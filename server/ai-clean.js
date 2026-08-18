/**
 * Fonction serveur Vercel : nettoyage d'une partition par IA (Claude).
 *
 * Optionnelle : nécessite la variable d'environnement ANTHROPIC_API_KEY
 * dans les réglages Vercel (Settings → Environment Variables), avec une
 * clé créée sur https://console.anthropic.com.
 * Sans clé, l'application fonctionne normalement avec le nettoyage
 * heuristique intégré.
 */

const MAX_INPUT = 40_000;

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
          "Le nettoyage IA n'est pas configuré. Ajoute la variable " +
          'ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables) ' +
          'puis redéploie.',
      });
      return;
    }
    const text = req.body?.text;
    if (!text || typeof text !== 'string' || text.trim() === '') {
      res.status(400).json({ error: 'Texte manquant' });
      return;
    }
    const input = text.slice(0, MAX_INPUT);
    const hint =
      typeof req.body?.hint === 'string' ? req.body.hint.slice(0, 200) : '';

    const prompt =
      'Tu es un assistant qui nettoie des partitions de chansons pour un songbook.\n' +
      'Convertis la partition ci-dessous EXACTEMENT dans ce format :\n' +
      '- En tête, si connues : "Title: …", "Artist: …", "Key: …", "Capo: …" (une par ligne)\n' +
      '- Les en-têtes de sections sur leur propre ligne : [Intro], [Couplet 1], [Refrain], [Pont], [Solo], [Outro]…\n' +
      '- Les marqueurs de sections du document peuvent prendre des formes variées — « (couplet 1) », « Refrain: », « [Verse 2] », « CHORUS », ligne isolée… — convertis-les TOUS au format [Section].\n' +
      "- S'il n'y a AUCUN marqueur, identifie les sections toi-même : les blocs qui se répètent sont des refrains, les blocs à paroles uniques des couplets ; repère intro, pont et final. Si l'indice titre/artiste te permet de reconnaître la chanson, appuie-toi sur ta connaissance de sa structure — sans JAMAIS modifier ni compléter les paroles du document.\n" +
      '- Les accords placés ENTRE CROCHETS directement dans les paroles, juste avant la syllabe où ils tombent, ex. : "[Am]Sous le ciel de [F]Port-Louis"\n' +
      '- Une ligne d\'accords sans paroles s\'écrit : "[Am] [F] [C] [G]"\n' +
      '- Un accord se place TOUJOURS au DÉBUT d\'un mot ou d\'une syllabe chantée, JAMAIS au milieu d\'un mot : écris "[C]comment faire", pas "commen[C]t faire". Si le document a COUPÉ un mot autour d\'un accord (ex. "com [C] ment"), RESSOUDE le mot et pose l\'accord devant.\n' +
      '- SUPPRIME le bruit qui n\'est pas la chanson : notes de celui qui a fait la tab, difficulté, accordage, rythmique ("strumming"), liens/URL, mentions de site, numéros de page, et les répétitions du titre ou de l\'artiste dans le corps. Le titre et l\'artiste ne vivent QUE dans les lignes "Title:" / "Artist:" d\'en-tête. Un "Capo 2" trouvé dans ce bruit devient la ligne "Capo: 2".\n' +
      '- Repère TOUS les accords, même écrits sans crochets ou collés aux paroles (Am7, F#m, Bb, C/G, Dsus4, notations européennes La, Sim…) : ils finissent tous entre crochets, rien d\'autre n\'y finit.\n' +
      '- Un PDF mal extrait peut COLLER deux mots ("hiveret" pour "hiver et", "s\'arrêtepas") ou couper un accord ("Cma j7") ou coller deux accords ("CCmaj7" pour "C Cmaj7") : rétablis les espaces d\'après le sens, sans changer aucun mot.\n' +
      '- AÈRE la partition : une ligne vide entre chaque section (couplet, refrain, pont…), jamais deux sections collées.\n' +
      '- Si le document est une tablature (lignes e|--3--…), résume chaque partie par sa suite d\'accords quand elle est identifiable, et garde les paroles si présentes.\n' +
      'Règles STRICTES : ne modifie JAMAIS les paroles (orthographe, ordre, langue), n\'invente pas de paroles, conserve tous les couplets. ' +
      'Corrige uniquement le placement/format des accords et la mise en page.\n' +
      'CAS PARTICULIER — texte brouillé : certains PDF ont une police cassée qui ' +
      'remplace chaque caractère par un autre, de façon COHÉRENTE dans tout le ' +
      'document (ex. « YZ[X\\]^_`[ » pour « Les matins »). Si le texte ci-dessous ' +
      'ressemble à cela (symboles ^_`{}| omniprésents, voyelles rares), commence ' +
      'par le DÉCHIFFRER : établis la table de substitution (même symbole = même ' +
      'lettre partout, langue probablement française ou anglaise, l\'espace est ' +
      'souvent le caractère le plus fréquent), déchiffre TOUT le texte, puis ' +
      'applique le format demandé. Déduis les paroles du déchiffrement, pas de ' +
      'ta mémoire de la chanson.\n' +
      (hint !== '' ? 'Indice sur le morceau : ' + hint + '\n' : '') +
      'Réponds UNIQUEMENT avec la partition nettoyée, sans commentaire.\n\n' +
      '--- PARTITION À NETTOYER ---\n' +
      input;

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
        max_tokens: 8000,
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
    // Mesure de l'appel (b160). ATTENDUE (b161) : sur Vercel l'instance
    // est gelée dès la réponse envoyée — une mesure « en vol » mourait
    // avec elle. Elle abandonne seule au bout de 2 s.
    await meterClaude('clean', model, body?.usage);
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
