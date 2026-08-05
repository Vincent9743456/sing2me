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
    for (const f of line.frags) {
      const col = Math.max(0, Math.round((f.x - minX) / charW));
      if (col > text.length) {
        text += ' '.repeat(col - text.length);
      } else if (text !== '' && !text.endsWith(' ') && !f.str.startsWith(' ')) {
        // fragments contigus recollés : garder une séparation minimale
        // seulement s'ils ne se touchaient pas déjà
        const gap = f.x - (line.frags[0].x + text.length * charW);
        if (gap > charW * 0.6) text += ' ';
      }
      text += f.str;
    }
    out.push(text.replace(/\s+$/, ''));
  }
  return out.join('\n');
}

/** Extrait le texte d'un PDF (toutes pages), lignes reconstruites. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
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
  const text = repairPdfText(
    pages.filter((p) => p.trim() !== '').join('\n\n'),
  );
  if (text.trim() === '') {
    throw new Error(
      'Ce PDF ne contient pas de texte lisible — il s’agit sans doute d’un ' +
        'scan (image). Piste : ouvre-le et copie le texte s’il est ' +
        'sélectionnable, sinon il faudra le ressaisir.',
    );
  }
  return text;
}
