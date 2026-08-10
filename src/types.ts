/**
 * Sing2Me — modèle de données.
 * Les accords sont écrits entre crochets dans les paroles : "[Am]Sous le ciel".
 *
 * La structure du morceau (intro / couplet / refrain…) est un résumé en tête
 * de partition : chaque ligne porte un libellé, la suite d'accords et un
 * commentaire de répétition ("batterie seule au début", "on s'arrête"…).
 * Les paroles forment un bloc continu, sans découpage.
 */

export interface StructureRow {
  id: string;
  /** Intro, Couplet, Refrain, Pont, Solo, Outro… */
  label: string;
  /** Suite d'accords, ex. "C D E G" */
  chords: string;
  /** Commentaire fixe (issu de l'import ou de l'édition) */
  comment: string;
}

/** Note de répétition (partagée ou personnelle). */
export interface SongNote {
  id: string;
  /** '' = note générale ; sinon libellé d'une partie ("Refrain"…) */
  target: string;
  /** Contexte : '' = solo / tous, sinon id du groupe concerné */
  bandId: string;
  text: string;
  /** Nom du musicien qui l'a écrite */
  author: string;
  /** 'groupe' = visible par tout le monde ; 'privee' = seulement l'auteur */
  visibility: 'groupe' | 'privee';
  createdAt: string;
}

/** Message laissé par le public sur un morceau (pendant un direct). */
export interface FanMessage {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

/** Version d'un morceau (par groupe, arrangement, setlist…). */
export interface SongVersion {
  id: string;
  /** "Standard", "Acoustique", "Groupe Xyz"… */
  name: string;
  /** Groupe auquel cette version correspond ('' = solo / perso) */
  bandId: string;
  key: string;
  tempo: number;
  capo: number;
  structure: StructureRow[];
  lyrics: string;
  /**
   * Dernière modification du CONTENU de cette version (paroles, accords,
   * structure, tonalité, capo, tempo). Sert à propager les modifications
   * d'une version de groupe entre membres, indépendamment du `updatedAt`
   * du morceau entier (que chaque compte bump pour ses propres raisons).
   * Absent = version héritée d'avant ce suivi : on retombe alors sur le
   * `updatedAt` du morceau.
   */
  updatedAt?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Tonalité, ex. "Am", "G" */
  key: string;
  tempo: number;
  capo: number;
  /** Durée en secondes (0 = non renseignée) */
  durationSec: number;
  tags: string[];
  /** Résumé de structure affiché en tête (version active) */
  structure: StructureRow[];
  /**
   * « Structure » : notes générales sur le morceau, en écriture libre
   * (remplace l'ancien affichage sections + accords par partie).
   */
  structureNotes?: string;
  /** Paroles + accords [X], bloc continu (version active) */
  lyrics: string;
  /**
   * LE TEXTE QUE LIT LE PUBLIC, QUAND L'ARTISTE L'A ÉCRIT LUI-MÊME (b223).
   *
   * Absent dans le cas normal : le public lit alors la partition préparée
   * automatiquement (`stripChords`), et suit donc toute correction apportée
   * au morceau sans que personne n'ait rien à entretenir.
   *
   * Présent, il fait autorité PARTOUT (direct, setlist parcourue par le
   * spectateur, mode scène, télécommande, vue « paroles seules ») jusqu'à ce
   * que l'artiste revienne au texte automatique. `from` garde le texte
   * automatique tel qu'il était à l'enregistrement : c'est ce qui permet de
   * dire, sans deviner, que la partition a changé depuis.
   *
   * Voir `src/lib/publiclyrics.ts` — toute lecture passe par là.
   */
  publicLyrics?: { text: string; from: string; updatedAt: string };
  /** Toutes les versions du morceau (la version active est reflétée ci-dessus) */
  versions: SongVersion[];
  activeVersionId: string;
  /** Notes de répétition (partagées et personnelles) */
  rehearsalNotes: SongNote[];
  /**
   * Réglages personnels du musicien pour CE morceau (instrument joué,
   * ampli, effets, retours…). Locaux à son application — jamais inclus
   * dans les partages.
   */
  mySetup?: { instrument: string; notes: string };
  /**
   * true = « idée » : morceau importé mais pas encore validé dans la
   * bibliothèque (réserve à travailler — ex. partition récupérée en plein
   * concert à la demande du public). Jouable partout ; validé d'un clic.
   */
  idea?: boolean;
  /**
   * Proposition de groupe en attente d'acceptation. Quand un autre membre
   * ajoute un morceau au répertoire du groupe, il arrive chez moi marqué
   * de l'id (local) du groupe : il n'apparaît PAS encore dans ma
   * bibliothèque personnelle (pour éviter d'être submergé de partitions),
   * mais reste disponible pour les setlists du groupe (non bloquant).
   * J'accepte l'ajout d'un clic → le champ est effacé et le morceau
   * rejoint ma bibliothèque. Personnel — jamais partagé.
   */
  pendingBandId?: string;
  /**
   * Par défaut, tout morceau est jouable en Solo. true = déqualifié
   * manuellement du répertoire solo (l'utilisateur estime ne pas pouvoir
   * le jouer seul). Personnel — jamais inclus dans les partages.
   */
  noSolo?: boolean;
  /**
   * L'IMPORT A DOUTÉ (chantier « Reprise de répertoire »).
   *
   * Un morceau dont l'analyse est douteuse entre quand même en
   * bibliothèque — un mauvais import signalé vaut mieux qu'un import
   * manquant — mais il porte la raison du doute, en clair, et se retrouve
   * d'un geste par le filtre « à vérifier ».
   *
   * Le diagnostic existe depuis longtemps (`analyzeImport` : accords non
   * reconnus, accords non alignés, encodage abîmé, tablatures) ; il était
   * montré à l'écran d'aperçu puis jeté. Il est désormais conservé sur le
   * morceau, jusqu'à ce que l'utilisateur le relise.
   *
   * Effacé dès que le morceau est modifié à la main : relire, c'est
   * vérifier. Personnel — jamais partagé.
   */
  needsCheck?: { reason: string };
  /**
   * LA PARTITION D'AVANT L'IA (b220).
   *
   * Depuis b220, l'IA remet en forme CHAQUE import. Quand ce passage laisse
   * un gros doute, on garde ce qu'on avait avant elle, pour que le musicien
   * puisse revenir à sa version d'origine — y compris longtemps après, dans
   * le cas d'un import en masse qui ne s'arrête pas pour poser la question.
   *
   * Gardé UNIQUEMENT sur les morceaux marqués « à vérifier » : le conserver
   * partout doublerait le poids de la bibliothèque en localStorage pour
   * rien. Effacé dès qu'on tranche (retour en arrière, ou vérification).
   */
  beforeAi?: {
    lyrics: string;
    structure: StructureRow[];
    key: string;
    capo: number;
  };
  /** Total des ❤ reçus en concert (synchronisé depuis les stats) */
  hearts: number;
  /** Messages du public rattachés à ce morceau */
  fanMessages: FanMessage[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Vues d'affichage d'une partition selon le musicien :
 * - complete : chanteur/guitariste — tout (accords + paroles + commentaires)
 * - accords  : bassiste — structure avec les suites d'accords
 * - structure: batteur — structure et commentaires
 * - paroles  : public — paroles seules
 */
/**
 * Vues d'un morceau (b147) : la partition complète, ou les paroles
 * seules (public / QR). Les vues « accords » et « structure » — un
 * découpage en sections avec accords par partie — ont été retirées avec
 * le reste des sections (décision produit : « Structure » est un texte
 * libre).
 */
export type ViewMode = 'complete' | 'paroles';


export interface Prefs {
  /** Vue par défaut du musicien (profil) */
  defaultView: ViewMode;
  /** Nom du musicien (signe les notes de répétition) */
  userName: string;
  /** Clé secrète du mode ON AIR (identique à LIVE_KEY sur Vercel) */
  liveKey: string;
  /** Langue de l'interface (b156) : '' ou absent = automatique
   *  (langue du téléphone), sinon 'fr' | 'en'. */
  lang?: '' | 'fr' | 'en';
  /**
   * Noms donnés APRÈS COUP aux directs passés (b176), par identifiant de
   * session : « soirée chez Marco du 26 août ». Côté serveur une session
   * n'a qu'une date ; c'est l'artiste qui sait ce que c'était. Rangé dans
   * les préférences, donc synchronisé avec le compte.
   */
  liveNames?: Record<string, string>;
  /**
   * Lives retirés de MON historique (b183). Le direct reste en base — il
   * appartient aussi aux autres membres quand c'était un concert de groupe,
   * et chacun décide de le garder ou non. Supprimer n'efface donc rien chez
   * les autres : c'est mon classement, pas une destruction.
   */
  hiddenLives?: string[];
  /**
   * Départs écartés à la main (b212), clé « cloudIdDuGroupe|userId ».
   * Une bannière « à réinviter » qu'on ne peut pas fermer est une impasse :
   * on ne réinvite pas toujours, et le message resterait à vie.
   */
  hiddenDepartures?: string[];
  /**
   * Dernière sauvegarde enregistrée par l'utilisateur (fichier gardé chez
   * lui). Sert au rappel discret de la bibliothèque — jamais à autre chose.
   */
  lastBackupAt?: string;
  /** Nombre de morceaux au moment de cette sauvegarde. */
  lastBackupSongs?: number;
  /** « Plus tard » : date jusqu'à laquelle on ne repropose rien. */
  backupSnoozeUntil?: string;
}

/** Membre d'un groupe (v1 locale : simple annuaire + invitations). */
export interface BandMember {
  id: string;
  name: string;
  instrument: string;
  /** Photo de profil (annuaire) du membre, si disponible. */
  photo?: string;
  /** true = le nom vient de la carte de musicien Sing2Me du membre */
  verified?: boolean;
  /** Invité mais pas encore accepté : profil « en attente d'acceptation ». */
  pending?: boolean;
  /** Matériel apporté par ce musicien */
  gear?: GearItem[];
}

export interface Band {
  id: string;
  name: string;
  members: BandMember[];
  bio: string;
  photo: string;
  links: ArtistLink[];
  tipUrl: string;
  /** Publication cloud du groupe (adhésions entre comptes) */
  cloudId?: string;
  /** true = j'ai créé ce groupe (propriétaire cloud) ; sinon je l'ai rejoint. */
  owned?: boolean;
  /**
   * Nom du créateur du groupe (b147), pour les membres qui l'ont
   * rejoint : « créé par Vincent ». Renseigné à l'acceptation de
   * l'invitation. Vide chez le créateur lui-même.
   */
  ownerName?: string;
}

/** Position d'un musicien ou d'un matériel sur le plan de scène (0…1). */
export interface StagePos {
  id: string;
  label: string;
  /** Musicien : instrument · Matériel : propriétaire */
  instrument: string;
  x: number;
  y: number;
  /** 'gear' = matériel (rendu distinct) ; absent = musicien */
  kind?: 'gear';
  /** Catégorie du matériel (icône sur le plan) */
  category?: GearCategory;
}

/** Configuration son & scène d'une setlist. */
export interface StageSetup {
  /** Matériel */
  gear: string;
  /** Branchements (patch, DI, retours…) */
  wiring: string;
  /** Effets & réglages sono */
  sound: string;
  /** Plan de scène */
  positions: StagePos[];
}

export function emptySetup(): StageSetup {
  return { gear: '', wiring: '', sound: '', positions: [] };
}

export interface SetlistItem {
  id: string;
  songId: string;
  note: string;
  /** Tonalité spécifique pour ce concert (vide = tonalité du morceau) */
  keyOverride: string;
  /** Version du morceau à jouer ('' = version active) */
  versionId: string;
  /**
   * true = morceau « en réserve » : présent dans la setlist mais pas
   * prévu d'office — on le garde sous le coude selon l'ambiance. Par
   * défaut (absent/false) le morceau fait partie du set joué.
   */
  reserve?: boolean;
}

export interface Setlist {
  id: string;
  name: string;
  comment: string;
  /**
   * Auteur de la setlist (b146) : identifiant du compte qui l'a créée.
   * Seul lui peut la supprimer d'un groupe. Vide sur les setlists
   * antérieures — dans ce cas, chacun garde la main (on ne bloque pas
   * l'existant).
   */
  createdBy?: string;
  /** Nom lisible de l'auteur, pour l'expliquer aux autres membres. */
  createdByName?: string;
  /**
   * Mots laissés par le public pendant les concerts joués sur cette
   * setlist (b139) : le mot appartient au CONCERT, pas au morceau qui
   * passait à cet instant — même s'il en garde la trace.
   */
  fanMessages?: FanMessage[];
  /** Groupe auquel cette setlist est affectée ('' = aucun) */
  bandId: string;
  items: SetlistItem[];
  /** Sono & scène : matériel, branchements, plan de scène, réglages */
  setup?: StageSetup;
  /**
   * Type de soirée (ex. « entre potes », « bœuf », « concert »…) —
   * contexte facultatif, utile notamment aux setlists proposées par l'IA.
   */
  partyType?: string;
  /**
   * Capsule contextuelle (ex. « Soirée entre amis ») : regroupe des
   * setlists solo autour d'un contexte plutôt que d'un groupe. Vide =
   * capsule Solo classique ou capsule de groupe (voir bandId).
   */
  context?: string;
  createdAt: string;
  updatedAt: string;
}

/** Durée par défaut d'un morceau quand sa durée réelle n'est pas
 *  renseignée : 5 minutes. Sert à estimer la durée d'une setlist. */
export const DEFAULT_SONG_SECONDS = 300;

/** Durée à retenir pour un morceau : sa durée réelle si renseignée,
 *  sinon l'estimation par défaut. */
export function songSeconds(song: { durationSec: number } | undefined): number {
  return song && song.durationSec > 0 ? song.durationSec : DEFAULT_SONG_SECONDS;
}

export interface Concert {
  id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  /** Page du lieu : site du bar, Google Maps, page Facebook… */
  venueUrl: string;
  /** Événement : Facebook, billetterie… */
  eventUrl: string;
  description: string;
  setlistId: string;
  /** Qui joue : '' = solo, sinon l'id du groupe. */
  bandId?: string;
  visibility: 'public' | 'prive';
  createdAt: string;
  updatedAt: string;
}

export interface ArtistLink {
  id: string;
  label: string;
  url: string;
}

/** Catégories de matériel (inventaire des musiciens, plan de scène). */
export type GearCategory =
  | 'instrument'
  | 'micro'
  | 'ampli'
  | 'sono'
  | 'effet'
  | 'cable'
  | 'autre';

export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  /** Quantité détenue (ex. 3 câbles XLR) — 1 par défaut */
  qty?: number;
}

/**
 * Paramétrage de l'écran public (page ouverte par le QR) : l'artiste
 * choisit ce que voient les spectateurs. Tout est actif par défaut.
 */
export interface PublicScreen {
  /** Titre + interprète du morceau en cours */
  songTitle: boolean;
  /** Paroles en direct */
  lyrics: boolean;
  /** Cœurs ❤ : bouton d'envoi + compteur */
  hearts: boolean;
  /** Messages du public */
  messages: boolean;
  /** Pourboires */
  tips: boolean;
  /** Fiche artiste (photo, bio) hors morceau */
  profile: boolean;
  /** Liens streaming & réseaux */
  links: boolean;
  /** Bouton « Suivre l'artiste » */
  follow: boolean;
  /** Invitation à découvrir Sing2Me (pause / fin de concert) */
  appInvite: boolean;
}

export function defaultPublicScreen(): PublicScreen {
  return {
    songTitle: true,
    lyrics: true,
    hearts: true,
    messages: true,
    tips: true,
    profile: true,
    links: true,
    follow: true,
    appInvite: true,
  };
}

/* Champ libre « Structure » d'un morceau : des notes générales, sans
 * découpage imposé par sections ni suites d'accords par partie. */

export interface ArtistProfile {
  name: string;
  bio: string;
  photo: string;
  links: ArtistLink[];
  /** Lien de pourboire (PayPal.me, Lydia, Stripe Payment Link…) */
  tipUrl: string;
  /** Mon matériel (instruments, amplis, câbles…) — jamais public */
  gear?: GearItem[];
  /** Ce que voit le public sur l'écran du QR (tout actif par défaut) */
  publicScreen?: Partial<PublicScreen>;
  /**
   * Licence Scène (annuelle, attachée au compte artiste). PRÉVU mais SANS
   * AUCUN EFFET pour l'instant (chantier 2 — mesure seulement) : aucun seuil,
   * aucun blocage, aucune notification ne dépend de ce champ tant que les
   * fondateurs n'ont pas donné le feu vert (mécanique de seuil archivée).
   */
  sceneLicense?: boolean;
  /**
   * Concert de grâce déjà consommé. PRÉVU mais SANS AUCUN EFFET (chantier 2).
   */
  graceUsed?: boolean;
  /** Dernière modification — sert à fusionner le profil entre appareils */
  updatedAt?: string;
}

/** Contenu d'un lien de partage public (encodé dans l'URL). */
export interface SharePayload {
  v: 1;
  type: 'song' | 'setlist' | 'artist' | 'member' | 'invite';
  /** Vue imposée au destinataire */
  view: ViewMode;
  song?: Song;
  setlist?: { name: string; comment: string; setup?: StageSetup };
  songs?: Song[];
  itemKeys?: string[];
  itemNotes?: string[];
  artist?: ArtistProfile;
  concerts?: {
    title: string;
    date: string;
    time: string;
    venue: string;
    venueUrl?: string;
    eventUrl?: string;
  }[];
  /** Liens du concert partagé (page du lieu, événement) */
  event?: { venue: string; venueUrl: string; eventUrl: string };
  /** Invitation à rejoindre un groupe (cloudId+token = adhésion en 1 clic) */
  invite?: {
    band: string;
    from: string;
    bandId?: string;
    cloudId?: string;
    token?: string;
  };
  /** Carte de musicien : réponse à une invitation de groupe */
  member?: { bandId: string; bandName: string; name: string; instrument: string };
  /** Champ hérité des anciens liens (compatibilité) */
  withChords?: boolean;
}

/**
 * Trace d'une suppression (« pierre tombale ») : synchronisée entre les
 * appareils pour que supprimer ici supprime aussi là-bas.
 */
/**
 * Retrait d'un morceau du RÉPERTOIRE D'UN GROUPE (par titre normalisé) :
 * propagé à tous les membres — chacun garde la partition en personnel,
 * mais elle ne fait plus partie de la bibliothèque du groupe.
 */
export interface BandRemoval {
  bandId: string;
  key: string;
  at: string;
}

export interface Tombstone {
  id: string;
  at: string;
  /** Morceaux : titre normalisé — empêche la ré-importation par le
   *  répertoire partagé d'un groupe (sans supprimer chez les autres). */
  key?: string;
}

export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptySong(): Song {
  const now = new Date().toISOString();
  const versionId = makeId();
  const structure = [
    { id: makeId(), label: 'Intro', chords: '', comment: '' },
    { id: makeId(), label: 'Couplet', chords: '', comment: '' },
    { id: makeId(), label: 'Refrain', chords: '', comment: '' },
  ];
  return {
    id: makeId(),
    title: '',
    artist: '',
    key: '',
    tempo: 0,
    capo: 0,
    durationSec: 0,
    tags: [],
    structure,
    lyrics: '',
    versions: [
      {
        id: versionId,
        name: 'Original',
        bandId: '',
        key: '',
        tempo: 0,
        capo: 0,
        structure,
        lyrics: '',
      },
    ],
    activeVersionId: versionId,
    rehearsalNotes: [],
    hearts: 0,
    fanMessages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function emptySetlist(): Setlist {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    name: '',
    comment: '',
    bandId: '',
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyBand(): Band {
  return {
    id: makeId(),
    name: '',
    members: [],
    bio: '',
    photo: '',
    links: [],
    tipUrl: '',
  };
}

export function emptyConcert(): Concert {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: '',
    date: '',
    time: '',
    venue: '',
    venueUrl: '',
    eventUrl: '',
    description: '',
    setlistId: '',
    visibility: 'public',
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyArtist(): ArtistProfile {
  return { name: '', bio: '', photo: '', links: [], tipUrl: '' };
}

export function defaultPrefs(): Prefs {
  return { defaultView: 'complete', userName: '', liveKey: '' };
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseDuration(text: string): number {
  const m = /^(\d+):(\d{1,2})$/.exec(text.trim());
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const n = parseInt(text.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
