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
import { fetchBandMembers, fetchMyInvites } from '../lib/bands';
import { useStore } from '../store';
import { useAccount } from './Account';

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
  /** Total pour la pastille de l'onglet Groupes. */
  badge: number;
  refresh: () => void;
  /** Marque les arrivées comme vues (efface la partie « acceptations »). */
  acknowledgeMembers: () => void;
}

const Ctx = createContext<NotificationsValue | null>(null);

export function useNotifications(): NotificationsValue {
  return (
    useContext(Ctx) ?? {
      inviteCount: 0,
      memberNews: [],
      badge: 0,
      refresh: () => {},
      acknowledgeMembers: () => {},
    }
  );
}

const SEEN_KEY = 'sing2me/seenMembers';
const INIT_KEY = 'sing2me/initBands';
const NEWS_KEY = 'sing2me/memberNews';

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
  const { bands } = useStore();
  const [inviteCount, setInviteCount] = useState(0);
  const [memberNews, setMemberNews] = useState<MemberNews[]>(() => loadNews());
  const bandsRef = useRef(bands);
  bandsRef.current = bands;
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
      } catch {
        // annuaire indisponible : on garde la valeur précédente
      }

      // 2) Nouvelles arrivées dans mes groupes publiés (acceptations).
      const seen = loadSet(SEEN_KEY);
      const initBands = loadSet(INIT_KEY);
      const fresh: MemberNews[] = [];
      for (const band of bandsRef.current) {
        const cid = band.cloudId;
        if (!cid) continue;
        try {
          const members = await fetchBandMembers(s, cid);
          // Première observation d'un groupe : on établit la base sans
          // notifier (sinon tous les membres existants sembleraient nouveaux).
          const firstTime = !initBands.has(cid);
          for (const m of members) {
            if (m.user_id === s.userId) continue;
            const key = `${cid}:${m.user_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!firstTime) {
              fresh.push({
                key,
                bandName: band.name || 'ton groupe',
                memberName: m.name || 'Un musicien',
              });
            }
          }
          initBands.add(cid);
        } catch {
          // groupe injoignable : on réessaiera au prochain cycle
        }
      }
      saveSet(SEEN_KEY, seen);
      saveSet(INIT_KEY, initBands);
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

  const value: NotificationsValue = {
    inviteCount,
    memberNews,
    badge: inviteCount + memberNews.length,
    refresh: () => void poll(),
    acknowledgeMembers,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
