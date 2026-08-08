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

async function aiSummarize(text: string, song: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/ai?fn=note', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, song, parts: [] }),
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
  onSave: (note: SongNote) => void;
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
  const dictation = useRef<Dictation | null>(null);
  // N° de session : les événements d'une dictée abandonnée (onEnd tardif
  // d'iOS…) ne doivent pas toucher l'état de la suivante.
  const session = useRef(0);
  const watchdog = useRef(0);

  const bandId = existing ? existing.bandId : initialBandId;
  const bandName =
    bandId !== '' ? (bands.find((b) => b.id === bandId)?.name ?? '') : '';

  useEffect(() => {
    return () => {
      session.current++;
      window.clearTimeout(watchdog.current);
      dictation.current?.abort();
    };
  }, []);

  /** Coupe la dictée immédiatement, quel que soit l'humeur du navigateur. */
  function stopRecording() {
    session.current++;
    window.clearTimeout(watchdog.current);
    setRecState('off');
    const d = dictation.current;
    dictation.current = null;
    d?.stop();
    d?.abort();
  }

  function toggleRecording() {
    setError(null);
    if (recording) {
      stopRecording();
      return;
    }
    const sid = ++session.current;
    const fresh = () => session.current === sid;
    const d = createDictation(
      (t) => {
        if (fresh()) setText((prev) => (prev.trim() === '' ? t : prev + ' ' + t));
      },
      () => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setRecState('off');
          dictation.current = null;
        }
      },
      (msg) => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setError(msg);
          setRecState('off');
          dictation.current = null;
        }
      },
      () => {
        if (fresh()) {
          window.clearTimeout(watchdog.current);
          setRecState('on');
        }
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
        stopRecording();
        setError(
          "Le micro n'a pas démarré. Vérifie l'autorisation micro ; " +
            "depuis l'app installée, essaie aussi dans Safari.",
        );
      }
    }, 6000);
    d.start();
  }

  async function onAi() {
    if (text.trim() === '' || aiBusy) return;
    setError(null);
    setAiBusy(true);
    try {
      setText(await aiSummarize(text, song.title));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La synthèse a échoué.');
    } finally {
      setAiBusy(false);
    }
  }

  function onSubmit() {
    if (text.trim() === '') return;
    stopRecording();
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
    );
    onClose();
  }

  return (
    <Modal
      title={existing ? 'Modifier la note' : 'Note de répétition'}
      onClose={onClose}
    >
      <Field label="Note">
        {/* Pas d'autoFocus (b152) : le clavier s'ouvrait dès l'ouverture et
            recouvrait toute la modale sur iPhone — on choisit d'abord
            clavier OU dictée, la modale entière sous les yeux. */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Départ batterie seule, break avant le pont, fin abrégée…"
        />
      </Field>
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
          onClick={() => void onAi()}
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
          <span className="recdot" aria-hidden="true" /> Enregistrement en
          cours — parle, le texte s'ajoute au fur et à mesure.
        </div>
      )}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="chips" style={{ marginBottom: 10 }}>
        <button
          className={`chip ${visibility === 'groupe' ? '' : 'off'}`}
          onClick={() => setVisibility('groupe')}
        >
          👥 Visible du groupe
        </button>
        <button
          className={`chip ${visibility === 'privee' ? '' : 'off'}`}
          onClick={() => setVisibility('privee')}
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
