/**
 * Réduit une photo en data-URL compacte (partage + stockage local).
 */
export async function resizePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image illisible'));
      img.src = url;
    });
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponible');
    const min = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - min) / 2,
      (img.height - min) / 2,
      min,
      min,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * VIGNETTE D'UNE PHOTO DÉJÀ STOCKÉE (b232).
 *
 * Les photos de l'app vivent en data-URL de 192 px (`resizePhoto`) : bon pour
 * l'écran, trop lourd pour être RECOPIÉ dans la fiche publique, qui part au
 * serveur en un seul objet JSON. Une photo de groupe et cinq de musiciens
 * feraient à elles seules plus de 70 Ko, à chaque publication de profil et à
 * chaque GO LIVE.
 *
 * On en refait donc une vignette à la taille où elle sera VRAIMENT affichée.
 * Jamais bloquant (règle du lot) : si le navigateur ne sait pas la relire, on
 * rend une chaîne vide et la fiche part sans cette photo — jamais une
 * data-URL tronquée, qui afficherait une image cassée.
 */
export async function miniature(dataUrl: string, taille: number): Promise<string> {
  if (dataUrl === '' || !dataUrl.startsWith('data:image')) return '';
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image illisible'));
      img.src = dataUrl;
    });
    if (img.width === 0 || img.height === 0) return '';
    const canvas = document.createElement('canvas');
    canvas.width = taille;
    canvas.height = taille;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const min = Math.min(img.width, img.height);
    ctx.drawImage(
      img,
      (img.width - min) / 2,
      (img.height - min) / 2,
      min,
      min,
      0,
      0,
      taille,
      taille,
    );
    const out = canvas.toDataURL('image/jpeg', 0.7);
    // Une vignette plus lourde que l'original n'a aucun intérêt.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return '';
  }
}
