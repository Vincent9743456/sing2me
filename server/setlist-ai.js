/**
 * Fonction serveur Vercel : propose une setlist à partir de la bibliothèque
 * du musicien et du type de soirée, via l'IA (Claude).
 *
 * Optionnelle : nécessite ANTHROPIC_API_KEY dans les réglages Vercel.
 * Sans clé, l'encart « IA » de l'application reste masqué / renvoie une
 * erreur claire.
 *
 * Entrée (POST JSON) :
 *   { library: [{ title, artist, tags, seconds, key }], partyType, minutes }
 * Sortie :
 *   { name, comment, order: number[] }  (order = indices dans `library`)
 */

const MAX_SONGS = 400;

function clampInt(n, lo, hi, dflt) {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : dflt;
  return Math.max(lo, Math.min(hi, v));
}

/** Extrait un objet JSON d'une réponse (tolère les ```json … ``` autour). */
function parseJsonLoose(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

import { meterClaude } from './meter.js';

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
          "La génération IA n'est pas configurée. Ajoute la variable " +
          'ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables) ' +
          'puis redéploie.',
      });
      return;
    }
    const library = Array.isArray(req.body?.library)
      ? req.body.library.slice(0, MAX_SONGS)
      : [];
    if (library.length === 0) {
      res.status(400).json({ error: 'Bibliothèque vide' });
      return;
    }
    const partyType =
      typeof req.body?.partyType === 'string'
        ? req.body.partyType.slice(0, 120).trim()
        : '';
    const minutes = clampInt(req.body?.minutes, 5, 300, 60);

    const catalog = library
      .map((s, i) => {
        const mn = Math.round((Number(s.seconds) || 300) / 60);
        const tags =
          Array.isArray(s.tags) && s.tags.length > 0
            ? ` [${s.tags.slice(0, 6).join(', ')}]`
            : '';
        const artist = s.artist ? ` — ${s.artist}` : '';
        const k = s.key ? ` (${s.key})` : '';
        return `${i}) ${s.title ?? '?'}${artist}${tags} · ~${mn} min${k}`;
      })
      .join('\n');

    const prompt =
      'Tu es un musicien expérimenté qui prépare la setlist d\'une soirée.\n' +
      'Choisis et ORDONNE des morceaux UNIQUEMENT parmi la bibliothèque ' +
      'numérotée ci-dessous (n\'invente aucun titre, ne réutilise pas deux ' +
      'fois le même numéro).\n' +
      `Ambiance / type de soirée : ${partyType !== '' ? partyType : 'non précisé'}.\n` +
      `Durée cible : environ ${minutes} minutes (additionne les durées ~min pour t'en approcher).\n` +
      'Principes : ouvrir avec un morceau accrocheur, alterner rythmes et ' +
      'tonalités, regrouper ce qui va ensemble, garder les temps forts pour ' +
      'la fin, coller à l\'ambiance demandée.\n' +
      'Réponds STRICTEMENT en JSON, sans texte autour, au format :\n' +
      '{"name": "titre court (2-4 mots)", "comment": "intention TRÈS courte, 6 mots max", "order": [indices dans l\'ordre de jeu]}\n\n' +
      '--- BIBLIOTHÈQUE ---\n' +
      catalog;

    // Modèle nommé une seule fois : sert à l'appel ET à la mesure (b160).
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!apiRes.ok) {
      const detail = await apiRes.text();
      res.status(502).json({
        error: `L'API IA a répondu ${apiRes.status}`,
        detail: detail.slice(0, 300),
      });
      return;
    }
    const body = await apiRes.json();
    // Mesure de l'appel (b160) : best-effort, jamais bloquant.
    void meterClaude('setlist', model, body?.usage);
    const out = Array.isArray(body.content)
      ? body.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
      : '';
    const parsed = parseJsonLoose(out);
    if (!parsed || !Array.isArray(parsed.order)) {
      res.status(502).json({ error: "L'IA n'a pas renvoyé de setlist exploitable" });
      return;
    }
    // Nettoyage : indices valides, uniques, dans l'ordre proposé.
    const seen = new Set();
    const order = parsed.order
      .map((n) => (typeof n === 'number' ? n : parseInt(n, 10)))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < library.length)
      .filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
    if (order.length === 0) {
      res.status(502).json({ error: 'Aucun morceau retenu par l\'IA' });
      return;
    }
    res.status(200).json({
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 80) : '',
      comment:
        typeof parsed.comment === 'string' ? parsed.comment.slice(0, 80) : '',
      order,
    });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
