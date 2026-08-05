/**
 * Extraction du texte d'un fichier .docx (Word) sans dépendance externe.
 * Un .docx est une archive ZIP ; le texte est dans word/document.xml.
 */

function readU16(view: DataView, off: number): number {
  return view.getUint16(off, true);
}
function readU32(view: DataView, off: number): number {
  return view.getUint32(off, true);
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Extrait un fichier donné d'une archive ZIP (méthodes stored/deflate). */
async function unzipFile(
  bytes: Uint8Array,
  wantedName: string,
): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const decoder = new TextDecoder();
  while (off + 30 <= bytes.length) {
    const sig = readU32(view, off);
    if (sig !== 0x04034b50) break; // fin des entrées locales
    const flags = readU16(view, off + 6);
    const method = readU16(view, off + 8);
    let csize = readU32(view, off + 18);
    const nameLen = readU16(view, off + 26);
    const extraLen = readU16(view, off + 28);
    const name = decoder.decode(
      bytes.subarray(off + 30, off + 30 + nameLen),
    );
    const dataStart = off + 30 + nameLen + extraLen;

    if ((flags & 0x08) !== 0 && csize === 0) {
      // Taille inconnue (data descriptor) : rare dans les .docx ;
      // on cherche la signature du descripteur pour délimiter les données.
      const sigBytes = [0x50, 0x4b, 0x07, 0x08];
      let scan = dataStart;
      let found = -1;
      while (scan + 4 <= bytes.length) {
        if (
          bytes[scan] === sigBytes[0] &&
          bytes[scan + 1] === sigBytes[1] &&
          bytes[scan + 2] === sigBytes[2] &&
          bytes[scan + 3] === sigBytes[3]
        ) {
          found = scan;
          break;
        }
        scan++;
      }
      if (found === -1) break;
      csize = found - dataStart;
      const data = bytes.subarray(dataStart, dataStart + csize);
      if (name === wantedName) {
        return method === 0 ? data : inflateRaw(data);
      }
      off = found + 16;
      continue;
    }

    const data = bytes.subarray(dataStart, dataStart + csize);
    if (name === wantedName) {
      return method === 0 ? data : inflateRaw(data);
    }
    off = dataStart + csize;
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_a, n: string) =>
      String.fromCodePoint(parseInt(n, 10)),
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_a, n: string) =>
      String.fromCodePoint(parseInt(n, 16)),
    );
}

/** Convertit le XML de Word en texte brut (paragraphes → lignes). */
export function documentXmlToText(xml: string): string {
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '    ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extrait le texte d'un fichier .docx. Lève une erreur si illisible. */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const xmlBytes = await unzipFile(bytes, 'word/document.xml');
  if (!xmlBytes) {
    throw new Error('document.xml introuvable dans le fichier Word');
  }
  const xml = new TextDecoder().decode(xmlBytes);
  return documentXmlToText(xml);
}
