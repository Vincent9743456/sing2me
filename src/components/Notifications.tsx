/**
 * Notifications de groupe, dans l'application (pas seulement par email) :
 *  • invitations reçues (annuaire) → pastille sur l'onglet Groupes ;
 *  • acceptations : quand un musicien rejoint l'un de tes groupes, tu es
 *    prévenu (« X a rejoint « Groupe » »).
 * Sondage léger (à la connexion puis toutes les 60 s), best-effort.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { getValidSession } from '../lib/auth';
import {
  CloudMember,
  fetchBandMembers,
  fetchBandMessages,
  fetchBandDepartures,
  fetchMyInvites,
} from '../lib/bands';
import { useStore } from '../store';
import { BandMember, makeId } from '../types';
import { t } from '../i18n';
import { useAccount } from './Account';
import { useToast } from './Feedback';

/** Signature stable de la liste de membres (par nom) pour comparer sans churn. */
function membersSignature(
  members: { name: string; photo?: string }[],
): string {
  return members
    .map((m) => `${m.name.trim().toLowerCase()}#${m.photo ? '1' : '0'}`)
    .filter((n) => n !== '#0')
    .sort()
    .join('|');
}

/**
 * Fusionne les membres réels (comptes, cloud_band_members) dans la liste
 * locale du groupe : les comptes deviennent des membres « vérifiés », les
 * membres manuels non représentés par un compte sont conservés. Dé-doublonne
 * par nom (le créateur ne doit pas apparaître deux fois).
 */
function mergeCloudMembers(
  local: BandMember[],
  cloud: CloudMember[],
): BandMember[] {
  const cloudNames = new Set(
    cloud.map((m) => m.name.trim().toLowerCase()).filter((n) => n !== ''),
  );
  const fromCloud: BandMember[] = cloud.map((m) => {
    const existing = local.find(
      (l) => l.name.trim().toLowerCase() === m.name.trim().toLowerCase(),
    );
    return existing
      ? {
          ...existing,
          name: m.name || existing.name,
          instrument: m.instrument || existing.instrument,
          // Photo d'annuaire du membre (si renseignée) : conservée localement.
          photo: m.photo || existing.photo,
          verified: true,
          // Il a rejoint pour de bon : ce n'est plus « en attente ».
          pending: undefined,
        }
      : {
          id: makeId(),
          name: m.name || 'Musicien',
          instrument: m.instrument,
          photo: m.photo,
          verified: true,
        };
  });
  const cloudNamesArr = [...cloudNames];
  const keptManual = local.filter((m) => {
    const nm = m.name.trim().toLowerCase();
    if (nm === '') return true; // membre manuel sans nom : conservé
    if (cloudNames.has(nm)) return false; // déjà représenté (nom exact)
    // Invité « en attente » : son PRÉNOM peut différer du nom d'artiste
    // choisi à l'adhésion (« Marco » → « marco.bosio »). Dès qu'un membre
    // cloud contient ce prénom (ou l'inverse), l'invité a rejoint : on retire
    // le profil « en attente », remplacé par sa vraie fiche (nom + photo).
    if (
      m.pending === true &&
      cloudNamesArr.some((cn) => cn.includes(nm) || nm.includes(cn))
    ) {
      return false;
    }
    return true;
  });
  return [...fromCloud, ...keptManual];
}

export interface MemberNews {
  key: string;
  bandName: string;
  memberName: string;
}

interface NotificationsValue {
  /** Invitations de groupe reçues, en attente de réponse. */
  inviteCount: number;
  /** Musiciens qui viennent de rejoindre l'un de mes groupes. */
  memberNews: MemberNews[];
  /** Messages de groupe non lus, par groupe (clé = cloudId). */
  unreadByBand: Record<string, number>;
  /** Total des messages de groupe non lus. */
  messageUnread: number;
  /** Total pour la pastille de l'onglet Groupes. */
  badge: number;
  refresh: () => void;
  /** Marque les arrivées comme vues (efface la partie « acceptations »). */
  acknowledgeMembers: () => void;
  /** Marque le fil d'un groupe comme lu (appelé à l'ouverture de la discussion). */
  markMessagesSeen: (cloudId: string) => void;
}

const Ctx = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  return (
    useContext(Ctx) ?? {
      inviteCount: 0,
      memberNews: [],
      unreadByBand: {},
      messageUnread: 0,
      badge: 0,
      refresh: () => {},
      acknowledgeMembers: () => {},
      markMessagesSeen: () => {},
    }
  );
}

const SEEN_KEY = 'sing2me/seenMembers';
const INIT_KEY = 'sing2me/initBands';
// Groupes cloud dont je suis (ou j'ai été) membre : sert à détecter une
// dissolution / un retrait (je n'y suis plus) et à retirer le groupe local.
const WAS_MEMBER_KEY = 'sing2me/wasMember';
const NEWS_KEY = 'sing2me/memberNews';
const MSG_SEEN_KEY = 'sing2me/msgSeen'; // { [cloudId]: dernier créé_at vu }
const MSG_INIT_KEY = 'sing2me/msgInit'; // groupes déjà « baselinés »

function loadMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    return obj && typeof obj === 'object'
      ? (obj as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}
function saveMap(key: string, m: Record<string, string>): void {
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {
    // stockage indisponible
  }
}

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveSet(key: string, s: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    // stockage indisponible
  }
}
function loadNews(): MemberNews[] {
  try {
    const raw = localStorage.getItem(NEWS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as MemberNews[]) : [];
  } catch {
    return [];
  }
}
function saveNews(n: MemberNews[]): void {
  try {
    localStorage.setItem(NEWS_KEY, JSON.stringify(n));
  } catch {
    // stockage indisponible
  }
}

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = useAccount();
  const [departureCount, setDepartureCount] = useState(0);
  const { bands, saveBand, deleteBand } = useStore();
  const toast = useToast();
  const [inviteCount, setInviteCount] = useState(0);
  const [memberNews, setMemberNews] = useState<MemberNews[]>(() => loadNews());
  const [unreadByBand, setUnreadByBand] = useState<Record<string, number>>({});
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
  const saveBandRef = useRef(saveBand);
  saveBandRef.current = saveBand;
  const deleteBandRef = useRef(deleteBand);
  deleteBandRef.current = deleteBand;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const busy = useRef(false);

  const poll = useCallback(async () => {
    if (account?.email == null || busy.current) return;
    busy.current = true;
    try {
      const s = await getValidSession();
      if (!s) return;

      // 1) Invitations reçues (annuaire).
      try {
        const invites = await fetchMyInvites(s);
        setInviteCount(invites.length);
        // Musiciens partis de MES groupes, à réinviter (b142) : compte
        // dans la pastille de l'onglet Groupes — sans quoi personne ne
        // sait qu'une action est attendue.
        const gone = await fetchBandDepartures(s);
        setDepartureCount(gone.length);
      } catch {
        // annuaire indisponible : on garde la valeur précédente
      }

      // 2) Nouvelles arrivées dans mes groupes publiés (acceptations) +
      //    messages de groupe non lus.
      const seen = loadSet(SEEN_KEY);
      const initBands = loadSet(INIT_KEY);
      const wasMember = loadSet(WAS_MEMBER_KEY);
      const msgSeen = loadMap(MSG_SEEN_KEY);
      const msgInit = loadSet(MSG_INIT_KEY);
      const fresh: MemberNews[] = [];
      const unread: Record<string, number> = {};
      for (const band of bandsRef.current) {
        const cid = band.cloudId;
        if (!cid) continue;
        try {
          const members = await fetchBandMembers(s, cid);
          // Première observation d'un groupe : on établit la base sans
          // notifier (sinon tous les membres existants sembleraient nouveaux).
          const firstTime = !initBands.has(cid);
          // Détection fiable côté MEMBRE (indépendante du flag local, donc
          // valable aussi pour les adhésions anciennes) : le créateur n'est
          // jamais dans cloud_band_members, un membre si. Si j'étais membre de
          // ce groupe et que je n'y suis plus (dissous par le créateur, ou
          // retiré), on le retire de mon app + notif. Mes copies personnelles
          // des morceaux restent. Sécurité : jamais pour un groupe dont je suis
          // le propriétaire.
          const iAmMember = members.some((m) => m.user_id === s.userId);
          if (iAmMember) {
            wasMember.add(cid);
          } else if (wasMember.has(cid) && band.owned !== true) {
            wasMember.delete(cid);
            deleteBandRef.current(band.id);
            toastRef.current.show(
              t(
                'Le groupe « {name} » n\'existe plus — tes morceaux restent dans ta bibliothèque.',
                { name: band.name || t('ton groupe') },
              ),
            );
            continue;
          }
          for (const m of members) {
            if (m.user_id === s.userId) continue;
            const key = `${cid}:${m.user_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!firstTime) {
              fresh.push({
                key,
                bandName: band.name || t('ton groupe'),
                memberName: m.name || t('Un musicien'),
              });
            }
          }
          initBands.add(cid);
          // Tenir la liste locale des membres à jour, pour que le décompte
          // (« X musiciens ») soit correct partout — pas seulement dans la
          // fiche du groupe.
          const merged = mergeCloudMembers(band.members, members);
          if (membersSignature(merged) !== membersSignature(band.members)) {
            saveBandRef.current({ ...band, members: merged });
          }
        } catch {
          // groupe injoignable : on réessaiera au prochain cycle
        }
        // Messages de groupe non lus (hors les miens).
        try {
          const msgs = await fetchBandMessages(s, cid);
          const newest = msgs.length ? msgs[msgs.length - 1].created_at : '';
          if (!msgInit.has(cid)) {
            // Première observation : on établit la base sans tout marquer non lu.
            if (newest) msgSeen[cid] = newest;
            msgInit.add(cid);
          } else {
            const since = msgSeen[cid] ?? '';
            const count = msgs.filter(
              (m) => m.user_id !== s.userId && m.created_at > since,
            ).length;
            if (count > 0) unread[cid] = count;
          }
        } catch {
          // fil injoignable : on réessaiera
        }
      }
      saveSet(SEEN_KEY, seen);
      saveSet(INIT_KEY, initBands);
      saveSet(WAS_MEMBER_KEY, wasMember);
      saveMap(MSG_SEEN_KEY, msgSeen);
      saveSet(MSG_INIT_KEY, msgInit);
      setUnreadByBand(unread);
      if (fresh.length > 0) {
        setMemberNews((prev) => {
          const known = new Set(prev.map((n) => n.key));
          const merged = [...prev, ...fresh.filter((n) => !known.has(n.key))];
          saveNews(merged);
          return merged;
        });
      }
    } finally {
      busy.current = false;
    }
  }, [account?.email]);

  useEffect(() => {
    if (account?.email == null) {
      setInviteCount(0);
      setUnreadByBand({});
      return;
    }
    void poll();
    const id = window.setInterval(() => void poll(), 60000);
    return () => window.clearInterval(id);
  }, [account?.email, poll]);

  const acknowledgeMembers = useCallback(() => {
    setMemberNews([]);
    saveNews([]);
  }, []);

  // À l'ouverture d'une discussion : on marque le fil lu (base = maintenant),
  // et on retire ce groupe du compteur non lu.
  const markMessagesSeen = useCallback((cloudId: string) => {
    if (!cloudId) return;
    const map = loadMap(MSG_SEEN_KEY);
    map[cloudId] = new Date().toISOString();
    saveMap(MSG_SEEN_KEY, map);
    const init = loadSet(MSG_INIT_KEY);
    init.add(cloudId);
    saveSet(MSG_INIT_KEY, init);
    setUnreadByBand((prev) => {
      if (!prev[cloudId]) return prev;
      const next = { ...prev };
      delete next[cloudId];
      return next;
    });
  }, []);

  const messageUnread = Object.values(unreadByBand).reduce((a, b) => a + b, 0);
  const value: NotificationsValue = {
    inviteCount,
    memberNews,
    unreadByBand,
    messageUnread,
    badge: inviteCount + departureCount + memberNews.length + messageUnread,
    refresh: () => void poll(),
    acknowledgeMembers,
    markMessagesSeen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
