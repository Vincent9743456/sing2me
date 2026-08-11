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
import { t } from '../i18n';
import { getValidSession } from '../lib/auth';
import {
  BandMessage,
  BandMessageKind,
  deleteBandMessage,
  ensureCloudBand,
  fetchBandMessages,
  postBandMessage,
} from '../lib/bands';
import { findSameSong, songKey } from '../lib/importer';
import { duplicateVersion, switchVersion, versionForBand } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { Song } from '../types';

/**
 * ÉCRIRE, C'EST ÉCRIRE (b266, constat de Vincent : « les 3 boutons Discussion
 * / Répét / Concert ne servent à rien »). Il fallait choisir une étiquette
 * AVANT de taper son message, alors qu'elle ne changeait rien : ni tri, ni
 * filtre, ni notification, ni rappel — juste une pastille de plus en tête de
 * message, et une décision à prendre pour dire « on répète jeudi ? ». Un
 * groupe de deux musiciens n'a pas besoin d'un classeur.
 *
 * Ce qui NE change PAS : le type reste dans la donnée (`BandMessage.kind`) et
 * les messages DÉJÀ envoyés gardent leur pastille — 🥁 et 🎤 continuent donc
 * de s'afficher dans l'historique du groupe. On retire un choix à faire, pas
 * une donnée déjà écrite : la table est partagée avec les autres membres, qui
 * ne mettront pas tous leur app à jour le même jour.
 */

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
  if (diff <= 0) return t("Aujourd'hui");
  if (diff === 1) return t('Hier');
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
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [myId, setMyId] = useState('');
  const cloudIdRef = useRef(band?.cloudId ?? '');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const author = prefs.userName || artist.name || t('Moi');
  const { markMessagesSeen } = useNotifications();

  const load = useCallback(async () => {
    if (!band) return;
    try {
      const s = await getValidSession();
      if (!s) {
        setError(
          t(
            "Connecte-toi (Profil artiste → Mon compte) pour accéder à l'espace du groupe.",
          ),
        );
        return;
      }
      setMyId(s.userId);
      // Groupe pas encore publié dans le cloud : on le publie (créateur)
      if (cloudIdRef.current === '') {
        const ref = await ensureCloudBand(s, band.id, band.name);
        cloudIdRef.current = ref.cloudId;
        saveBand({ ...band, cloudId: ref.cloudId, owned: true });
      }
      setMessages(await fetchBandMessages(s, cloudIdRef.current));
      // Ouvrir/consulter la discussion = fil lu : on efface le compteur.
      markMessagesSeen(cloudIdRef.current);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Chargement impossible.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band?.id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => window.clearInterval(timer);
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
      if (!s) throw new Error(t('Connexion requise.'));
      await postBandMessage(s, cloudIdRef.current, {
        author,
        kind: 'message',
        text: text.trim(),
      });
      setText('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("L'envoi a échoué."));
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
      if (!s) throw new Error(t('Connexion requise.'));
      if (cloudIdRef.current === '') {
        const ref = await ensureCloudBand(s, band.id, band.name);
        cloudIdRef.current = ref.cloudId;
        saveBand({ ...band, cloudId: ref.cloudId, owned: true });
      }
      // Associe la chanson au groupe (version dédiée) si ce n'est pas déjà
      // fait, sans changer la version affichée du morceau. La synchro du
      // répertoire partagé la propage ensuite à tous les membres.
      if (!versionForBand(song, band.id)) {
        const prev = song.activeVersionId;
        saveSong(
          switchVersion(
            duplicateVersion(song, band.name || t('Groupe'), band.id),
            prev,
          ),
        );
        clearBandRemoval(band.id, songKey(song.title, song.artist));
      }
      // Annonce dans le fil : visible par tout le groupe.
      await postBandMessage(s, cloudIdRef.current, {
        author,
        kind: 'chanson',
        text: `${song.title || t('(sans titre)')}${
          song.artist !== '' ? ` — ${song.artist}` : ''
        }`,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('La proposition a échoué.'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(m: BandMessage) {
    if (!confirm(t('Supprimer ce message ?'))) return;
    try {
      const s = await getValidSession();
      if (!s) return;
      await deleteBandMessage(s, m.id);
      setMessages((prev) => (prev ?? []).filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Suppression impossible.'));
    }
  }

  if (!band) {
    return (
      <>
        <TopBar
          live={false}
          title={t('Espace du groupe')}
          onBack={() => navigate('/bands')}
        />
        <div className="page">
          <p className="help">{t("Ce groupe n'existe plus.")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        live={false}
        title={`💬 ${band.name || t('Espace du groupe')}`}
        onBack={() => navigate(`/band/${band.id}`)}
      />
      <div className="page">
        <CoachMark
          id="chat-propose"
          text={t(
            "Propose un morceau 🎵 — un bouton l'importera directement pour tout le groupe.",
          )}
        />
        {messages === null && error === null && (
          <p className="help" style={{ textAlign: 'center' }}>
            {t("Ouverture de l'espace du groupe…")}
          </p>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)' }}>
            {error}
          </div>
        )}
        {messages !== null && messages.length === 0 && (
          <p className="help" style={{ textAlign: 'center' }}>
            {t(
              'Premier message à écrire ! Propose un morceau 🎵, une date de répét 🥁, un plan de concert 🎤 — tout le groupe le verra.',
            )}
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
                    {m.author || t('Musicien')}
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
                      title={t('Supprimer ce message')}
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
                  <ChezMoi text={m.text} bandId={id} />
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
          title={t(
            "Choisir un morceau de ton répertoire et l'ajouter au répertoire du groupe",
          )}
        >
          🎵 {t('Proposer un morceau de mon répertoire')}
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('Ton message au groupe…')}
          style={{ minHeight: 70 }}
        />
        <button
          className="btn block"
          onClick={() => void onSend()}
          disabled={text.trim() === '' || busy}
        >
          {busy ? t('Envoi…') : t('Envoyer')}
        </button>
        <p className="help" style={{ textAlign: 'center' }}>
          {t(
            'Visible par tous les membres du groupe. Actualisé automatiquement.',
          )}
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
    <Modal title={t('Proposer un morceau au groupe')} onClose={onClose}>
      <p className="help">
        {t(
          'Choisis un morceau de ton répertoire : il rejoint le répertoire du groupe et tout le monde en est informé.',
        )}
      </p>
      <input
        type="text"
        placeholder={t('Rechercher dans mon répertoire…')}
        value={q}
        /* Pas d'autoFocus (b269) : même écran, même raison — la liste des
           morceaux est ce qu'on est venu voir. */
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="spacer" />
      {list.length === 0 ? (
        <p className="help">
          {songs.some((s) => s.idea !== true)
            ? t('Aucun morceau ne correspond à ta recherche.')
            : t("Ton répertoire est vide — ajoute d'abord un morceau.")}
        </p>
      ) : (
        <div className="list">
          {list.map((s) => {
            const already = versionForBand(s, bandId) !== null;
            return (
              <div className="row" key={s.id} onClick={() => onPick(s)}>
                <div className="grow">
                  <div className="title">{s.title || t('(sans titre)')}</div>
                  <div className="sub">
                    {[s.artist, s.key].filter((x) => x !== '').join(' · ') || ' '}
                  </div>
                </div>
                {already ? (
                  <span
                    style={{ color: 'var(--accent)', fontWeight: 700 }}
                    title={t('Déjà dans le répertoire du groupe')}
                  >
                    ✓ {t('Déjà proposée')}
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
        {t('Fermer')}
      </button>
    </Modal>
  );
}

/**
 * « Et chez moi, elle est où ? » (b184).
 *
 * L'annonce disait seulement « Ajoutée au répertoire du groupe ». Vincent
 * cherchait la partition de Marco dans ses Idées et ne la trouvait pas —
 * pour une bonne raison : il avait DÉJÀ ce morceau, la partition de Marco
 * était donc devenue une VERSION de groupe sur le sien. C'est le bon
 * comportement, mais rien ne le disait. Ici, l'annonce se termine par où la
 * partition a atterri, et par le geste pour y aller.
 */
function ChezMoi({ text, bandId }: { text: string; bandId: string }) {
  const { songs } = useStore();
  // L'annonce est écrite « Titre — Artiste » (voir announceBandSong).
  const [titre, artiste] = text.split(' — ');
  const mien = findSameSong(songs, (titre ?? '').trim(), '', (artiste ?? '').trim());
  if (!mien) {
    return (
      <div className="help" style={{ marginTop: 4 }}>
        {t('Ajoutée au répertoire du groupe — elle arrivera dans tes Idées.')}
      </div>
    );
  }
  const surMonMorceau = versionForBand(mien, bandId) !== null;
  return (
    <div style={{ marginTop: 4 }}>
      <div className="help">
        {mien.idea === true
          ? t('Ajoutée au répertoire du groupe — elle t’attend dans tes Idées.')
          : surMonMorceau
            ? t(
                'Ajoutée au répertoire du groupe — tu avais déjà ce morceau : c’est une version de plus dessus.',
              )
            : t('Ajoutée au répertoire du groupe — tu as déjà ce morceau.')}
      </div>
      <button
        className="btn ghost small"
        style={{ marginTop: 6 }}
        onClick={() => navigate(`/song/${mien.id}`)}
      >
        🎵 {t('Voir dans ma bibliothèque')}
      </button>
    </div>
  );
}
