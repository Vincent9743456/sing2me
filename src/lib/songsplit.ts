/**
 * PLUSIEURS PARTITIONS DANS UN MÊME FICHIER — détection, jamais décision.
 *
 * Un recueil PDF de quarante chansons, un export concaténé d'une autre
 * application : jusqu'ici, tout cela produisait UN seul morceau. Pire, la
 * lecture des directives ChordPro s'appliquant à toutes les lignes, le
 * second `{title:}` écrasait le premier — le morceau final portait le titre
 * de la DERNIÈRE chanson du fichier, avec les autres empilées dans ses
 * paroles. Une perte de données déguisée en réussite.
 *
 * Ce module ne fait que REGARDER. Il propose un découpage et dit à quel
 * point il en est sûr ; c'est l'utilisateur qui tranche. C'est la même
 * règle que le rattachement d'un live à un concert (b207) ou d'un morceau à
 * sa séance (b186) : l'indice suggère, l'humain conclut. Trois lots ont été
 * perdus à l'avoir oublié.
 *
 * Fonction pure, sans dépendance au navigateur : testable directement.
 */
import { isChordLine } from './importer';

/** Un morceau repéré dans le contenu déposé. */
export interface DetectedSong {
  /** Titre lu dans le fichier ('' si on n'a qu'une position de coupe). */
  title: string;
  /** Le texte de CE morceau, prêt pour `importText`. */
  text: string;
}

/** D'où vient le fichier — déduit de sa forme, jamais demandé. */
export type SourceSignal =
  | 'chordpro' // directives {title:} / {t:} répétées
  | 'onsong' // en-têtes « Title: » répétés
  | 'pages' // recueil paginé (PDF), une chanson par page
  | 'separators' // séparateurs répétés (saut de page, ligne de tirets)
  | 'none'; // rien de reconnaissable : un seul morceau

export interface SplitResult {
  /** Toujours au moins un élément. */
  songs: DetectedSong[];
  /**
   * Vrai quand le signal ne laisse guère de place au doute (directives ou
   * en-têtes répétés). Sur `pages`, on propose sans affirmer.
   */
  confident: boolean;
  signal: SourceSignal;
}

/** Directive ChordPro de titre, en début de ligne. */
const CHORDPRO_TITLE = /^\s*\{\s*(?:title|t)\s*:\s*(.+?)\s*\}\s*$/i;
/** En-tête « Title: … » (dialecte OnSong et assimilés). */
const ONSONG_TITLE = /^\s*(?:title|titre)\s*:\s*(.+?)\s*$/i;
/** Ligne de séparation : tirets, égales, astérisques, ou saut de page. */
const SEPARATOR = /^\s*(?:\f|[-=_*—–]{3,})\s*$/;
/** En-tête de section : jamais un titre de morceau. */
const SECTION =
  /^\s*[[(]?\s*(intro|couplet|verse|strophe|refrain|chorus|pont|bridge|pre[- ]?chorus|pr[eé][- ]?refrain|solo|instrumental|interlude|outro|coda|final)\s*\d*\s*[\])]?\s*:?\s*$/i;

/** Un morceau vaut la peine d'exister : au moins deux lignes de contenu. */
function assezDense(text: string): boolean {
  return text.split('\n').filter((l) => l.trim() !== '').length >= 2;
}

/**
 * Cette ligne ressemble-t-elle à un TITRE de morceau ?
 *
 * Volontairement sévère : mieux vaut ne pas découper que découper à tort.
 * Un faux positif coupe une chanson en deux au milieu d'un couplet, ce qui
 * est bien pire qu'un recueil resté d'un bloc — lequel sera de toute façon
 * marqué « à vérifier ».
 */
export function ressembleAUnTitre(line: string): boolean {
  const l = line.trim();
  if (l === '' || l.length > 60) return false;
  if (SECTION.test(l)) return false;
  if (isChordLine(l)) return false;
  if (/\[[A-G](?:#|b)?[^\]\n]*\]/.test(l)) return false; // accords en ligne
  if (!/[a-zà-ÿ]{2,}/i.test(l)) return false; // au moins un vrai mot
  if (/[.,;:!?]$/.test(l)) return false; // une phrase, pas un titre
  // Une ligne de paroles est rarement seule et courte ; on exige en plus
  // qu'elle ne se termine pas par une conjonction ou un article.
  if (/\b(et|ou|de|du|des|la|le|les|un|une|dans|que|qui)$/i.test(l)) {
    return false;
  }
  return true;
}

/** Découpe un texte aux positions données (indices de ligne de début). */
function coupe(
  lines: string[],
  starts: { at: number; title: string }[],
): DetectedSong[] {
  const out: DetectedSong[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].at;
    const to = i + 1 < starts.length ? starts[i + 1].at : lines.length;
    const text = lines.slice(from, to).join('\n').replace(/^\n+|\n+$/g, '');
    if (text.trim() === '') continue;
    out.push({ title: starts[i].title, text });
  }
  return out;
}

/**
 * Cherche les morceaux dans un contenu.
 *
 * `pages` (le PDF page par page) est le signal le plus utile pour un
 * recueil : `extractPdfText` aplatissait tout, cette information existait
 * et se perdait. Quand elle est disponible on s'en sert ; sinon on retombe
 * sur le texte continu.
 */
export function splitSongs(input: {
  text?: string;
  pages?: string[];
}): SplitResult {
  const texte = (input.text ?? input.pages?.join('\n\n') ?? '').replace(
    /\r\n?/g,
    '\n',
  );
  const lines = texte.split('\n');
  const seul = (signal: SourceSignal = 'none'): SplitResult => ({
    songs: [{ title: '', text: texte }],
    confident: false,
    signal,
  });
  if (texte.trim() === '') return seul();

  // ————— 1. Directives ChordPro : le signal le plus sûr qui soit.
  const cp: { at: number; title: string }[] = [];
  lines.forEach((l, i) => {
    const m = CHORDPRO_TITLE.exec(l);
    if (m) cp.push({ at: i, title: m[1].trim() });
  });
  if (cp.length >= 2) {
    const songs = coupe(lines, cp).filter((s) => assezDense(s.text));
    if (songs.length >= 2) return { songs, confident: true, signal: 'chordpro' };
  }

  // ————— 2. En-têtes « Title: » répétés (dialecte OnSong et assimilés).
  //    On n'accepte que ceux qui ouvrent un bloc (précédés d'une ligne vide
  //    ou en tête de fichier) : « Title: » au milieu d'un couplet n'est pas
  //    un début de morceau.
  const os: { at: number; title: string }[] = [];
  lines.forEach((l, i) => {
    const m = ONSONG_TITLE.exec(l);
    if (!m) return;
    if (i > 0 && lines[i - 1].trim() !== '') return;
    os.push({ at: i, title: m[1].trim() });
  });
  if (os.length >= 2) {
    const songs = coupe(lines, os).filter((s) => assezDense(s.text));
    if (songs.length >= 2) return { songs, confident: true, signal: 'onsong' };
  }

  // ————— 3. Recueil paginé : une chanson par page, parfois deux pages.
  //    Une page qui ne commence PAS par un titre continue la précédente.
  const pages = input.pages ?? [];
  if (pages.length >= 2) {
    const debuts: { title: string; textes: string[] }[] = [];
    for (const p of pages) {
      const premieres = p.split('\n');
      const idx = premieres.findIndex((l) => l.trim() !== '');
      const tete = idx >= 0 ? premieres[idx] : '';
      if (ressembleAUnTitre(tete) || debuts.length === 0) {
        debuts.push({ title: tete.trim(), textes: [p] });
      } else {
        debuts[debuts.length - 1].textes.push(p);
      }
    }
    const songs = debuts
      .map((d) => ({ title: d.title, text: d.textes.join('\n\n').trim() }))
      .filter((s) => assezDense(s.text));
    // Un recueil, c'est au moins deux morceaux titrés. Un document d'une
    // seule chanson sur trois pages retombe naturellement ici sur 1.
    if (songs.length >= 2 && songs.every((s) => s.title !== '')) {
      return { songs, confident: false, signal: 'pages' };
    }
  }

  // ————— 4. Séparateurs répétés (saut de page, ligne de tirets).
  const seps = lines
    .map((l, i) => (SEPARATOR.test(l) ? i : -1))
    .filter((i) => i >= 0);
  if (seps.length >= 1) {
    const blocs: { at: number; title: string }[] = [];
    let debut = 0;
    for (const s of [...seps, lines.length]) {
      if (s > debut) {
        const idx = lines.slice(debut, s).findIndex((l) => l.trim() !== '');
        const tete = idx >= 0 ? lines[debut + idx] : '';
        blocs.push({
          at: debut + Math.max(0, idx),
          title: ressembleAUnTitre(tete) ? tete.trim() : '',
        });
      }
      debut = s + 1;
    }
    const songs = coupe(lines, blocs).filter((s) => assezDense(s.text));
    if (songs.length >= 2 && songs.filter((s) => s.title !== '').length >= 2) {
      return { songs, confident: false, signal: 'separators' };
    }
  }

  return seul();
}

/**
 * Ce contenu SENT le recueil sans qu'on sache le découper ?
 *
 * Sert de ceinture au filet de sécurité : quand on n'a pas su couper, un
 * document anormalement long ou qui répète des titres part quand même en
 * bibliothèque, mais marqué « à vérifier » avec cette raison. Un mauvais
 * import signalé vaut mieux qu'un import manquant.
 */
export function sentLeRecueil(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const pleines = lines.filter((l) => l.trim() !== '').length;
  if (pleines < 120) return false;
  // Beaucoup de lignes ET plusieurs têtes de morceau plausibles isolées
  // entre deux lignes vides.
  let titres = 0;
  for (let i = 1; i < lines.length - 1; i++) {
    if (
      lines[i - 1].trim() === '' &&
      lines[i + 1].trim() === '' &&
      ressembleAUnTitre(lines[i])
    ) {
      titres++;
    }
  }
  return titres >= 3;
}
