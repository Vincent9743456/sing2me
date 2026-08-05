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
