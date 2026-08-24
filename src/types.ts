/**
 * mojosong — modèle de données.
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
   * Le texte que lit le public POUR CETTE VERSION (b224).
   *
   * Il vit sur la VERSION et pas sur le morceau (question de Vincent) pour
   * deux raisons qui n'en font qu'une : une version, c'est « comme on le joue
   * dans ce contexte » — si la version du groupe raccourcit un couplet, le
   * public doit lire le couplet raccourci ; et c'est la version qui VOYAGE
   * vers les autres membres, donc c'est le seul endroit d'où le texte du
   * public peut les suivre. Posé sur le morceau, il ne bougeait pas d'une
   * version à l'autre et ne partait jamais au groupe.
   *
   * Absent = le public lit la partition préparée automatiquement.
   * `Song.publicLyrics` en est le REFLET pour la version active, comme
   * `Song.lyrics`. Voir `src/lib/publiclyrics.ts`.
   */
  publicLyrics?: { text: string; from: string; updatedAt: string };
  /**
   * Dernière modification du CONTENU de cette version (paroles, accords,
   * structure, tonalité, capo, tempo). Sert à propager les modifications
   * d'une version de groupe entre membres, indépendamment du `updatedAt`
   * du morceau entier (que chaque compte bump pour ses propres raisons).
   * Absent = version héritée d'avant ce suivi : on retombe alors sur le
   * `updatedAt` du morceau.
   */
  updatedAt?: string;
  /**
   * QUI a apporté cette version au répertoire du groupe (b420, règle de
   * Vincent : « une proposition ne peut venir que d'un artiste, pas d'un
   * groupe »). Posé une fois, à l'acte de proposer, et jamais réécrit :
   * c'est de la PROVENANCE, pas du contenu — il ne compte donc ni dans
   * `versionContentDiffers` ni dans `versionEqual` (bandSync), sinon un
   * vieux client qui l'ignore ferait du ping-pong avec un neuf. Absent sur
   * les versions d'avant b420 : l'affichage retombe sur le nom du groupe.
   */
  par?: { id: string; nom: string };
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
   *
   * REFLET de la version active (b224), exactement comme `lyrics` : la
   * source est `SongVersion.publicLyrics`, pour que le texte suive les
   * versions et voyage jusqu'aux autres membres du groupe.
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
   * true = PROPOSITION en attente de validation (b274, arbitrage de Vincent :
   * « on abandonne le concept d'idée à tous les niveaux »).
   *
   * Le mot recouvrait deux choses sans rapport : une boîte de réception (ce
   * qui arrive du dehors et attend une décision — avec ses boutons, sa
   * pastille, sa fin) et une étagère personnelle (« à travailler »), qui
   * n'avait, elle, aucune fin. La pastille comptait donc « 3 choses à
   * traiter » ET « 12 morceaux que je jouerai peut-être un jour ».
   *
   * Il ne reste que la boîte, et elle n'a que DEUX entrées : le répertoire
   * d'un groupe (`pendingBandId`) et un morceau gardé à un bœuf
   * (`keptAtJam`). Rien d'autre ne peut poser ce drapeau.
   *
   * Le CHAMP garde son nom : il vit dans le localStorage de tous les
   * utilisateurs installés, et une clé de stockage ne se renomme jamais.
   */
  idea?: boolean;
  /**
   * OBSOLÈTE (b386) — la distinction actif/réserve de b385 a été retirée
   * le jour même (arbitrage Vincent : « Simplifie tout. Pas de
   * distinction actif / réserve »). Le champ reste dans le type parce
   * qu'il a pu être écrit dans le localStorage d'installés pendant la
   * fenêtre b385 : on ne le lit ni ne l'écrit plus, mais on ne réécrit
   * jamais le stockage pour l'effacer (cicatrice b290).
   */
  reserve?: boolean;
  /**
   * Copie personnelle rapportée d'un bœuf (b110). Marque l'autre entrée de
   * la boîte de réception : sans elle, on ne saurait pas la distinguer d'une
   * ancienne « idée » personnelle au moment de la migration.
   */
  keptAtJam?: boolean;
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
   * PROPOSITION ÉCARTÉE (b240, demande de Vincent).
   *
   * « Qu'un morceau proposé dans le répertoire du Groupe, s'il n'est pas
   * accepté par un membre, puisse — dans le cas où le membre l'ait
   * supprimé — être récupéré facilement. »
   *
   * Écarter n'est pas supprimer : le morceau quitte les Idées et n'apparaît
   * plus nulle part… SAUF dans le répertoire du groupe qui l'a proposé, où
   * il attend un « ↩ Reprendre ». C'est le seul état qui rende la
   * proposition récupérable sans rien demander à personne : une vraie
   * suppression pose une pierre tombale, et le groupe — dont les données
   * n'ont pas bougé — n'a alors AUCUN moyen de la reproposer.
   *
   * Ne veut rien dire sans `pendingBandId`, qui dit de quel groupe il
   * s'agit. Personnel — jamais partagé.
   */
  declined?: boolean;
  /**
   * OBSOLÈTE (b293) — le « mode Solo » a été retiré (arbitrage Vincent : pour
   * se faire un répertoire perso, on crée un groupe dont on est seul membre).
   * Le champ reste dans le type parce qu'il vit dans le localStorage des
   * installés : on ne le lit ni ne l'écrit plus, mais on ne le supprime pas
   * (aucune réécriture destructive du stockage — cicatrice b290).
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
  /**
   * BROUILLON DE CRÉATION (b319, flux « Recherche & création »).
   *
   * `'draft'` : fiche créée au lancement d'une recherche — INVISIBLE du
   * répertoire, des setlists, des compteurs et de toute liste ; jamais
   * synchronisée (locale à l'appareil). `'formatting'` : contenu collé,
   * mise en forme en cours — mêmes règles d'invisibilité.
   *
   * ABSENT = morceau ordinaire (validé). La validation EFFACE le champ
   * plutôt que d'écrire 'validated' : les morceaux déjà installés n'ont pas
   * ce champ, et un seul état « absent » évite toute migration.
   *
   * Purge : nouvelle recherche (l'ancien brouillon meurt), abandon explicite,
   * et TTL de 6 h au chargement. Un brouillon survit au passage en arrière-
   * plan (l'interruption subie ne détruit pas le travail).
   */
  status?: 'draft' | 'formatting';
  createdAt: string;
  updatedAt: string;
}

/** Un morceau en cours de création (invisible et jamais synchronisé). */
export function estBrouillon(s: { status?: 'draft' | 'formatting' }): boolean {
  return s.status === 'draft' || s.status === 'formatting';
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
  /**
   * Ma page publique est-elle en ligne ? VISIBLE par défaut (b262) — c'est
   * l'intérêt du QR. Cochée, elle rend la fiche indisponible : rien de
   * personnel ne reste sur le serveur.
   */
  pagePubliqueMasquee?: boolean;
  /**
   * Un masquage de groupe qui n'a pas atteint le serveur (b282). Levé quand
   * la republication de la fiche échoue — hors ligne, réseau capricieux —
   * et rejoué à la prochaine synchronisation, comme toute modification faite
   * hors ligne (b221). Sans lui, la page publique continuerait de nommer un
   * groupe masqué jusqu'au prochain enregistrement du profil : un réglage de
   * vie privée n'a pas le droit d'attendre un geste qui ne viendra peut-être
   * jamais.
   */
  ficheARepublier?: boolean;
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
   * Thème de l'interface (b233) : absent ou 'sombre' = sombre, l'identité
   * de scène de l'app. 'clair' est une sortie pour le plein jour, réglée
   * depuis la partition et appliquée partout. Suit le compte, comme la
   * langue ; une copie locale (`sing2me/theme`) sert à poser le thème avant
   * le premier rendu, sinon l'app clignoterait à chaque lancement.
   */
  theme?: 'sombre' | 'clair';
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
  /**
   * IDENTIFIANT DE COMPTE (b249, proposition de Vincent : « un identifiant
   * réseau unique par artiste qui s'inscrit, et c'est cet identifiant qui
   * est utilisé partout »). Il FAIT AUTORITÉ sur le nom : deux lignes qui le
   * portent sont la même personne, deux lignes qui en portent des différents
   * ne le sont jamais — quoi que disent les noms.
   *
   * Absent tant que le musicien n'a pas de compte (invité à la main, jamais
   * inscrit) : c'est le seul cas où l'on retombe sur la comparaison des noms.
   * Il se remplit tout seul dès que le groupe est publié — l'app rapproche
   * une dernière fois par le nom, puis n'en a plus besoin.
   */
  userId?: string;
  instrument: string;
  /** Photo de profil (annuaire) du membre, si disponible. */
  photo?: string;
  /** true = le nom vient de la carte de musicien mojosong du membre */
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
  /**
   * MASQUÉ AU PUBLIC (b227, demande de Vincent).
   *
   * « Un groupe que je fais à l'occasion avec un pote, avec qui on ne fait
   * pas de concert, n'a pas vocation à être exposé aux yeux du public sur ma
   * fiche artiste. » Deux conséquences, indissociables :
   *   - il n'est pas proposé comme identité publique (écran du QR) ;
   *   - il ne peut PAS servir à lancer un direct — sinon le masquer ne
   *     servirait à rien, il suffirait d'un concert pour l'exposer ;
   *   - il n'a pas d'adresse miroir (et la sienne est retirée s'il en avait).
   *
   * PERSONNEL : c'est MA page publique, donc MON choix. Jamais partagé avec
   * le groupe, jamais synchronisé vers les autres membres.
   */
  hiddenFromPublic?: boolean;
  /**
   * Horodatage des MODIFICATIONS DE L'UTILISATEUR (b373, constat de Marco :
   * renommer un groupe ne se propageait jamais aux autres appareils). Posé
   * par `tamponneBand` sur les gestes délibérés UNIQUEMENT — jamais par les
   * réparations automatiques (recalage des membres, cloudId, owned), qui ne
   * doivent pas gagner une fusion (cicatrices b244/b249). La fusion prend
   * le plus récent comme base, l'union des champs reste le filet.
   */
  updatedAt?: string;
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
  /** Invitation à découvrir mojosong (pause / fin de concert) */
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

/** Un musicien tel qu'il apparaît sur une page publique (b232). */
export interface PublicMember {
  name: string;
  /**
   * Sa photo d'annuaire, réduite en vignette (`miniature`). Absente s'il n'en
   * a pas : on n'invente jamais d'avatar, on retombe sur ses initiales.
   */
  photo?: string;
  /**
   * Son adresse publique, si son nom en désigne UNE SEULE sans ambiguïté
   * (`findPublicPageByArtist`). Deux musiciens du même nom : aucun lien —
   * mieux vaut pas de lien qu'un lien vers quelqu'un d'autre.
   */
  address?: string;
}

/** Un groupe tel qu'il apparaît sur une page publique (b231, enrichi b232). */
export interface PublicBand {
  name: string;
  /**
   * Les musiciens du groupe. `string[]` sur les fiches publiées avant b232 :
   * toute lecture doit accepter les deux formes (le serveur garde le JSON
   * qu'on lui a donné, il ne le migre pas).
   */
  members: (PublicMember | string)[];
  /** Adresse publique du groupe, si elle existe (« zakoustiks »). */
  address?: string;
  /** Photo de la fiche du groupe, réduite en vignette (b232). */
  photo?: string;
}

export interface ArtistProfile {
  name: string;
  bio: string;
  photo: string;
  links: ArtistLink[];
  /**
   * PAGE PUBLIQUE RENDUE INVISIBLE (b262, demande de Vincent : « prévoir
   * dans les réglages que la page publique puisse ne pas être disponible en
   * ligne à la demande de l'utilisateur »).
   *
   * Ce drapeau n'apparaît QUE dans la fiche publiée, et il y arrive SEUL :
   * quand l'artiste choisit l'invisibilité, on ne publie pas un profil
   * qu'on masquerait à l'affichage — on ne publie RIEN. Photo, bio, liens
   * et pourboire ne sont alors nulle part en ligne. « Invisible » doit
   * vouloir dire absent, pas caché derrière un écran.
   *
   * La LIGNE, elle, reste : elle réserve l'adresse (sinon quelqu'un d'autre
   * la prendrait) et permet au QR de retrouver un direct en cours — un
   * concert n'a pas à s'arrêter parce que la fiche est privée.
   */
  masquee?: boolean;
  /** Lien de pourboire (PayPal.me, Lydia, Stripe Payment Link…) */
  tipUrl: string;
  /** Mon matériel (instruments, amplis, câbles…) — jamais public */
  gear?: GearItem[];
  /** Ce que voit le public sur l'écran du QR (tout actif par défaut) */
  publicScreen?: Partial<PublicScreen>;
  /**
   * LES GROUPES DE L'ARTISTE, TELS QUE LE PUBLIC LES VOIT (b231, demande de
   * Vincent : « la page publique de l'artiste mentionne les groupes auxquels
   * il appartient, et réciproquement »).
   *
   * Publié AVEC le profil, donc c'est l'artiste qui décide par construction :
   * un groupe masqué (`Band.hiddenFromPublic`) n'entre jamais dans cette
   * liste. Réciprocité obtenue sans deuxième page : l'adresse d'un groupe
   * étant un MIROIR vers la page de son détenteur (b227), y lire le groupe
   * ET ses musiciens suffit aux deux sens de la demande.
   *
   * b232 (« le mieux est de mettre la photo présente sur la fiche du Groupe ou
   * du musicien, et un lien cliquable ») : on publie AUSSI les photos de
   * l'annuaire, en vignettes, et les adresses publiques qui existent déjà —
   * jamais un e-mail, jamais un identifiant de compte, jamais un musicien
   * seulement INVITÉ (tant qu'il n'a pas accepté, il n'est pas du groupe).
   * La sortie reste le masquage du groupe, qui le retire d'un geste.
   */
  publicBands?: PublicBand[];
  /**
   * LES MUSICIENS — rempli UNIQUEMENT sur la fiche publique d'un GROUPE
   * (b232). Un groupe se présente au public exactement comme un artiste
   * (photo, présentation, liens, pourboire) : sa fiche a donc la même forme,
   * avec en plus sa composition. C'est la réciproque de `publicBands` : la
   * page de l'artiste nomme ses groupes, celle du groupe nomme ses musiciens,
   * et chaque nom mène à la page de l'autre quand elle existe.
   *
   * Sur une fiche d'artiste, ce champ reste absent.
   */
  publicMembers?: PublicMember[];
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
    /** Jeton NOMINATIF et à usage unique de CETTE invitation (b251). */
    token?: string;
    /** Nom de la personne invitée — le lien n'est valable que pour elle. */
    for?: string;
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

/**
 * Horodate une MODIFICATION DÉLIBÉRÉE d'un groupe (b373) : renommage,
 * photo, bio, liens, musicien ajouté/retiré à la main, masquage. À appeler
 * au moment du geste, jamais depuis une réparation automatique — c'est cet
 * horodatage qui décide de la base à la fusion entre appareils.
 */
export function tamponneBand(b: Band): Band {
  return { ...b, updatedAt: new Date().toISOString() };
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
