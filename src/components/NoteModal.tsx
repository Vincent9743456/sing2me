/**
 * Note de répétition : le journal daté et signé du travail sur un
 * morceau. Saisie réduite à l'essentiel — le texte (clavier ou dictée
 * 🎤, synthèse IA ✨) et la visibilité 👥/🔒. Le contexte (solo ou
 * groupe) est repris automatiquement de la version affichée.
 * Sert aussi à MODIFIER une note existante (`existing`).
 */
import React, { useEffect, useRef, useState } from 'react';

import { createDictation, Dictation, dictationSupported } from '../lib/speech';
import {
  blobToBase64,
  MAX_NOTE_SECONDS,
  Recorder,
  recordingSupported,
  startRecording,
} from '../lib/recorder';
import { getLang, t } from '../i18n';
import { useStore } from '../store';
import { makeId, Song, SongNote } from '../types';
import { Field, Modal } from './ui';

/**
 * Synthèse + fusion + PORTÉE (b155) : une seule passe IA classe le
 * commentaire — « groupe » (visible de tous, y compris quand il vise un
 * musicien nommé, qui doit pouvoir le lire) ou « perso » (il ne concerne
 * que celui qui parle) — et met à jour la note vivante correspondante.
 */
async function aiSummarize(
  text: string,
  song: string,
  opts: {
    previousGroup: string;
    previousPerso: string;
    author: string;
    musicians: string[];
  } | null,
  /** Portée imposée par l'utilisateur (b163) : note vivante à mettre à
   *  jour, sans laisser l'IA choisir entre groupe et perso. */
  previous = '',
): Promise<{ text: string; scope: 'groupe' | 'perso' | '' }> {
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        opts
          ? { text, song, parts: [], detect: true, ...opts }
          : { text, song, parts: [], previous },
      ),
    });
  } catch {
    throw new Error(
      t('Synthèse indisponible — nécessite la version en ligne (Vercel).'),
    );
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(
      t('Synthèse indisponible — nécessite la version en ligne (Vercel).'),
    );
  }
  const body = (await res.json()) as {
    text?: string;
    scope?: string;
    error?: string;
  };
  if (!res.ok || body.error)
    throw new Error(body.error ?? t('Erreur {code}', { code: res.status }));
  return {
    text: body.text ?? '',
    scope: body.scope === 'perso' || body.scope === 'groupe' ? body.scope : '',
  };
}

/** Transcription côté serveur : le téléphone enregistre, le serveur écrit.
 *  `seconds` = durée RÉELLE mesurée par le téléphone (b163) : le serveur
 *  la devinait au poids du fichier, ce qui surestimait beaucoup le coût
 *  quand le navigateur enregistre à un débit plus élevé que demandé. */
async function transcribe(
  blob: Blob,
  mime: string,
  seconds: number,
): Promise<string> {
  const audio = await blobToBase64(blob);
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio, mime, seconds, lang: getLang() }),
    });
  } catch {
    throw new Error(
      t('Transcription indisponible — il faut être connecté au réseau.'),
    );
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(
      t('Transcription indisponible — nécessite la version en ligne (Vercel).'),
    );
  }
  const body = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  return body.text ?? '';
}

/**
 * Quel chemin de dictée ? (b157)
 * - `native` : reconnaissance du navigateur — gratuite, texte en direct ;
 * - `server` : on enregistre et le serveur transcrit — le seul qui marche
 *   dans une app installée sur iPhone (Apple y bride la reconnaissance).
 * Un échec du chemin natif est MÉMORISÉ : on ne refait pas subir l'attente
 * à l'utilisateur une seconde fois.
 */
const PATH_KEY = 'sing2me/dictationPath';

function isIosStandalone(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      nav.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true;
    return ios && standalone;
  } catch {
    return false;
  }
}

function preferredPath(): 'native' | 'server' {
  try {
    if (localStorage.getItem(PATH_KEY) === 'server') return 'server';
  } catch {
    // stockage indisponible : on décide au cas par cas
  }
  // App installée sur iPhone : la reconnaissance du navigateur n'y répond
  // pas — on va droit au serveur plutôt que d'attendre pour rien.
  if (isIosStandalone() && recordingSupported()) return 'server';
  return dictationSupported() ? 'native' : 'server';
}

export function NoteModal({
  song,
  author,
  initialBandId = '',
  existing,
  onSave,
  onClose,
}: {
  song: Song;
  author: string;
  /** Contexte repris de la version affichée ('' = solo / tous) */
  initialBandId?: string;
  /** Note à modifier (absent = nouvelle note) */
  existing?: SongNote;
  /** `replaces` : id de la note vivante que celle-ci met à jour (b154) —
   *  le parent doit alors la remplacer (retrait + ajout), pas l'empiler. */
  onSave: (note: SongNote, replaces?: string) => void;
  onClose: () => void;
}) {
  const { bands } = useStore();
  const [text, setText] = useState(existing?.text ?? '');
  const [visibility, setVisibility] = useState<'groupe' | 'privee'>(
    existing?.visibility ?? 'groupe',
  );
  /**
   * Dictée : machine à états explicite (b151, bug iPhone).
   * - 'starting' : micro demandé, pas encore confirmé (autorisation…) ;
   * - 'on'       : le micro écoute réellement (confirmé par le navigateur).
   * RÈGLE ABSOLUE : arrêter ne dépend JAMAIS d'un événement navigateur —
   * un tap sur Arrêter coupe l'état tout de suite (iOS n'émet parfois
   * jamais `onend`, ce qui figeait l'écran sans issue).
   */
  const [recState, setRecState] = useState<
    'off' | 'starting' | 'on' | 'transcribing'
  >('off');
  const recording = recState === 'starting' || recState === 'on';
  /** Enregistreur du chemin serveur (b157). */
  const recorder = useRef<Recorder | null>(null);
  /** Secondes écoulées, affichées pendant l'enregistrement (b159). */
  const [recSeconds, setRecSeconds] = useState(0);
  const ticker = useRef(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Transcription PROVISOIRE affichée en direct pendant qu'on parle. */
  const [interim, setInterim] = useState('');
  const dictation = useRef<Dictation | null>(null);
  // N° de session : les événements d'ÉTAT d'une dictée abandonnée (onEnd
  // tardif d'iOS…) ne doivent pas toucher la suivante. Le TEXTE, lui,
  // reste accepté après l'arrêt (gate séparé) : sur iPhone les segments
  // finaux n'arrivent souvent qu'APRÈS stop() — b152 les jetait, d'où
  // « j'ai dicté, rien ne s'affiche ».
  const session = useRef(0);
  const textGate = useRef(0);
  const watchdog = useRef(0);
  /** La session en cours a-t-elle entendu quelque chose ? (provisoire ou final) */
  const heard = useRef(false);
  /** Du texte a-t-il été dicté (finalisé) depuis le dernier passage IA ? */
  const dictated = useRef(false);
  /**
   * Le texte courant est-il DÉJÀ passé par la fusion IA (b317) ? Évite de
   * refaire tourner l'IA à l'enregistrement quand la dictée l'a déjà fait,
   * et se remet à faux dès que l'utilisateur retape (texte neuf à fusionner).
   */
  const aiProcessed = useRef(false);
  const autoAi = useRef(0);
  // Miroirs pour les minuteries (synthèse différée) : le texte et la
  // visibilité doivent être lus à jour, pas figés dans une fermeture.
  const textRef = useRef(text);
  textRef.current = text;
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  /**
   * L'utilisateur a-t-il CHOISI lui-même 👥 ou 🔒 ? (b163)
   * Si oui, son choix fait loi : l'IA ne classe plus, et la fusion se
   * fait avec la note vivante de CETTE portée uniquement. Sans ce garde-
   * fou, une note dictée en « Personnelle » se retrouvait fusionnée avec
   * la note du groupe — les deux se mélangeaient.
   */
  const visibilityChosen = useRef(false);

  const bandId = existing ? existing.bandId : initialBandId;
  const bandName =
    bandId !== '' ? (bands.find((b) => b.id === bandId)?.name ?? '') : '';

  /**
   * Note VIVANTE (demande Vincent, b154) : le nouveau commentaire ne
   * s'empile pas — il MET À JOUR la dernière note du même contexte : la
   * fusion IA remplace ce qui est contredit (« intro à la basse » →
   * « intro aux percus ») et ajoute ce qui est nouveau. `previous` est
   * cette note-là ; `mergedWith` vaut son id une fois la fusion faite,
   * et l'enregistrement la remplace alors au lieu d'ajouter.
   */
  const livingNote = React.useCallback(
    (vis: 'groupe' | 'privee'): SongNote | null => {
      if (existing) return null;
      const cands = song.rehearsalNotes
        .filter(
          (n) =>
            n.bandId === bandId &&
            n.visibility === vis &&
            (vis === 'groupe' || n.author === author),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return cands.length > 0 ? cands[cands.length - 1] : null;
    },
    [song, bandId, existing, author],
  );
  const prevGroupe = livingNote('groupe');
  const prevPerso = livingNote('privee');
  const previous = visibility === 'groupe' ? prevGroupe : prevPerso;
  const mergedWith = useRef<string | null>(null);
  const livingRef = useRef({ prevGroupe, prevPerso });
  livingRef.current = { prevGroupe, prevPerso };
  /** Noms des musiciens du contexte — pour que l'IA détecte « Marco : … ». */
  const musicians =
    bandId !== ''
      ? (bands.find((b) => b.id === bandId)?.members ?? [])
          .map((m) => m.name.trim())
          .filter((n) => n !== '')
      : [];

  useEffect(() => {
    return () => {
      session.current++;
      textGate.current++;
      window.clearTimeout(watchdog.current);
      window.clearTimeout(autoAi.current);
      window.clearInterval(ticker.current);
      dictation.current?.abort();
      recorder.current?.cancel();
    };
  }, []);

  /**
   * Synthèse AUTOMATIQUE (demande Vincent, b153) : à l'arrêt de la
   * dictée, la note est résumée par l'IA sans geste supplémentaire.
   * Différée de 1,4 s pour laisser arriver les segments finaux tardifs
   * d'iOS. Si l'IA est indisponible (hors-ligne…), le texte brut reste.
   */
  function scheduleAutoSummary() {
    window.clearTimeout(autoAi.current);
    autoAi.current = window.setTimeout(() => {
      if (heard.current === false) {
        // Micro ouvert mais rien capté : le dire, plutôt que le silence.
        setInfo(
          t(
            "Rien n'a été entendu. Parle plus près du micro — et si l'app installée ne capte rien, essaie dans Safari.",
          ),
        );
        return;
      }
      if (dictated.current && textRef.current.trim() !== '') {
        dictated.current = false;
        void runAi();
      }
    }, 1400);
  }

  /** Coupe la dictée immédiatement, quel que soit l'humeur du navigateur.
   *  Le texte finalisé qui arrive juste APRÈS (typique iOS) est conservé. */
  function stopRecording(withSummary = true) {
    session.current++;
    window.clearTimeout(watchdog.current);
    setRecState('off');
    setInterim('');
    const d = dictation.current;
    dictation.current = null;
    d?.stop();
    // Petit délai avant l'arrêt FORCÉ : laisser le navigateur finaliser
    // les derniers mots (abort() les jetterait).
    window.setTimeout(() => d?.abort(), 1600);
    if (withSummary) scheduleAutoSummary();
  }

  /** Chemin SERVEUR : on enregistre ici, le serveur transcrit (b157). */
  async function startServerDictation(because?: string) {
    setError(null);
    if (!recordingSupported()) {
      setError(
        t("Ce navigateur ne sait pas enregistrer le micro — essaie Chrome ou Safari."),
      );
      return;
    }
    if (because) setInfo(because);
    setRecState('starting');
    try {
      recorder.current = await startRecording(() => {
        // Durée maximale atteinte (b159) : on transcrit ce qui a été dit
        // — rien n'est perdu — et on dit pourquoi ça s'est arrêté.
        setInfo(
          t(
            'Limite de {n} secondes atteinte : on transcrit ce que tu as dit. Dicte une seconde note si besoin.',
            { n: MAX_NOTE_SECONDS },
          ),
        );
        void finishServerDictation();
      });
      setRecSeconds(0);
      window.clearInterval(ticker.current);
      ticker.current = window.setInterval(() => {
        setRecSeconds(recorder.current?.elapsed() ?? 0);
      }, 1000);
      setRecState('on');
    } catch {
      setRecState('off');
      recorder.current = null;
      setError(
        t(
          "Micro indisponible — autorise l'accès au microphone pour ce site, puis réessaie.",
        ),
      );
    }
  }

  /** Arrête l'enregistrement et fait transcrire. */
  async function finishServerDictation() {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    window.clearInterval(ticker.current);
    setRecState('transcribing');
    let recording: Awaited<ReturnType<Recorder['stop']>> = null;
    try {
      recording = await rec.stop();
    } catch {
      recording = null;
    }
    if (!recording) {
      setRecState('off');
      setInfo(
        t(
          "Rien n'a été entendu. Parle plus près du micro — et si l'app installée ne capte rien, essaie dans Safari.",
        ),
      );
      return;
    }
    try {
      const said = await transcribe(
        recording.blob,
        recording.mime,
        recording.seconds,
      );
      setRecState('off');
      if (said.trim() === '') {
        setInfo(t("Rien n'a été compris dans cet enregistrement."));
        return;
      }
      heard.current = true;
      dictated.current = true;
      setText((prev) => (prev.trim() === '' ? said : prev + ' ' + said));
      // Même suite que la dictée du navigateur : synthèse + fusion + portée.
      scheduleAutoSummary();
    } catch (e) {
      setRecState('off');
      setError(e instanceof Error ? e.message : t('La transcription a échoué.'));
    }
  }

  /** Coupe l'enregistrement serveur SANS transcrire (annulation). */
  function cancelServerDictation() {
    window.clearInterval(ticker.current);
    recorder.current?.cancel();
    recorder.current = null;
    setRecState('off');
    setInfo(null);
  }

  function toggleRecording() {
    setError(null);
    setInfo(null);
    // Chemin serveur en cours : arrêter = transcrire.
    if (recorder.current) {
      void finishServerDictation();
      return;
    }
    if (recording) {
      stopRecording();
      return;
    }
    if (recState === 'transcribing') return;
    if (preferredPath() === 'server') {
      void startServerDictation();
      return;
    }
    window.clearTimeout(autoAi.current);
    const sid = ++session.current;
    const gate = ++textGate.current;
    const fresh = () => session.current === sid;
    heard.current = false;
    const d = createDictation(
      (t) => {
        // Gate TEXTE (pas session) : accepté aussi après l'arrêt.
        if (textGate.current === gate) {
          heard.current = true;
          dictated.current = true;
          setText((prev) => (prev.trim() === '' ? t : prev + ' ' + t));
        }
      },
      () => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setRecState('off');
          setInterim('');
          dictation.current = null;
          scheduleAutoSummary();
        }
      },
      (msg) => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setError(msg);
          setRecState('off');
          setInterim('');
          dictation.current = null;
        }
      },
      () => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setRecState('on');
        }
      },
      (t) => {
        if (t !== '') heard.current = true;
        if (fresh()) setInterim(t);
      },
    );
    if (!d) {
      setError(
        t(
          "La dictée vocale n'est pas disponible dans ce navigateur — essaie Chrome ou Edge.",
        ),
      );
      return;
    }
    dictation.current = d;
    setRecState('starting');
    // Garde-fou : si le micro n'a pas VRAIMENT démarré sous 6 s
    // (autorisation restée sans réponse, PWA iOS capricieuse…), on coupe
    // tout et on le dit — plus jamais d'écran figé sans explication.
    window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => {
      if (fresh() && dictation.current === d) {
        stopRecording(false);
        // b157 : plutôt que de renvoyer l'utilisateur vers Safari, on
        // BASCULE sur la dictée par le serveur — et on s'en souvient pour
        // ne plus jamais lui faire attendre ces 6 secondes.
        try {
          localStorage.setItem(PATH_KEY, 'server');
        } catch {
          // stockage indisponible : la bascule vaudra pour cette fois
        }
        void startServerDictation(
          t(
            'Le micro du navigateur ne répond pas — on passe par la dictée enregistrée. Parle, puis appuie sur ⏹.',
          ),
        );
      }
    }, 6000);
    d.start();
  }

  /**
   * Fusion IA de la note courante (dictée OU écrite, b317) avec la note
   * vivante : remplace ce qui est contredit, ajoute ce qui est nouveau,
   * classe la portée. Renvoie le résultat (pour l'enregistrement direct
   * d'une note écrite) ou null si l'IA n'a rien pu faire (hors-ligne…),
   * auquel cas l'appelant garde le texte brut.
   */
  async function runAi(): Promise<{
    text: string;
    replaces?: string;
    visibility: 'groupe' | 'privee';
  } | null> {
    const input = textRef.current;
    if (input.trim() === '' || aiBusy) return null;
    const living = livingRef.current;
    setError(null);
    setAiBusy(true);
    // Portée IMPOSÉE par l'utilisateur (b163) : s'il a choisi 👥 ou 🔒
    // lui-même, l'IA ne classe pas — elle met seulement à jour la note
    // vivante de CETTE portée. Elle ne mélangera plus les deux.
    const forced = !existing && visibilityChosen.current;
    const forcedPrev =
      visibilityRef.current === 'groupe' ? living.prevGroupe : living.prevPerso;
    let resultVis: 'groupe' | 'privee' = visibilityRef.current;
    let replaces: string | undefined;
    try {
      const out = await aiSummarize(
        input,
        song.title,
        existing || forced
          ? null // édition ou portée imposée : pas de classement
          : {
              previousGroup: living.prevGroupe?.text ?? '',
              previousPerso: living.prevPerso?.text ?? '',
              author,
              musicians,
            },
        forced ? (forcedPrev?.text ?? '') : '',
      );
      if (out.text.trim() === '') return null;
      setText(out.text);
      textRef.current = out.text; // miroir à jour tout de suite (b317)
      dictated.current = false;
      aiProcessed.current = true;
      if (forced) {
        // La fusion a porté sur la note vivante de la portée choisie :
        // c'est elle, et elle seule, que l'on remplacera.
        mergedWith.current = forcedPrev?.id ?? null;
        replaces = forcedPrev?.id ?? undefined;
      } else if (!existing && out.scope !== '') {
        // Portée détectée (b155) : la note bascule d'elle-même — et la
        // fusion remplacera la note vivante de CETTE portée.
        const vis = out.scope === 'perso' ? 'privee' : 'groupe';
        resultVis = vis;
        mergedWith.current =
          (out.scope === 'perso' ? living.prevPerso : living.prevGroupe)?.id ??
          null;
        replaces = mergedWith.current ?? undefined;
        if (vis !== visibilityRef.current) {
          setVisibility(vis);
          visibilityRef.current = vis; // miroir à jour tout de suite
          setInfo(
            out.scope === 'perso'
              ? t(
                  "🔒 L'IA a classé ce commentaire comme personnel — il ira dans ta note personnelle. Change la visibilité si besoin.",
                )
              : t(
                  "👥 L'IA a classé ce commentaire pour le groupe. Change la visibilité si besoin.",
                ),
          );
        }
      } else if (!existing) {
        // Portée inconnue (réponse hors format) : prudence — la note
        // s'AJOUTE, on ne remplace jamais sans fusion certaine.
        mergedWith.current = null;
        replaces = undefined;
      }
      return { text: out.text, replaces, visibility: resultVis };
    } catch (e) {
      // IA indisponible (hors-ligne…) : le texte brut reste tel quel.
      setError(e instanceof Error ? e.message : t('La synthèse a échoué.'));
      return null;
    } finally {
      setAiBusy(false);
    }
  }

  async function onSubmit() {
    if (text.trim() === '' || aiBusy) return;
    window.clearTimeout(autoAi.current);
    stopRecording(false);
    cancelServerDictation();
    // NOTE ÉCRITE : elle profite AUSSI de la fusion IA (b317, demande de
    // Vincent). Sans ça, une note tapée s'empilait à côté de la note vivante
    // au lieu de la mettre à jour ou de corriger une contradiction — alors
    // que la dictée, elle, était bien fusionnée. On ne le fait qu'à la
    // CRÉATION (une édition directe reste littérale) et si l'IA n'a pas déjà
    // tourné (dictée). Jamais bloquant : si l'IA échoue, on garde le texte
    // brut (repli sur le comportement d'avant).
    let finalText = text.trim();
    let replaces = existing ? undefined : (mergedWith.current ?? undefined);
    let vis = visibility;
    if (!existing && !aiProcessed.current) {
      const merged = await runAi();
      if (merged) {
        finalText = merged.text.trim();
        replaces = merged.replaces;
        vis = merged.visibility;
      }
    }
    onSave(
      existing
        ? { ...existing, text: finalText, visibility: vis }
        : {
            id: makeId(),
            target: '',
            bandId,
            text: finalText,
            author,
            visibility: vis,
            createdAt: new Date().toISOString(),
          },
      replaces,
    );
    onClose();
  }

  return (
    <Modal
      title={existing ? t('Modifier la note') : t('Note de répétition')}
      onClose={onClose}
    >
      {/* Note vivante (b154) : la note actuelle est rappelée, le nouveau
          commentaire la met à jour (fusion IA) au lieu de s'empiler. */}
      {previous !== null && (
        <div className="prevnote">
          <div className="prevnote-label">
            {t('Note actuelle')}
            {previous.author !== '' ? ` (${previous.author})` : ''} :
          </div>
          <div className="prevnote-text">{previous.text}</div>
        </div>
      )}
      <Field label={previous !== null ? t('Nouveau commentaire') : t('Note')}>
        {/* Pas d'autoFocus (b152) : le clavier s'ouvrait dès l'ouverture et
            recouvrait toute la modale sur iPhone — on choisit d'abord
            clavier OU dictée, la modale entière sous les yeux. */}
        <textarea
          value={text}
          onChange={(e) => {
            // Texte retapé à la main : il devra repasser par la fusion IA
            // à l'enregistrement (b317).
            aiProcessed.current = false;
            setText(e.target.value);
          }}
          placeholder={t('Départ batterie seule, break avant le pont, fin abrégée…')}
        />
      </Field>
      {previous !== null && (
        <p className="help" style={{ marginTop: -6 }}>
          {t(
            'Ton commentaire met la note à jour : ce qui est contredit est remplacé, le reste est conservé et complété.',
          )}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {/* b157 : dicter est possible même sans reconnaissance vocale dans
            le navigateur (Firefox, Samsung Internet, app iPhone
            installée) — on enregistre et le serveur transcrit. */}
        {(dictationSupported() || recordingSupported()) && (
          <button
            className={`btn ${recording ? 'danger' : 'ghost'}`}
            onClick={toggleRecording}
          >
            {recState === 'off' && t('🎤 Dicter')}
            {recState === 'starting' && t('⏹ Annuler (micro…)')}
            {recState === 'on' && t('⏹ Arrêter la dictée')}
            {recState === 'transcribing' && t('✍️ Transcription…')}
          </button>
        )}
        {/* Plus de bouton « Synthétiser » (b162, demande Vincent) : la
            synthèse se déclenche TOUTE SEULE après une dictée, et une
            note tapée au clavier n'a pas besoin d'être reformulée. */}
      </div>
      {/* L'état d'enregistrement doit être IMPOSSIBLE à rater (b151). */}
      {recState === 'starting' && (
        <div className="recbanner starting" role="status">
          {t("🎤 Démarrage du micro… (autorise l'accès si demandé)")}
        </div>
      )}
      {recState === 'on' && (
        <div className="recbanner" role="status">
          <span className="recdot" aria-hidden="true" />
          <span className="grow">
            {t("Enregistrement — parle, puis ⏹. La note sera résumée par l'IA.")}
            {interim !== '' && <em className="recinterim"> « {interim} »</em>}
          </span>
          {/* Compteur (b159) : on voit toujours depuis combien de temps on
              enregistre, et les 15 dernières secondes préviennent. */}
          {recorder.current !== null && (
            <span
              className={`rectimer ${
                recSeconds >= MAX_NOTE_SECONDS - 15 ? 'soon' : ''
              }`}
            >
              {Math.floor(recSeconds / 60)}:
              {String(recSeconds % 60).padStart(2, '0')} /{' '}
              {Math.floor(MAX_NOTE_SECONDS / 60)}:
              {String(MAX_NOTE_SECONDS % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      )}
      {/* Transcription en cours côté serveur (b157). */}
      {recState === 'transcribing' && (
        <div className="recbanner starting" role="status">
          {t('✍️ Transcription de ce que tu viens de dire…')}
        </div>
      )}
      {/* Synthèse automatique en cours après la dictée (b153). */}
      {!recording && recState !== 'transcribing' && aiBusy && (
        <div className="recbanner starting" role="status">
          {t("✨ Synthèse de la note par l'IA…")}
        </div>
      )}
      {info && <p className="help">{info}</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="chips" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${visibility === 'groupe' ? '' : 'off'}`}
          onClick={() => {
            setVisibility('groupe');
            visibilityChosen.current = true; // choix explicite : l'IA n'y touche plus
            mergedWith.current = null; // autre contexte → autre note vivante
          }}
        >
          {t('👥 Visible du groupe')}
        </button>
        <button
          className={`chip ${visibility === 'privee' ? '' : 'off'}`}
          onClick={() => {
            setVisibility('privee');
            visibilityChosen.current = true; // choix explicite : l'IA n'y touche plus
            mergedWith.current = null; // autre contexte → autre note vivante
          }}
        >
          {t('🔒 Personnelle')}
        </button>
      </div>
      <p className="help">
        {t('Contexte : ')}
        {bandName !== '' ? t('avec {band}', { band: bandName }) : t('solo / tous')}
        {' — '}
        {t('repris de la version affichée. Signée')} {author || t('sans nom')}
        {t(', datée automatiquement.')}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{ flex: 1 }}
          onClick={onSubmit}
          disabled={text.trim() === '' || aiBusy}
        >
          {aiBusy
            ? t('⏳ Fusion…')
            : existing
              ? t('Enregistrer les modifications')
              : t('Enregistrer la note')}
        </button>
        <button className="btn ghost" onClick={onClose}>
          {t('Annuler')}
        </button>
      </div>
    </Modal>
  );
}
