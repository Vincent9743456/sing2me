/**
 * DÉCOUPAGE DES LIENS DANS UN TEXTE LIBRE (b441, revue UX Groupes).
 *
 * Les messages de la discussion de groupe sont du texte brut : une adresse
 * collée (« regarde https://youtu.be/… ») n'était pas cliquable. On découpe
 * le texte en segments — texte ordinaire et URL — et l'affichage rend les
 * URL en liens. Le texte d'origine n'est JAMAIS modifié : le découpage ne
 * sert qu'au rendu (le contenu des musiciens reste intouchable, règle b156).
 *
 * Volontairement strict : seuls http(s):// déclenchent un lien — pas de
 * « www. » nu ni de devinette de domaine, un faux lien est pire que pas de
 * lien. La ponctuation finale collée (« …regarde https://x.com. ») reste du
 * texte : une virgule ou un point de fin de phrase ne fait pas partie de
 * l'adresse, et une parenthèse fermante n'en fait partie que si l'adresse
 * en contient une ouvrante (cas Wikipédia).
 */

export type SegmentLien =
  | { type: 'texte'; contenu: string }
  | { type: 'lien'; url: string };

const URL_RE = /https?:\/\/[^\s<>«»"']+/g;

/** Retire la ponctuation de fin qui appartient à la phrase, pas au lien. */
function detacherPonctuation(brut: string): { url: string; reste: string } {
  let url = brut;
  let reste = '';
  // Ponctuation simple de fin de phrase, éventuellement enchaînée (« ?! »).
  while (/[.,;:!?…]$/.test(url)) {
    reste = url.slice(-1) + reste;
    url = url.slice(0, -1);
  }
  // Parenthèse / crochet fermant : ne fait partie du lien que si l'adresse
  // contient son ouvrant (https://fr.wikipedia.org/wiki/Rock_(musique)).
  while (/[)\]]$/.test(url)) {
    const fermant = url.slice(-1);
    const ouvrant = fermant === ')' ? '(' : '[';
    if (url.includes(ouvrant)) break;
    reste = fermant + reste;
    url = url.slice(0, -1);
  }
  return { url, reste };
}

export function decoupeLiens(texte: string): SegmentLien[] {
  const out: SegmentLien[] = [];
  let curseur = 0;
  URL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(texte)) !== null) {
    if (m.index > curseur) {
      out.push({ type: 'texte', contenu: texte.slice(curseur, m.index) });
    }
    const { url, reste } = detacherPonctuation(m[0]);
    if (url !== '') out.push({ type: 'lien', url });
    if (reste !== '') out.push({ type: 'texte', contenu: reste });
    curseur = m.index + m[0].length;
  }
  if (curseur < texte.length) {
    out.push({ type: 'texte', contenu: texte.slice(curseur) });
  }
  return out;
}
