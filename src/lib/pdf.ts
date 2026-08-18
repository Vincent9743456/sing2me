/**
 * Extraction du texte d'un PDF côté navigateur (pdf.js chargé à la
 * demande depuis le CDN — aucune dépendance ajoutée au build).
 *
 * Particularité partitions : on reconstruit les LIGNES à partir des
 * positions (x, y) des fragments, en préservant les colonnes — sinon les
 * accords au-dessus des paroles perdraient leur alignement et l'analyse
 * d'import ne pourrait plus les rattacher aux syllabes.
 */

import { repairPdfText } from './textRepair';

const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69';

let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
  if (!pdfjsPromise) {
    // new Function : évite que Vite/TS tentent de résoudre l'URL au build.
    const dynImport = new Function('u', 'return import(u)') as (
      u: string,
    ) => Promise<any>;
    pdfjsPromise = dynImport(`${PDFJS_BASE}/pdf.min.mjs`).then((m: any) => {
      m.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return m;
    });
    pdfjsPromise.catch(() => {
      pdfjsPromise = null; // réseau indisponible → on pourra retenter
    });
  }
  return pdfjsPromise;
}

/** Fragment de texte positionné (unités PDF). */
export interface PdfFragment {
  str: string;
  x: number;
  y: number;
  w: number;
}

/**
 * Reconstruit le texte ligne par ligne à partir des fragments positionnés.
 * Pure (testée dans le bac à sable) : regroupe par y (tolérance), ordonne
 * par x, et replace chaque fragment à sa colonne estimée pour préserver
 * l'alignement accords/paroles.
 */
export function fragmentsToText(frags: PdfFragment[]): string {
  const usable = frags.filter((f) => f.str.trim() !== '');
  if (usable.length === 0) return '';

  // Regroupement par ligne : deux fragments sont sur la même ligne si
  // leurs y diffèrent de moins de 4 unités (~ demi-hauteur de police).
  const lines: { y: number; frags: PdfFragment[] }[] = [];
  const sorted = [...usable].sort((a, b) => b.y - a.y || a.x - b.x);
  for (const f of sorted) {
    const line = lines.find((l) => Math.abs(l.y - f.y) < 4);
    if (line) {
      line.frags.push(f);
      line.y = (line.y * (line.frags.length - 1) + f.y) / line.frags.length;
    } else {
      lines.push({ y: f.y, frags: [f] });
    }
  }

  // Largeur moyenne d'un caractère (base de la conversion x → colonne).
  let totalW = 0;
  let totalChars = 0;
  for (const f of usable) {
    if (f.w > 0 && f.str.length > 0) {
      totalW += f.w;
      totalChars += f.str.length;
    }
  }
  const charW = totalChars > 0 && totalW > 0 ? totalW / totalChars : 6;
  const minX = Math.min(...usable.map((f) => f.x));

  const out: string[] = [];
  for (const line of lines) {
    line.frags.sort((a, b) => a.x - b.x);
    let text = '';
    /**
     * LA VRAIE GÉOMÉTRIE, PAS UNE ESTIMATION (b366, PDF de Vincent — son
     * propre export mojosong). L'ancien code décidait des espaces avec
     * `text.length * charW` : une largeur MOYENNE de page, fausse dès que
     * deux polices cohabitent. Deux symptômes, tous deux constatés :
     *  • les accords sont dessinés GLYPHE PAR GLYPHE (fragments contigus de
     *    largeur 6.0 quand la moyenne vaut ~5.5) — la dérive d'arrondi
     *    finissait par insérer un espace DANS l'accord (« Cm a j7 ») ;
     *  • entre deux fragments de paroles, la fin estimée dépassait la fin
     *    réelle, l'écart ressortait négatif, et l'espace réel disparaissait
     *    (« hiveret », « s'arrêtepas », « vitesserattrape »).
     * On suit donc la fin RÉELLE du fragment précédent (x + largeur) : un
     * écart quasi nul recolle (glyphes d'un même mot), un écart d'une
     * espace en vaut une, et un vrai trou se convertit en colonnes pour
     * préserver l'alignement accords/paroles.
     */
    let finPrecedente: number | null = null;
    for (const f of line.frags) {
      const col = Math.max(0, Math.round((f.x - minX) / charW));
      const ecart = finPrecedente === null ? 0 : f.x - finPrecedente;
      if (finPrecedente === null) {
        // Retrait de début de ligne : c'est lui qui place un accord isolé
        // au-dessus de sa syllabe.
        if (col > 0) text += ' '.repeat(col);
      } else if (ecart > charW * 1.5 && col > text.length) {
        text += ' '.repeat(col - text.length);
      } else if (
        ecart > charW * 0.3 &&
        !text.endsWith(' ') &&
        !f.str.startsWith(' ')
      ) {
        text += ' ';
      }
      text += f.str;
      finPrecedente = f.x + (f.w > 0 ? f.w : f.str.length * charW);
    }
    out.push(text.replace(/\s+$/, ''));
  }
  return out.join('\n');
}

/**
 * Extrait le texte d'un PDF PAGE PAR PAGE, lignes reconstruites.
 *
 * La pagination est le meilleur indice qu'un fichier contient plusieurs
 * partitions : dans un recueil, la règle est « une chanson par page ».
 * Cette information existait déjà ici et était détruite juste avant de
 * servir — les pages étaient recollées en un seul texte. Un recueil de
 * quarante chansons devenait donc un morceau de mille lignes.
 *
 * Les pages vides (illustrations, séparateurs) sont écartées.
 */
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  let pdfjs: any;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new Error(
      "Le lecteur PDF n'a pas pu être chargé (connexion requise la première fois).",
    );
  }
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const frags: PdfFragment[] = [];
      for (const item of tc.items as any[]) {
        if (typeof item?.str !== 'string') continue;
        frags.push({
          str: item.str,
          x: item.transform?.[4] ?? 0,
          y: item.transform?.[5] ?? 0,
          w: typeof item.width === 'number' ? item.width : 0,
        });
      }
      pages.push(fragmentsToText(frags));
    }
  } finally {
    void doc.destroy?.();
  }
  const utiles = pages
    .map((p) => repairPdfText(p))
    .filter((p) => p.trim() !== '');
  if (utiles.length === 0) {
    throw new Error(
      'Ce PDF ne contient pas de texte lisible — il s’agit sans doute d’un ' +
        'scan (image). Piste : ouvre-le et copie le texte s’il est ' +
        'sélectionnable, sinon il faudra le ressaisir.',
    );
  }
  return utiles;
}

/** Le texte du PDF d'un seul tenant (pages recollées). */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  return (await extractPdfPages(bytes)).join('\n\n');
}
