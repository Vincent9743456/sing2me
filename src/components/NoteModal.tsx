/**
 * Note de répétition : le journal daté et signé du travail sur un
 * morceau. Saisie réduite à l'essentiel — le texte (clavier ou dictée
 * 🎤, synthèse IA ✨) et la visibilité 👥/🔒. Le contexte (solo ou
 * groupe) est repris automatiquement de la version affichée.
 * Sert aussi à MODIFIER une note existante (`existing`).
 */
import React, { useEffect, useRef, useState } from 'react';

import { createDictation, Dictation, dictationSupported } from '../lib/speech';
import { useStore } from '../store';
import { makeId, Song, SongNote } from '../types';
import { Field, Modal } from './ui';

async function aiSummarize(
  text: string,
  song: string,
  previous: string,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, song, parts: [], previous }),
    });
  } catch {
    throw new Error(
      "Synthèse indisponible — nécessite la version en ligne (Vercel).",
    );
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(
      "Synthèse indisponible — nécessite la version en ligne (Vercel).",
    );
  }
  const body = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `Erreur ${res.status}`);
  return body.text ?? '';
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
  const [recState, setRecState] = useState<'off' | 'starting' | 'on'>('off');
  const recording = recState !== 'off';
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
  const autoAi = useRef(0);
  // Miroir du texte pour les minuteries (synthèse différée).
  const textRef = useRef(text);
  textRef.current = text;

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
  const previous = React.useMemo(() => {
    if (existing) return null;
    const cands = song.rehearsalNotes
      .filter(
        (n) =>
          n.bandId === bandId &&
          n.visibility === visibility &&
          (visibility === 'groupe' || n.author === author),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return cands.length > 0 ? cands[cands.length - 1] : null;
  }, [song, bandId, visibility, existing, author]);
  const mergedWith = useRef<string | null>(null);
  const previousRef = useRef(previous);
  previousRef.current = previous;

  useEffect(() => {
    return () => {
      session.current++;
      textGate.current++;
      window.clearTimeout(watchdog.current);
      window.clearTimeout(autoAi.current);
      dictation.current?.abort();
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
          "Rien n'a été entendu. Parle plus près du micro — et si l'app " +
            "installée ne capte rien, essaie dans Safari.",
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

  function toggleRecording() {
    setError(null);
    setInfo(null);
    if (recording) {
      stopRecording();
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
        "La dictée vocale n'est pas disponible dans ce navigateur — essaie Chrome ou Edge.",
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
        setError(
          "Le micro n'a pas démarré. Vérifie l'autorisation micro ; " +
            "depuis l'app installée, essaie aussi dans Safari.",
        );
      }
    }, 6000);
    d.start();
  }

  async function runAi() {
    const input = textRef.current;
    if (input.trim() === '' || aiBusy) return;
    const prev = previousRef.current;
    setError(null);
    setAiBusy(true);
    try {
      const summary = await aiSummarize(input, song.title, prev?.text ?? '');
      if (summary.trim() !== '') {
        setText(summary);
        // La note affichée contient désormais la fusion : à
        // l'enregistrement, elle REMPLACE la note vivante.
        mergedWith.current = prev?.id ?? null;
        dictated.current = false;
      }
    } catch (e) {
      // IA indisponible (hors-ligne…) : le texte brut reste tel quel.
      setError(e instanceof Error ? e.message : 'La synthèse a échoué.');
    } finally {
      setAiBusy(false);
    }
  }

  function onSubmit() {
    if (text.trim() === '') return;
    window.clearTimeout(autoAi.current);
    stopRecording(false);
    onSave(
      existing
        ? { ...existing, text: text.trim(), visibility }
        : {
            id: makeId(),
            target: '',
            bandId,
            text: text.trim(),
            author,
            visibility,
            createdAt: new Date().toISOString(),
          },
      existing ? undefined : (mergedWith.current ?? undefined),
    );
    onClose();
  }

  return (
    <Modal
      title={existing ? 'Modifier la note' : 'Note de répétition'}
      onClose={onClose}
    >
      {/* Note vivante (b154) : la note actuelle est rappelée, le nouveau
          commentaire la met à jour (fusion IA) au lieu de s'empiler. */}
      {previous !== null && (
        <div className="prevnote">
          <div className="prevnote-label">
            Note actuelle{previous.author !== '' ? ` (${previous.author})` : ''} :
          </div>
          <div className="prevnote-text">{previous.text}</div>
        </div>
      )}
      <Field label={previous !== null ? 'Nouveau commentaire' : 'Note'}>
        {/* Pas d'autoFocus (b152) : le clavier s'ouvrait dès l'ouverture et
            recouvrait toute la modale sur iPhone — on choisit d'abord
            clavier OU dictée, la modale entière sous les yeux. */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Départ batterie seule, break avant le pont, fin abrégée…"
        />
      </Field>
      {previous !== null && (
        <p className="help" style={{ marginTop: -6 }}>
          Ton commentaire met la note à jour : ce qui est contredit est
          remplacé, le reste est conservé et complété.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {dictationSupported() && (
          <button
            className={`btn ${recording ? 'danger' : 'ghost'}`}
            onClick={toggleRecording}
          >
            {recState === 'off' && '🎤 Dicter'}
            {recState === 'starting' && '⏹ Annuler (micro…)'}
            {recState === 'on' && '⏹ Arrêter la dictée'}
          </button>
        )}
        <button
          className="btn ghost"
          onClick={() => void runAi()}
          disabled={text.trim() === '' || aiBusy}
        >
          {aiBusy ? '✨ Synthèse…' : '✨ Synthétiser (IA)'}
        </button>
      </div>
      {/* L'état d'enregistrement doit être IMPOSSIBLE à rater (b151). */}
      {recState === 'starting' && (
        <div className="recbanner starting" role="status">
          🎤 Démarrage du micro… (autorise l'accès si demandé)
        </div>
      )}
      {recState === 'on' && (
        <div className="recbanner" role="status">
          <span className="recdot" aria-hidden="true" />
          <span>
            Enregistrement — parle, puis ⏹. La note sera résumée par l'IA.
            {interim !== '' && <em className="recinterim"> « {interim} »</em>}
          </span>
        </div>
      )}
      {/* Synthèse automatique en cours après la dictée (b153). */}
      {!recording && aiBusy && (
        <div className="recbanner starting" role="status">
          ✨ Synthèse de la note par l'IA…
        </div>
      )}
      {info && <p className="help">{info}</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="chips" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${visibility === 'groupe' ? '' : 'off'}`}
          onClick={() => {
            setVisibility('groupe');
            mergedWith.current = null; // autre contexte → autre note vivante
          }}
        >
          👥 Visible du groupe
        </button>
        <button
          className={`chip ${visibility === 'privee' ? '' : 'off'}`}
          onClick={() => {
            setVisibility('privee');
            mergedWith.current = null; // autre contexte → autre note vivante
          }}
        >
          🔒 Personnelle
        </button>
      </div>
      <p className="help">
        Contexte : {bandName !== '' ? `avec ${bandName}` : 'solo / tous'} —
        repris de la version affichée. Signée {author || 'sans nom'}, datée
        automatiquement.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{ flex: 1 }}
          onClick={onSubmit}
          disabled={text.trim() === ''}
        >
          {existing ? 'Enregistrer les modifications' : 'Enregistrer la note'}
        </button>
        <button className="btn ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}
