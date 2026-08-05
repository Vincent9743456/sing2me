/**
 * Dictée vocale via l'API Web Speech du navigateur (fr-FR).
 * Fonctionne dans Chrome, Edge et Safari ; aucun serveur requis.
 */

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function dictationSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface Dictation {
  start: () => void;
  stop: () => void;
}

/**
 * Crée une session de dictée. `onText` reçoit chaque segment finalisé,
 * `onEnd` est appelé quand la reconnaissance s'arrête.
 */
export function createDictation(
  onText: (text: string) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): Dictation | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = (event: any) => {
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
      onError("Micro refusé — autorise le microphone pour ce site.");
    } else if (code !== 'no-speech' && code !== 'aborted') {
      onError(`Dictée interrompue (${code}).`);
    }
  };
  rec.onend = () => onEnd();
  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
  };
}
