/**
 * Mesure des appels IA (b160) — la base du tableau de bord fondateur.
 *
 * Pourquoi mesurer nous-mêmes : ni Anthropic ni OpenAI n'exposent le
 * SOLDE restant par API (seulement la dépense passée, et via des clés
 * « Admin » distinctes). En comptant chaque appel là où il part, on sait
 * exactement ce que coûte chaque fonctionnalité, et le solde restant se
 * reconstitue avec les rechargements saisis à la main.
 *
 * Règle : la mesure ne doit JAMAIS faire échouer ni ralentir une
 * fonctionnalité. Tout est best-effort, en silence.
 *
 * Aucune donnée personnelle ni musicale n'est enregistrée : ni texte, ni
 * audio, ni identifiant d'utilisateur. Seulement quelle fonction, quel
 * modèle, quel volume, quel coût.
 */

/**
 * Tarifs publics au 8 août 2026, en dollars.
 * - Claude : par MILLION de jetons (entrée / sortie).
 * - Transcription : par MINUTE d'audio.
 * À ajuster ici si les tarifs changent : c'est le seul endroit.
 */
const PRICES = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-sonnet-4-5': { in: 3.0, out: 15.0 },
  'claude-opus-4-5': { in: 15.0, out: 75.0 },
  'whisper-1': { perMinute: 0.006 },
  'gpt-4o-transcribe': { perMinute: 0.006 },
};

/** Tarif d'un modèle, avec repli prudent si le nom est inconnu. */
function priceOf(model) {
  if (PRICES[model]) return PRICES[model];
  const key = Object.keys(PRICES).find((k) => String(model).startsWith(k));
  if (key) return PRICES[key];
  // Modèle inconnu : on facture au tarif Haiku plutôt que zéro, pour ne
  // pas sous-estimer la dépense affichée au tableau de bord.
  return PRICES['claude-haiku-4-5'];
}

export function costOfTokens(model, tokensIn, tokensOut) {
  const p = priceOf(model);
  if (!p.in) return 0;
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}

export function costOfAudio(model, seconds) {
  const p = priceOf(model);
  const perMinute = p.perMinute ?? 0.006;
  return (seconds / 60) * perMinute;
}

function ready() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
}

/**
 * Enregistre un appel.
 *
 * IMPORTANT (corrigé b161) : il faut l'ATTENDRE. Sur Vercel, l'instance
 * est gelée dès la réponse envoyée — un `void meter(...)` laissait la
 * requête en vol mourir avec elle, et rien n'arrivait dans la table.
 * Pour que la mesure ne puisse jamais ralentir l'utilisateur, elle
 * abandonne d'elle-même au bout de 2 secondes.
 */
export async function meter(entry) {
  if (!ready()) return;
  try {
    const key = process.env.SUPABASE_SERVICE_KEY;
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/ai_usage`, {
      signal: AbortSignal.timeout(2000),
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        fn: String(entry.fn ?? ''),
        provider: String(entry.provider ?? ''),
        model: String(entry.model ?? ''),
        tokens_in: Math.max(0, Math.round(entry.tokensIn ?? 0)),
        tokens_out: Math.max(0, Math.round(entry.tokensOut ?? 0)),
        audio_secs: Math.max(0, Math.round(entry.seconds ?? 0)),
        cost_usd: Number((entry.cost ?? 0).toFixed(6)),
        ok: entry.ok !== false,
      }),
    });
  } catch {
    // mesure best-effort : on n'alerte pas, on ne bloque pas
  }
}

/** Raccourci pour un appel Claude, à partir du bloc `usage` renvoyé. */
export function meterClaude(fn, model, usage, ok = true) {
  const tokensIn = usage?.input_tokens ?? 0;
  const tokensOut = usage?.output_tokens ?? 0;
  return meter({
    fn,
    provider: 'anthropic',
    model,
    tokensIn,
    tokensOut,
    cost: costOfTokens(model, tokensIn, tokensOut),
    ok,
  });
}
