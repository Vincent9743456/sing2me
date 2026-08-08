/**
 * Encodage des liens de partage : le contenu (chanson, setlist, profil)
 * est compressé puis encodé directement dans l'URL.
 * → Le destinataire n'a besoin d'aucun compte ni d'aucune application :
 *   la page publique se reconstruit entièrement depuis le lien.
 * (Avec Supabase, ces liens deviendront de courts identifiants.)
 */
import { liveHeaders } from './liveAuth';
import { SharePayload } from '../types';

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = JSON.stringify(payload);
  const utf8 = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([utf8 as BlobPart]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return 'z' + bytesToBase64Url(new Uint8Array(buf));
  }
  return 'p' + bytesToBase64Url(utf8);
}

export async function decodeShare(encoded: string): Promise<SharePayload> {
  const kind = encoded[0];
  const body = encoded.slice(1);
  const bytes = base64UrlToBytes(body);
  let utf8: Uint8Array;
  if (kind === 'z') {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    utf8 = new Uint8Array(buf);
  } else if (kind === 'p') {
    utf8 = bytes;
  } else {
    throw new Error('Lien de partage invalide');
  }
  const payload = JSON.parse(new TextDecoder().decode(utf8)) as SharePayload;
  if (payload.v !== 1) throw new Error('Version de lien non reconnue');
  return payload;
}

/** URL complète de partage à copier / transformer en QR code. */
export function shareUrl(encoded: string): string {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/s/${encoded}`;
}

/**
 * Lien court : le contenu est stocké côté serveur (table shares) et le
 * lien/QR devient minuscule. Best-effort : null si hors ligne, clé On Air
 * absente ou serveur non configuré → on retombe sur le lien long autonome.
 */
export async function createShortLink(
  liveKey: string,
  payload: SharePayload,
): Promise<string | null> {
  if (liveKey.trim() === '') return null;
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...liveHeaders(liveKey),
      },
      body: JSON.stringify({ payload }),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('application/json')) return null;
    const body = (await res.json()) as { id?: string };
    if (!res.ok || !body.id) return null;
    return `${location.origin}${location.pathname}#/p/${body.id}`;
  } catch {
    return null;
  }
}

/** Récupère le contenu d'un lien court. */
export async function fetchSharedPayload(id: string): Promise<SharePayload> {
  const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
  const body = (await res.json()) as { payload?: SharePayload; error?: string };
  if (!res.ok || body.error || !body.payload) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  if (body.payload.v !== 1) throw new Error('Version de lien non reconnue');
  return body.payload;
}
