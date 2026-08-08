/**
 * Fonction serveur Vercel : TRANSCRIPTION d'une note vocale (b157).
 *
 * Pourquoi : la reconnaissance vocale du navigateur est bridée par Apple
 * dans une app installée sur l'écran d'accueil (le micro s'ouvre, rien ne
 * revient). Ici le téléphone se contente d'ENREGISTRER — ce que tous les
 * navigateurs savent faire — et la transcription se fait ici.
 *
 * Claude ne transcrit pas l'audio : il faut un service dédié. On parle le
 * dialecte « OpenAI transcription » (multipart), compatible avec OpenAI
 * lui-même et avec plusieurs services équivalents (Groq, DeepInfra…), ce
 * qui permet d'en changer sans toucher au code :
 *   TRANSCRIBE_API_KEY  (obligatoire)
 *   TRANSCRIBE_URL      (défaut : https://api.openai.com/v1/audio/transcriptions)
 *   TRANSCRIBE_MODEL    (défaut : whisper-1)
 *
 * L'audio n'est JAMAIS conservé : reçu, transmis pour transcription,
 * jeté. Seul le texte revient au téléphone.
 */

/**
 * Garde-fou de taille (b159, demande Vincent : « pas des heures »).
 * Le téléphone borne déjà la prise à 90 s enregistrées à bas débit
 * (~400 Ko). On accepte largement au-dessus pour ne pas rejeter un
 * format bavard (mp4 d'iPhone), mais on refuse tout ce qui ressemble à
 * un micro laissé ouvert : facture de transcription et temps d'attente.
 */
const MAX_BASE64 = 2_800_000; // ≈ 2 Mo d'audio réel

import { costOfAudio, meter } from './meter.js';

const EXT = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-m4a': 'm4a',
};

function extensionFor(mime) {
  const base = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  return EXT[base] ?? 'webm';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    const key = process.env.TRANSCRIBE_API_KEY;
    if (!key) {
      res.status(501).json({
        error:
          "La dictée par le serveur n'est pas configurée (variable TRANSCRIBE_API_KEY manquante dans Vercel).",
      });
      return;
    }
    const audio = req.body?.audio;
    if (typeof audio !== 'string' || audio.trim() === '') {
      res.status(400).json({ error: 'Audio manquant' });
      return;
    }
    if (audio.length > MAX_BASE64) {
      res.status(413).json({
        error:
          'Enregistrement trop long — une note dictée fait moins de 90 secondes. Coupe-la en plusieurs notes.',
      });
      return;
    }
    const mime = typeof req.body?.mime === 'string' ? req.body.mime : 'audio/webm';
    // La langue attendue aide beaucoup la reconnaissance des noms et du
    // vocabulaire musical ; 'fr' par défaut (le téléphone la transmet).
    const lang = /^[a-z]{2}$/.test(String(req.body?.lang ?? ''))
      ? String(req.body.lang)
      : 'fr';

    let bytes;
    try {
      bytes = Buffer.from(audio, 'base64');
    } catch {
      res.status(400).json({ error: 'Audio illisible' });
      return;
    }
    if (bytes.length < 1000) {
      res.status(400).json({ error: "L'enregistrement est vide." });
      return;
    }

    const url =
      process.env.TRANSCRIBE_URL ||
      'https://api.openai.com/v1/audio/transcriptions';
    const model = process.env.TRANSCRIBE_MODEL || 'whisper-1';

    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: mime }),
      `note.${extensionFor(mime)}`,
    );
    form.append('model', model);
    form.append('language', lang);
    form.append('response_format', 'json');
    // Amorce de vocabulaire : oriente la transcription vers le jargon des
    // répétitions plutôt que vers des mots proches hors contexte.
    form.append(
      'prompt',
      lang === 'fr'
        ? 'Note de répétition de groupe de musique : intro, couplet, refrain, pont, break, tonalité, capo, basse, batterie, guitare, clavier, chant.'
        : 'Band rehearsal note: intro, verse, chorus, bridge, break, key, capo, bass, drums, guitar, keys, vocals.',
    );

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => '');
      res.status(502).json({
        error: `Le service de transcription a répondu ${apiRes.status}`,
        detail: detail.slice(0, 300),
      });
      return;
    }
    const body = await apiRes.json().catch(() => null);
    // Mesure de l'appel (b160), ATTENDUE (b161 : sinon elle meurt avec
    // l'instance gelée). La durée exacte n'est pas renvoyée par le
    // service : on l'estime à partir du poids, au débit d'enregistrement
    // du téléphone (32 kbit/s), et on borne à la limite d'une note.
    const seconds = Math.min(90, Math.round((bytes.length * 8) / 32000));
    await meter({
      fn: 'transcribe',
      provider: 'openai',
      model,
      seconds,
      cost: costOfAudio(model, seconds),
    });
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text === '') {
      res.status(200).json({ text: '', empty: true });
      return;
    }
    res.status(200).json({ text });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
