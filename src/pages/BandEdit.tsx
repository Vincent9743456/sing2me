/**
 * Profil d'un groupe : identité publique, membres, invitations.
 * Connecté : le groupe est publié dans le cloud à la première invitation,
 * et les musiciens qui ont un compte le rejoignent en un clic (liste des
 * membres réels ✓ affichée ici).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { BandPublicPeek } from '../components/BandPublicPeek';
import { BandPublicCard } from '../components/BandPublicCard';

import { useAccount } from '../components/Account';
import { ConfirmSheet, useToast } from '../components/Feedback';
import { GearEditor } from '../components/GearEditor';
import { Icon } from '../components/Icon';
import { LinkPreviews } from '../components/LinkPreviews';
import { ShareModal } from '../components/ShareModal';
import { Field, Modal, SaveBar, TopBar } from '../components/ui';
import { t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { detacherDuCloud, texteSuppression } from '../lib/deleteband';
import {
  findPublicPageByArtist,
  findPublicPageByUser,
  PublicPage,
} from '../lib/publicPages';
import {
  announceBandSong,
  CloudMember,
  deleteCloudBand,
  DirectoryPerson,
  cancelBandInvite,
  createBandInvite,
  ensureCloudBand,
  BandDeparture,
  BandOwner,
  departuresToShow,
  fetchBandDepartures,
  fetchBandOwner,
  fetchBandMembers,
  fetchBandMessages,
  inviteToBand,
  removeBandMember,
  searchProfiles,
  transferBand,
} from '../lib/bands';
import {
  bandToProfile,
  connusEnTete,
  dedupeMusicians,
  musiciensDuGroupe,
  duplicateVersion,
  memeMusicien,
  musiciensConnus,
  memePersonne,
  stampMemberIds,
  removeVersion,
  sameMusician,
  switchVersion,
  versionForBand,
} from '../lib/model';
import { normalizeTitle } from '../lib/importer';
import { resizePhoto } from '../lib/photo';
import { navigate } from '../router';
import { useStore } from '../store';
import { Band, estBrouillon, makeId, SharePayload, Song, tamponneBand } from '../types';
import { isUpcoming } from './Concerts';

const LINK_PRESETS = [
  'Spotify',
  'Apple Music',
  'Deezer',
  'YouTube',
  'Instagram',
  'Facebook',
  'TikTok',
  'Site web',
];

/** Pastille membre : photo de profil si disponible, sinon initiales. */
function Avatar({ name, photo }: { name: string; photo?: string }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?';
  const base = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    flexShrink: 0,
  } as const;
  return photo && photo !== '' ? (
    <img src={photo} alt="" style={{ ...base, objectFit: 'cover' }} />
  ) : (
    <div
      style={{
        ...base,
        background: 'var(--surface-high)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '0.85rem',
        color: 'var(--text-dim)',
      }}
    >
      {initials}
    </div>
  );
}

/** Ancienneté lisible (« il y a 2 h ») pour le sous-titre de la Discussion. */
function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("à l'instant");
  if (min < 60) return t('il y a {min} min', { min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('il y a {h} h', { h });
  return t('il y a {j} j', { j: Math.floor(h / 24) });
}

export function BandEdit({ id }: { id: string }) {
  const {
    bands,
    saveBand,
    deleteBand,
    setlists,
    songs,
    saveSong,
    clearBandRemoval,
    recordBandRemoval,
    concerts,
    prefs,
    artist,
  } = useStore();
  const band = bands.find((b) => b.id === id);
  const account = useAccount();
  const toast = useToast();
  const [invite, setInvite] = useState(false);
  const [share, setShare] = useState(false);
  const [cloudRef, setCloudRef] = useState<{
    cloudId: string;
    token: string;
  } | null>(null);
  const [cloudMembers, setCloudMembers] = useState<CloudMember[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  // Vue par défaut = écran d'accueil du groupe (3 portes) ; l'avancé
  // (édition, page publique, suppression) vit derrière « ⋯ ».
  const [editing, setEditing] = useState(false);
  // Consulter la page publique du groupe sans quitter l'app (b230).
  const [peek, setPeek] = useState(false);
  // b149 : l'édition passe par un BROUILLON — rien n'est enregistré tant
  // que « Valider » (barre de validation) n'est pas pressé.
  const [editDraft, setEditDraft] = useState<Band | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // Fiche d'un membre ouverte au clic (null = fermée). Pour MOI → onglet Artiste.
  const [viewMember, setViewMember] = useState<{
    name: string;
    instrument?: string;
    photo?: string;
    /** Son compte (b249) : c'est LUI qui retrouve sa page, pas son nom. */
    userId?: string;
  } | null>(null);
  // Page publique du musicien affiché (b173) : undefined = on cherche
  // encore, null = il n'en a pas (ou son nom est porté par plusieurs
  // artistes — on refuse alors de deviner).
  const [memberPage, setMemberPage] = useState<PublicPage | null | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!viewMember) return;
    let cancelled = false;
    setMemberPage(undefined);
    void (async () => {
      // Par le COMPTE d'abord — exact, insensible au nom affiché (b276) ;
      // par le nom seulement pour une ligne qui n'a pas d'identifiant.
      const page =
        (await findPublicPageByUser(viewMember.userId ?? '')) ??
        (await findPublicPageByArtist(viewMember.name));
      if (!cancelled) setMemberPage(page);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMember]);

  // Étape « prénom de l'invité » avant de partager le lien.
  const [invitePrompt, setInvitePrompt] = useState(false);
  const [pendingName, setPendingName] = useState('');
  /**
   * L'INVITATION EN COURS (b251) : un jeton NOMINATIF et à usage unique,
   * créé pour cette personne-là. Le lien ne porte plus le jeton du groupe,
   * qui était permanent et utilisable par quiconque le recevait.
   */
  const [inviteLink, setInviteLink] = useState<{
    token: string;
    name: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  /**
   * DÉJÀ SUR MOJOSONG ? (b252, demande de Vincent : « il faut que
   * l'invitation puisse vérifier si la personne n'est pas déjà inscrite »).
   * Cherché pendant la frappe : quand la personne a un compte, l'invitation
   * part DIRECTEMENT chez elle — rien à envoyer, et sa ligne porte son
   * identifiant dès l'invitation (b250), donc aucun doublon à l'adhésion.
   */
  const [dejaInscrits, setDejaInscrits] = useState<DirectoryPerson[]>([]);
  /**
   * CE QUE LA RECHERCHE A CONCLU (b409, complété b410 — trois allers-retours
   * avec Vincent parce que l'écran ne disait RIEN) : 'membre' = trouvé mais
   * déjà dans CE groupe ; 'introuvable' = aucun compte à ce nom ; 'panne' =
   * annuaire injoignable ; '' = rien à dire (proposition affichée, ou
   * saisie trop courte). Un écran qui cherche et ne trouve pas doit le
   * dire — sinon on ne distingue pas « pas de compte » d'un bug.
   */
  const [verdictAnnuaire, setVerdictAnnuaire] = useState<
    '' | 'membre' | 'introuvable' | 'panne'
  >('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastMsg, setLastMsg] = useState<{ text: string; at: string } | null>(
    null,
  );
  const [myId, setMyId] = useState('');
  /**
   * CEUX AVEC QUI JE JOUE DÉJÀ (b253, demande de Vincent : « quand il y aura
   * 126 Vincent, ce sera plus pratique pour Marco de créer un nouveau groupe
   * avec moi »). Calculé depuis MES groupes, sans aucun appel réseau : les
   * identifiants de compte y sont posés depuis b249.
   *
   * Déclaré ICI, au-dessus de toutes les gardes (`if (!band) return`) et des
   * fonctions qui s'en servent — un calcul d'écran posé après une garde ne
   * s'exécute pas quand l'écran renonce (cicatrice b201).
   */
  // Le groupe EN COURS D'ÉDITION est exclu du calcul (b403, test de
  // Vincent : « j'ai tapé ton nom, je t'ai ajouté et il m'a dit "déjà avec
  // toi dans Pizza n roses" » — le groupe qu'il venait de créer). « Déjà
  // avec toi » ne peut désigner que les AUTRES groupes.
  const connus = musiciensConnus(bands.filter((b) => b.id !== id), myId);
  /** « déjà avec toi dans X » — la raison du classement, écrite. */
  const dejaAvecMoi = (userId: string): string => {
    const g = connus.get(userId) ?? [];
    if (g.length === 0) return '';
    return g.length === 1
      ? t('déjà avec toi dans {groupe}', { groupe: g[0] })
      : t('déjà avec toi dans {groupes}', { groupes: g.join(', ') });
  };
  // Ajout d'un membre : recherche dans l'annuaire ou repli lien/email.
  const [addOpen, setAddOpen] = useState(false);
  const [dirQuery, setDirQuery] = useState('');
  const [dirResults, setDirResults] = useState<DirectoryPerson[]>([]);
  const [dirBusy, setDirBusy] = useState(false);
  const [dirMsg, setDirMsg] = useState<string | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  // Invitations RENVOYÉES à des membres déjà inscrits (b140).
  const [reinvited, setReinvited] = useState<Set<string>>(new Set());
  // Musiciens partis de CE groupe, à réinviter (b142).
  const [departures, setDepartures] = useState<BandDeparture[]>([]);
  // Créateur du groupe, tel que le SERVEUR le connaît (b213) : c'est lui
  // qui fait autorité, le drapeau local n'en est qu'un reflet.
  const [owner, setOwner] = useState<BandOwner | null>(null);
  // Transmission du groupe : choix du musicien, puis confirmation.
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  // Retrait d'un membre par le créateur (b143) — confirmé, jamais brutal.
  const [removeMember, setRemoveMember] = useState<{
    userId: string;
    name: string;
    // Invité pas encore accepté : on ANNULE l'invitation (pas un retrait de
    // membre) — libellés et action côté serveur diffèrent (b312).
    pending?: boolean;
  } | null>(null);

  // Membres réels (comptes) du groupe publié
  useEffect(() => {
    const cid = band?.cloudId;
    if (!cid || account?.email == null) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await getValidSession();
        if (!s || cancelled) return;
        if (!cancelled) setMyId(s.userId);
        const members = await fetchBandMembers(s, cid);
        if (!cancelled) setCloudMembers(members);
        // Qui possède le groupe (b213). Le serveur fait autorité : après
        // une transmission, c'est ainsi que le NOUVEAU créateur l'apprend,
        // et que l'ancien voit son drapeau local retomber.
        const own = await fetchBandOwner(s, cid);
        // IDENTIFIANTS DE COMPTE (b249) : ma ligne et celles des membres
        // reçoivent leur identifiant, une fois pour toutes. Le créateur n'est
        // jamais dans `cloud_band_members` — d'où l'ajout du propriétaire.
        if (!cancelled) {
          const comptes = members.map((m) => ({
            user_id: m.user_id,
            name: m.name,
          }));
          if (own) comptes.push({ user_id: own.userId, name: own.name });
          const estampille = stampMemberIds(band, comptes);
          if (estampille !== band) saveBand(estampille);
        }
        if (own && !cancelled) {
          setOwner(own);
          const jeSuisLe = own.userId === s.userId;
          if (jeSuisLe && band.owned !== true) {
            saveBand({ ...band, owned: true, ownerName: '' });
          } else if (!jeSuisLe) {
            // Un annuaire muet ne doit pas EFFACER le nom qu'on connaît.
            const nom = own.name !== '' ? own.name : (band.ownerName ?? '');
            if (band.owned !== false || (band.ownerName ?? '') !== nom) {
              saveBand({ ...band, owned: false, ownerName: nom });
            }
          }
        }
        // Départs à traiter sur CE groupe (b142), moi excepté (b212 : la
        // réinitialisation fait « partir » le créateur de son propre
        // groupe — il n'a pas à se réinviter lui-même).
        const gone = await fetchBandDepartures(s);
        if (!cancelled) {
          setDepartures(
            departuresToShow(gone, {
              myUserId: s.userId,
              myCloudIds: [cid],
              hidden: prefs.hiddenDepartures,
            }),
          );
        }
        // Dernier message pour le sous-titre de la porte « Discussion ».
        try {
          const msgs = await fetchBandMessages(s, cid);
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          if (!cancelled && last) {
            setLastMsg({ text: last.text, at: last.created_at });
          }
        } catch {
          // fil injoignable : sous-titre générique
        }
      } catch {
        // silencieux : la liste locale reste affichée
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [band?.cloudId, account?.email]);

  async function openInvite() {
    if (!band) return;
    setInviteBusy(true);
    try {
      // Connecté : publie le groupe dans le cloud pour l'adhésion en 1 clic.
      // Jamais si le groupe ne m'appartient PLUS (b213) : je ne verrais pas
      // sa ligne (RLS), et j'en créerais un DEUXIÈME, vide, avec le même
      // identifiant local — le groupe se dédoublerait en silence.
      if (account?.email != null && !groupeDUnAutre()) {
        const s = await getValidSession();
        if (s) {
          const ref = await ensureCloudBand(s, band.id, band.name);
          setCloudRef(ref);
          if (band.cloudId !== ref.cloudId) {
            saveBand({ ...band, cloudId: ref.cloudId, owned: true });
          }
        }
      }
    } catch {
      // sans cloud, l'invitation classique (répertoire + carte) reste valable
    } finally {
      setInviteBusy(false);
      // On demande d'abord le prénom de l'invité (pour l'afficher « en
      // attente »), puis on partage le lien.
      setPendingName('');
      setInviteLink(null);
      setInviteError(null);
      setInvitePrompt(true);
    }
  }

  /**
   * CRÉE L'INVITATION NOMINATIVE (b251, demande de Vincent : « il faut que
   * cette invitation soit nominative et que personne d'autre ne puisse
   * utiliser ce lien »).
   *
   * Le lien portait le jeton DU GROUPE : un seul, permanent, réutilisable à
   * l'infini par quiconque le recevait — un transfert de message suffisait à
   * faire entrer un inconnu dans le répertoire partagé. On demande donc au
   * serveur une invitation POUR CETTE PERSONNE, qui expire et se referme sur
   * le premier compte qui l'utilise.
   *
   * Si le serveur ne sait pas la créer, on REFUSE : produire quand même un
   * lien ouvert reviendrait à contourner la règle en silence.
   */
  async function creerInvitation() {
    if (!band) return;
    const nm = pendingName.trim();
    if (nm === '') return;
    setInviteBusy(true);
    setInviteError(null);
    try {
      const cid = cloudRef?.cloudId ?? band.cloudId ?? '';
      const s = await getValidSession();
      if (!s || cid === '') throw new Error(t('Connexion requise'));
      const token = await createBandInvite(s, cid, nm);
      setInviteLink({ token, name: nm });
      // La ligne « en attente » n'a pas d'identifiant : par lien, on ne sait
      // pas encore qui viendra. Elle en recevra un à l'adhésion (b249/b250).
      if (!band.members.some((m) => memeMusicien(m, { name: nm }))) {
        saveBand(tamponneBand({
          ...band,
          members: [
            ...band.members,
            { id: makeId(), name: nm, instrument: '', pending: true },
          ],
        }));
      }
      setInvitePrompt(false);
      setInvite(true);
    } catch (e) {
      setInviteError(
        e instanceof Error && e.message !== ''
          ? t('Invitation impossible : {raison}', { raison: e.message })
          : t('Invitation impossible.'),
      );
    } finally {
      setInviteBusy(false);
    }
  }

  // Recherche dans l'annuaire au fil de la frappe (400 ms), pendant que la
  // fenêtre d'invitation est ouverte. Silencieuse : un annuaire indisponible
  // n'empêche jamais d'obtenir un lien.
  useEffect(() => {
    if (!invitePrompt) {
      setDejaInscrits([]);
      setVerdictAnnuaire('');
      return;
    }
    const q = pendingName.trim();
    if (q.length < 2) {
      setDejaInscrits([]);
      setVerdictAnnuaire('');
      return;
    }
    let annule = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const s = await getValidSession();
          if (!s || annule) return;
          const rows = await searchProfiles(s, q);
          // Les membres déjà dans le groupe n'ont pas à être réinvités.
          if (!annule) {
            const libres = rows.filter(
              (p) =>
                !(band?.members ?? []).some((m) =>
                  memeMusicien(m, { name: p.name, userId: p.user_id }),
                ),
            );
            setDejaInscrits(connusEnTete(libres, connus));
            setVerdictAnnuaire(
              rows.length === 0
                ? 'introuvable'
                : libres.length === 0
                  ? 'membre'
                  : '',
            );
          }
        } catch {
          if (!annule) {
            setDejaInscrits([]);
            setVerdictAnnuaire('panne');
          }
        }
      })();
    }, 400);
    return () => {
      annule = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitePrompt, pendingName]);

  /** Ouvre l'ajout de membre : publie le groupe (pour l'annuaire + le jeton). */
  async function openAddMember() {
    if (!band) return;
    setInviteBusy(true);
    try {
      if (account?.email != null && !groupeDUnAutre()) {
        const s = await getValidSession();
        if (s) {
          const ref = await ensureCloudBand(s, band.id, band.name);
          setCloudRef(ref);
          if (band.cloudId !== ref.cloudId) {
            saveBand({ ...band, cloudId: ref.cloudId, owned: true });
          }
        }
      }
    } catch {
      // sans cloud : seul l'invite par lien/carte reste possible
    } finally {
      setInviteBusy(false);
      setDirMsg(null);
      setDirResults([]);
      setDirQuery('');
      setAddOpen(true);
    }
  }

  async function doSearch() {
    if (dirQuery.trim().length < 2 || dirBusy) return;
    setDirBusy(true);
    setDirMsg(null);
    try {
      const s = await getValidSession();
      if (!s) {
        setDirMsg(
          t('Connecte-toi (Profil artiste) pour chercher dans l’annuaire.'),
        );
        return;
      }
      const rows = await searchProfiles(s, dirQuery.trim());
      // Les membres (et invités) déjà dans CE groupe n'ont pas à être
      // réinvités — même règle que la recherche pendant la frappe (b252) ;
      // ce chemin-ci l'avait oubliée (b403).
      const libres = rows.filter(
        (p) =>
          !(band?.members ?? []).some((m) =>
            memeMusicien(m, { name: p.name, userId: p.user_id }),
          ),
      );
      // Ceux avec qui je joue déjà en premier (b253) : sur cent homonymes,
      // c'est presque toujours l'un d'eux qu'on cherche.
      setDirResults(connusEnTete(libres, connus));
      if (rows.length === 0)
        setDirMsg(t('Aucun musicien trouvé pour ce nom.'));
      else if (libres.length === 0)
        setDirMsg(t('Cette personne est déjà dans le groupe (ou invitée).'));
    } catch {
      setDirMsg(t("L'annuaire n'est pas disponible pour le moment."));
      setDirResults([]);
    } finally {
      setDirBusy(false);
    }
  }

  async function invitePerson(person: DirectoryPerson) {
    const cid = band?.cloudId;
    if (!cid) {
      setDirMsg(
        t(
          'Publie d’abord le groupe (invite par lien) avant d’inviter depuis l’annuaire.',
        ),
      );
      return;
    }
    try {
      const s = await getValidSession();
      if (!s) return;
      await inviteToBand(s, cid, person.user_id);
      setInvited((prev) => new Set(prev).add(person.user_id));
      // On matérialise l'invitation par un profil « en attente d'acceptation »
      // dans le groupe : le musicien apparaît tout de suite, marqué comme
      // pas encore accepté (il deviendra un membre normal à son adhésion).
      //
      // INVITÉ DEPUIS L'ANNUAIRE = COMPTE DÉJÀ CONNU (b250, remarque de
      // Vincent : un musicien invité n'a de toute façon accès à rien tant
      // qu'il n'est pas inscrit). On pose donc son identifiant TOUT DE
      // SUITE : sa ligne n'aura jamais besoin d'être rapprochée par le nom,
      // même s'il rejoint sous un nom d'artiste différent — c'est ainsi
      // qu'était né le doublon de Marco.
      const already = band?.members.some((m) =>
        memeMusicien(m, { name: person.name, userId: person.user_id }),
      );
      if (band && !already && person.name.trim() !== '') {
        saveBand(tamponneBand({
          ...band,
          members: [
            ...band.members,
            {
              id: makeId(),
              userId: person.user_id,
              name: person.name.trim(),
              instrument: '',
              pending: true,
            },
          ],
        }));
      }
    } catch (e) {
      setDirMsg(e instanceof Error ? e.message : t('Invitation impossible.'));
    }
  }

  const invitePayload = useMemo<SharePayload | null>(() => {
    if (!band) return null;
    // Lien d'invitation MINIMAL : uniquement l'invitation à rejoindre le
    // groupe (pas le répertoire — il arrive par le cloud après adhésion).
    // → lien court, page d'accueil claire, orientée « crée ton compte ».
    return {
      v: 1,
      type: 'invite',
      view: 'paroles',
      invite: {
        band: band.name || t('notre groupe'),
        from: prefs.userName || artist.name || t('Un musicien'),
        bandId: band.id,
        cloudId: cloudRef?.cloudId,
        // Jeton NOMINATIF et à usage unique (b251) — jamais celui du groupe.
        token: inviteLink?.token,
        for: inviteLink?.name,
      },
    };
  }, [band, prefs.userName, artist.name, cloudRef, inviteLink]);

  const publicPayload = useMemo<SharePayload | null>(() => {
    if (!band || band.name.trim() === '') return null;
    const bandSetlistIds = new Set(
      setlists.filter((sl) => sl.bandId === band.id).map((sl) => sl.id),
    );
    return {
      v: 1,
      type: 'artist',
      view: 'paroles',
      artist: bandToProfile(band),
      concerts: concerts
        .filter(
          (c) =>
            c.visibility === 'public' &&
            isUpcoming(c) &&
            (bandSetlistIds.size === 0 || bandSetlistIds.has(c.setlistId)),
        )
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map((c) => ({ title: c.title, date: c.date, time: c.time, venue: c.venue })),
    };
  }, [band, concerts, setlists]);

  if (!band) {
    return (
      <>
        <TopBar title={t('Groupe')} onBack={() => navigate('/bands')} />
        <div className="page">
          {/* Un bouton « Discussion du groupe » traînait ici (b215) : il
              lisait band.id sur un groupe qui n'existe justement PLUS —
              l'ouvrir plantait l'écran. Un groupe disparu n'a rien à
              proposer d'autre que le retour. */}
          <p className="help">{t("Ce groupe n'existe plus.")}</p>
        </div>
      </>
    );
  }

  /** Copie de travail du groupe (liens et membres dupliqués). */
  const draftOf = (b: Band): Band => ({
    ...b,
    links: b.links.map((l) => ({ ...l })),
    members: b.members.map((m) => ({
      ...m,
      gear: m.gear?.map((g) => ({ ...g })),
    })),
  });

  function startEditing() {
    if (!band) return;
    setEditDraft(draftOf(band));
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setEditDraft(null);
  }

  // b149 : en mode édition, chaque changement va dans le brouillon ; la
  // barre « Valider / Annuler » apparaît dès qu'il diffère du groupe.
  function update(patch: Partial<typeof band>) {
    setEditDraft((d) => (d === null ? d : { ...d, ...patch }));
  }

  // Ce que l'écran d'édition AFFICHE : le brouillon (identique au groupe
  // enregistré hors édition, donc sans effet ailleurs).
  const shown = editing && editDraft !== null ? editDraft : band;
  const editDirty =
    editing &&
    editDraft !== null &&
    JSON.stringify(editDraft) !== JSON.stringify(band);

  function confirmEdit() {
    if (editDraft === null) return;
    // Geste délibéré : horodaté, pour gagner la fusion entre appareils (b373).
    saveBand(tamponneBand(editDraft));
    setEditSaved(true);
    window.setTimeout(() => setEditSaved(false), 1400);
  }

  function cancelEdit() {
    if (band) setEditDraft(draftOf(band));
  }

  // Propriétaire = créateur du groupe. Lui seul peut supprimer le groupe,
  // inviter ou retirer un musicien. Les autres peuvent seulement le quitter.
  // (owned non renseigné = groupe créé avant cette règle → considéré comme
  // mien pour ne pas bloquer d'anciens groupes ; les adhésions récentes
  // posent explicitement owned:false.)
  const isOwner = band.owned !== false;

  /** Propriétaire → dissout le groupe pour tout le monde ; membre → le quitte
   *  (retire sa propre adhésion cloud). Dans les deux cas, on le retire de mon
   *  app ; mes copies personnelles des morceaux restent. */
  async function dissolveOrLeave() {
    if (!band) return;
    // La décision (dissoudre / quitter) vit dans `lib/deleteband.ts` depuis
    // b254 : la liste des groupes l'applique à l'identique, et deux portes
    // vers la même action ne peuvent pas se mettre à diverger.
    await detacherDuCloud(band);
    deleteBand(band.id);
    navigate(isOwner ? '/artist' : '/bands');
  }

  /** Ce groupe est-il celui d'un AUTRE ? (déjà publié, et pas à moi) */
  const groupeDUnAutre = (): boolean =>
    (band?.cloudId ?? '') !== '' && band?.owned === false;

  /** Le créateur, nommé : « Toi » quand c'est moi, sinon son nom (serveur
   *  d'abord, puis ce que je sais en local). */
  const nomDuCreateur = (): string => {
    if (owner && myId !== '' && owner.userId === myId) return t('Toi');
    if (owner && owner.name !== '') return owner.name;
    if ((band?.ownerName ?? '') !== '') return band?.ownerName ?? '';
    return band?.owned === false ? t('un autre musicien') : t('Toi');
  };

  /**
   * EST-CE MOI ? (b247, constat de Vincent : « je ne vois pas ma photo à côté
   * de celle de Marco »). Sa ligne de musicien dit « Vincent », son profil
   * dit « tessier vincent » : l'égalité de chaînes ne les reconnaissait plus,
   * donc plus de photo, plus d'accès à sa fiche, et le ⭐ créateur tombait à
   * côté. Un nom d'artiste qui change suffit à provoquer ça.
   *
   * Deux niveaux, du plus sûr au plus tolérant :
   *  1. mon COMPTE, quand la ligne a un pendant côté cloud — sans ambiguïté,
   *     et à l'inverse une ligne qui appartient à QUELQU'UN D'AUTRE n'est
   *     jamais moi, même si les noms se ressemblent ;
   *  2. sinon les MOTS du nom (`memePersonne`), qui encaissent un nom de
   *     famille ajouté sans confondre « Marc » et « Marco ».
   */
  const mesNoms = [prefs.userName, artist.name].filter(
    (n) => (n ?? '').trim() !== '',
  );
  /**
   * Le créateur porte MON nom d'artiste… mais pas mon compte (b256). Le
   * serveur fait autorité sur les deux : si les identifiants diffèrent, ce
   * n'est pas moi, quoi que disent les noms (b249).
   */
  const compteDifferentAuMemeNom =
    band.owned === false &&
    owner !== null &&
    myId !== '' &&
    owner.userId !== myId &&
    mesNoms.some((n) => memePersonne(n, owner.name));

  const estMoi = (m: { name: string; userId?: string }): boolean => {
    // 1. L'identifiant de compte tranche (b249) — dans les deux sens.
    if ((m.userId ?? '') !== '' && myId !== '') return m.userId === myId;
    // 2. Sinon la ligne cloud qui lui correspond, s'il y en a une.
    const c = cloudMembers.find((x) => sameMusician(x.name, m.name));
    if (c && myId !== '') return c.user_id === myId;
    // 3. En dernier ressort les mots du nom (musicien sans compte).
    return mesNoms.some((n) => memePersonne(n, m.name));
  };
  /** Le créateur, pour le repérer dans la liste (nom OU « c'est moi »). */
  const createurEstMoi =
    (owner && myId !== '' && owner.userId === myId) ||
    (!owner && (band?.ownerName ?? '') === '' && band?.owned !== false);
  const nomDuCreateurBrut = ((): string => {
    if (owner) {
      const c = cloudMembers.find((m) => m.user_id === owner.userId);
      return c?.name || owner.name || '';
    }
    return band?.ownerName ?? '';
  })();
  const estLeCreateur = (m: { name: string; userId?: string }): boolean => {
    if (owner && (m.userId ?? '') !== '') return m.userId === owner.userId;
    if (createurEstMoi) return estMoi(m);
    return nomDuCreateurBrut !== '' && memePersonne(nomDuCreateurBrut, m.name);
  };
  // Photo d'un membre. Pour MOI, mon profil fait foi et passe DEVANT la copie
  // enregistrée dans le groupe : ma photo n'a qu'une maison (règle 1), et
  // celle du membre n'est qu'un reflet qui peut dater.
  const photoOf = (m: { name: string; photo?: string; userId?: string }): string =>
    estMoi(m) ? artist.photo || m.photo || '' : m.photo || '';
  const cloudNames = new Set(
    cloudMembers
      .map((m) => m.name.trim().toLowerCase())
      .filter((n) => n !== ''),
  );
  const cloudNamesArr = [...cloudNames];
  // Rapprochement FLOU : un membre local (prénom d'invitation, saisie
  // manuelle) est considéré déjà représenté par un compte cloud dès que
  // l'un contient l'autre (« Marco » ↔ « marco.bosio »). Évite le doublon
  // quand le vrai compte a rejoint sous un nom d'annuaire différent.
  const nameMatchesCloud = (nm: string): boolean =>
    nm !== '' && cloudNamesArr.some((cn) => sameMusician(cn, nm));
  // Membres manuels non déjà représentés par un compte cloud. On INCLUT
  // désormais les invités « en attente d'acceptation » (b306, demande de
  // Vincent : il faut pouvoir supprimer un membre qui n'a pas encore
  // accepté) — ils s'affichent avec leur propre ligne « ⏳ En attente » et un
  // bouton « Annuler l'invitation ». Un invité déjà rejoint sous un nom
  // d'annuaire (nom qui matche le cloud) reste exclu : c'est un doublon.
  const manualMembers = shown.members.filter(
    (m) => !nameMatchesCloud(m.name.trim().toLowerCase()),
  );

  /**
   * LES MUSICIENS DU GROUPE (b255). Le créateur n'étant jamais dans
   * `cloud_band_members`, il faut l'ajouter explicitement — sans quoi un
   * membre qui a rejoint compte un musicien de moins que la réalité
   * (« 1 musicien » chez Damien pour un groupe qui en a trois).
   */
  const tousLesMusiciens = musiciensDuGroupe(
    band,
    cloudMembers,
    owner ?? (band.ownerName ? { name: band.ownerName } : undefined),
  );
  const allMembers = tousLesMusiciens.filter((m) => m.pending !== true);
  const enAttente = tousLesMusiciens.filter((m) => m.pending === true);
  const memberCount = tousLesMusiciens.length;
  const fewMembers = memberCount < 2;
  // Règle 11 : la pastille compte EXACTEMENT ce que l'écran du répertoire
  // montrera — donc jamais un brouillon de création, qui n'apparaît nulle
  // part (b319/b338).
  const repCount = songs.filter(
    (s) => !estBrouillon(s) && versionForBand(s, band.id) !== null,
  ).length;
  const propCount = songs.filter(
    (s) => !estBrouillon(s) && (s.pendingBandId ?? '') === band.id,
  ).length;
  const bandSetlists = [...setlists]
    .filter((sl) => sl.bandId === band.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function openRepertoire() {
    if (!band) return;
    // Règle 1 : le répertoire = la bibliothèque filtrée sur ce groupe.
    try {
      localStorage.setItem('sing2me/libBandFilter', band.id);
    } catch {
      // stockage indisponible : la bibliothèque s'ouvrira sans filtre
    }
    navigate('/');
  }

  /** Même règle pour les setlists (b214, signalement de Vincent) : depuis
   *  la fiche d'un groupe, on arrive sur l'onglet Setlists DÉJÀ filtré sur
   *  ce groupe. Sans ça, la porte « Setlists du groupe » ouvrait la liste
   *  entière — à chercher soi-même ce qu'on venait de désigner. */
  function openSetlists() {
    if (!band) return;
    try {
      localStorage.setItem('sing2me/setlistCtx', band.id);
    } catch {
      // stockage indisponible : la liste s'ouvrira sans filtre
    }
    navigate('/setlists');
  }

  return (
    <>
      <TopBar
        title={band.name || 'Groupe'}
        onBack={() => (editing ? stopEditing() : navigate('/bands'))}
      />
      <div className="page">
        {/* Un musicien a quitté CE groupe (b142) : signalé haut et clair,
            avec le geste qui répare juste à côté. */}
        {departures.length > 0 && (
          <div
            className="card"
            style={{ borderColor: 'var(--accent)', marginBottom: 12 }}
          >
            {departures.map((d) => (
              <div key={d.userId} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{d.name || t('Un musicien')}</strong>{' '}
                  {t(
                    "n'a plus accès au groupe — son application a été réinitialisée.",
                  )}
                </div>
                <div className="rowactions">
                  <button
                    className="btn"
                    disabled={reinvited.has(d.userId)}
                    onClick={() => {
                      const cid = band.cloudId;
                      if (!cid) return;
                      void (async () => {
                        try {
                          const s = await getValidSession();
                          if (!s) return;
                          await inviteToBand(s, cid, d.userId);
                          setReinvited((prev) => new Set(prev).add(d.userId));
                          setDepartures((list) =>
                            list.filter((x) => x.userId !== d.userId),
                          );
                        } catch {
                          /* silencieux : la carte reste */
                        }
                      })();
                    }}
                  >
                    {t('↻ Lui renvoyer la demande')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!editing && (
          <>
            {/* En-tête : photo + nom + membres + Inviter. */}
            <div className="bandhead">
              <button
                className="bandhead-photo"
                title={t('Modifier le groupe (photo, nom…)')}
                onClick={() => startEditing()}
              >
                {band.photo !== '' ? (
                  <img src={band.photo} alt={band.name} />
                ) : (
                  <span aria-hidden="true">👥</span>
                )}
              </button>
              <h1>{band.name || t('Groupe')}</h1>
              <button
                className="bandhead-members"
                onClick={() => setMembersOpen(true)}
                title={t('Voir les musiciens du groupe')}
              >
                <span className="avstack" aria-hidden="true">
                  {allMembers.slice(0, 4).map((m, i) => (
                    <span className="av" key={i}>
                      {photoOf(m) ? (
                        <img src={photoOf(m)} alt="" />
                      ) : (
                        (m.name.trim()[0] || '?').toUpperCase()
                      )}
                    </span>
                  ))}
                  {enAttente.slice(0, 2).map((m, i) => (
                    <span
                      className="av pending"
                      key={`p${i}`}
                      title={t("En attente d'acceptation")}
                    >
                      {(m.name.trim()[0] || '?').toUpperCase()}
                    </span>
                  ))}
                </span>
                <span>
                  {band.owned === false && (band.ownerName ?? '') !== ''
                    ? t('créé par {nom} · ', { nom: band.ownerName ?? '' })
                    : ''}
                  {/* Le total inclut les invités en attente, et le dit
                      (b255) : « le groupe c'est 3 musiciens dont un en
                      attente d'acceptation » (Vincent). Annoncer 2 quand on
                      en a invité 3, c'est faire douter du compte. */}
                  {memberCount > 1
                    ? t('{n} musiciens', { n: memberCount })
                    : t('{n} musicien', { n: memberCount })}
                  {enAttente.length > 0
                    ? t(', dont {n} en attente', { n: enAttente.length })
                    : ''}
                </span>
              </button>
              {isOwner ? (
                <button
                  className={`btn ${fewMembers ? '' : 'ghost'}`}
                  disabled={inviteBusy}
                  onClick={() => void openInvite()}
                  title={t(
                    'Inviter un musicien : il rejoint avec son compte, le répertoire se partage tout seul',
                  )}
                >
                  {inviteBusy ? '…' : `＋ ${t('Inviter')}`}
                </button>
              ) : (
                <span className="help" style={{ margin: 0 }}>
                  {t('Membre du groupe')}
                </span>
              )}
            </div>

            {/* CRÉÉ PAR UN COMPTE À MON NOM, MAIS PAS LE MIEN (b256, constat
                de Vincent : « non, c'est le groupe que j'ai créé moi »).
                L'écran disait alors deux choses contradictoires — « créé par
                tessier vincent » ET « Membre du groupe » — sans jamais
                expliquer laquelle des deux était en cause. C'est le cas de
                b246 vu du côté des groupes : une reconnexion avec une autre
                adresse e-mail crée un AUTRE compte, qui n'a rien créé.
                On le DIT, avec l'adresse en cours : c'est le seul fait qui
                permette de comprendre, et d'agir. */}
            {compteDifferentAuMemeNom && (
              <p
                className="help"
                style={{ color: 'var(--warn)', textAlign: 'center' }}
              >
                {t(
                  'Ce groupe a été créé par un compte différent du tien, au même nom d’artiste. Tu es connecté avec {email} : c’est peut-être une autre adresse que celle d’origine.',
                  { email: account?.email ?? '' },
                )}
              </p>
            )}

            {/* Trois grandes portes. */}
            <button
              className="bigrow"
              onClick={() => navigate(`/band/${band.id}/chat`)}
            >
              <span className="i" aria-hidden="true">
                💬
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Discussion')}</div>
                <div className="su">
                  {lastMsg
                    ? `« ${lastMsg.text.slice(0, 40)}${lastMsg.text.length > 40 ? '…' : ''} » · ${ago(lastMsg.at)}`
                    : t('Prépare répéts et concerts, propose des morceaux')}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            <button className="bigrow" onClick={openRepertoire}>
              <span className="i" aria-hidden="true">
                🎵
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Répertoire du groupe')}</div>
                <div className="su">
                  {repCount > 1
                    ? t('{n} morceaux', { n: repCount })
                    : t('{n} morceau', { n: repCount })}
                  {propCount > 0
                    ? propCount > 1
                      ? t(' · {n} propositions à valider', { n: propCount })
                      : t(' · {n} proposition à valider', { n: propCount })
                    : ''}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            <button className="bigrow" onClick={openSetlists}>
              <span className="i" aria-hidden="true">
                📋
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Setlists du groupe')}</div>
                <div className="su">
                  {bandSetlists.length === 0
                    ? t('Aucune setlist pour ce groupe')
                    : t('{nom} · {n} au total', {
                        nom: bandSetlists[0].name || t('(sans nom)'),
                        n: bandSetlists.length,
                      })}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            {/* PAGE PUBLIQUE DU GROUPE (b230, demande de Vincent). On ne
                quitte pas l'app pour la consulter (règle b187) : elle se
                recopie ici, et son adresse se copie pour être dictée. */}
            <button className="bigrow" onClick={() => setPeek(true)}>
              <span className="i" aria-hidden="true">
                👁
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Page publique du groupe')}</div>
                <div className="su">
                  {band.hiddenFromPublic === true
                    ? t('Masqué au public — pas d’adresse')
                    : t('Ce que voit quelqu’un qui tape son adresse')}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            {/* MODIFIER ET SUPPRIMER, SUR LA PAGE (b272, constat de Vincent :
                « le bouton permettant la modification / suppression est peu
                visible (les ⋯) »). Ces deux actions sont les seules qu'on
                vienne chercher sur la fiche d'un groupe une fois qu'il
                tourne ; les cacher derrière trois points, c'est les rendre
                introuvables. Le menu « ⋯ » disparaît avec : ses trois
                entrées existent maintenant sur la page — dont la page
                publique, déjà juste au-dessus. Deux chemins vers la même
                action, c'est exactement ce que la règle 3 interdit. */}
            <button className="bigrow" onClick={() => startEditing()}>
              <span className="i" aria-hidden="true">
                ✏️
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti">{t('Modifier le groupe')}</div>
                <div className="su">
                  {t('Photo, nom, présentation, liens, adresse publique')}
                </div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>

            <button className="bigrow" onClick={() => setConfirmDel(true)}>
              <span className="i" aria-hidden="true">
                {isOwner ? '🗑' : '🚪'}
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="ti" style={{ color: 'var(--danger)' }}>
                  {texteSuppression(band).libelle}
                </div>
                <div className="su">{texteSuppression(band).message}</div>
              </div>
              <span className="chev" aria-hidden="true">
                ›
              </span>
            </button>
          </>
        )}

        {peek && <BandPublicPeek band={band} onClose={() => setPeek(false)} />}

        {editing && (
          <>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          {shown.photo !== '' ? (
            <img
              src={shown.photo}
              alt={shown.name}
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border)',
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                background: 'var(--surface-high)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              👥
            </div>
          )}
          <div className="spacer" />
          <label className="btn ghost small" style={{ cursor: 'pointer' }}>
            {shown.photo !== ''
              ? t('Changer la photo')
              : t('Ajouter une photo')}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  update({ photo: await resizePhoto(file) });
                } catch {
                  alert(t("Cette image n'a pas pu être lue."));
                }
              }}
            />
          </label>
        </div>

        <Field label={t('Nom du groupe')}>
          <input
            type="text"
            value={shown.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label={t('Biographie')}>
          <textarea
            value={shown.bio}
            onChange={(e) => update({ bio: e.target.value })}
            placeholder={t('Quelques lignes sur le groupe…')}
          />
        </Field>
        <Field label={t('Lien de pourboire (PayPal.me, Lydia…)')}>
          <input
            type="url"
            value={shown.tipUrl}
            placeholder="https://paypal.me/legroupe"
            onChange={(e) => update({ tipUrl: e.target.value })}
          />
        </Field>

        {/* Le groupe face au public (b227) : masquage + adresse miroir. */}
        <BandPublicCard band={band} onSave={saveBand} />

        <h2 className="pagetitle">{t('Streaming & réseaux')}</h2>
        {shown.links.map((link) => (
          <div key={link.id} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              list="band-link-presets"
              value={link.label}
              placeholder="Spotify, Instagram…"
              style={{ flex: '0 0 132px' }}
              onChange={(e) =>
                update({
                  links: shown.links.map((l) =>
                    l.id === link.id ? { ...l, label: e.target.value } : l,
                  ),
                })
              }
            />
            <input
              type="url"
              value={link.url}
              placeholder="https://…"
              onChange={(e) =>
                update({
                  links: shown.links.map((l) =>
                    l.id === link.id ? { ...l, url: e.target.value } : l,
                  ),
                })
              }
            />
            <button
              className="btn ghost small"
              style={{ color: 'var(--danger)' }}
              onClick={() =>
                update({ links: shown.links.filter((l) => l.id !== link.id) })
              }
            >
              ✕
            </button>
          </div>
        ))}
        <datalist id="band-link-presets">
          {LINK_PRESETS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button
          className="btn ghost block"
          onClick={() =>
            update({ links: [...shown.links, { id: makeId(), label: '', url: '' }] })
          }
        >
          ＋ {t('Ajouter un lien')}
        </button>

        <h2 className="pagetitle">{t('Musiciens')}</h2>
        {/* Qui gère ce groupe — dit en clair, et transmissible (b213). */}
        <p className="help">
          {t('Créateur : {nom}', { nom: nomDuCreateur() })}
          {' · '}
          {t('c’est lui qui invite, retire un musicien et supprime le groupe.')}
        </p>
        {isOwner && cloudMembers.length > 0 && (
          <div style={{ marginBottom: 'var(--sp-3)' }}>
            <button
              type="button"
              className="btn ghost small"
              title={t(
                'Confier le groupe à un autre musicien : c’est lui qui le gérera',
              )}
              onClick={() => setTransferOpen(true)}
            >
              {t('⭐ Transmettre le groupe…')}
            </button>
          </div>
        )}
        {cloudMembers.length > 0 && (
          <>
            <p className="help">{t('Membres avec compte mojosong :')}</p>
            {cloudMembers.map((m) => (
              <div
                key={m.user_id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ color: 'var(--accent)' }}>✓</span>
                <span style={{ flex: 1 }}>
                  {m.name || t('(sans nom)')}
                  {m.instrument !== '' && (
                    <span className="stauthor"> · {m.instrument}</span>
                  )}
                </span>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title={t('Retirer du groupe')}
                  onClick={() => {
                    const cid = band.cloudId;
                    if (!cid) return;
                    if (
                      !confirm(
                        t('Retirer {nom} du groupe ?', {
                          nom: m.name || t('ce musicien'),
                        }),
                      )
                    )
                      return;
                    void (async () => {
                      try {
                        const s = await getValidSession();
                        if (!s) return;
                        await removeBandMember(s, cid, m.user_id);
                        setCloudMembers((list) =>
                          list.filter((x) => x.user_id !== m.user_id),
                        );
                        // La ligne LOCALE part avec (b409, constat de
                        // Vincent) : la laisser jusqu'au prochain sondage
                        // bloquait la réinvitation — la recherche croyait
                        // le musicien encore membre (filtre b403), sans un
                        // mot.
                        saveBand(
                          tamponneBand({
                            ...band,
                            members: band.members.filter(
                              (x) => (x.userId ?? '') !== m.user_id,
                            ),
                          }),
                        );
                      } catch {
                        alert(
                          t('Impossible de retirer ce membre pour le moment.'),
                        );
                      }
                    })();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="spacer" />
            <p className="help">{t('Autres musiciens (saisis à la main) :')}</p>
          </>
        )}
        {/* Musiciens saisis à la main, SANS ceux qui ont déjà un compte
            dans la liste au-dessus (b143) : « Dam » invité et « Dam »
            connecté sont la même personne. */}
        {manualMembers.map((m) => (
          <div key={m.id} style={{ marginBottom: 10 }}>
          {m.pending === true ? (
            <div className="pendingmember">
              <span className="av pending" aria-hidden="true">
                {(m.name.trim()[0] || '?').toUpperCase()}
              </span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="title">{m.name || t('(invité)')}</div>
                <div className="sub">{t("⏳ En attente d'acceptation")}</div>
              </div>
              {isOwner && (
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title={t("Annuler l'invitation")}
                  onClick={() => {
                    // Révoque l'invitation CÔTÉ SERVEUR (b307) — lien nominatif
                    // ET/OU invitation d'annuaire — best-effort : le retrait
                    // local a lieu tout de suite, sans dépendre du réseau.
                    const cid = cloudRef?.cloudId ?? band.cloudId ?? '';
                    if (cid !== '') {
                      void (async () => {
                        try {
                          const s = await getValidSession();
                          if (s) await cancelBandInvite(s, cid, m.userId ?? '', m.name);
                        } catch {
                          /* l'annulation locale a déjà eu lieu */
                        }
                      })();
                    }
                    update({
                      members: shown.members.filter((x) => x.id !== m.id),
                    });
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ) : (
          <>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {m.verified === true && (
              <span
                title={t(
                  'Profil mojosong confirmé (carte de musicien reçue)',
                )}
                style={{ color: 'var(--accent)', flexShrink: 0 }}
              >
                ✓
              </span>
            )}
            {m.verified === true ? (
              // Le nom d'un membre qui a son propre compte lui appartient :
              // personne d'autre ne peut le modifier (évite les désyncs et
              // les doublons). Seul lui le change, dans son onglet Artiste.
              <div
                className="grow"
                style={{ minWidth: 0 }}
                title={t(
                  'Nom géré par son compte — seul ce musicien peut le modifier',
                )}
              >
                <div className="title">{m.name || t('Musicien')}</div>
                <div className="sub">{t('Nom géré par son compte')}</div>
              </div>
            ) : (
              <input
                type="text"
                value={m.name}
                placeholder={t('Nom du musicien')}
                onChange={(e) =>
                  update({
                    members: shown.members.map((x) =>
                      x.id === m.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
            )}
            <input
              type="text"
              value={m.instrument}
              placeholder={t('Instrument')}
              style={{ maxWidth: 160 }}
              onChange={(e) =>
                update({
                  members: shown.members.map((x) =>
                    x.id === m.id ? { ...x, instrument: e.target.value } : x,
                  ),
                })
              }
            />
            {isOwner && (
              <button
                className="btn ghost small"
                style={{ color: 'var(--danger)' }}
                title={t('Retirer ce musicien')}
                onClick={() =>
                  update({ members: shown.members.filter((x) => x.id !== m.id) })
                }
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>
          <details className="stfold" style={{ margin: '4px 0 0 8px' }}>
            <summary>
              {t('Matériel')}
              {(m.gear ?? []).length > 0 ? ` (${(m.gear ?? []).length})` : ''}
            </summary>
            <div className="spacer" />
            <GearEditor
              items={m.gear ?? []}
              onChange={(gear) =>
                update({
                  members: shown.members.map((x) =>
                    x.id === m.id ? { ...x, gear } : x,
                  ),
                })
              }
            />
          </details>
          </>
          )}
          </div>
        ))}
        {isOwner && (
          <button
            className="btn ghost block"
            onClick={() =>
              update({
                members: [...shown.members, { id: makeId(), name: '', instrument: '' }],
              })
            }
          >
            ＋ {t('Ajouter un musicien')}
          </button>
        )}

        <div className="rowactions">
          {isOwner && (
            <button
              className="btn"
              disabled={inviteBusy}
              onClick={() => void openInvite()}
            >
              {inviteBusy ? '…' : `📨 ${t('Inviter un musicien')}`}
            </button>
          )}
          <button
            className="btn ghost"
            disabled={publicPayload === null}
            onClick={() => setShare(true)}
          >
            {t('Page publique / QR')}
          </button>
          <button
            className="btn danger"
            onClick={() => setConfirmDel(true)}
          >
            {isOwner ? t('Supprimer le groupe') : t('Quitter le groupe')}
          </button>
        </div>
        <p className="help">
          {t(
            "L'invitation contient le répertoire du groupe (morceaux de ses setlists). Si le musicien a un compte mojosong, il rejoint le groupe en un clic et apparaît ici avec ✓. Sinon, il peut te renvoyer sa « carte de musicien » (l'ouvrir ici met à jour la liste manuelle).",
          )}
        </p>
        {editSaved && !editDirty && (
          <div className="savedhint">✓ {t('Enregistré')}</div>
        )}
        <div className="spacer" />
        {/* Sortie visible seulement quand tout est enregistré : quand le
            brouillon diffère, la barre Valider / Annuler prend la main. */}
        {!editDirty && (
          <button
            className="btn ghost small"
            onClick={() => stopEditing()}
          >
            ← {t('Terminer')}
          </button>
        )}
          </>
        )}
      </div>
      <SaveBar visible={editDirty} onSave={confirmEdit} onCancel={cancelEdit} />

      {addOpen && (
        <Modal title={t('Ajouter un membre')} onClose={() => setAddOpen(false)}>
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'Cherche un musicien qui a déjà mojosong (il devra accepter), ou envoie-lui un lien / email.',
            )}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={dirQuery}
              placeholder={t('Nom du musicien…')}
              autoFocus
              onChange={(e) => setDirQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doSearch();
              }}
            />
            <button
              className="btn"
              style={{ flexShrink: 0 }}
              disabled={dirQuery.trim().length < 2 || dirBusy}
              onClick={() => void doSearch()}
            >
              {dirBusy ? '…' : t('Chercher')}
            </button>
          </div>
          {dirMsg && <p className="help">{dirMsg}</p>}
          {dirResults.length > 0 && (
            <div className="list">
              {dirResults.map((person) => (
                <div
                  className="row"
                  key={person.user_id}
                  style={{ cursor: 'default' }}
                >
                  <Avatar name={person.name} photo={person.photo} />
                  <div className="grow">
                    <div className="title">
                      {person.name || t('(sans nom)')}
                    </div>
                    {dejaAvecMoi(person.user_id) !== '' ? (
                      <div className="sub" style={{ color: 'var(--accent)' }}>
                        {dejaAvecMoi(person.user_id)}
                      </div>
                    ) : (
                      person.instrument !== '' && (
                        <div className="sub">{person.instrument}</div>
                      )
                    )}
                  </div>
                  {invited.has(person.user_id) ? (
                    <span style={{ color: 'var(--accent)', fontWeight: 650 }}>
                      ✓ {t('Invité')}
                    </span>
                  ) : (
                    <button
                      className="btn ghost small"
                      onClick={() => void invitePerson(person)}
                    >
                      {t('Inviter')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="spacer" />
          <button
            className="btn ghost block"
            onClick={() => {
              setAddOpen(false);
              setInvite(true);
            }}
          >
            🔗 {t('Inviter par lien / email')}
          </button>
        </Modal>
      )}
      {invitePrompt && (
        <Modal
          title={t('Inviter un musicien')}
          onClose={() => setInvitePrompt(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              "Qui invites-tu ? Note son prénom : il apparaîtra « en attente » jusqu'à ce qu'il rejoigne, puis son nom d'artiste le remplacera.",
            )}
          </p>
          <input
            type="text"
            value={pendingName}
            placeholder={t("Prénom de l'invité·e")}
            autoFocus
            onChange={(e) => setPendingName(e.target.value)}
          />
          {/* DÉJÀ SUR MOJOSONG ? (b252, demande de Vincent : « il faut que
              l'invitation puisse vérifier si la personne n'est pas déjà
              inscrite »). On cherche pendant qu'il tape : si la personne a un
              compte, l'invitation part DIRECTEMENT chez elle — pas de lien à
              envoyer, et sa ligne porte son identifiant tout de suite (b250),
              donc aucun doublon possible à l'adhésion. */}
          {verdictAnnuaire !== '' && (
            <p className="help" style={{ margin: '8px 0 0' }}>
              {verdictAnnuaire === 'membre'
                ? t(
                    'Cette personne est déjà dans le groupe, ou déjà invitée : elle n’a pas besoin d’une nouvelle invitation. Pour la réinviter après un départ, retire d’abord sa ligne de la liste des musiciens.',
                  )
                : verdictAnnuaire === 'introuvable'
                  ? t(
                      'Aucun compte mojosong à ce nom dans l’annuaire — c’est normal s’il n’a pas encore l’app : le lien d’invitation est fait pour ça.',
                    )
                  : t(
                      'L’annuaire ne répond pas pour le moment — le lien d’invitation fonctionne quand même.',
                    )}
            </p>
          )}
          {dejaInscrits.length > 0 && (
            <>
              <div className="spacer" />
              <p className="help" style={{ margin: 0 }}>
                {dejaInscrits.length === 1
                  ? t('Cette personne est déjà sur mojosong :')
                  : t('Ces musiciens sont déjà sur mojosong :')}
              </p>
              {dejaInscrits.map((p) => (
                <div className="row" key={p.user_id}>
                  <Avatar name={p.name} photo={p.photo} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="title">{p.name}</div>
                    {dejaAvecMoi(p.user_id) !== '' ? (
                      <div className="sub" style={{ color: 'var(--accent)' }}>
                        {dejaAvecMoi(p.user_id)}
                      </div>
                    ) : (
                      p.instrument !== '' && (
                        <div className="sub">{p.instrument}</div>
                      )
                    )}
                  </div>
                  <button
                    className="btn small"
                    disabled={invited.has(p.user_id) || inviteBusy}
                    onClick={() => void invitePerson(p)}
                  >
                    {invited.has(p.user_id) ? `✓ ${t('Invité')}` : t('Inviter')}
                  </button>
                </div>
              ))}
              <p className="help" style={{ margin: '4px 0 0' }}>
                {t(
                  'Elle recevra l’invitation dans son application : rien à envoyer.',
                )}
              </p>
            </>
          )}
          <div className="spacer" />
          {inviteError !== null && (
            <p className="help" style={{ color: 'var(--danger)' }}>
              {inviteError}
            </p>
          )}
          <button
            className="btn block"
            disabled={inviteBusy || pendingName.trim() === ''}
            onClick={() => void creerInvitation()}
          >
            {inviteBusy ? '…' : t("Obtenir le lien d'invitation")}
          </button>
          {/* Plus de « partager sans noter de prénom » (b252) : ce bouton
              produisait un lien SANS invitation — donc, depuis b251, un lien
              que le destinataire ne pouvait pas utiliser, sans le moindre
              message. C'était aussi le dernier chemin vers un lien ouvert,
              que b251 avait justement pour objet de supprimer. */}
        </Modal>
      )}
      {invite && invitePayload && (
        <ShareModal
          title={t('Inviter dans « {nom} »', { nom: band.name })}
          payload={invitePayload}
          onClose={() => setInvite(false)}
        />
      )}
      {share && publicPayload && (
        <ShareModal
          title={t('Page publique — {nom}', { nom: band.name })}
          payload={publicPayload}
          onClose={() => setShare(false)}
        />
      )}
      {/* « ⋯ » de l'en-tête : tout l'avancé du groupe. */}
      {removeMember && (
        <ConfirmSheet
          title={
            removeMember.pending === true
              ? t('Annuler l’invitation de {nom} ?', {
                  nom: removeMember.name || t('ce musicien'),
                })
              : t('Retirer {nom} du groupe ?', {
                  nom: removeMember.name || t('ce musicien'),
                })
          }
          message={
            removeMember.pending === true
              ? t(
                  'Son invitation sera annulée. Tu pourras la renvoyer plus tard.',
                )
              : t(
                  "Il perdra l'accès au répertoire et aux setlists du groupe. Sa bibliothèque personnelle, elle, ne bouge pas. Tu pourras le réinviter plus tard.",
                )
          }
          confirmLabel={
            removeMember.pending === true
              ? t('Annuler l’invitation')
              : t('Retirer du groupe')
          }
          danger
          onConfirm={() => {
            const cid = band.cloudId;
            const target = removeMember.userId;
            const name = removeMember.name;
            const wasPending = removeMember.pending === true;
            void (async () => {
              try {
                const s = await getValidSession();
                if (s && cid) {
                  if (wasPending) {
                    // Au mieux : annule l'invitation côté serveur — le compte
                    // visé (si connu) ET le lien nominatif (par le nom).
                    await cancelBandInvite(s, cid, target, name);
                  } else {
                    await removeBandMember(s, cid, target);
                    setCloudMembers((list) =>
                      list.filter((x) => x.user_id !== target),
                    );
                    setDepartures((list) =>
                      list.filter((x) => x.userId !== target),
                    );
                  }
                }
                // Retirer la ligne LOCALE dans tous les cas (invité comme
                // membre) : sinon la personne réapparaît juste en dessous. Un
                // groupe purement local (sans cloudId) passe aussi par ici.
                saveBand(tamponneBand({
                  ...band,
                  members: band.members.filter(
                    (x) => !sameMusician(x.name, name),
                  ),
                }));
              } catch {
                /* silencieux : la liste se rafraîchira à la prochaine ouverture */
              }
            })();
          }}
          onClose={() => setRemoveMember(null)}
        />
      )}

      {membersOpen && (
        <Modal
          title={t('Musiciens du groupe')}
          onClose={() => setMembersOpen(false)}
        >
          {tousLesMusiciens.length === 0 && (
            <p className="help">{t("Aucun musicien pour l'instant.")}</p>
          )}
          {tousLesMusiciens.map((m, i) => {
            const isMe = estMoi(m);
            // Membre avec compte : le créateur peut le retirer du groupe
            // (b143). Les musiciens saisis à la main n'ont pas de compte.
            const cloud = cloudMembers.find((c) => sameMusician(c.name, m.name));
            const canRemove =
              band.owned === true &&
              !isMe &&
              m.pending !== true &&
              cloud !== undefined;
            // Invité PAS ENCORE accepté : le créateur peut annuler son
            // invitation (b312, demande de Vincent — le bouton manquait ici,
            // dans la liste « Musiciens du groupe »). On retire la ligne
            // locale et on annule l'invitation côté serveur, au mieux.
            const canCancelInvite = band.owned === true && m.pending === true;
            // Ligne CLIQUABLE avec ses actions dedans (b145) — un <button>
            // dans un <button> est invalide en HTML : la corbeille passait
            // à la ligne, décalée sous le musicien.
            return (
              <div
                className="row"
                key={`a${i}`}
                style={{ cursor: 'pointer' }}
                title={
                  isMe
                    ? t('Voir / modifier ma fiche')
                    : t('Voir la fiche de {nom}', { nom: m.name })
                }
                onClick={() => {
                  if (isMe) {
                    setMembersOpen(false);
                    navigate('/artist');
                  } else {
                    setViewMember({
                      name: m.name,
                      instrument: m.instrument,
                      photo: photoOf(m),
                      userId: m.userId,
                    });
                  }
                }}
              >
                <Avatar name={m.name} photo={photoOf(m)} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">
                    {m.name || t('Musicien')}
                    {/* Qui gère le groupe se lit sur la ligne (b213). */}
                    {estLeCreateur(m) && (
                      <span className="badge-next">{t('⭐ créateur')}</span>
                    )}
                    {/* Un invité compte dans le total (b255) : il doit donc
                        figurer dans la liste, et se distinguer d'un membre. */}
                    {m.pending === true && (
                      <span className="badge-next">
                        {t("En attente d'acceptation")}
                      </span>
                    )}
                  </div>
                  {(m.instrument ?? '') !== '' && (
                    <div className="sub">{m.instrument}</div>
                  )}
                </div>
                {(canRemove || canCancelInvite) && (
                  <button
                    className="btn icon"
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                    title={
                      canCancelInvite
                        ? t('Annuler l’invitation de {nom}', {
                            nom: m.name || t('ce musicien'),
                          })
                        : t('Retirer {nom} du groupe', {
                            nom: m.name || t('ce musicien'),
                          })
                    }
                    aria-label={
                      canCancelInvite
                        ? t('Annuler l’invitation de {nom}', {
                            nom: m.name || t('ce musicien'),
                          })
                        : t('Retirer {nom} du groupe', {
                            nom: m.name || t('ce musicien'),
                          })
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setRemoveMember({
                        userId: canCancelInvite
                          ? (m.userId ?? '')
                          : cloud!.user_id,
                        name: m.name,
                        pending: canCancelInvite,
                      });
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
                <span className="chevron" aria-hidden="true">
                  <Icon name="chevron-right" size={16} />
                </span>
              </div>
            );
          })}
        </Modal>
      )}
      {viewMember && (
        <Modal title={t('Fiche musicien')} onClose={() => setViewMember(null)}>
          <div style={{ textAlign: 'center', marginBottom: 'var(--sp-3)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 8,
              }}
            >
              <Avatar name={viewMember.name} photo={viewMember.photo} />
            </div>
            <h2 style={{ margin: '0 0 2px' }}>
              {viewMember.name || t('Musicien')}
            </h2>
            {(viewMember.instrument ?? '') !== '' && (
              <p className="help" style={{ margin: 0 }}>
                {viewMember.instrument}
              </p>
            )}
          </div>
          {memberPage === undefined ? (
            <p className="help" style={{ textAlign: 'center' }}>
              {t('Recherche de sa page publique…')}
            </p>
          ) : memberPage === null ? (
            <p className="help" style={{ textAlign: 'center' }}>
              {t(
                'Ce musicien n’a pas encore de page publique. Elle se crée toute seule à sa première ouverture de l’application — s’il vient de s’inscrire, elle apparaîtra ici sous peu.',
              )}
            </p>
          ) : (
            <>
              {(memberPage.profile.bio ?? '') !== '' && (
                <p className="help" style={{ whiteSpace: 'pre-wrap' }}>
                  {memberPage.profile.bio}
                </p>
              )}
              {(memberPage.profile.links ?? []).some(
                (l) => l.url.trim() !== '',
              ) && (
                <LinkPreviews links={memberPage.profile.links ?? []} showChips />
              )}
              {/* On ne QUITTE plus l'app pour voir cette fiche (b187).
                  Un lien ordinaire remplaçait l'écran (b175) ; l'ouvrir dans
                  un onglet à part ne marche pas davantage dans l'app
                  installée sur iPhone, où le nouvel onglet s'affiche sans
                  barre de navigation : on restait bloqué sur la page de
                  Marco, sans retour possible. La fiche est déjà ici — photo,
                  bio, liens. Il ne manquait qu'un moyen de PARTAGER son
                  adresse, ce que fait ce bouton. */}
              <button
                className="btn block"
                onClick={() => {
                  const url = `${location.origin}/${memberPage.name}`;
                  void navigator.clipboard
                    ?.writeText(url)
                    .then(() => toast.show(t('Lien de sa page copié.')))
                    .catch(() => toast.show(url));
                }}
              >
                🔗 {t('Copier le lien de sa page')}
              </button>
            </>
          )}
        </Modal>
      )}
      {/* Transmettre le groupe (b213) : à un MEMBRE avec compte — on ne
          confie pas la gestion d'un groupe à un nom saisi à la main. */}
      {transferOpen && (
        <Modal
          title={t('Transmettre le groupe')}
          onClose={() => setTransferOpen(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'À qui confies-tu ce groupe ? Il pourra inviter, retirer un musicien et supprimer le groupe. Tu resteras membre — mais seul lui pourra te le rendre.',
            )}
          </p>
          {cloudMembers.length === 0 && (
            <p className="help">
              {t(
                'Aucun musicien avec un compte pour l’instant : invite-le d’abord.',
              )}
            </p>
          )}
          {cloudMembers.map((m) => (
            <div
              className="row"
              key={m.user_id}
              style={{ cursor: 'pointer' }}
              onClick={() =>
                setTransferTo({
                  userId: m.user_id,
                  name: m.name || t('ce musicien'),
                })
              }
            >
              <Avatar name={m.name} photo={m.photo} />
              <div className="grow" style={{ minWidth: 0, marginLeft: 10 }}>
                <div className="title">{m.name || t('Musicien')}</div>
                {m.instrument !== '' && (
                  <div className="sub">{m.instrument}</div>
                )}
              </div>
              <span className="chevron" aria-hidden="true">
                <Icon name="chevron-right" size={16} />
              </span>
            </div>
          ))}
        </Modal>
      )}
      {transferTo && (
        <ConfirmSheet
          title={t('Confier « {groupe} » à {nom} ?', {
            groupe: band.name || t('ce groupe'),
            nom: transferTo.name,
          })}
          message={t(
            'Il gérera le groupe : inviter, retirer un musicien, le supprimer. Tu y restes comme musicien, et tu gardes toutes tes partitions — mais tu ne pourras pas reprendre la main toi-même.',
          )}
          confirmLabel={transferBusy ? '…' : t('Transmettre')}
          onConfirm={() => {
            const cid = band.cloudId;
            const cible = transferTo;
            if (!cid || !cible) return;
            setTransferBusy(true);
            void (async () => {
              try {
                const s = await getValidSession();
                if (!s) throw new Error('hors ligne');
                await transferBand(s, cid, cible.userId);
                saveBand({ ...band, owned: false, ownerName: cible.name });
                setOwner({ userId: cible.userId, name: cible.name, photo: '' });
                setTransferOpen(false);
                toast.show(
                  t('{nom} gère désormais « {groupe} ».', {
                    nom: cible.name,
                    groupe: band.name || t('le groupe'),
                  }),
                );
              } catch {
                toast.show(
                  t('Impossible de transmettre le groupe pour le moment.'),
                );
              } finally {
                setTransferBusy(false);
              }
            })();
          }}
          onClose={() => setTransferTo(null)}
        />
      )}
      {confirmDel && (
        <ConfirmSheet
          title={texteSuppression(band).titre}
          message={texteSuppression(band).message}
          confirmLabel={texteSuppression(band).libelle}
          danger
          onConfirm={() => void dissolveOrLeave()}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}
