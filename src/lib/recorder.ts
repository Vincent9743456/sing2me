/**
 * Enregistreur audio (b157) — le chemin de dictée qui marche PARTOUT.
 *
 * La reconnaissance vocale du navigateur (Web Speech) est gratuite et
 * instantanée, mais Apple la bride dans une app installée sur l'écran
 * d'accueil : le micro s'ouvre et rien ne revient. Ici on ne demande au
 * navigateur que ce qu'il sait faire partout — ENREGISTRER — et c'est le
 * serveur qui transcrit.
 *
 * L'audio n'est jamais conservé : il part pour être transcrit, le texte
 * revient, l'enregistrement est jeté.
 */

/** Formats acceptés, du meilleur au plus compatible (Safari = mp4). */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg;codecs=opus',
];

export function recordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      // isTypeSupported absent (vieux Safari) : on laisse le navigateur choisir
    }
  }
  return '';
}

export interface Recording {
  blob: Blob;
  mime: string;
  seconds: number;
}

export interface Recorder {
  /** Coupe le micro et rend l'enregistrement (null si rien d'exploitable). */
  stop: () => Promise<Recording | null>;
  /** Coupe le micro et jette tout (fermeture, annulation). */
  cancel: () => void;
}

/**
 * Démarre un enregistrement. Rend le contrôleur une fois que le micro
 * écoute VRAIMENT (autorisation accordée) — donc l'interface ne peut pas
 * afficher « enregistrement » alors que rien n'est capté.
 *
 * `maxSeconds` borne la durée : au-delà, l'enregistrement se termine tout
 * seul (protège la taille d'envoi et la facture de transcription).
 */
export async function startRecording(
  onAutoStop?: () => void,
  maxSeconds = 180,
): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mime !== '' ? { mimeType: mime } : undefined);
  } catch {
    // Format refusé : on retente en laissant le navigateur décider.
    rec = new MediaRecorder(stream);
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const startedAt = Date.now();
  let stopped = false;
  const closeMic = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  const ended = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start();

  const limit = window.setTimeout(() => {
    if (!stopped && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        // déjà arrêté
      }
      onAutoStop?.();
    }
  }, maxSeconds * 1000);

  return {
    stop: async () => {
      if (stopped) return null;
      stopped = true;
      window.clearTimeout(limit);
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        // déjà arrêté : les morceaux déjà reçus suffisent
      }
      await ended;
      closeMic();
      if (chunks.length === 0) return null;
      const type = chunks[0].type || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (blob.size < 1200) return null; // quasi silence : rien à transcrire
      return {
        blob,
        mime: type,
        seconds: Math.round((Date.now() - startedAt) / 1000),
      };
    },
    cancel: () => {
      stopped = true;
      window.clearTimeout(limit);
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        // rien à faire
      }
      closeMic();
    },
  };
}

/** Encode l'audio pour l'envoi JSON (base64, sans en-tête data:). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture audio impossible'));
    reader.onload = () => {
      const out = String(reader.result ?? '');
      resolve(out.slice(out.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}
