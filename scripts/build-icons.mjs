/**
 * LES ICÔNES DE L'APP, DÉRIVÉES DE L'ICÔNE DE LA CHARTE (b237).
 *
 *   node scripts/build-icons.mjs
 *
 * Source unique : `public/mojosong.png` — le bloc complet de la charte
 * l'emblème mojosong. OBSOLÈTE depuis b303 (icônes rendues depuis le SVG).
 * On n'en dessine JAMAIS une variante à la main : tout ce qui suit est un
 * redimensionnement de ce fichier-là, pour qu'aucune version ne diverge.
 *
 * Ce qui est produit :
 *   · mojosong-128.png       — l'icône dans l'app (barres, pieds de page),
 *                               légère parce que la page du spectateur la
 *                               charge aussi ;
 *   · mojosong-256.png       — les emplois GRANDS (portail de connexion,
 *                               page introuvable) : au-delà de 64 px à
 *                               l'écran, la 128 se voit pixelisée sur un
 *                               écran à haute densité ;
 *   · icon-192 / icon-512     — manifeste PWA, fond nuit opaque ;
 *   · icon-maskable-512       — même chose, mais l'illustration réduite à
 *                               80 % au centre : Android recadre les icônes
 *                               « maskable » et mangerait le bord de l'emblème ;
 *   · apple-touch-icon (180)  — iOS arrondit lui-même, donc fond opaque.
 *
 * Aucune dépendance : décodage et encodage PNG à la main (zlib suffit).
 * La source n'utilise que le filtre 0, ce qui rend le décodeur trivial —
 * si un jour elle changeait, ce script le dirait au lieu de deviner.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { crc32 } from 'node:zlib';

const NUIT = [0x0a, 0x0f, 0x1d];

function lirePng(chemin) {
  const buf = readFileSync(chemin);
  let i = 8;
  let largeur = 0;
  let hauteur = 0;
  let profondeur = 0;
  let type = 0;
  const morceaux = [];
  while (i < buf.length) {
    const taille = buf.readUInt32BE(i);
    const nom = buf.toString('ascii', i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + taille);
    if (nom === 'IHDR') {
      largeur = data.readUInt32BE(0);
      hauteur = data.readUInt32BE(4);
      profondeur = data[8];
      type = data[9];
    } else if (nom === 'IDAT') morceaux.push(data);
    i += taille + 12;
  }
  if (profondeur !== 8 || (type !== 2 && type !== 6)) {
    throw new Error(`PNG non géré (profondeur ${profondeur}, type ${type})`);
  }
  const canaux = type === 6 ? 4 : 3;
  const brut = inflateSync(Buffer.concat(morceaux));
  const px = new Uint8Array(largeur * hauteur * 4);
  const pas = largeur * canaux;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (pas + 1)];
    if (filtre !== 0) throw new Error(`filtre PNG ${filtre} non géré (ligne ${y})`);
    const ligne = brut.subarray(y * (pas + 1) + 1, y * (pas + 1) + 1 + pas);
    for (let x = 0; x < largeur; x++) {
      const s = x * canaux;
      const d = (y * largeur + x) * 4;
      px[d] = ligne[s];
      px[d + 1] = ligne[s + 1];
      px[d + 2] = ligne[s + 2];
      px[d + 3] = canaux === 4 ? ligne[s + 3] : 255;
    }
  }
  return { largeur, hauteur, px };
}

function ecrirePng(chemin, largeur, hauteur, px, avecAlpha) {
  const canaux = avecAlpha ? 4 : 3;
  const lignes = Buffer.alloc(hauteur * (largeur * canaux + 1));
  let o = 0;
  for (let y = 0; y < hauteur; y++) {
    lignes[o++] = 0;
    for (let x = 0; x < largeur; x++) {
      const s = (y * largeur + x) * 4;
      lignes[o++] = px[s];
      lignes[o++] = px[s + 1];
      lignes[o++] = px[s + 2];
      if (avecAlpha) lignes[o++] = px[s + 3];
    }
  }
  const morceau = (nom, data) => {
    const t = Buffer.from(nom, 'ascii');
    const taille = Buffer.alloc(4);
    taille.writeUInt32BE(data.length);
    const somme = Buffer.alloc(4);
    somme.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([taille, t, data, somme]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;
  ihdr[9] = avecAlpha ? 6 : 2;
  writeFileSync(
    chemin,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      morceau('IHDR', ihdr),
      morceau('IDAT', deflateSync(lignes, { level: 9 })),
      morceau('IEND', Buffer.alloc(0)),
    ]),
  );
}

/**
 * Réduction par moyenne de boîte : la source fait 512 px et toutes les
 * tailles voulues la divisent presque exactement, donc une moyenne suffit —
 * et elle ne crée aucun halo, contrairement à un rééchantillonnage naïf.
 * `part` < 1 laisse une marge autour (zone de sécurité des icônes
 * « maskable »), remplie du fond nuit.
 */
function reduire(src, taille, { opaque = false, part = 1 } = {}) {
  const out = new Uint8Array(taille * taille * 4);
  const dessin = Math.round(taille * part);
  const marge = Math.floor((taille - dessin) / 2);
  for (let i = 0; i < taille * taille; i++) {
    out[i * 4] = NUIT[0];
    out[i * 4 + 1] = NUIT[1];
    out[i * 4 + 2] = NUIT[2];
    out[i * 4 + 3] = opaque ? 255 : 0;
  }
  const ech = src.largeur / dessin;
  for (let y = 0; y < dessin; y++) {
    for (let x = 0; x < dessin; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const x0 = Math.floor(x * ech);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * ech));
      const y0 = Math.floor(y * ech);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * ech));
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const s = (sy * src.largeur + sx) * 4;
          const al = src.px[s + 3] / 255;
          r += src.px[s] * al;
          g += src.px[s + 1] * al;
          b += src.px[s + 2] * al;
          a += src.px[s + 3];
          n++;
        }
      }
      const al = a / n / 255;
      const d = ((y + marge) * taille + (x + marge)) * 4;
      // Composition sur le fond nuit : l'icône ne se pose jamais sur autre
      // chose (charte §1), donc le faire ici plutôt que de laisser un bord
      // translucide se mélanger à n'importe quoi.
      out[d] = Math.round(r / n + NUIT[0] * (1 - al));
      out[d + 1] = Math.round(g / n + NUIT[1] * (1 - al));
      out[d + 2] = Math.round(b / n + NUIT[2] * (1 - al));
      out[d + 3] = opaque ? 255 : Math.round(al * 255);
    }
  }
  return out;
}

const src = lirePng('public/mojosong.png');
if (src.largeur !== src.hauteur) throw new Error('la source doit être carrée');

const sorties = [
  ['public/mojosong-128.png', 128, { opaque: false, part: 1 }],
  ['public/mojosong-256.png', 256, { opaque: false, part: 1 }],
  ['public/apple-touch-icon.png', 180, { opaque: true, part: 1 }],
  ['public/icon-192.png', 192, { opaque: true, part: 1 }],
  ['public/icon-512.png', 512, { opaque: true, part: 1 }],
  ['public/icon-maskable-512.png', 512, { opaque: true, part: 0.8 }],
];
for (const [chemin, taille, opts] of sorties) {
  ecrirePng(chemin, taille, taille, reduire(src, taille, opts), !opts.opaque);
  console.log(`build-icons : ${chemin} (${taille}px)`);
}
