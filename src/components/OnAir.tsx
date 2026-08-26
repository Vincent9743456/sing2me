/**
 * Mode ON AIR : bouton global + panneau de contrôle du direct.
 * Quand le direct est actif, la partition courante (paroles seules)
 * est publiée pour les spectateurs (page /#/live).
 */
import QRCode from 'qrcode';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  fetchLive,
  fetchLiveById,
  fetchLiveForBands,
  fetchLiveStats,
  fetchMessages,
  heartTotals,
  LiveMode,
  LivePublicSong,
  LiveSong,
  LiveStatus,
  currentLiveRef,
  liveUrl,
  messagesBySetlist,
  messagesBySong,
  pushBandSong,
  pushLive,
  clotureEnAttente,
  noterClotureEnAttente,
  oublierCloture,
  rejouerCloture,
  pushSetlist,
} from '../lib/live';
import { getValidSession } from '../lib/auth';
import { liveReady } from '../lib/liveAuth';
import { bandToProfile } from '../lib/model';
import {
  cachedPublicName,
  ensurePublicPage,
  ficheGroupe,
  groupesPublics,
  profilAPublier,
  publierFichesGroupes,
  monAdressePublique,
} from '../lib/publicPages';
import { cibleDuLive, libelleBadge } from '../lib/livenav';
import { navigate } from '../router';
import { useStore } from '../store';
import { t } from '../i18n';
import { useWakeLock } from '../lib/wakelock';
import { ConfirmSheet } from './Feedback';
import { LIVE_LAUNCHED_KEY } from './Onboarding';
import { Modal } from './ui';

/**
 * « Selon le contexte » : d'après la page sous le panneau ON AIR, renvoie la
 * route du mode scène à ouvrir en passant en direct — la setlist courante
 * (vue, édition, aperçu ou lecture d'un de ses morceaux) ou le morceau
 * courant. Ailleurs (bibliothèque, groupe…) : null (rien ne s'ouvre).
 */
function stageTargetFromHash(hash: string): string | null {
  let m: RegExpMatchArray | null;
  // Depuis un morceau DANS la setlist, on emporte sa position : le mode
  // scène s'ouvre sur CE morceau, pas sur le premier du set (b164).
  if ((m = hash.match(/^#\/setlist\/([^/]+)\/song\/(\d+)$/))) {
    return `/stage/${m[1]}/${m[2]}`;
  }
  if ((m = hash.match(/^#\/setlist\/([^/]+)(?:\/edit|\/apercu)?$/))) {
    return `/stage/${m[1]}`;
  }
  if ((m = hash.match(/^#\/song\/([^/]+?)(?:\/edit)?$/))) {
    return `/stage/song/${m[1]}`;
  }
  return null;
}

interface OnAirValue {
  status: LiveStatus;
  /** Session en cours : concert (public) ou répétition (musiciens seuls). */
  mode: LiveMode;
  /** La page courante déclare ce que voit le chanteur. */
  setCurrent: (song: LiveSong | null) => void;
  /** Une page de setlist déclare la setlist à diffuser au public. */
  setSetlist: (songs: LivePublicSong[] | null, name?: string, id?: string) => void;
}

const OnAirContext = createContext<OnAirValue | null>(null);
const StatusContext = createContext<{
  status: LiveStatus;
  hearts: number;
  /** Spectateurs connectés — seulement sur l'appareil du LANCEUR (c'est son
   *  sondage `?id=`, b345) ; null ailleurs ou hors session. */
  viewers: number | null;
  /** Setlist en cours de diffusion (id LOCAL, si le diffuseur l'a donné) :
   *  c'est elle qui rend la Régie atteignable depuis le badge (b378). */
  regieSetlistId: string;
  openPanel: () => void;
} | null>(null);

/** État du live pour les écrans (b359, section EN LIVE de l'onglet Live) :
 *  statut courant + ouverture du panneau. Null hors OnAirProvider. */
export function useLiveStatus() {
  return useContext(StatusContext);
}

export function OnAirProvider({ children }: { children: React.ReactNode }) {
  const {
    prefs,
    artist,
    bands,
    songs,
    saveSong,
    concerts,
    setlists,
    saveSetlist,
  } = useStore();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [hearts, setHearts] = useState(0);
  const [who, setWho] = useState<string>(
    () => localStorage.getItem('sing2me/onairWho') ?? 'solo',
  );
  const [mode, setMode] = useState<LiveMode>(() =>
    localStorage.getItem('sing2me/onairMode') === 'repet' ? 'repet' : 'concert',
  );

  useEffect(() => {
    localStorage.setItem('sing2me/onairMode', mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('sing2me/onairWho', who);
  }, [who]);

  /*
   * CONCERT DU JOUR → LIVE (b207, décision Vincent).
   *
   * Le concert préparé (lieu, groupe, setlist) et le direct décrivaient la
   * même soirée en s'ignorant : il fallait renommer le live après coup.
   * Ils se rejoignent ici — mais par une CONFIRMATION, jamais par une
   * déduction. L'ancien code prenait en silence le premier concert de la
   * journée, sans regarder qui jouait : deviner un rattachement à l'heure
   * nous a déjà coûté b138, b186 et b188. Le temps SUGGÈRE (on ne propose
   * que les concerts du jour), il ne conclut pas.
   *
   * Le filtre d'identité reprend la règle des lives (b183/b188) : un live
   * solo ne peut porter qu'un concert solo, un live de groupe qu'un concert
   * de CE groupe. Qui a CRÉÉ le concert n'entre pas en compte — c'est
   * l'appartenance qui décide, sinon le concert créé par Marco empêcherait
   * de rattacher le live que je lance pour le même groupe.
   */
  const concertsDuJour = concerts
    .filter((c) => c.date === todayStr)
    .filter((c) => (who === 'solo' ? (c.bandId ?? '') === '' : c.bandId === who))
    .sort((a, b) => a.time.localeCompare(b.time));
  const [concertId, setConcertId] = useState('');
  // Proposition : le premier concert du jour qui correspond à l'identité
  // choisie. Si on change de groupe, un choix devenu impossible retombe.
  useEffect(() => {
    setConcertId((cur) =>
      concertsDuJour.some((c) => c.id === cur)
        ? cur
        : (concertsDuJour[0]?.id ?? ''),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, concertsDuJour.map((c) => c.id).join(',')]);
  const todayConcert = concertsDuJour.find((c) => c.id === concertId) ?? null;

  // Les groupes qu'un live peut porter (un groupe masqué au public n'en
  // porte jamais, b227) — sert au sélecteur ET à la garde de collision.
  const bandsVisibles = bands.filter((b) => b.hiddenFromPublic !== true);
  const performerBase =
    who === 'solo'
      ? artist.name !== ''
        ? artist
        : null
      : (() => {
          // Un groupe masqué ne porte pas de direct (b227) : s'il l'est
          // devenu depuis le choix, on se présente en solo plutôt que de
          // l'exposer — même garde que plus bas sur `liveBand`.
          const b = bands.find(
            (x) => x.id === who && x.hiddenFromPublic !== true,
          );
          return b ? bandToProfile(b) : artist.name !== '' ? artist : null;
        })();
  // L'écran public suit TES réglages, même en groupe ; le matériel
  // (privé) ne part jamais dans l'état du direct.
  const performer = performerBase
    ? { ...performerBase, gear: undefined, publicScreen: artist.publicScreen }
    : null;
  const [status, setStatus] = useState<LiveStatus>(
    () => (localStorage.getItem('sing2me/onair') as LiveStatus) || 'off',
  );
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  // L'arrêt n'a pas atteint le serveur : on propose de couper ici (b216).
  const [arretForce, setArretForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  // Refonte b345 : confirmation avant Terminer, avertissement de collision
  // (un autre membre déjà en live), copie du lien, durée écoulée et
  // spectateurs de la session.
  const [confirmFin, setConfirmFin] = useState(false);
  const [collision, setCollision] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [dureeTxt, setDureeTxt] = useState('');
  const [viewers, setViewers] = useState<number | null>(null);
  // Nom public dictable, annoncé au micro pendant le concert
  // (« dis-leur livemyband.fr/tonnom ») — demande Vincent, b136.
  const [publicName, setPublicName] = useState(() => cachedPublicName());
  const currentRef = useRef<LiveSong | null>(null);
  const setlistRef = useRef<LivePublicSong[] | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  // Une page de setlist (mode scène ou lecture d'un morceau de la setlist)
  // déclare la setlist à diffuser : le public peut alors la parcourir
  // lui-même. Poussée si le direct est actif. L'effacement est différé pour
  // ne pas clignoter quand on passe d'un morceau à l'autre de la setlist.
  const setlistClearTimer = useRef<number | null>(null);
  // Setlist en cours de diffusion, par son id LOCAL (b378) : c'est ce qui
  // rend la Régie atteignable depuis le badge du header. '' = aucune.
  const [setlistIdEnCours, setSetlistIdEnCours] = useState('');
  const setSetlist = useCallback(
    (songs: LivePublicSong[] | null, name = '', id = '') => {
      setlistRef.current = songs;
      setSetlistIdEnCours(songs && songs.length > 0 ? id : '');
      if (statusRef.current !== 'on') return;
      if (songs && songs.length > 0) {
        if (setlistClearTimer.current !== null) {
          window.clearTimeout(setlistClearTimer.current);
          setlistClearTimer.current = null;
        }
        void pushSetlist(prefs.liveKey, songs, name);
      } else {
        if (setlistClearTimer.current !== null) {
          window.clearTimeout(setlistClearTimer.current);
        }
        setlistClearTimer.current = window.setTimeout(() => {
          setlistClearTimer.current = null;
          if (
            (setlistRef.current?.length ?? 0) === 0 &&
            statusRef.current === 'on'
          ) {
            void pushSetlist(prefs.liveKey, null);
          }
        }, 900);
      }
    },
    [prefs.liveKey],
  );

  useEffect(() => {
    localStorage.setItem('sing2me/onair', status);
  }, [status]);

  // Pendant le direct : le musicien voit les ❤ arriver en temps réel
  useEffect(() => {
    if (status !== 'on') return;
    let cancelled = false;
    const tick = async () => {
      try {
        // Multi-live : le leader sonde SON direct par son IDENTIFIANT
        // (b217) — pas par le code de salon, que la clôture efface.
        const ref = currentLiveRef();
        const s = ref?.liveId
          ? await fetchLiveById(ref.liveId)
          : await fetchLive(ref?.joinCode ?? '');
        if (cancelled) return;
        setHearts(s.hearts);
        setViewers(typeof s.viewers === 'number' ? s.viewers : null);
        // Le serveur peut couper un direct oublié (4 h, ou 1 h sans
        // partition) : on répercute l'arrêt sur l'UI du leader — et on
        // rapatrie les ❤ du direct, que personne n'aurait sinon récupérés
        // faute de clic sur « Arrêter » (b138).
        if (s.status === 'off') {
          setStatus('off');
          setPanel(false);
          window.setTimeout(() => void syncHeartsRef.current(), 1200);
        }
      } catch {
        // silencieux
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    // Clôture restée en travers : on rappelle le serveur tant qu'il le faut
    // — mais JAMAIS pendant un direct (b217). Sinon le rattrapage fermait le
    // direct qu'on venait de lancer, une seconde après : le bouton passait
    // au rouge puis revenait au vert (signalement de Vincent).
    const rattraper = () => {
      if (statusRef.current !== 'off') return;
      if (clotureEnAttente()) void rejouerCloture(prefs.liveKey);
    };
    const rattrapage = window.setInterval(rattraper, 15000);
    rattraper();
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.clearInterval(rattrapage);
    };
  }, [status, prefs.liveKey]);

  // Reporte les totaux de ❤ (historique des directs) dans la bibliothèque.
  const syncHearts = useCallback(async () => {
    try {
      // Mon nom d'artiste ET celui de TOUS mes groupes (b139) : chaque
      // membre garde l'historique des ❤ du groupe dans sa bibliothèque,
      // pas seulement celui qui a lancé le direct.
      const names = [
        artist.name,
        performer?.name ?? '',
        ...bands.map((b) => b.name),
      ].filter((n) => n.trim() !== '');
      const totals = heartTotals(
        await fetchLiveStats(prefs.liveKey, [...new Set(names)]),
      );
      const allMessages = await fetchMessages(prefs.liveKey, [
        ...new Set(names),
      ]);
      const bySong = messagesBySong(allMessages);
      // Les mots du public appartiennent au CONCERT : ils se rangent dans
      // la setlist jouée (b139), en plus de la trace laissée sur le
      // morceau qui passait à cet instant.
      const bySetlist = messagesBySetlist(allMessages);
      for (const sl of setlists) {
        const msgs = bySetlist.get(sl.name);
        if (msgs.length === 0) continue;
        const known = new Set((sl.fanMessages ?? []).map((m) => m.id));
        const fresh = msgs
          .map((m) => ({
            id: `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`,
            author: m.author,
            text: m.body,
            createdAt: m.created_at,
          }))
          .filter((m) => !known.has(m.id));
        if (fresh.length > 0) {
          saveSetlist({
            ...sl,
            fanMessages: [...(sl.fanMessages ?? []), ...fresh],
          });
        }
      }
      for (const s of songs) {
        const total = totals.get(s.title);
        const msgs = bySong.get(s.title);
        const known = new Set(s.fanMessages.map((m) => m.id));
        const fresh = msgs
          .map((m) => ({
            id: `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`,
            author: m.author,
            text: m.body,
            createdAt: m.created_at,
          }))
          .filter((m) => !known.has(m.id));
        const heartsChanged = total !== undefined && total !== s.hearts;
        if (heartsChanged || fresh.length > 0) {
          saveSong({
            ...s,
            hearts: heartsChanged ? (total as number) : s.hearts,
            fanMessages: [...s.fanMessages, ...fresh],
          });
        }
      }
    } catch {
      // silencieux : la synchro retentera au prochain arrêt de direct
    }
  }, [
    prefs.liveKey,
    songs,
    saveSong,
    setlists,
    saveSetlist,
    performer,
    artist.name,
    bands,
  ]);

  // `syncHearts` dépend de la bibliothèque : on le garde dans une référence
  // pour que les minuteries ci-dessous ne se recréent pas à chaque
  // modification d'un morceau.
  const syncHeartsRef = useRef(syncHearts);
  syncHeartsRef.current = syncHearts;

  /**
   * Rapatriement des ❤ et des mots du public (bug signalé par Marco, b138).
   * Avant, il n'avait lieu QU'au clic sur « Arrêter » : un direct fermé
   * autrement (app quittée, arrêt automatique du serveur au bout de 4 h)
   * perdait les cœurs, qui n'apparaissaient jamais en face du morceau.
   * Désormais : au démarrage de l'app, puis toutes les 60 s pendant un
   * direct. L'opération est idempotente — les totaux du serveur REMPLACENT
   * les compteurs locaux, jamais d'addition en double.
   */
  useEffect(() => {
    if (!liveReady(prefs.liveKey)) return;
    // `timer` : évite de masquer la fonction de traduction `t`.
    const timer = window.setTimeout(() => void syncHeartsRef.current(), 1500);
    return () => window.clearTimeout(timer);
  }, [prefs.liveKey]);

  useEffect(() => {
    if (status === 'off' || !liveReady(prefs.liveKey)) return;
    const id = window.setInterval(() => void syncHeartsRef.current(), 60000);
    return () => window.clearInterval(id);
  }, [status, prefs.liveKey]);

  const lastMetaRef = useRef<{ title: string; artist: string; key: string } | null>(
    null,
  );

  // Diffusion différée de « plus aucune chanson » : évite un clignotement
  // vers l'écran d'accueil quand on passe simplement d'une chanson à une autre.
  const clearTimer = useRef<number | null>(null);

  const setCurrent = useCallback(
    (song: LiveSong | null) => {
      currentRef.current = song;
      if (song) {
        // La tonalité envoyée aux autres musiciens vient du MORCEAU, pas de la
        // clé de rafraîchissement (b169). Celle-ci contient aussi le capo
        // (« Am:0 ») : envoyée telle quelle, elle était illisible et le suivi
        // de groupe ne transposait donc jamais (Follow.tsx).
        lastMetaRef.current = {
          title: song.title,
          artist: song.artist,
          key: song.playedKey ?? song.chordKey ?? '',
        };
        if (clearTimer.current !== null) {
          window.clearTimeout(clearTimer.current);
          clearTimer.current = null;
        }
        if (statusRef.current === 'on') {
          pushLive(prefs.liveKey, { status: 'on', song }).catch(() => {
            // publication silencieuse : l'erreur détaillée apparaît dans le panneau
          });
        }
        // Synchro du groupe : automatique, toujours active (best-effort).
        // Sans réseau, chaque musicien garde la main sur sa bibliothèque locale.
        void pushBandSong(prefs.liveKey, lastMetaRef.current);
      } else {
        // Aucune chanson affichée : RÈGLE — tout le monde voit alors l'écran
        // d'accueil. Publié après un court délai (annulé si une nouvelle
        // chanson arrive) pour ne pas clignoter entre deux morceaux.
        if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
        clearTimer.current = window.setTimeout(() => {
          clearTimer.current = null;
          if (currentRef.current === null && statusRef.current === 'on') {
            pushLive(prefs.liveKey, { status: 'on', song: null }).catch(() => {});
            void pushBandSong(prefs.liveKey, null);
          }
        }, 600);
      }
    },
    [prefs.liveKey],
  );

  async function act(next: LiveStatus) {
    setBusy(true);
    setError(null);
    // Relancer un direct ANNULE une clôture restée en attente (b217) :
    // l'artiste vient de dire l'inverse, on ne ferme pas derrière lui.
    if (next !== 'off') oublierCloture();
    // Durée écoulée du bandeau (b345) : posée au VRAI démarrage (jamais à
    // la reprise d'une pause), effacée à la fin. Clé locale, jamais
    // synchronisée — c'est l'horloge de CE téléphone.
    if (next === 'on' && statusRef.current === 'off') {
      try {
        localStorage.setItem('sing2me/onairStart', String(Date.now()));
        // Étape « Lance ton premier live » de la prise en main (b380) :
        // clé additive, posée une seule fois — jamais réécrite.
        if (localStorage.getItem(LIVE_LAUNCHED_KEY) === null) {
          localStorage.setItem(LIVE_LAUNCHED_KEY, new Date().toISOString());
        }
      } catch {
        /* sans stockage, pas de durée affichée — rien de cassé */
      }
    }
    if (next === 'off') {
      try {
        localStorage.removeItem('sing2me/onairStart');
      } catch {
        /* idem */
      }
    }
    try {
      // Passage en direct : la fiche publique est publiée/rafraîchie et le
      // nom dictable réservé automatiquement s'il manquait (b136) — le QR
      // pointe vers /sonnom, cette page ne doit jamais être vide. Silencieux
      // et non bloquant : un souci réseau ne retarde pas le concert.
      //
      // On y publie MON profil, jamais celui du groupe (b183) : mon QR est
      // unique et sert aux deux, mais un concert de groupe ne doit pas
      // remplacer définitivement ma fiche par celle du groupe. Ce que le
      // public voit PENDANT le direct vient de l'état du live (`artist`
      // ci-dessous) — c'est là que mon choix solo/groupe s'applique.
      if (next !== 'off') {
        void (async () => {
          try {
            const s = await getValidSession();
            if (!s) return;
            const name = await ensurePublicPage(
              s,
              await profilAPublier(artist, bands, prefs.pagePubliqueMasquee === true),
            );
            if (name) setPublicName(name);
            // Les fiches de mes groupes se rafraîchissent en même temps
            // (b232) : leur adresse doit ouvrir une page à jour, avec ou
            // sans direct en cours.
            await publierFichesGroupes(s, bands, artist);
          } catch {
            /* best-effort */
          }
        })();
      }
      // Portée « mon groupe » : on tague le direct avec le cloudId du groupe
      // qui joue (vide en solo → n'apparaît chez aucun autre membre) et le nom
      // de la personne qui lance (affiché dans la bannière des membres).
      // Un groupe masqué ne peut pas porter un direct (b227) : si le réglage
      // pointait encore vers lui (masqué après coup), on repart en solo
      // plutôt que de l'exposer.
      const choisi = who === 'solo' ? null : bands.find((x) => x.id === who);
      const liveBand = choisi?.hiddenFromPublic === true ? null : choisi;
      /**
       * CE QUE LE PUBLIC POURRA CONSULTER PENDANT LE DIRECT (b232).
       *
       * « Vincent lance un live en solo. Un spectateur flashe, atterrit sur
       * la page de Vincent, et veut consulter le profil du Groupe Zakoustiks
       * auquel Vincent appartient : il faudrait qu'il puisse le faire. »
       * Pendant un concert, la fiche ouverte par l'avatar EST la page de
       * l'artiste : sans ces listes, elle est un cul-de-sac.
       *
       * Solo → mes groupes. Groupe → ses musiciens. Best-effort : si la
       * préparation échoue, le direct part quand même, sans les liens.
       */
      let vitrine = performer;
      if (next !== 'off' && performer) {
        try {
          /**
           * DÉLAI MAXIMUM SUR LA PRÉPARATION (b440, signalement de Vincent :
           * « ⏳ Lancement… » sans fin sur une 5G faible — le live ne
           * partait jamais). Cette préparation enchaîne des appels réseau
           * SANS délai propre (adresses publiques, fiches de groupes,
           * vignettes) : le try/catch attrape un échec, jamais un fetch qui
           * RESTE EN ATTENTE — et tout le lancement pendait derrière elle.
           * Même règle que b216 : une action déclenchée par un bouton doit
           * toujours pouvoir se terminer. 4 s, puis le live part avec la
           * fiche nue — c'était déjà la promesse du commentaire ci-dessus
           * (« si la préparation échoue, le direct part quand même »).
           */
          const enrichie = await Promise.race([
            (async () =>
              liveBand
                ? {
                    ...performer,
                    publicMembers: (await ficheGroupe(liveBand, artist))
                      .publicMembers,
                  }
                : {
                    ...performer,
                    publicBands: await groupesPublics(bands, artist),
                  })(),
            new Promise<null>((r) => window.setTimeout(() => r(null), 4000)),
          ]);
          if (enrichie !== null) vitrine = enrichie;
        } catch {
          /* la fiche part sans ses liens plutôt que pas de concert */
        }
      }
      await pushLive(prefs.liveKey, {
        status: next,
        mode,
        song: next === 'off' ? null : currentRef.current,
        bandSong: next === 'off' ? null : lastMetaRef.current,
        setlist: next === 'off' ? null : setlistRef.current,
        artist: vitrine,
        bandId: next === 'off' ? '' : (liveBand?.cloudId ?? ''),
        startedBy: next === 'off' ? '' : artist.name,
        concert:
          next === 'off'
            ? null
            : todayConcert
              ? {
                  id: todayConcert.id,
                  title: todayConcert.title,
                  date: todayConcert.date,
                }
              : null,
      });
      setStatus(next);
      if (next === 'off') {
        setPanel(false);
        setHearts(0);
        // les ❤ de la dernière chanson viennent d'être archivés côté serveur
        window.setTimeout(() => void syncHearts(), 1200);
      } else if (next === 'on') {
        /*
         * Passage en direct → mode scène « selon le contexte » : le panneau
         * est une modale par-dessus la page courante ; on ouvre la scène de
         * la setlist ou du morceau sous-jacent.
         *
         * À DÉFAUT, la setlist du concert confirmé (b208, décision Vincent :
         * « ok pour préchargement si une setlist est définie dans le
         * concert »). Deux garde-fous :
         *  — la page courante GAGNE. Si je regarde déjà une setlist ou un
         *    morceau, c'est mon intention immédiate ; on ne m'arrache pas à
         *    ce que j'ai sous les yeux pour ouvrir autre chose ;
         *  — la setlist doit exister encore (le concert peut pointer une
         *    setlist supprimée depuis) — sinon on n'ouvre rien.
         *
         * Après quoi, fonctionnement classique : le mode scène se quitte
         * comme d'habitude, et le direct continue sans rien exiger. Ce
         * préchargement ouvre une porte, il ne ferme aucune.
         */
        const duConcert =
          todayConcert &&
          (todayConcert.setlistId ?? '') !== '' &&
          setlists.some((sl) => sl.id === todayConcert.setlistId)
            ? `/stage/${todayConcert.setlistId}`
            : null;
        const target = stageTargetFromHash(location.hash) ?? duConcert;
        if (target) {
          setPanel(false);
          navigate(target);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Action impossible.'));
      // Un arrêt qui n'atteint pas le serveur ne doit PAS retenir l'artiste
      // (b216) : il coupe ici, et l'application rappellera le serveur toute
      // seule. À défaut, le direct se ferme de lui-même côté serveur (1 h
      // sans partition). On le dit, sans rien cacher.
      if (next === 'off') setArretForce(true);
    } finally {
      setBusy(false);
    }
  }

  /** Arrêt LOCAL, quand le serveur ne répond pas : on n'enferme personne. */
  function arreterIci() {
    noterClotureEnAttente();
    setArretForce(false);
    setError(null);
    setStatus('off');
    setPanel(false);
    setCurrent(null);
  }

  /**
   * Démarrage avec garde de collision (b345, arbitrage Vincent : avertir
   * sans bloquer). Si un AUTRE membre a déjà lancé le live du groupe, on le
   * dit avant de doubler — deux lives du même concert restent légitimes
   * (b207, les chiffres s'additionnent), mais pas sans le savoir.
   * Vérification best-effort : réseau muet ou lent (2,5 s), le live part.
   */
  async function demarrer() {
    const choisi = who === 'solo' ? null : bands.find((x) => x.id === who);
    const cid = (choisi?.cloudId ?? '').trim();
    if (choisi && choisi.hiddenFromPublic !== true && cid !== '') {
      setBusy(true);
      try {
        const autre = await Promise.race([
          fetchLiveForBands([cid]),
          new Promise<null>((r) => window.setTimeout(() => r(null), 2500)),
        ]);
        const ref = currentLiveRef();
        if (autre !== null && autre.id !== '' && autre.id !== (ref?.liveId ?? '')) {
          setBusy(false);
          setCollision(choisi.name || t('Le groupe'));
          return;
        }
      } catch {
        /* vérification best-effort */
      }
      setBusy(false);
    }
    void act('on');
  }

  async function copierUrl() {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopie(true);
      window.setTimeout(() => setCopie(false), 1600);
    } catch {
      /* presse-papiers indisponible : le lien reste lisible à l'écran */
    }
  }

  // L'écran de l'artiste ne s'endort pas tant que le panneau live est
  // ouvert en session (b345) — même filet que le mode scène (b318).
  useWakeLock(panel && status !== 'off');

  // Le QR est l'élément PRINCIPAL de l'écran de session (b345) : il
  // s'affiche tout seul, plus de bouton à trouver.
  useEffect(() => {
    if (panel && status !== 'off' && qr === null) void showQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, status]);

  // Durée écoulée mm:ss (h:mm:ss après une heure) du bandeau EN LIVE.
  useEffect(() => {
    if (!panel || status !== 'on') return;
    const maj = () => {
      const t0 = Number(localStorage.getItem('sing2me/onairStart') ?? '');
      if (!Number.isFinite(t0) || t0 <= 0) {
        setDureeTxt('');
        return;
      }
      const s = Math.max(0, Math.floor((Date.now() - t0) / 1000));
      const mn = Math.floor(s / 60);
      const h = Math.floor(mn / 60);
      const two = (n: number) => String(n).padStart(2, '0');
      setDureeTxt(h > 0 ? `${h}:${two(mn % 60)}:${two(s % 60)}` : `${mn}:${two(s % 60)}`);
    };
    maj();
    const id = window.setInterval(maj, 1000);
    return () => window.clearInterval(id);
  }, [panel, status]);

  async function showQr() {
    try {
      // QR UNIQUE ET ÉTERNEL (décision Vincent) : il encode l'adresse
      // PERMANENTE de l'artiste — sa page publique /sonnom, qui file toute
      // seule aux paroles quand il est en direct. JAMAIS le code de salon
      // (il change à chaque session) : le même QR imprimé sert à vie.
      // Cache d'abord, serveur si le cache est muet (b245, `monAdressePublique`).
      const name = await monAdressePublique();
      const url = name !== '' ? `${location.origin}/${name}` : liveUrl();
      setQrUrl(url);
      setQr(await QRCode.toDataURL(url, { width: 440, margin: 1 }));
    } catch {
      setQr(null);
    }
  }

  return (
    <OnAirContext.Provider value={{ status, mode, setCurrent, setSetlist }}>
      <StatusContext.Provider
        value={{
          status,
          hearts,
          viewers,
          regieSetlistId: setlistIdEnCours,
          openPanel: () => setPanel(true),
        }}
      >
        {children}
        {/* REFONTE b345 (cahier UX de Vincent) : « live » est LE mot — GO
            LIVE et « direct » quittent l'interface de ce périmètre (amende
            b257 ; le CODE garde ses noms, b258). Deux écrans : AVANT
            (choisir, démarrer) et PENDANT (bandeau d'état, QR au centre,
            Pause en action courante, Terminer en lien discret confirmé). */}
        {panel && (
          <Modal title={t('Live')} onClose={() => setPanel(false)}>
            {status === 'off' && (
              <>
                {/* Choix VISIBLE (pas un menu déroulant), conséquence
                    écrite dessous. Le dernier choix est mémorisé. */}
                <div
                  className="seglive"
                  role="radiogroup"
                  aria-label={t('Type de session')}
                >
                  <button
                    type="button"
                    className={mode === 'concert' ? 'actif' : ''}
                    aria-pressed={mode === 'concert'}
                    onClick={() => setMode('concert')}
                  >
                    {t('Concert')}
                  </button>
                  <button
                    type="button"
                    className={mode === 'repet' ? 'actif' : ''}
                    aria-pressed={mode === 'repet'}
                    onClick={() => setMode('repet')}
                  >
                    {t('Répétition')}
                  </button>
                </div>
                <p className="help" style={{ textAlign: 'center', margin: '8px 0 12px' }}>
                  {mode === 'concert'
                    ? t(
                        'Le public voit les paroles du morceau en cours. Les musiciens qui se greffent voient paroles et accords.',
                      )
                    : t('Seuls les musiciens du groupe suivent.')}
                </p>
              </>
            )}
            {/* Sans groupe, rien à choisir : le live part en solo. Avec des
                groupes, Solo reste un choix du MÊME sélecteur (arbitrage
                b345 — le cahier n'en parlait pas). */}
            {status === 'off' && bandsVisibles.length > 0 && (
              <div className="field" style={{ maxWidth: 320, margin: '0 auto 6px' }}>
                <label>{t('Qui joue ce soir ?')}</label>
                <select value={who} onChange={(e) => setWho(e.target.value)}>
                  <option value="solo">
                    {artist.name !== ''
                      ? t('{name} (solo)', { name: artist.name })
                      : t('Moi (solo)')}
                  </option>
                  {/* Masqué au public = pas de direct à son nom (b227).
                      Sinon le masquer ne servirait à rien : un seul concert
                      suffirait à l'exposer. */}
                  {bandsVisibles.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name || t('Groupe sans nom')}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Le rattachement au concert se CONFIRME ici, il ne se devine
                pas (b207). Rangé après « qui joue », dont il dépend. */}
            {status === 'off' && concertsDuJour.length > 0 && (
              <div className="field" style={{ maxWidth: 320, margin: '0 auto 6px' }}>
                <label>{t('C’est pour quel concert ?')}</label>
                <select
                  value={concertId}
                  onChange={(e) => setConcertId(e.target.value)}
                >
                  {concertsDuJour.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.title || t('Concert'), c.venue, c.time]
                        .filter((x) => x !== '')
                        .join(' · ')}
                    </option>
                  ))}
                  <option value="">{t('Aucun — c’est autre chose')}</option>
                </select>
              </div>
            )}
            {/* ÉCRAN 1 — le bouton qui fait avancer, pleine largeur. */}
            {status === 'off' && (
              <>
                <button
                  className="btn block"
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={() => void demarrer()}
                >
                  {busy
                    ? t('⏳ Lancement…')
                    : mode === 'repet'
                      ? t('Démarrer la répétition')
                      : t('Démarrer le live')}
                </button>
                {who !== 'solo' && (
                  <p className="help" style={{ textAlign: 'center', marginTop: 8 }}>
                    {t('Les musiciens du groupe suivent automatiquement.')}
                  </p>
                )}
              </>
            )}
            {/* ÉCRAN 2 — bandeau d'état, QR au centre (élément principal),
                Pause/Reprendre en action courante, Terminer en lien discret
                éloigné : une erreur de tap sur scène coûte toute la salle. */}
            {status !== 'off' && (
              <>
                <div className={`livebandeau ${status === 'on' ? 'on' : 'pause'}`}>
                  <span className="dot" aria-hidden="true" />
                  <strong>{status === 'on' ? t('EN LIVE') : t('EN PAUSE')}</strong>
                  {status === 'on' && dureeTxt !== '' && <span>{dureeTxt}</span>}
                  {status === 'on' &&
                    viewers !== null &&
                    (viewers > 1 ? (
                      <span>{t('{n} spectateurs', { n: viewers })}</span>
                    ) : (
                      <span>{t('{n} spectateur', { n: viewers })}</span>
                    ))}
                </div>
                {status === 'pause' && (
                  <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
                    {t('Les spectateurs restent connectés, l’affichage est vide.')}
                  </p>
                )}
                {/* Le QR reste affiché EN PAUSE : un retardataire peut
                    rejoindre pendant l'entracte. */}
                {qr && (
                  <div className="qrbox">
                    <img src={qr} alt={t('QR du live')} />
                    <div className="linkbox" style={{ fontSize: '0.9rem' }}>
                      {qrUrl}
                    </div>
                    <button
                      className="btn ghost small"
                      onClick={() => void copierUrl()}
                    >
                      {copie ? t('Copié ✓') : t('Copier le lien')}
                    </button>
                  </div>
                )}
                {status === 'on' ? (
                  <button
                    className="btn block"
                    style={{ marginTop: 12 }}
                    disabled={busy}
                    onClick={() => void act('pause')}
                  >
                    {busy ? t('⏳…') : t('⏸ Pause')}
                  </button>
                ) : (
                  <button
                    className="btn block"
                    style={{ marginTop: 12 }}
                    disabled={busy}
                    onClick={() => void act('on')}
                  >
                    {busy ? t('⏳ Reprise…') : t('▶ Reprendre')}
                  </button>
                )}
                <p style={{ textAlign: 'center', margin: '20px 0 4px' }}>
                  <button
                    className="linklike"
                    disabled={busy}
                    onClick={() => setConfirmFin(true)}
                  >
                    {t('Terminer le live')}
                  </button>
                </p>
              </>
            )}
            {/* Le message hors-ligne n'apparaît qu'au moment où la panne
                survient (b216) — jamais en préventif. */}
            {arretForce && (
              <>
                <p className="help" style={{ textAlign: 'center' }}>
                  {t(
                    'Le serveur n’a pas répondu. Tu peux couper ici : ton téléphone sort du live, et l’application préviendra le serveur dès qu’elle y arrive.',
                  )}
                </p>
                <div style={{ textAlign: 'center' }}>
                  <button className="btn danger" onClick={arreterIci}>
                    {t('Terminer quand même')}
                  </button>
                </div>
              </>
            )}
            {error && (
              <p style={{ color: 'var(--danger)', textAlign: 'center' }}>
                {error}
              </p>
            )}
          </Modal>
        )}
        {confirmFin && (
          <ConfirmSheet
            title={t('Terminer le live ?')}
            message={t(
              'Les spectateurs seront déconnectés et devront rescanner.',
            )}
            confirmLabel={t('Terminer')}
            danger
            onConfirm={() => {
              setConfirmFin(false);
              void act('off');
            }}
            onClose={() => setConfirmFin(false)}
          />
        )}
        {collision !== null && (
          <ConfirmSheet
            title={t('{name} est déjà en live', { name: collision })}
            message={t(
              'Un autre membre a déjà lancé un live pour ce groupe. En démarrer un deuxième est possible : les chiffres du concert s’additionnent.',
            )}
            confirmLabel={t('Démarrer quand même')}
            onConfirm={() => {
              setCollision(null);
              void act('on');
            }}
            onClose={() => setCollision(null)}
          />
        )}
      </StatusContext.Provider>
    </OnAirContext.Provider>
  );
}

/** Bouton GO LIVE, présent au même endroit sur toutes les pages du
 *  musicien : INTÉGRÉ à la barre de titre (variante `inBar`, posée par
 *  TopBar — plus rien de flottant qui chevauche le contenu). La version
 *  flottante ne subsiste qu'en mode scène, qui n'a pas de barre.
 *  N'apparaît qu'une fois la fiche artiste créée (décision Vincent) : un
 *  débutant n'a pas à voir le mode direct avant d'avoir posé son nom.
 *  Exception : un direct déjà actif reste toujours pilotable. */
/**
 * BADGE D'ÉTAT DU LIVE (b378, refonte navigation — lot 1). Rien hors
 * session : le LANCEMENT vit dans l'onglet Live. En session : point qui
 * pulse + « Live · N » (spectateurs, connus seulement chez le lanceur).
 * Le clic mène à la Régie quand une setlist est diffusée, sinon au panneau
 * Live — jamais un écran mort (décision validée par Vincent).
 */
export function LiveBadge() {
  const ctx = useContext(StatusContext);
  if (!ctx || ctx.status === 'off') return null;
  const { status, viewers, regieSetlistId, openPanel } = ctx;
  const cible = cibleDuLive(regieSetlistId);
  const versRegie = cible.type === 'regie';
  const label =
    (status === 'pause' ? t('Live en pause') : t('Live en cours')) +
    (viewers !== null && viewers > 0
      ? ', ' +
        (viewers > 1
          ? t('{n} spectateurs', { n: viewers })
          : t('{n} spectateur', { n: viewers }))
      : '') +
    ' — ' +
    (versRegie ? t('ouvrir le mode chanteur') : t('gérer le live'));
  return (
    <button
      className={`livebar ${status}`}
      aria-label={label}
      title={label}
      onClick={() => {
        if (versRegie && cible.type === 'regie') navigate(cible.chemin);
        else openPanel();
      }}
    >
      <span className="dot" aria-hidden="true" />
      <span aria-live="polite">{libelleBadge(viewers)}</span>
    </button>
  );
}

export function OnAirButton({
  inBar = false,
  masquerHorsLive = false,
}: { inBar?: boolean; masquerHorsLive?: boolean } = {}) {
  const ctx = useContext(StatusContext);
  const { artist } = useStore();
  if (!ctx) return null;
  const { status, hearts, openPanel } = ctx;
  if (artist.name.trim() === '' && status === 'off') return null;
  /* SUR SCÈNE, PAS D'INVITATION PERMANENTE (b430/D-1, passe UX de
     Vincent) : hors live, la pastille « ● Live » n'a rien à faire sur
     l'écran de jeu — on lance un live depuis la bibliothèque ou l'onglet
     Live. PENDANT un live, le bouton reste : il est à la fois le témoin
     fiable (● LIVE + cœurs, seulement quand le direct est réellement
     actif) et la seule commande de gestion (pause / terminer) accessible
     sans quitter la scène. */
  if (masquerHorsLive && status === 'off') return null;
  return (
    <button
      className={`onair ${status}${inBar ? ' inbar' : ''}`}
      onClick={openPanel}
      title={
        status === 'on' || status === 'pause'
          ? t('Live en cours — gérer')
          : t('Passer en live')
      }
    >
      {status === 'on' ? (
        <>
          <span className="dot" /> LIVE
          {hearts > 0 && <span className="onairhearts">❤ {hearts}</span>}
        </>
      ) : status === 'pause' ? (
        '⏸ LIVE'
      ) : (
        // b345 (amende b257) : « live » est LE mot, GO LIVE disparaît.
        '● Live'
      )}
    </button>
  );
}

/**
 * À appeler depuis les pages de partition : déclare le morceau
 * que voit le chanteur (publié automatiquement si le direct est actif).
 */
export function useOnAirSong(song: LiveSong | null, songKey = '') {
  const ctx = useContext(OnAirContext);
  const setCurrent = ctx?.setCurrent;
  const key = song
    ? `${song.title}|${song.artist}|${song.lyrics.length}|${songKey}`
    : '';
  useEffect(() => {
    if (setCurrent) setCurrent(song);
    // En quittant une page de partition, plus aucune chanson n'est affichée
    // → l'écran d'accueil est diffusé (règle : c'est la chanson affichée qui
    // est vue par tous ; sinon l'accueil).
    return () => {
      if (setCurrent) setCurrent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCurrent, key]);
}

/** État du direct (pour afficher des repères côté musicien). */
export function useOnAirLive(): { status: LiveStatus; mode: LiveMode } {
  const ctx = useContext(OnAirContext);
  return { status: ctx?.status ?? 'off', mode: ctx?.mode ?? 'concert' };
}

/**
 * À appeler depuis le mode scène : déclare la setlist jouée, pour que le
 * public puisse la parcourir lui-même (diffusée seulement si le direct est
 * actif). Effacée en quittant.
 */
export function useOnAirSetlist(
  songs: LivePublicSong[] | null,
  /** Nom de la setlist : les mots du public s'y rattachent (b139). */
  name = '',
  /** Id LOCAL de la setlist (b378) : rend la Régie atteignable depuis le
   *  badge du header. Facultatif — sans lui, le badge ouvre le panneau. */
  id = '',
) {
  const ctx = useContext(OnAirContext);
  const setSetlist = ctx?.setSetlist;
  const key = songs
    ? `${name}#${id}#${songs.length}#${songs.map((s) => s.title).join('|')}`
    : '';
  useEffect(() => {
    if (setSetlist) setSetlist(songs && songs.length > 0 ? songs : null, name, id);
    return () => {
      if (setSetlist) setSetlist(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSetlist, key]);
}
