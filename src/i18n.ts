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

export function resolveLang(pref: LangPref | undefined): AppLang {
  return pref === 'fr' || pref === 'en' ? pref : detectLang();
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
