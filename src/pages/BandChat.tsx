/**
 * Espace du groupe : fil de discussion entre les membres — préparer les
 * répétitions et les concerts, proposer des chansons, s'organiser.
 * Messages typés (💬 discussion, 🎵 chanson, 🥁 répét, 🎤 concert),
 * stockés dans Supabase (band_messages, RLS créateur + membres),
 * rafraîchis régulièrement. Compte + groupe publié requis.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { CoachMark } from '../components/CoachMark';
import { useNotifications } from '../components/Notifications';
import { Modal, TopBar } from '../components/ui';
import { getValidSession } from '../lib/auth';
import {
  BandMessage,
  BandMessageKind,
  deleteBandMessage,
  ensureCloudBand,
  fetchBandMessages,
  postBandMessage,
} from '../lib/bands';
import { normalizeTitle } from '../lib/importer';
import { duplicateVersion, switchVersion, versionForBand } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { Song } from '../types';

/**
 * Types de message saisis librement dans le fil. La proposition de chanson
 * n'en fait PAS partie : elle se fait uniquement en associant un morceau du
 * répertoire (bouton dédié) — le fil garde alors une annonce 🎵 automatique.
 */
const KINDS: { kind: BandMessageKind; label: string; hint: string }[] = [
  { kind: 'message', label: '💬 Discussion', hint: 'organisation, questions…' },
  { kind: 'repet', label: '🥁 Répét', hint: 'proposer une date, un lieu' },
  { kind: 'concert', label: '🎤 Concert', hint: 'plan, date, matériel' },
];

const BADGES: Record<BandMessageKind, string> = {
  message: '💬',
  chanson: '🎵',
  repet: '🥁',
  concert: '🎤',
};

function kindBadge(kind: BandMessageKind): string {
  return BADGES[kind] ?? '💬';
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((startOf(today) - startOf(d)) / 86400000);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function BandChat({ id }: { id: string }) {
  const { bands, prefs, artist, saveBand, songs, saveSong, clearBandRemoval } =
    useStore();
  const band = bands.find((b) => b.id === id);
  const [messages, setMessages] = useState<BandMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<BandMessageKind>('message');
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [myId, setMyId] = useState('');
  const cloudIdRef = useRef(band?.cloudId ?? '');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const author = prefs.userName || artist.name || 'Moi';
  const { markMessagesSeen } = useNotifications();

  const load = useCallback(async () => {
    if (!band) return;
    try {
      const s = await getValidSession();
      if (!s) {
        setError(
          "Connecte-toi (Profil artiste → Mon compte) pour accéder à l'espace du groupe.",
        );
        return;
      }
      setMyId(s.userId);
      // Groupe pas encore publié dans le cloud : on le publie (créateur)
      if (cloudIdRef.current === '') {
        const ref = await ensureCloudBand(s, band.id, band.name);
        cloudIdRef.current = ref.cloudId;
        saveBand({ ...band, cloudId: ref.cloudId });
      }
      setMessages(await fetchBandMessages(s, cloudIdRef.current));
      // Ouvrir/consulter la discussion = fil lu : on efface le compteur.
      markMessagesSeen(cloudIdRef.current);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band?.id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(t);
  }, [load]);

  // Défile vers le dernier message à l'arrivée du fil
  const count = messages?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const grouped = useMemo(() => {
    const out: { day: string; items: BandMessage[] }[] = [];
    for (const m of messages ?? []) {
      const day = dayLabel(m.created_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  async function onSend() {
    if (!band || text.trim() === '' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await getValidSession();
      if (!s) throw new Error('Connexion requise.');
      await postBandMessage(s, cloudIdRef.current, {
        author,
        kind,
        text: text.trim(),
      });
      setText('');
      setKind('message');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Proposer une chanson = l'associer au répertoire du groupe (aucune
   * validation des autres n'est requise) et l'annoncer dans le fil pour que
   * tout le monde sache qu'un nouveau morceau a rejoint le répertoire.
   */
  async function propose(song: Song) {
    if (!band || busy) return;
    setPickOpen(false);
    setBusy(true);
    setError(null);
    try {
      const s = await getValidSession();
      if (!s) throw new Error('Connexion requise.');
      if (cloudIdRef.current === '') {
        const ref = await ensureCloudBand(s, band.id, band.name);
        cloudIdRef.current = ref.cloudId;
        saveBand({ ...band, cloudId: ref.cloudId });
      }
      // Associe la chanson au groupe (version dédiée) si ce n'est pas déjà
      // fait, sans changer la version affichée du morceau. La synchro du
      // répertoire partagé la propage ensuite à tous les membres.
      if (!versionForBand(song, band.id)) {
        const prev = song.activeVersionId;
        saveSong(
          switchVersion(
            duplicateVersion(song, band.name || 'Groupe', band.id),
            prev,
          ),
        );
        clearBandRemoval(band.id, normalizeTitle(song.title));
      }
      // Annonce dans le fil : visible par tout le groupe.
      await postBandMessage(s, cloudIdRef.current, {
        author,
        kind: 'chanson',
        text: `${song.title || '(sans titre)'}${
          song.artist !== '' ? ` — ${song.artist}` : ''
        }`,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La proposition a échoué.');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(m: BandMessage) {
    if (!confirm('Supprimer ce message ?')) return;
    try {
      const s = await getValidSession();
      if (!s) return;
      await deleteBandMessage(s, m.id);
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression impossible.');
    }
  }

  if (!band) {
    return (
      <>
        <TopBar title="Espace du groupe" onBack={() => navigate('/bands')} />
        <div className="page">
          <p className="help">Ce groupe n'existe plus.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title={`💬 ${band.name || 'Espace du groupe'}`}
        onBack={() => navigate(`/band/${band.id}`)}
      />
      <div className="page">
        <CoachMark
          id="chat-propose"
          text="Propose une chanson 🎵 — un bouton l'importera directement pour tout le groupe."
        />
        {messages === null && error === null && (
          <p className="help" style={{ textAlign: 'center' }}>
            Ouverture de l'espace du groupe…
          </p>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            {error}
          </div>
        )}
        {messages !== null && messages.length === 0 && (
          <p className="help" style={{ textAlign: 'center' }}>
            Premier message à écrire ! Propose une chanson 🎵, une date de
            répét 🥁, un plan de concert 🎤 — tout le groupe le verra.
          </p>
        )}

        {grouped.map((g) => (
          <React.Fragment key={g.day}>
            <div className="help" style={{ textAlign: 'center', margin: '10px 0 6px' }}>
              — {g.day} —
            </div>
            {g.items.map((m) => (
              <div
                className="card"
                key={m.id}
                style={{ padding: '8px 12px', marginBottom: 8 }}
              >
                <div className="hstack" style={{ gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>{kindBadge(m.kind)}</span>
                  <strong style={{ flex: 1 }}>
                    {m.author || 'Musicien'}
                    <span className="stauthor" style={{ fontWeight: 400 }}>
                      {' '}
                      ·{' '}
                      {new Date(m.created_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </strong>
                  {m.user_id === myId && (
                    <button
                      className="btn icon"
                      title="Supprimer ce message"
                      onClick={() => void onDelete(m)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                  {m.text}
                </div>
                {m.kind === 'chanson' && (
                  <div className="help" style={{ marginTop: 4 }}>
                    Ajoutée au répertoire du groupe.
                  </div>
                )}
              </div>
            ))}
          </React.Fragment>
        ))}
        <div ref={bottomRef} />

        <div className="spacer" />
        <button
          className="btn ghost block"
          style={{ marginBottom: 8 }}
          disabled={busy}
          onClick={() => setPickOpen(true)}
          title="Choisir un morceau de ton répertoire et l'ajouter au répertoire du groupe"
        >
          🎵 Proposer une chanson de mon répertoire
        </button>
        <div className="chips" style={{ marginBottom: 8 }}>
          {KINDS.map((k) => (
            <button
              key={k.kind}
              className={`chip ${kind === k.kind ? '' : 'off'}`}
              title={k.hint}
              onClick={() => setKind(k.kind)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            kind === 'repet'
              ? 'Ex. Répét jeudi 20h chez Marco ?'
              : kind === 'concert'
                ? 'Ex. Fête de la musique — on répond avant vendredi ?'
                : 'Ton message au groupe…'
          }
          style={{ minHeight: 70 }}
        />
        <button
          className="btn block"
          onClick={() => void onSend()}
          disabled={text.trim() === '' || busy}
        >
          {busy ? 'Envoi…' : `Envoyer — signé ${author}`}
        </button>
        <p className="help" style={{ textAlign: 'center' }}>
          Visible par tous les membres du groupe. Actualisé automatiquement.
        </p>
      </div>

      {pickOpen && (
        <SongPicker
          songs={songs}
          bandId={band.id}
          onPick={(song) => void propose(song)}
          onClose={() => setPickOpen(false)}
        />
      )}
    </>
  );
}

/** Choix d'un morceau du répertoire personnel à proposer au groupe. */
function SongPicker({
  songs,
  bandId,
  onPick,
  onClose,
}: {
  songs: Song[];
  bandId: string;
  onPick: (song: Song) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...songs]
      .filter((s) => s.idea !== true)
      .filter(
        (s) =>
          needle === '' ||
          s.title.toLowerCase().includes(needle) ||
          s.artist.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }, [songs, q]);

  return (
    <Modal title="Proposer une chanson au groupe" onClose={onClose}>
      <p className="help">
        Choisis un morceau de ton répertoire : il rejoint le répertoire du
        groupe et tout le monde en est informé.
      </p>
      <input
        type="text"
        placeholder="Rechercher dans mon répertoire…"
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="spacer" />
      {list.length === 0 ? (
        <p className="help">
          {songs.some((s) => s.idea !== true)
            ? 'Aucun morceau ne correspond à ta recherche.'
            : "Ton répertoire est vide — ajoute d'abord un morceau."}
        </p>
      ) : (
        <div className="list">
          {list.map((s) => {
            const already = versionForBand(s, bandId) !== null;
            return (
              <div className="row" key={s.id} onClick={() => onPick(s)}>
                <div className="grow">
                  <div className="title">{s.title || '(sans titre)'}</div>
                  <div className="sub">
                    {[s.artist, s.key].filter((x) => x !== '').join(' · ') || ' '}
                  </div>
                </div>
                {already ? (
                  <span
                    style={{ color: 'var(--accent)', fontWeight: 700 }}
                    title="Déjà dans le répertoire du groupe"
                  >
                    ✓ Déjà proposée
                  </span>
                ) : (
                  <span className="chevron">
                    <Icon name="plus" size={16} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="spacer" />
      <button className="btn ghost block" onClick={onClose}>
        Fermer
      </button>
    </Modal>
  );
}
