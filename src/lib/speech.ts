/**
 * Dictée vocale via l'API Web Speech du navigateur (fr-FR).
 * Fonctionne dans Chrome, Edge et Safari ; aucun serveur requis.
 *
 * Robustesse (b151, bug iPhone) : sur iOS — surtout en PWA installée —
 * les événements `onstart`/`onend` sont capricieux : `onend` peut ne
 * JAMAIS arriver après `stop()`, et `start()` peut échouer pendant la
 * demande d'autorisation. Tout est donc encapsulé : `start`/`stop`/
 * `abort` n'émettent jamais d'exception, et l'appelant ne doit JAMAIS
 * dépendre d'un événement navigateur pour sortir de l'état
 * « enregistrement » (arrêt optimiste côté interface).
 */

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface Dictation {
  /** Démarre l'écoute. En cas d'échec immédiat → onError + onEnd. */
  start: () => void;
  /** Arrêt doux (laisse finir le segment en cours). Sans exception. */
  stop: () => void;
  /** Arrêt immédiat et silencieux (fermeture, annulation). */
  abort: () => void;
}

/**
 * Crée une session de dictée.
 * - `onText` reçoit chaque segment finalisé ;
 * - `onStart` est appelé quand le micro écoute RÉELLEMENT (événement
 *   `onstart`, ou premier résultat si le navigateur ne l'émet pas) ;
 * - `onEnd` est appelé quand la reconnaissance s'arrête (au plus une fois) ;
 * - `onError` reçoit un message lisible.
 */
export function createDictation(
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
  onStart?: () => void,
): Dictation | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  let rec: RecognitionLike;
  try {
    rec = new Ctor();
  } catch {
    return null;
  }
  let started = false;
  let ended = false;
  const emitStart = () => {
    if (!started && !ended) {
      started = true;
      onStart?.();
    }
  };
  const emitEnd = () => {
    if (!ended) {
      ended = true;
      onEnd();
    }
  };
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onstart = emitStart;
  rec.onresult = (event: any) => {
    emitStart(); // certains navigateurs n'émettent pas onstart
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal && result[0]) {
        const text = String(result[0].transcript ?? '').trim();
        if (text !== '') onText(text);
      }
    }
  };
  rec.onerror = (event: any) => {
    const code = String(event?.error ?? 'inconnu');
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      onError(
        'Micro indisponible — autorise le microphone pour ce site. ' +
          "Depuis l'app installée, si rien ne se passe, essaie dans Safari.",
      );
    } else if (code !== 'no-speech' && code !== 'aborted') {
      onError(`Dictée interrompue (${code}).`);
    }
  };
  rec.onend = emitEnd;
  const hardStop = () => {
    try {
      if (rec.abort) rec.abort();
      else rec.stop();
    } catch {
      // déjà arrêté : rien à faire
    }
  };
  return {
    start: () => {
      try {
        rec.start();
      } catch {
        // iOS : start() peut échouer (session déjà active, autorisation…)
        onError("La dictée n'a pas pu démarrer — réessaie.");
        hardStop();
        emitEnd();
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        hardStop();
      }
    },
    abort: () => {
      hardStop();
      emitEnd();
    },
  };
}
