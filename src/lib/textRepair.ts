/**
 * Réparation des textes issus de PDF « cassés » : certaines polices PDF
 * encodent l'ESPACE comme le glyphe « ! » (défaut classique de vieux
 * convertisseurs — même pdftotext produit « Cendrillon!pour!ses!vingt!ans »).
 * Détection prudente : on ne répare que si les « ! » entre les mots sont
 * massivement majoritaires face aux vrais espaces — une chanson normale,
 * même très exclamative, n'approche jamais ce ratio.
 * Fonctions pures — testées dans le bac à sable.
 */

/* ------------------------------------------------------------------ */
/* Entités HTML restées dans le texte (&eacute; → é)                   */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  auml: 'ä',
  atilde: 'ã',
  ccedil: 'ç',
  ocirc: 'ô',
  ouml: 'ö',
  oacute: 'ó',
  ograve: 'ò',
  otilde: 'õ',
  icirc: 'î',
  iuml: 'ï',
  iacute: 'í',
  igrave: 'ì',
  ucirc: 'û',
  ugrave: 'ù',
  uuml: 'ü',
  uacute: 'ú',
  ntilde: 'ñ',
  yuml: 'ÿ',
  aelig: 'æ',
  oelig: 'œ',
  szlig: 'ß',
  aring: 'å',
  oslash: 'ø',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  deg: '°',
  laquo: '«',
  raquo: '»',
  // UG emploie &acute; comme apostrophe (« J&acute;avais ») : on rend
  // une vraie apostrophe, pas l'accent isolé « ´ ».
  acute: "'",
  grave: '`',
  uml: '¨',
  cedil: '¸',
  tilde: '˜',
  circ: 'ˆ',
  middot: '·',
  bull: '•',
  prime: '′',
  euro: '€',
  pound: '£',
  cent: '¢',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  plusmn: '±',
  sup2: '²',
  sup3: '³',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  iexcl: '¡',
  iquest: '¿',
};

function decodeEntitiesOnce(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d{1,7});/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]{2,8});/g, (m, name: string) => {
      const exact = NAMED_ENTITIES[name];
      if (exact) return exact;
      const lower = NAMED_ENTITIES[name.toLowerCase()];
      if (lower && name[0] === name[0].toUpperCase()) {
        return lower.toUpperCase();
      }
      return lower ?? m;
    });
}

/**
 * Décode les entités HTML restées en clair (« attrap&eacute; » →
 * « attrapé ») : nommées, décimales (&#233;) et hexadécimales (&#xE9;).
 * ITÉRATIF : les textes passés par plusieurs encodages successifs
 * (« d&amp;eacute;sormais », voire &amp;amp;…) sont décodés couche par
 * couche jusqu'à stabilité. Les « & » ordinaires (R&B, Simon &
 * Garfunkel) ne sont pas touchés.
 */
export function decodeHtmlEntities(text: string): string {
  let prev = text;
  for (let i = 0; i < 5; i++) {
    const next = decodeEntitiesOnce(prev);
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

/** Le texte contient-il des entités HTML à décoder ? */
export function hasHtmlEntities(text: string): boolean {
  return decodeHtmlEntities(text) !== text;
}

/** Une passe de décodage AVEC carte des positions (ancien → nouveau). */
function decodeOnceWithMap(s: string): { out: string; map: number[] } {
  const map = new Array<number>(s.length + 1);
  let out = '';
  let last = 0;
  const re = /&#x[0-9a-fA-F]{1,6};|&#\d{1,7};|&[a-zA-Z]{2,8};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const rep = decodeEntitiesOnce(m[0]);
    if (rep === m[0]) continue; // entité inconnue : intacte
    for (let i = last; i < m.index; i++) map[i] = out.length + (i - last);
    out += s.slice(last, m.index);
    // positions à l'intérieur de l'entité : l'accord ira APRÈS la lettre
    map[m.index] = out.length;
    for (let i = m.index + 1; i <= m.index + m[0].length; i++) {
      map[i] = out.length + rep.length;
    }
    out += rep;
    last = m.index + m[0].length;
  }
  for (let i = last; i < s.length; i++) map[i] = out.length + (i - last);
  out += s.slice(last);
  map[s.length] = out.length;
  return { out, map };
}

/**
 * Répare des paroles AVEC accords [X] dont les entités ont été coupées
 * par un accord inséré au milieu (« d&eac[F#m]ute;sormais ») : les
 * accords sont extraits, le texte nu est décodé (les morceaux d'entité
 * se ressoudent), puis les accords sont réinsérés à la bonne place.
 */
export function repairChordedLyrics(lyrics: string): string {
  return lyrics
    .split('\n')
    .map((line) => {
      if (!line.includes('[')) return decodeHtmlEntities(line);
      // Sépare accords et texte nu
      const chords: { pos: number; tok: string }[] = [];
      let plain = '';
      const re = /\[[^\]\n]*\]/g;
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        plain += line.slice(last, m.index);
        chords.push({ pos: plain.length, tok: m[0] });
        last = m.index + m[0].length;
      }
      plain += line.slice(last);
      if (decodeHtmlEntities(plain) === plain) return line; // rien à décoder
      // Décodage par passes, en composant les cartes de positions
      let text = plain;
      let positions = chords.map((c) => c.pos);
      for (let pass = 0; pass < 5; pass++) {
        const { out, map } = decodeOnceWithMap(text);
        if (out === text) break;
        positions = positions.map((p) => map[Math.min(p, text.length)]);
        text = out;
      }
      // Réinsère les accords (de la fin vers le début)
      let res = text;
      for (let i = chords.length - 1; i >= 0; i--) {
        const p = Math.min(positions[i], res.length);
        res = res.slice(0, p) + chords[i].tok + res.slice(p);
      }
      return res;
    })
    .join('\n');
}

/** Des entités subsistent-elles, même coupées par des accords ? */
export function hasBrokenEntities(lyrics: string): boolean {
  const plain = lyrics.replace(/\[[^\]\n]*\]/g, '');
  return decodeHtmlEntities(plain) !== plain;
}

/** Le texte utilise-t-il « ! » à la place des espaces ? */
export function hasGlyphSpaces(text: string): boolean {
  if (text === '') return false;
  const sepHits = (
    text.match(/[A-Za-zÀ-ÿ0-9),.'][!][A-Za-zÀ-ÿ0-9('!]/g) ?? []
  ).length;
  const spaceHits = (
    text.match(/[A-Za-zÀ-ÿ0-9] [A-Za-zÀ-ÿ0-9]/g) ?? []
  ).length;
  return sepHits >= 8 && sepHits > spaceHits * 3;
}

/** Remplace les « ! » par des espaces (à n'appliquer que si détecté). */
export function fixGlyphSpaces(text: string): string {
  return text.replace(/!/g, ' ').replace(/[ \t]+$/gm, '');
}

/**
 * Caractères de contrôle invisibles (dont le NUL  que certains
 * PDF cassés injectent) : illégaux en base (PostgreSQL 22P05) et
 * inutiles à l'écran. On garde \n et \t.
 */
export function stripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Répare si nécessaire, sinon renvoie le texte tel quel. */
export function repairPdfText(text: string): string {
  const clean = stripControlChars(text);
  return hasGlyphSpaces(clean) ? fixGlyphSpaces(clean) : clean;
}

/**
 * Texte « brouillé » : certaines polices PDF remplacent CHAQUE lettre
 * par un autre caractère (substitution involontaire — « YZ[ » = « Les »).
 * Signes : symboles ^ _ ` { } | \ ~ omniprésents et voyelles quasi
 * absentes. Un tel texte est indéchiffrable localement, mais l'IA sait
 * le décoder (correspondance cohérente + langue connue).
 */
export function looksGarbled(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  // Hors espaces : la mise en page (centrage…) ne doit pas diluer la mesure
  const dense = t.replace(/\s+/g, '');
  if (dense.length < 60) return false;
  const symbols = (dense.match(/[\^_`{}|\\~]/g) ?? []).length;
  const letters = (dense.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (letters === 0) return symbols / dense.length > 0.1;
  const vowels = (dense.match(/[aeiouyAEIOUYàâéèêëîïôùûü]/g) ?? []).length;
  const vowelRatio = vowels / letters;
  const symbolRatio = symbols / dense.length;
  // Français/anglais normal : ~35-48 % de voyelles, quasi aucun ^_`{}|
  return symbolRatio > 0.06 && vowelRatio < 0.28;
}
