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
  const [recording, setRecording] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictation = useRef<Dictation | null>(null);

  const bandId = existing ? existing.bandId : initialBandId;
  const bandName =
    bandId !== '' ? (bands.find((b) => b.id === bandId)?.name ?? '') : '';

  useEffect(() => {
    return () => {
      dictation.current?.stop();
    };
  }, []);

  function toggleRecording() {
    setError(null);
    if (recording) {
      dictation.current?.stop();
      return;
    }
    const d = createDictation(
      (t) => setText((prev) => (prev.trim() === '' ? t : prev + ' ' + t)),
      () => setRecording(false),
      (msg) => {
        setError(msg);
        setRecording(false);
      },
    );
    if (!d) {
      setError(
        "La dictée vocale n'est pas disponible dans ce navigateur — essaie Chrome ou Edge.",
      );
      return;
    }
    dictation.current = d;
    d.start();
    setRecording(true);
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
    dictation.current?.stop();
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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Départ batterie seule, break avant le pont, fin abrégée…"
          autoFocus
        />
      </Field>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {dictationSupported() && (
          <button
            className={`btn ${recording ? 'danger' : 'ghost'}`}
            onClick={toggleRecording}
          >
            {recording ? '⏹ Arrêter la dictée' : '🎤 Dicter'}
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
      {recording && (
        <p className="help">🔴 Enregistrement en cours — parle, le texte s'ajoute au fur et à mesure.</p>
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
