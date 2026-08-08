/**
 * Fonction serveur Vercel : synthèse d'une note de répétition par IA.
 * Reçoit la transcription d'une note vocale (ou un texte brouillon) et
 * renvoie une note courte et actionnable.
 * Nécessite ANTHROPIC_API_KEY (comme api/ai-clean.js).
 */

const MAX_INPUT = 8_000;

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
    // Note VIVANTE (b154) : la note actuelle du morceau, à mettre à jour
    // avec le nouveau commentaire (remplacer ce qui est contredit,
    // conserver et compléter le reste).
    const previous =
      typeof req.body?.previous === 'string' ? req.body.previous.trim() : '';
    // Portée détectée par l'IA (b155) : quand `detect` est demandé, la
    // même passe choisit si le commentaire vise le GROUPE (visible de
    // tous — y compris quand il s'adresse à UN musicien nommé, qui doit
    // pouvoir le lire) ou seulement le musicien qui parle (note perso),
    // puis met à jour la note vivante de la portée choisie.
    const detect = req.body?.detect === true;
    const previousGroup =
      typeof req.body?.previousGroup === 'string'
        ? req.body.previousGroup.trim()
        : '';
    const previousPerso =
      typeof req.body?.previousPerso === 'string'
        ? req.body.previousPerso.trim()
        : '';
    const author =
      typeof req.body?.author === 'string' ? req.body.author.trim() : '';
    const musicians = Array.isArray(req.body?.musicians)
      ? req.body.musicians
          .filter((m) => typeof m === 'string' && m.trim() !== '')
          .slice(0, 20)
      : [];

    const UPDATE_RULES =
      'Règles de mise à jour : si le nouveau commentaire CONTREDIT un point ' +
      'existant (autre décision sur le même sujet), REMPLACE ce point par la ' +
      'nouvelle décision ; sinon AJOUTE le nouveau point ; conserve tels quels ' +
      'les points non concernés. Note concise et actionnable, en français, ' +
      'une ligne par point, chaque ligne commençant par « – ».';

    const prompt = detect
      ? "Tu aides un groupe de musique à tenir les notes de répétition d'un morceau" +
        (song ? ` (« ${song} »)` : '') +
        '.\n' +
        `Le musicien qui parle : « ${author || 'inconnu'} ».` +
        (musicians.length > 0
          ? ` Les musiciens du groupe : ${musicians.join(', ')}.`
          : '') +
        '\n\n1. Décide de la PORTÉE du nouveau commentaire :\n' +
        '- "perso" UNIQUEMENT s\'il ne concerne que le musicien qui parle, lui-même ' +
        '(son propre travail, un rappel pour lui : « je dois… », « il faut que je révise… ») ;\n' +
        '- "groupe" dans tous les autres cas : décisions d\'arrangement, consignes ' +
        "collectives, et aussi les remarques qui visent UN AUTRE musicien nommé " +
        '(il doit pouvoir les lire) — commence alors ce point par son nom (« Marco : … »).\n' +
        '\n2. Mets à jour la note VIVANTE de la portée choisie.\n' +
        UPDATE_RULES +
        '\n\n--- NOTE DE GROUPE ACTUELLE ---\n' +
        (previousGroup.slice(0, MAX_INPUT) || '(vide)') +
        `\n\n--- NOTE PERSONNELLE ACTUELLE DE ${author || 'ce musicien'} ---\n` +
        (previousPerso.slice(0, MAX_INPUT) || '(vide)') +
        '\n\n--- NOUVEAU COMMENTAIRE ---\n' +
        text.slice(0, MAX_INPUT) +
        '\n\nRéponds UNIQUEMENT avec un JSON strict, sans texte autour : ' +
        '{"portee":"groupe" ou "perso","note":"la note mise à jour de la portée choisie"}'
      : previous !== ''
        ? "Voici la note de répétition ACTUELLE d'un morceau" +
          (song ? ` (« ${song} »)` : '') +
          ", puis la transcription d'un NOUVEAU commentaire pris en répétition.\n" +
          'Mets la note à jour :\n' +
          '- si le nouveau commentaire CONTREDIT un point existant (autre décision sur le même sujet), REMPLACE ce point par la nouvelle décision ;\n' +
          '- sinon, AJOUTE le nouveau point ;\n' +
          '- conserve tels quels les points non concernés.\n' +
          'Réponds UNIQUEMENT avec la note à jour, en français, concise et actionnable : ' +
          'une ligne par point, chaque ligne commençant par « – ». Sans commentaire.\n\n' +
          '--- NOTE ACTUELLE ---\n' +
          previous.slice(0, MAX_INPUT) +
          '\n\n--- NOUVEAU COMMENTAIRE ---\n' +
          text.slice(0, MAX_INPUT)
        : "Voici la transcription d'une note vocale prise pendant une répétition de groupe" +
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
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!apiRes.ok) {
      res.status(502).json({ error: `L'API IA a répondu ${apiRes.status}` });
      return;
    }
    const body = await apiRes.json();
    // Mesure de l'appel (b160) : best-effort, jamais bloquant.
    void meterClaude('note', model, body?.usage);
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
    if (detect) {
      // Réponse attendue en JSON strict {"portee","note"} — avec repli
      // texte brut si le modèle a répondu autrement.
      try {
        const clean = out
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '');
        const parsed = JSON.parse(clean);
        const portee = parsed?.portee === 'perso' ? 'perso' : 'groupe';
        const note = typeof parsed?.note === 'string' ? parsed.note.trim() : '';
        if (note !== '') {
          res.status(200).json({ text: note, scope: portee });
          return;
        }
      } catch {
        // repli texte brut ci-dessous
      }
      res.status(200).json({ text: out.trim(), scope: '' });
      return;
    }
    res.status(200).json({ text: out.trim() });
  } catch {
    res.status(500).json({ error: 'Erreur inattendue côté serveur' });
  }
}
