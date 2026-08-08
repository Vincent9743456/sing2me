/**
 * Internationalisation NON DESTRUCTRICE (b156, demande Vincent).
 *
 * Principe : le FRANÇAIS reste écrit tel quel dans le code — c'est à la
 * fois la langue source et la clé de traduction. `t('…')` renvoie la
 * chaîne française telle quelle en français, ou sa traduction anglaise
 * si elle existe dans le dictionnaire ; SINON LE FRANÇAIS RESTE AFFICHÉ
 * (repli sûr : une chaîne pas encore traduite ne casse jamais rien).
 *
 * La langue vient du réglage utilisateur (`prefs.lang`) ; « automatique »
 * ('' ou absent) suit la langue du téléphone (navigator.language).
 *
 * RÈGLE ABSOLUE : t() ne s'applique qu'aux textes de l'INTERFACE. Tout
 * ce qui vient de l'utilisateur — partitions, paroles, titres, noms,
 * notes de répétition, commentaires, messages — ne passe JAMAIS par la
 * traduction.
 */
export type AppLang = 'fr' | 'en';
/** Préférence stockée : '' = automatique (langue du téléphone). */
export type LangPref = '' | AppLang;

let current: AppLang = 'fr';
/**
 * Table de traduction ENFICHABLE : chaque entrée d'application déclare
 * les dictionnaires dont elle a besoin. L'app musicien charge tous les
 * domaines ; la page publique (spectateur, budget de poids serré) ne
 * charge que le sien — sans quoi elle embarquerait des centaines de
 * traductions qu'elle n'affiche jamais.
 */
let table: Record<string, string> = {};

export function registerTranslations(dict: Record<string, string>) {
  table = { ...table, ...dict };
}

/** Langue du terminal de l'utilisateur (repli : anglais hors francophonie). */
export function detectLang(): AppLang {
  try {
    const nav = (
      navigator.languages?.[0] ??
      navigator.language ??
      'fr'
    ).toLowerCase();
    return nav.startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'fr';
  }
}

/**
 * Choix MANUEL de langue, gardé hors du modèle synchronisé (b158).
 * Ceinture de sécurité : la synchro cloud a déjà effacé une fois le
 * champ `prefs.lang` et l'app repassait en automatique — donc en
 * français — quelques secondes après le choix. Cette copie-ci ne voyage
 * jamais : le choix de l'utilisateur ne peut plus être écrasé.
 */
const LANG_KEY = 'sing2me/lang';

export function storedLang(): LangPref {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'fr' || v === 'en' ? v : '';
  } catch {
    return '';
  }
}

/** '' = automatique : on oublie le choix manuel. */
export function rememberLang(pref: LangPref) {
  try {
    if (pref === 'fr' || pref === 'en') localStorage.setItem(LANG_KEY, pref);
    else localStorage.removeItem(LANG_KEY);
  } catch {
    // stockage indisponible : le réglage vaudra pour cette session
  }
}

/**
 * Langue effective, dans l'ordre voulu par Vincent :
 * 1. le choix manuel de l'utilisateur, s'il en a fait un (il prime et
 *    n'est jamais repris par la détection) ;
 * 2. sinon, la langue de son téléphone.
 */
export function resolveLang(pref: LangPref | undefined): AppLang {
  if (pref === 'fr' || pref === 'en') return pref;
  const kept = storedLang();
  if (kept === 'fr' || kept === 'en') return kept;
  return detectLang();
}

/** Fixée par la racine de l'app à CHAQUE rendu (avant les enfants). */
export function setLang(lang: AppLang) {
  current = lang;
}

export function getLang(): AppLang {
  return current;
}

/**
 * Traduit une chaîne d'interface. Les variables s'écrivent `{nom}` dans
 * la chaîne et se passent en second argument :
 *   t('Ajouter {n} morceaux', { n: 3 })
 */
export function t(
  fr: string,
  vars?: Record<string, string | number>,
): string {
  let out = current === 'en' ? (table[fr] ?? fr) : fr;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{${k}}`).join(String(v));
    }
  }
  return out;
}
