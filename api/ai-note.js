/**
 * Fonction serveur Vercel : synthèse d'une note de répétition par IA.
 * Reçoit la transcription d'une note vocale (ou un texte brouillon) et
 * renvoie une note courte et actionnable.
 * Nécessite ANTHROPIC_API_KEY (comme api/ai-clean.js).
 */

const MAX_INPUT = 8_000;

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Méthode non autorisée' });
      return;
    }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      res.status(501).json({
        error:
          "La synthèse IA n'est pas configurée (variable ANTHROPIC_API_KEY manquante dans Vercel).",
      });
      return;
    }
    const text = req.body?.text;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      res.status(400).json({ error: 'Texte manquant' });
      return;
    }
    const song = typeof req.body?.song === 'string' ? req.body.song : '';
    const parts = Array.isArray(req.body?.parts)
      ? req.body.parts.filter((p) => typeof p === 'string').slice(0, 30)
      : [];

    const prompt =
      "Voici la transcription d'une note vocale prise pendant une répétition de groupe" +
      (song ? ` pour le morceau « ${song} »` : '') +
      '.\n' +
      (parts.length > 0
        ? `Les parties du morceau sont : ${parts.join(', ')}.\n`
        : '') +
      'Reformule-la en une note de répétition courte, claire et actionnable ' +
      '(1 à 2 phrases maximum, style télégraphique accepté), en français. ' +
      "Si la note vise clairement une partie du morceau listée ci-dessus, commence ta réponse par ce libellé suivi de « : » (ex. « Refrain : … »). " +
      'Réponds UNIQUEMENT avec la note, sans commentaire.\n\n' +
      '--- TRANSCRIPTION ---\n' +
      text.slice(0, MAX_INPUT);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!apiRes.ok) {
      res.status(502).json({ error: `L'API IA a répondu ${apiRes.status}` });
      return;
    }
    const body = await apiRes.json();
    const out = Array.isArray(body.content)
      ? body.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
      : '';
    if (out.trim() === '') {
      res.status(502).json({ error: "L'IA n'a rien renvoyé" });
      return;
    }
    res.status(200).json({ text: out.trim() });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
