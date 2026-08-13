/**
 * Import intelligent de partitions texte vers le format mojosong.
 *
 * Formats reconnus automatiquement :
 * 1. « Accords au-dessus des paroles » (le plus courant)
 * 2. ChordPro : {title:…}, accords inline [Am], {soc}/{eoc}, {comment:…}
 * 3. OnSong : en-têtes "Title:", "Key:", "Capo:"… puis sections "Verse 1:"
 * 4. En-têtes de sections ([Couplet 1], Refrain:, Chorus…) → transformés en
 *    résumé de structure en tête de partition ; les paroles restent un bloc
 *    continu.
 */
import { extractChordSequence } from './model';
import {
  ligneDeSection,
  lireEnTeteDeSection,
  SECTION_HEADER_RE,
  sectionDeLaLigne,
} from './sections';
import { makeId, parseDuration, Song, StructureRow } from '../types';

const CHORD_TOKEN =
  /^\(?[A-G](?:#|b)?(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø)?\d*(?:(?:sus|add|maj)\d+)?(?:\/[A-G](?:#|b)?)?\)?$/;

const NOISE_TOKEN = /^(\||%|-|–|—|x\d+|\(x\d+\)|N\.?C\.?|\.|,)$/i;

const INLINE_CHORD = /\[[A-G](?:#|b)?[^\]\n]*\]/;

export function isChordLine(line: string): boolean {
  if (INLINE_CHORD.test(line)) return false;
  const tokens = line.trim().split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const t of tokens) {
    if (CHORD_TOKEN.test(t)) chords++;
    else if (!NOISE_TOKEN.test(t)) return false;
  }
  return chords > 0;
}

/* ------------------------------------------------------------------ */
/* Recalage des accords sur les mots                                    */
/* ------------------------------------------------------------------ */

/** Caractère faisant partie d'un mot. L'apostrophe et le trait d'union
 *  SÉPARENT : « d'Amsterdam » a deux attaques, et un accord posé sur
 *  l'apostrophe appartient à ce qui suit. */
function estLettre(c: string): boolean {
  return /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(c);
}

/** Attaque de mot : une lettre précédée d'autre chose. */
function estAttaque(s: string, i: number): boolean {
  return estLettre(s[i]) && (i === 0 || !estLettre(s[i - 1]));
}

/**
 * Écart maximal toléré pour rapatrier un accord sur une attaque de mot quand
 * le mot est LONG. Au-delà, l'accord tombe vraiment en cours de mot (mélisme,
 * syllabe tenue) et on le laisse où il est.
 */
const TOLERANCE_RECALAGE = 3;

/** Au-delà de cette longueur, un mot peut légitimement porter un changement
 *  d'accord en son milieu. En deçà, un accord planté dedans est un décalage
 *  de mise en page, jamais une intention. */
const MOT_LONG = 8;

/**
 * Un accord écrit au-dessus des paroles est aligné à la COLONNE près, dans
 * une police à chasse fixe — la partition d'origine, elle, ne l'est pas
 * toujours : un espace en trop, une accentuation qui décale, et l'accord
 * atterrit au milieu d'un mot. Le musicien lisait « commen[C]t faire » et
 * « un coup d[A7]'je t'aime ».
 *
 * On ramène donc l'accord au début du mot le plus proche quand il tombe DANS
 * un mot et que la frontière est à portée. Un changement d'accord se fait
 * presque toujours sur une attaque de mot ; à quelques caractères près,
 * c'est le typographe de la partition qui a glissé, pas le musicien.
 */
export function recalerSurUnMot(lyric: string, col: number): number {
  if (col <= 0 || col >= lyric.length) return col;
  if (estAttaque(lyric, col)) return col;

  let avant = -1;
  for (let i = col - 1; i >= 0; i--) {
    if (estAttaque(lyric, i)) {
      avant = i;
      break;
    }
  }
  let apres = -1;
  for (let i = col + 1; i < lyric.length; i++) {
    if (estAttaque(lyric, i)) {
      apres = i;
      break;
    }
  }

  // Accord posé sur une espace : il appartient au mot qui SUIT — jamais à
  // celui qu'on vient de quitter (« cou,[G] sur » se lit « cou, [G]sur »).
  // Au-delà de la tolérance, l'espace est une tenue et l'accord y reste.
  if (/\s/.test(lyric[col])) {
    return apres >= 0 && apres - col <= TOLERANCE_RECALAGE ? apres : col;
  }

  // Mot court : on recale toujours vers l'attaque la plus proche.
  let court = false;
  if (estLettre(lyric[col]) && avant >= 0) {
    let fin = col;
    while (fin < lyric.length && estLettre(lyric[fin])) fin++;
    court = fin - avant <= MOT_LONG;
  }
  const seuil = court ? Infinity : TOLERANCE_RECALAGE;
  const dAvant = avant >= 0 && col - avant <= seuil ? col - avant : Infinity;
  const dApres = apres >= 0 && apres - col <= seuil ? apres - col : Infinity;
  if (dAvant === Infinity && dApres === Infinity) return col;
  return dAvant <= dApres ? avant : apres;
}

export function mergeChordLyric(chordLine: string, lyricLine: string): string {
  const inserts: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine)) !== null) {
    const token = m[0];
    if (CHORD_TOKEN.test(token)) {
      inserts.push({ col: m.index, chord: token.replace(/^\(|\)$/g, '') });
    }
  }
  let result = lyricLine;
  const maxCol = inserts.length > 0 ? inserts[inserts.length - 1].col : 0;
  if (result.length < maxCol) {
    result = result + ' '.repeat(maxCol - result.length);
  }
  // Recalage, puis remise en ordre : deux accords ne peuvent pas se
  // retrouver sur la même colonne (« [C][G]faire » ne veut rien dire).
  const cols = inserts.map((x) => recalerSurUnMot(result, x.col));
  let precedent = -1;
  for (let i = 0; i < cols.length; i++) {
    if (cols[i] <= precedent) cols[i] = Math.max(inserts[i].col, precedent + 1);
    precedent = cols[i];
  }
  for (let i = inserts.length - 1; i >= 0; i--) {
    const c = Math.min(cols[i], result.length);
    result = result.slice(0, c) + '[' + inserts[i].chord + ']' + result.slice(c);
  }
  return result;
}

/**
 * RECALER LES ACCORDS D'UNE PARTITION DÉJÀ ENREGISTRÉE (b220).
 *
 * Le recalage de b219 opère à la FUSION des lignes d'accords et de paroles :
 * il ne pouvait donc rien pour la bibliothèque déjà importée, où les accords
 * sont figés en ligne (« commen[C]t faire »). Même règle, appliquée cette
 * fois aux positions déjà écrites — c'est du calcul pur, sans réseau, sans
 * IA, et rejouable sans risque (un accord déjà posé sur une attaque de mot
 * ne bouge plus).
 *
 * Les lignes sans paroles (grilles d'accords) sont laissées telles quelles :
 * il n'y a pas de mot sur lequel recaler.
 */
export function recalerAccordsEnLigne(lyrics: string): string {
  return lyrics
    .split('\n')
    .map((line) => {
      if (!line.includes('[')) return line;
      const inserts: { col: number; chord: string }[] = [];
      const re = /\[([^\]\n]+)\]/g;
      let nu = '';
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        nu += line.slice(last, m.index);
        inserts.push({ col: nu.length, chord: m[1] });
        last = m.index + m[0].length;
      }
      nu += line.slice(last);
      if (inserts.length === 0 || nu.trim() === '') return line;
      const cols = inserts.map((x) => recalerSurUnMot(nu, x.col));
      let precedent = -1;
      for (let i = 0; i < cols.length; i++) {
        if (cols[i] <= precedent) {
          cols[i] = Math.max(inserts[i].col, precedent + 1);
        }
        precedent = cols[i];
      }
      let out = nu;
      for (let i = inserts.length - 1; i >= 0; i--) {
        const c = Math.min(cols[i], out.length);
        out = out.slice(0, c) + '[' + inserts[i].chord + ']' + out.slice(c);
      }
      return out;
    })
    .join('\n');
}

/** Combien d'accords ce texte déplacerait-il ? (pour annoncer le travail) */
export function accordsARecaler(lyrics: string): number {
  const avant = lyrics.split('\n');
  const apres = recalerAccordsEnLigne(lyrics).split('\n');
  let n = 0;
  for (let i = 0; i < avant.length; i++) {
    if (avant[i] !== apres[i]) {
      n += (avant[i].match(/\[[^\]\n]*\]/g) ?? []).length;
    }
  }
  return n;
}

export function chordLineToGrid(line: string): string {
  return line
    .trim()
    .split(/\s+/)
    .map((t) =>
      CHORD_TOKEN.test(t) ? '[' + t.replace(/^\(|\)$/g, '') + ']' : t,
    )
    .join(' ');
}

interface Meta {
  title?: string;
  artist?: string;
  key?: string;
  tempo?: number;
  capo?: number;
  durationSec?: number;
  tags: string[];
  comments: string[];
}

/** Directives ChordPro {x:y} et en-têtes OnSong "Key: G" (début de fichier). */
function extractMeta(lines: string[]): {
  lines: string[];
  meta: Meta;
  markers: Map<number, 'soc' | 'eoc' | 'sov' | 'eov'>;
} {
  const meta: Meta = { tags: [], comments: [] };
  const kept: string[] = [];
  const markers = new Map<number, 'soc' | 'eoc' | 'sov' | 'eov'>();
  const DIRECTIVE_RE = /^\s*\{\s*([^:}]+?)\s*(?::\s*(.*?))?\s*\}\s*$/;
  const ONSONG_RE =
    /^\s*(title|titre|artist|artiste|author|key|tonalit[eé]|capo|tempo|bpm|time|duration|dur[eé]e|tags?)\s*:\s*(.+)\s*$/i;

  let inHeader = true;

  function applyMeta(name: string, value: string): boolean {
    switch (name) {
      case 'title':
      case 'titre':
      case 't':
        meta.title = value;
        return true;
      case 'artist':
      case 'artiste':
      case 'author':
      case 'subtitle':
      case 'st':
        meta.artist = value;
        return true;
      case 'key':
      case 'tonalite':
      case 'tonalité':
        meta.key = value;
        return true;
      case 'tempo':
      case 'bpm':
        meta.tempo = parseInt(value, 10) || 0;
        return true;
      case 'capo':
        meta.capo = parseInt(value, 10) || 0;
        return true;
      case 'duration':
      case 'duree':
      case 'durée':
        meta.durationSec = parseDuration(value);
        return true;
      case 'tag':
      case 'tags':
        meta.tags.push(
          ...value.split(/[,;]/).map((t) => t.trim()).filter((t) => t !== ''),
        );
        return true;
      case 'comment':
      case 'c':
      case 'ci':
      case 'comment_italic':
        meta.comments.push(value);
        return true;
      default:
        return false;
    }
  }

  for (const line of lines) {
    const d = DIRECTIVE_RE.exec(line);
    if (d) {
      const name = d[1].toLowerCase();
      const value = (d[2] ?? '').trim();
      if (applyMeta(name, value)) continue;
      switch (name) {
        case 'start_of_chorus':
        case 'soc':
          markers.set(kept.length, 'soc');
          continue;
        case 'end_of_chorus':
        case 'eoc':
          markers.set(kept.length, 'eoc');
          continue;
        case 'start_of_verse':
        case 'sov':
          markers.set(kept.length, 'sov');
          continue;
        case 'end_of_verse':
        case 'eov':
          markers.set(kept.length, 'eov');
          continue;
        default:
          continue;
      }
    }
    if (inHeader) {
      const o = ONSONG_RE.exec(line);
      if (o && !SECTION_HEADER_RE.test(line)) {
        applyMeta(o[1].toLowerCase(), o[2].trim());
        continue;
      }
      if (line.trim() !== '') inHeader = false;
    }
    kept.push(line);
  }
  return { lines: kept, meta, markers };
}

export interface ImportStats {
  structureRows: number;
  mergedChordLines: number;
  hadMeta: boolean;
  /** Le titre / l'artiste étaient présents dans le fichier importé */
  hadTitle: boolean;
  hadArtist: boolean;
}

export interface ImportOutcome {
  song: Song;
  stats: ImportStats;
}

export function importText(raw: string, fallbackTitle: string): ImportOutcome {
  const normalized = raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\u00a0/g, ' ');
  const { lines, meta, markers } = extractMeta(normalized.split('\n'));

  // Une "zone" par en-tête rencontré ; les paroles restent continues.
  interface Zone {
    label: string;
    lines: string[];
  }
  const zones: Zone[] = [];
  const counters: { [k: string]: number } = {};
  let current: Zone | null = null;
  let mergedChordLines = 0;

  function openZone(baseLabel: string, num: string) {
    if (num !== '') {
      counters[baseLabel] = parseInt(num, 10);
    } else {
      counters[baseLabel] = (counters[baseLabel] ?? 0) + 1;
    }
    const needsNumber = baseLabel === 'Couplet' || counters[baseLabel] > 1;
    current = {
      label: baseLabel + (needsNumber ? ` ${counters[baseLabel]}` : ''),
      lines: [],
    };
    zones.push(current);
  }

  function currentHasContent(): boolean {
    return current !== null && current.lines.length > 0;
  }

  function appendLine(text: string) {
    let zone = current;
    if (!zone) {
      zone = { label: '', lines: [] };
      zones.push(zone);
      current = zone;
    }
    zone.lines.push(text);
  }

  /**
   * En-tête de section à la ligne i — ou null.
   *
   * Un en-tête SANS décoration (« Solo » nu, sans crochets, parenthèses ni
   * deux-points) qui suit une ligne d'accords n'est pas un titre : c'est LA
   * PAROLE que ces accords surmontent. « Je marche solo dans la nuit / Am
   *  F / Solo » découpait le morceau en deux et le mot disparaissait.
   */
  function enTeteA(i: number) {
    const h = lireEnTeteDeSection(lines[i] ?? '');
    if (!h) return null;
    if (h.decore) return h;
    return i > 0 && isChordLine(lines[i - 1] ?? '') ? null : h;
  }

  for (let i = 0; i < lines.length; i++) {
    const marker = markers.get(i);
    if (marker === 'soc') openZone('Refrain', '');
    else if (marker === 'sov') openZone('Couplet', '');
    else if (marker === 'eoc' || marker === 'eov') current = null;

    const line = lines[i];
    const header = enTeteA(i);
    if (header) {
      openZone(header.label, header.num);
      continue;
    }

    if (line.trim() === '') {
      if (currentHasContent()) appendLine('');
      continue;
    }

    if (isChordLine(line)) {
      const next = i + 1 < lines.length ? lines[i + 1] : '';
      const nextUsable =
        next.trim() !== '' &&
        !isChordLine(next) &&
        enTeteA(i + 1) === null &&
        !markers.has(i + 1);
      if (nextUsable) {
        appendLine(mergeChordLyric(line, next));
        mergedChordLines++;
        i++;
      } else {
        appendLine(chordLineToGrid(line));
      }
      continue;
    }

    appendLine(line);
  }

  // Structure = résumé des zones nommées ; paroles = tout, en continu.
  const namedZones = zones.filter((z) => z.label !== '');
  const structure: StructureRow[] =
    namedZones.length > 0
      ? namedZones.map((z) => ({
          id: makeId(),
          label: z.label,
          chords: extractChordSequence(z.lines.join('\n')),
          comment: '',
        }))
      : [];

  // Les paroles GARDENT le nom de leurs sections (b219). Le fichier disait
  // « Refrain » ; jusqu'ici l'import s'en servait pour bâtir le résumé de
  // structure, puis le jetait — et comme « Structure » est devenu un bloc de
  // notes libres, plus aucun écran ne le montrait. Le musicien recevait un
  // pavé continu. Le libellé est écrit en clair (« Refrain : »), jamais entre
  // crochets : les crochets, ici, ce sont les accords.
  const lyrics = zones
    .map((z) => {
      const corps = z.lines.join('\n').replace(/^\n+|\n+$/g, '');
      if (z.label === '') return corps.trim() === '' ? '' : corps;
      // Un en-tête sans contenu (« Refrain » seul = « on reprend le
      // refrain ») dit quelque chose : on le garde.
      return corps.trim() === ''
        ? ligneDeSection(z.label)
        : `${ligneDeSection(z.label)}\n${corps}`;
    })
    .filter((c) => c !== '')
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');

  const now = new Date().toISOString();
  const versionId = makeId();
  const artiste = (meta.artist ?? '').trim();
  // Un tag qui répète le nom de l'artiste (« Pink Floyd ») est un doublon
  // inutile : on ne l'enregistre pas à l'import (b298, demande de Vincent).
  const tags =
    artiste === ''
      ? meta.tags
      : meta.tags.filter((tg) => tg.trim().toLowerCase() !== artiste.toLowerCase());
  const song: Song = {
    id: makeId(),
    title: (meta.title ?? fallbackTitle).trim() || 'Morceau importé',
    artist: artiste,
    key: meta.key ?? '',
    tempo: meta.tempo ?? 0,
    capo: meta.capo ?? 0,
    durationSec: meta.durationSec ?? 0,
    tags,
    structure,
    lyrics,
    versions: [
      {
        id: versionId,
        name: 'Original',
        bandId: '',
        key: meta.key ?? '',
        tempo: meta.tempo ?? 0,
        capo: meta.capo ?? 0,
        structure,
        lyrics,
      },
    ],
    activeVersionId: versionId,
    hearts: 0,
    fanMessages: [],
    rehearsalNotes: meta.comments
      .filter((c) => c.trim() !== '')
      .map((c) => ({
        id: makeId(),
        target: '',
        bandId: '',
        text: c,
        author: '',
        visibility: 'groupe' as const,
        createdAt: now,
      })),
    createdAt: now,
    updatedAt: now,
  };

  return {
    song,
    stats: {
      structureRows: structure.length,
      mergedChordLines,
      hadMeta: meta.title !== undefined || meta.artist !== undefined,
      hadTitle: meta.title !== undefined,
      hadArtist: meta.artist !== undefined,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Analyse de la qualité d'un import                                   */
/* ------------------------------------------------------------------ */

export interface ImportIssue {
  /** 'warn' = l'IA peut probablement aider ; 'info' = simple remarque */
  severity: 'warn' | 'info';
  text: string;
}

/** Ligne de tablature : e|--3--0--… (non convertible en accords sans IA). */
const TAB_LINE_RE = /^\s*[eEBGDAbgda]\s*\|[-0-9hpbrxs/\\~.^()\s|]{6,}$/;

/**
 * Analyse le résultat d'un import et liste ce qui mérite attention.
 * Les problèmes 'warn' justifient de proposer le nettoyage IA ;
 * les 'info' sont de simples remarques (rien de bloquant).
 */
export function analyzeImport(
  raw: string,
  outcome: ImportOutcome,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const { song, stats } = outcome;
  const rawLines = raw.replace(/\r\n?/g, '\n').split('\n');

  // Encodage abîmé (caractère de remplacement �)
  if (raw.includes('�')) {
    issues.push({
      severity: 'warn',
      text: 'caractères illisibles détectés (problème d’encodage du fichier)',
    });
  }

  // Tablatures : elles ne deviennent pas des accords toutes seules
  const tabLines = rawLines.filter((l) => TAB_LINE_RE.test(l)).length;
  if (tabLines >= 2) {
    issues.push({
      severity: 'warn',
      text: `tablatures détectées (${tabLines} lignes) — elles ne sont pas converties en accords`,
    });
  }

  const inlineChords = (song.lyrics.match(/\[[A-G](?:#|b)?[^\]\n]*\]/g) ?? [])
    .length;
  // Les en-têtes de sections vivent maintenant DANS les paroles (b219) :
  // ils ne comptent ni comme grille d'accords, ni comme ligne de paroles.
  const lyricLines = song.lyrics
    .split('\n')
    .filter((l) => sectionDeLaLigne(l) === null);
  const gridOnly = lyricLines.filter(
    (l) => l.includes('[') && l.replace(/\[[^\]\n]*\]/g, '').trim() === '',
  ).length;
  const wordLines = lyricLines.filter(
    (l) => !l.includes('[') && /[a-zà-ÿ]{3,}/i.test(l),
  ).length;

  if (inlineChords === 0 && stats.mergedChordLines === 0) {
    const chordish = rawLines.filter((l) => isChordLine(l)).length;
    if (chordish > 0) {
      issues.push({
        severity: 'warn',
        text: 'des accords semblent présents mais n’ont pas été reconnus',
      });
    } else if (tabLines < 2) {
      issues.push({
        severity: 'info',
        text: 'aucun accord détecté — paroles seules',
      });
    }
  } else if (gridOnly >= 3 && stats.mergedChordLines === 0 && wordLines > gridOnly) {
    issues.push({
      severity: 'warn',
      text: 'les accords n’ont pas pu être alignés sur les paroles',
    });
  }

  if (stats.structureRows === 0) {
    issues.push({
      severity: 'info',
      text: 'pas de sections détectées ([Couplet], Refrain:…) — la structure restera à saisir',
    });
  }
  if (!stats.hadArtist) {
    issues.push({
      severity: 'info',
      text: 'artiste non détecté — complète le champ Artiste',
    });
  }
  return issues;
}

/**
 * FAUT-IL RELIRE CE MORCEAU ? — renvoie la raison, ou '' si tout va bien.
 *
 * Le diagnostic ci-dessus était calculé, affiché à l'écran d'aperçu, puis
 * jeté. On le conserve maintenant sur le morceau importé : il entre en
 * bibliothèque même douteux — un mauvais import signalé vaut mieux qu'un
 * import manquant — mais il dit ce qui cloche et se retrouve d'un geste.
 *
 * Seuls les `warn` comptent : un artiste non détecté ou une structure
 * absente n'empêchent pas de jouer, et transformer chaque import en
 * corvée de relecture ferait fuir tout le monde.
 *
 * Une seule fonction, appelée par TOUS les chemins d'import (unitaire,
 * masse, découpage d'un recueil) : c'est ce qui empêche les trois de
 * diverger.
 */
export function raisonDeVerifier(
  raw: string,
  outcome: ImportOutcome,
  extra?: { plusieursPartitions?: boolean },
): string {
  if (extra?.plusieursPartitions) {
    return 'ce morceau contient peut-être plusieurs partitions';
  }
  const warn = analyzeImport(raw, outcome).find((x) => x.severity === 'warn');
  if (warn) return warn.text;
  // Contenu anormalement court : deux lignes ne font pas une partition.
  // Un en-tête de section n'est pas du contenu (b219).
  const utiles = outcome.song.lyrics
    .split('\n')
    .filter((l) => l.trim() !== '' && sectionDeLaLigne(l) === null).length;
  if (utiles > 0 && utiles < 3) return 'contenu très court — rien d’autre n’a été lu';
  return '';
}

/** Normalisation pour la détection de doublons. */
import { bandKeysMatch, normalizeTitle, songKey } from './normalizeTitle';
export { bandKeysMatch, normalizeTitle, songKey };

/** Cherche un doublon probable dans la bibliothèque. */
export function findDuplicate(songs: Song[], title: string): Song | null {
  const norm = normalizeTitle(title);
  if (norm === '') return null;
  return songs.find((s) => normalizeTitle(s.title) === norm) ?? null;
}

/** Mots significatifs des paroles (accords retirés, accents ignorés). */
function lyricsTokens(lyrics: string): Set<string> {
  return new Set(
    lyrics
      // Les en-têtes de sections ne sont pas des paroles (b219) : sans quoi
      // « refrain » et « couplet » pèseraient dans la reconnaissance de
      // doublons, entre un morceau importé avant ce lot et le même après.
      .split('\n')
      .filter((l) => sectionDeLaLigne(l) === null)
      .join('\n')
      .replace(/\[[^\]\n]*\]/g, '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

/** Similarité de paroles (0…1, indice de Jaccard sur les mots). */
export function lyricsSimilarity(a: string, b: string): number {
  const ta = lyricsTokens(a);
  const tb = lyricsTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Reconnaissance renforcée : même chanson si le titre est identique, OU si
 * les titres se contiennent (« Imagine » ⊂ « Imagine John Lennon ») avec
 * des paroles proches, OU si les paroles sont quasi identiques.
 */
export function findSameSong(
  songs: Song[],
  title: string,
  lyrics: string,
  artist?: string,
): Song | null {
  const nt = normalizeTitle(title);
  const na = normalizeTitle(artist ?? '');
  // Titre exact — mais JAMAIS entre deux artistes clairement différents :
  // deux « Hallelujah » (Cohen / autre) sont deux morceaux (b132).
  for (const s of songs) {
    if (normalizeTitle(s.title) !== nt || nt === '') continue;
    const nsa = normalizeTitle(s.artist ?? '');
    const clash =
      na !== '' &&
      nsa !== '' &&
      na !== nsa &&
      !na.includes(nsa) &&
      !nsa.includes(na);
    if (!clash) return s;
  }
  // « Aint No Sunshine Bill Withers » = « Ain't No Sunshine » + artiste :
  // on compare aussi les titres débarrassés du nom d'artiste.
  const stripArtist = (t: string, a: string): string => {
    if (a === '' || t === a) return t;
    if (t.endsWith(' ' + a)) return t.slice(0, t.length - a.length).trim();
    if (t.startsWith(a + ' ')) return t.slice(a.length).trim();
    return t;
  };
  for (const s of songs) {
    const ns = normalizeTitle(s.title);
    const nsa = normalizeTitle(s.artist ?? '');
    // Artistes connus et clairement différents → jamais le même morceau
    const artistsClash =
      na !== '' &&
      nsa !== '' &&
      na !== nsa &&
      !na.includes(nsa) &&
      !nsa.includes(na);
    const ntStripped = [nt, stripArtist(nt, na), stripArtist(nt, nsa)];
    const nsStripped = [ns, stripArtist(ns, nsa), stripArtist(ns, na)];
    const sameTitle = ntStripped.some(
      (a) => a !== '' && nsStripped.includes(a),
    );
    if (sameTitle && nt !== ns && !artistsClash) return s;
    const contains =
      nt !== '' && ns !== '' && (nt.includes(ns) || ns.includes(nt));
    const sim = lyricsSimilarity(lyrics, s.lyrics);
    if ((contains && sim >= 0.7) || sim >= 0.92) return s;
  }
  return null;
}
