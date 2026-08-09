/**
 * SAUVEGARDE ET RESTAURATION — le filet qui ne dépend de personne.
 *
 * Question de Vincent : « si nous avons un problème sur nos serveurs et
 * que nous perdons tout, comment s'assurer que l'utilisateur ne sera pas
 * impacté ? »
 *
 * Trois lignes de défense, dans cet ordre :
 *
 *  1. Le téléphone est la SOURCE. Une panne serveur ne vide rien : la
 *     lecture en échec lève, une ligne absente ne fusionne rien, et la
 *     synchronisation refuse désormais toute fusion qui viderait une
 *     bibliothèque déjà remplie.
 *  2. Cette sauvegarde-ci : un fichier que l'utilisateur DÉTIENT. Ni nous,
 *     ni notre hébergeur, ni son téléphone ne sont nécessaires pour le
 *     relire. C'est la seule protection qui survive à la perte simultanée
 *     du serveur et de l'appareil.
 *  3. L'export PDF, qui reste lisible par un humain mais ne se réimporte
 *     pas — il dépanne, il ne restaure pas.
 *
 * Le fichier est du JSON lisible : même sans Sing2Me, on y retrouve ses
 * paroles et ses accords. Une sauvegarde qu'on ne peut ouvrir qu'avec
 * l'outil qui l'a produite n'est pas une sauvegarde.
 */
import { t } from '../i18n';
import { AppState } from '../store';

/** Marqueur de format : permet de refuser un fichier qui n'est pas à nous. */
export const BACKUP_KIND = 'sing2me/backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  /** Date de la sauvegarde (ISO). */
  at: string;
  /** Version de l'app qui l'a produite — utile pour un dépannage. */
  build: string;
  /** De quoi se faire une idée du contenu sans tout ouvrir. */
  resume: { songs: number; setlists: number; concerts: number; bands: number };
  state: AppState;
}

export function makeBackup(state: AppState, build: string): Backup {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    at: new Date().toISOString(),
    build,
    resume: {
      songs: state.songs.length,
      setlists: state.setlists.length,
      concerts: state.concerts.length,
      bands: state.bands.length,
    },
    state,
  };
}

/** Nom de fichier daté : on retrouve la bonne sauvegarde des mois après. */
export function backupFileName(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `sing2me-${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}.json`;
}

/**
 * Relit un fichier de sauvegarde. Renvoie le contenu, ou une raison claire
 * du refus — jamais un échec muet : quelqu'un qui restaure est déjà dans
 * une mauvaise journée, il a droit à une phrase qui l'aide.
 */
export function readBackup(
  raw: string,
): { ok: true; backup: Backup } | { ok: false; raison: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      raison: t('Ce fichier n’est pas lisible — il a peut-être été tronqué.'),
    };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, raison: t('Ce fichier ne contient pas de sauvegarde.') };
  }
  const b = parsed as Partial<Backup>;
  if (b.kind !== BACKUP_KIND) {
    return {
      ok: false,
      raison: t('Ce fichier ne vient pas de Sing2Me.'),
    };
  }
  if (!b.state || typeof b.state !== 'object' || !Array.isArray(b.state.songs)) {
    return {
      ok: false,
      raison: t('Cette sauvegarde est incomplète — ses morceaux sont illisibles.'),
    };
  }
  return { ok: true, backup: b as Backup };
}

/**
 * Ce que la restauration va faire, dit AVANT de le faire.
 *
 * On ne remplace jamais : on ajoute ce qui manque et on garde la version la
 * plus récente de ce qui existe des deux côtés. Restaurer une vieille
 * sauvegarde ne peut donc pas détruire le travail d'hier — c'est la
 * différence entre un filet et un piège.
 */
export function decrireRestauration(
  actuel: AppState,
  backup: Backup,
): { nouveaux: number; connus: number } {
  const ids = new Set(actuel.songs.map((s) => s.id));
  let nouveaux = 0;
  for (const s of backup.state.songs) {
    if (!ids.has(s.id)) nouveaux++;
  }
  return { nouveaux, connus: backup.state.songs.length - nouveaux };
}

/**
 * FAUT-IL PROPOSER UNE SAUVEGARDE ? — et surtout : quand se taire.
 *
 * Consigne de Vincent : « pourquoi pas, mais il ne faut pas que ce soit
 * anxiogène ». Un rappel qui fait peur pousse à fermer, pas à agir. Quatre
 * règles en découlent, et elles sont toutes des règles de SILENCE :
 *
 *  1. On ne parle qu'à qui a quelque chose à protéger — en dessous d'une
 *     douzaine de morceaux, il n'y a rien à sauver qu'on ne puisse refaire.
 *  2. On laisse le temps de s'installer : jamais dans les premiers jours.
 *  3. On ne redemande pas. « Plus tard » vaut trois mois de silence.
 *  4. Une fois la sauvegarde faite, on se tait pour de bon — et on ne
 *     revient que si la bibliothèque a VRAIMENT changé depuis.
 *
 * Ce que la formulation ne fera jamais, côté écran : parler de perte, de
 * panne ou de risque. On propose de GARDER une copie, on n'agite pas la
 * menace de tout perdre.
 */
export type RappelSauvegarde =
  | { quoi: 'jamais'; morceaux: number }
  | { quoi: 'ancienne'; morceaux: number; depuis: number; ajoutes: number }
  | null;

/** En dessous, il n'y a rien à protéger qu'on ne puisse refaire en un soir. */
const ASSEZ_DE_MORCEAUX = 12;
/** On laisse une semaine avant de parler de quoi que ce soit. */
const DELAI_INSTALLATION_MS = 7 * 24 * 3600 * 1000;
/** Une sauvegarde reste bonne longtemps : six mois avant d'y repenser. */
const SAUVEGARDE_AGEE_MS = 180 * 24 * 3600 * 1000;
/** Et encore : seulement si la bibliothèque a réellement bougé. */
const ASSEZ_DE_NOUVEAUX = 10;

export function rappelSauvegarde(
  state: AppState,
  maintenant = Date.now(),
): RappelSauvegarde {
  const morceaux = state.songs.filter((s) => s.idea !== true).length;
  if (morceaux < ASSEZ_DE_MORCEAUX) return null;

  const snooze = Date.parse(state.prefs.backupSnoozeUntil ?? '');
  if (Number.isFinite(snooze) && snooze > maintenant) return null;

  const dernier = Date.parse(state.prefs.lastBackupAt ?? '');
  if (!Number.isFinite(dernier)) {
    // Jamais sauvegardé : on attend que le compte ait vécu un peu.
    const plusAncien = state.songs
      .map((s) => Date.parse(s.createdAt))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)[0];
    if (plusAncien === undefined) return null;
    if (maintenant - plusAncien < DELAI_INSTALLATION_MS) return null;
    return { quoi: 'jamais', morceaux };
  }

  const ajoutes = morceaux - (state.prefs.lastBackupSongs ?? 0);
  if (maintenant - dernier < SAUVEGARDE_AGEE_MS) return null;
  if (ajoutes < ASSEZ_DE_NOUVEAUX) return null;
  return {
    quoi: 'ancienne',
    morceaux,
    depuis: Math.floor((maintenant - dernier) / (30 * 24 * 3600 * 1000)),
    ajoutes,
  };
}
