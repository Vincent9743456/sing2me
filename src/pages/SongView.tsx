import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AutoScrollFab, useAutoScroll } from '../components/AutoScroll';
import { useOnAirSetlist, useOnAirSong } from '../components/OnAir';
import { LivePublicSong } from '../lib/live';
import { NoteModal } from '../components/NoteModal';
import { Icon } from '../components/Icon';
import { ShareModal } from '../components/ShareModal';
import { SongBody } from '../components/SongBody';
import { Empty, Field, Modal, TopBar } from '../components/ui';
import {
  semitonesBetween,
  spellingForKey,
  transposeContent,
  transposeKeyName,
} from '../lib/chords';
import {
  activeVersion,
  duplicateVersion,
  notesForBand,
  notesForShare,
  removeVersion,
  switchVersion,
  transposeChordSequence,
  versionForBand,
} from '../lib/model';
import { announceBandSong } from '../lib/bands';
import { stripChords } from '../lib/chordpro';
import { normalizeTitle } from '../lib/importer';
import { applyUgTextToSong, UgUpgradeModal } from '../components/UgUpgrade';
import { AssignSheet } from '../components/SongPicker';
import { CoachMark } from '../components/CoachMark';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptySetlist,
  formatDuration,
  makeId,
  SharePayload,
  Setlist,
  Song,
  SongNote,
  ViewMode,
} from '../types';

/** Couleur de repérage par groupe (identique à la bibliothèque). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

/** « aujourd'hui », « hier », sinon la date courte. */
function relativeDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000,
  );
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  if (diff < 7) return `il y a ${diff} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function SongView({
  id,
  fromSetlist,
}: {
  id: string;
  /** Lecture depuis une setlist : navigation précédent/suivant intégrée */
  fromSetlist?: { setlistId: string; index: number };
}) {
  const {
    songs,
    bands,
    prefs,
    artist,
    saveSong,
    deleteSong,
    setlists,
    saveSetlist,
    recordBandRemoval,
    clearBandRemoval,
    deleteNote,
  } = useStore();

  // Contexte setlist : le morceau vient de l'item courant
  const ctxSetlist = fromSetlist
    ? setlists.find((s) => s.id === fromSetlist.setlistId)
    : undefined;
  const ctxItem = ctxSetlist?.items[fromSetlist?.index ?? -1];
  const song = songs.find((s) => s.id === (ctxItem?.songId ?? id));

  // Vue unique : tout le monde voit la partition en entier.
  const view: ViewMode = 'complete';
  const [shift, setShift] = useState(0);
  const [capo, setCapo] = useState(song?.capo ?? 0);
  // Tonalité/capo choisis en lecture : mémorisés par morceau + version
  // (sur cet appareil), sans modifier la partition elle-même.
  const viewPrefLoaded = useRef(false);
  const inSetlistOverride =
    !!fromSetlist && !!ctxItem && ctxItem.keyOverride !== '';
  useEffect(() => {
    if (!song) return;
    viewPrefLoaded.current = false;
    if (!inSetlistOverride) {
      try {
        const raw = localStorage.getItem(
          `sing2me/viewkey/${song.id}/${song.activeVersionId}`,
        );
        if (raw !== null) {
          const v = JSON.parse(raw) as { shift?: number; capo?: number };
          setShift(typeof v.shift === 'number' ? ((v.shift % 12) + 12) % 12 : 0);
          setCapo(typeof v.capo === 'number' ? v.capo : song.capo);
        } else {
          setShift(0);
          setCapo(song.capo);
        }
      } catch {
        /* stockage indisponible */
      }
    }
    viewPrefLoaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, song?.activeVersionId]);
  useEffect(() => {
    if (!song || !viewPrefLoaded.current || inSetlistOverride) return;
    try {
      const key = `sing2me/viewkey/${song.id}/${song.activeVersionId}`;
      if (shift === 0 && capo === song.capo) {
        localStorage.removeItem(key); // réglages par défaut : rien à retenir
      } else {
        localStorage.setItem(key, JSON.stringify({ shift, capo }));
      }
    } catch {
      /* stockage indisponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, capo]);
  const [fontSize, setFontSize] = useState(1);
  const [share, setShare] = useState<'groupe' | 'public' | null>(null);
  // null = fermé · 'new' = nouvelle note · sinon la note à modifier
  const [noteModal, setNoteModal] = useState<'new' | SongNote | null>(null);
  const [ugUpgrade, setUgUpgrade] = useState(false);
  // Éditeur « Ajouter à un groupe / une setlist » (à la demande).
  const [assocOpen, setAssocOpen] = useState(false);
  const scroll = useAutoScroll(undefined, song?.id);

  // En lecture de setlist : bascule sur la version de l'item, puis
  // applique la tonalité spécifique du concert (keyOverride).
  useEffect(() => {
    if (!fromSetlist || !song || !ctxItem) return;
    const vid = (ctxItem.versionId ?? '') || song.activeVersionId;
    if (vid !== song.activeVersionId) {
      saveSong(switchVersion(song, vid));
      return; // l'effet repassera avec la bonne version en place
    }
    if (ctxItem.keyOverride !== '' && song.key !== '') {
      setShift(((semitonesBetween(song.key, ctxItem.keyOverride) ?? 0) + 12) % 12);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSetlist?.index, song?.activeVersionId]);

  // Modèle tonalité : song.key = tonalité des FORMES écrites (accords posés).
  //   Tonalité réelle (ce qui sonne) = formes + capo.
  //   shift = transposition des formes ; capo = capodastre (choix perso).
  // Vue « réelle » (sans capo) : préférence du musicien (ex. bassiste), locale.
  const [displayReal, setDisplayReal] = useState(
    () => localStorage.getItem('sing2me/showRealKey') === '1',
  );
  function toggleReal() {
    setDisplayReal((v) => {
      const next = !v;
      try {
        localStorage.setItem('sing2me/showRealKey', next ? '1' : '0');
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  }
  const shownShapeKey =
    song && song.key !== '' ? transposeKeyName(song.key, shift) : '';
  const realKeyShown =
    song && song.key !== '' ? transposeKeyName(song.key, shift + capo) : '';
  // Décalage réellement appliqué aux accords affichés : formes seules, ou
  // formes + capo quand on demande la tonalité réelle (sans capo).
  const displayShift = displayReal ? shift + capo : shift;
  const shownKey = displayReal ? realKeyShown : shownShapeKey;
  const preferFlat = spellingForKey(shownKey);

  // Ce que voit le chanteur → publié si la session est active
  // (paroles pour le public, accords pour la vue musicien du QR)
  useOnAirSong(
    song
      ? {
          title: song.title,
          artist: song.artist,
          lyrics: stripChords(song.lyrics),
          chords: song.lyrics,
          chordKey: song.key,
          // Formes affichées (le musicien voit ça) ; la tonalité réelle se
          // déduit avec le capo, côté vue musicien.
          playedKey: shownShapeKey !== '' ? shownShapeKey : song.key,
          capo,
        }
      : null,
    `${shownShapeKey || song?.key || ''}:${capo}`,
  );

  // Lecture d'un morceau DANS une setlist : on diffuse aussi la setlist au
  // public (il peut la parcourir), comme en mode scène.
  const publicSetlist = useMemo<LivePublicSong[] | null>(
    () =>
      ctxSetlist
        ? ctxSetlist.items
            .map((it) => songs.find((s) => s.id === it.songId))
            .filter((s): s is Song => s != null)
            .map((s) => ({
              title: s.title,
              artist: s.artist,
              lyrics: stripChords(s.lyrics),
            }))
        : null,
    [ctxSetlist, songs],
  );
  useOnAirSetlist(publicSetlist);

  const payload = useMemo<SharePayload | null>(() => {
    if (!song || share === null) return null;
    const kind = share === 'groupe' ? 'groupe' : 'public';
    const bandId = activeVersion(song).bandId;
    // On partage en tonalité RÉELLE (ce qui sonne), sans capo : la partition
    // reçue est autonome, chacun remettra le capo qu'il veut.
    const realShift = shift + capo;
    const preferFlatReal = spellingForKey(realKeyShown);
    const baked: Song = {
      ...song,
      key: realKeyShown !== '' ? realKeyShown : song.key,
      capo: 0,
      lyrics: transposeContent(song.lyrics, realShift, preferFlatReal),
      structure: song.structure.map((r) => ({
        ...r,
        chords: transposeChordSequence(r.chords, realShift, preferFlatReal),
        comment: share === 'groupe' ? r.comment : '',
      })),
      versions: [],
      mySetup: undefined,
      idea: undefined,
      noSolo: undefined,
      rehearsalNotes: notesForShare(
        notesForBand(song.rehearsalNotes, bandId),
        kind,
      ),
    };
    return {
      v: 1,
      type: 'song',
      view: share === 'groupe' ? 'complete' : 'paroles',
      song: baked,
    };
  }, [song, share, shift, capo, realKeyShown]);

  if (!song) {
    return (
      <>
        <TopBar title="Morceau" onBack={() => navigate('/')} />
        <Empty>Ce morceau n'existe plus.</Empty>
      </>
    );
  }

  const current = activeVersion(song);
  const showTranspose = view === 'complete' || view === 'accords';
  // Notes du contexte courant : solo/tous + celles du groupe de la version
  const contextNotes = notesForBand(song.rehearsalNotes, current.bandId);
  // Journal : la note la plus récente en premier
  const allNotes = [...contextNotes].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
  const showNotes = view === 'complete' || view === 'structure';
  const bandName = (bid: string) =>
    bands.find((b) => b.id === bid)?.name ?? '';

  function onVersionChange(value: string) {
    if (!song) return;
    if (value === '__new__') {
      const name = prompt(
        'Nom de la nouvelle version (ex. Acoustique, Groupe Xyz…)',
        `Version ${song.versions.length + 1}`,
      );
      if (name === null) return;
      saveSong(duplicateVersion(song, name));
    } else if (value.startsWith('__band__:')) {
      // Crée en un clic la version dédiée à ce groupe (copie de l'actuelle)
      const bid = value.slice('__band__:'.length);
      const b = bands.find((x) => x.id === bid);
      saveSong(duplicateVersion(song, b?.name ?? 'Groupe', bid));
      // Le groupe est informé (best-effort si publié + connecté)
      void announceBandSong(
        b?.cloudId,
        prefs.userName || artist.name || 'Moi',
        song.title,
        song.artist,
      );
    } else {
      saveSong(switchVersion(song, value));
    }
    setShift(0);
  }

  const bandsWithoutVersion = bands.filter(
    (b) => !song.versions.some((v) => v.bandId === b.id),
  );
  // Appartenances actuelles (pour l'état compact).
  const memberBands = bands.filter((b) => versionForBand(song, b.id) !== null);
  const memberSetlists = setlists.filter((sl) =>
    sl.items.some((it) => it.songId === song.id),
  );

  /** Applique une partition UG mieux notée : remplace ou nouvelle version. */
  function applyUgTab(text: string, mode: 'replace' | 'version') {
    if (!song) return;
    saveSong(applyUgTextToSong(song, text, mode));
    setUgUpgrade(false);
    setShift(0);
  }

  return (
    <>
      <TopBar
        title={
          ctxSetlist
            ? `${song.title || '(sans titre)'} · ${ctxSetlist.name || 'Setlist'}`
            : song.title || '(sans titre)'
        }
        onBack={() =>
          ctxSetlist ? navigate(`/setlist/${ctxSetlist.id}`) : navigate('/')
        }
        right={
          <>
            <button
              className="btn small"
              title={
                ctxSetlist
                  ? 'Mode scène — la setlist entière (le public peut la suivre)'
                  : 'Mode scène (plein écran)'
              }
              onClick={() =>
                navigate(
                  ctxSetlist
                    ? `/stage/${ctxSetlist.id}`
                    : `/stage/song/${song.id}`,
                )
              }
            >
              <Icon name="play" size={14} /> Scène
            </button>
            <button
              className="btn ghost small"
              title="Modifier la partition (paroles, accords, structure…)"
              onClick={() => navigate(`/song/${song.id}/edit`)}
            >
              <Icon name="edit" size={15} /> Modifier
            </button>
          </>
        }
      />
      <div className="page">
        {song.idea === true && (
          <div
            className="card"
            style={{
              borderColor: 'var(--accent-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1 }}>
              💡 <strong>Idée à travailler</strong>
              <br />
              <span className="help">
                Jouable partout, mais pas encore validée dans ta bibliothèque.
              </span>
            </span>
            <button
              className="btn small"
              onClick={() => saveSong({ ...song, idea: undefined })}
            >
              ✓ Valider dans la bibliothèque
            </button>
          </div>
        )}
        <div className="songmeta chips">
          {song.artist !== '' &&
            song.artist.trim().toLowerCase() !==
              (artist.name ?? '').trim().toLowerCase() && (
              <span className="chip static off">{song.artist}</span>
            )}
          {song.tempo > 0 && <span className="chip static">{song.tempo} BPM</span>}
          {song.durationSec > 0 && (
            <span className="chip static">{formatDuration(song.durationSec)}</span>
          )}
          {song.tags.map((t) => (
            <span className="chip static off" key={t}>
              {t}
            </span>
          ))}
          <button
            className={`chip ${song.noSolo === true ? 'off' : ''}`}
            title={
              song.noSolo === true
                ? 'Déqualifié du répertoire solo — cliquer pour le requalifier'
                : 'Jouable en solo (par défaut) — cliquer pour le déqualifier si tu ne peux pas le jouer seul'
            }
            onClick={() =>
              saveSong({
                ...song,
                noSolo: song.noSolo === true ? undefined : true,
              })
            }
          >
            <Icon name="mic" size={12} />{' '}
            {song.noSolo === true ? 'Pas en solo' : 'Solo ✓'}
          </button>
          {song.hearts > 0 && (
            <span className="chip static" style={{ color: 'var(--heart)' }}>
              ❤ {song.hearts}
            </span>
          )}
        </div>

        {/* Appartenances : état compact (où le morceau EST) + éditeur à la
            demande pour l'ajouter/retirer d'un groupe ou d'une setlist. */}
        <div
          className="hstack"
          style={{
            marginBottom: 8,
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span className="help">Dans :</span>
          {memberBands.length === 0 && memberSetlists.length === 0 && (
            <span className="help" style={{ margin: 0 }}>
              aucun groupe ni setlist
            </span>
          )}
          {memberBands.map((b) => (
            <span key={b.id} className="chip static">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    BAND_COLORS[
                      bands.findIndex((x) => x.id === b.id) % BAND_COLORS.length
                    ],
                  marginRight: 4,
                }}
              />
              {b.name || 'Groupe sans nom'}
            </span>
          ))}
          {memberSetlists.map((sl) => (
            <span key={sl.id} className="chip static">
              {sl.name || '(sans nom)'}
            </span>
          ))}
          <button
            className="chip off"
            title="Ajouter ce morceau à un groupe ou une setlist"
            onClick={() => setAssocOpen(true)}
          >
            ＋ Ajouter à…
          </button>
        </div>

        <CoachMark
          id="song-transpose"
          text="Change la tonalité ou le capo ici — tout se transpose."
        />
        <div className="versionbar">
          {/* Le sélecteur de version n'apparaît qu'à partir de 2 versions
              (Lot D : un morceau simple n'affiche aucune notion de version). */}
          {song.versions.length >= 2 && (
            <>
              <span className="lbl help">Version :</span>
              <select
                value={current.id}
                onChange={(e) => onVersionChange(e.target.value)}
              >
                {song.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.bandId !== '' && bandName(v.bandId) !== ''
                      ? ` · ${bandName(v.bandId)}`
                      : ''}
                    {v.key !== '' ? ` (${v.key})` : ''}
                  </option>
                ))}
                {bandsWithoutVersion.map((b) => (
                  <option key={`__band__:${b.id}`} value={`__band__:${b.id}`}>
                    ＋ Version pour {b.name || 'groupe sans nom'}
                  </option>
                ))}
                <option value="__new__">＋ Nouvelle version…</option>
              </select>
            </>
          )}
          <button
            className="btn ai small"
            title="Sing2Me cherche la version la mieux notée de cette partition et te la propose"
            onClick={() => setUgUpgrade(true)}
          >
            ★ Meilleure version ?
          </button>
          {song.versions.length > 1 && (
            <>
              <button
                className="btn ghost small"
                style={{ color: 'var(--danger)' }}
                onClick={() => {
                  const inBand = (current.bandId ?? '') !== '';
                  if (
                    confirm(
                      inBand
                        ? `Supprimer la version « ${current.name} » ? Le ` +
                            'morceau sortira aussi du répertoire du groupe ' +
                            'pour tous les membres (chacun garde sa ' +
                            'partition personnelle).'
                        : `Supprimer la version « ${current.name} » ?`,
                    )
                  ) {
                    if (inBand) {
                      recordBandRemoval(
                        current.bandId,
                        normalizeTitle(song.title),
                      );
                    }
                    saveSong(removeVersion(song, current.id));
                  }
                }}
              >
                Supprimer cette version
              </button>
            </>
          )}
        </div>

        {ugUpgrade && (
          <UgUpgradeModal
            song={song}
            onApply={applyUgTab}
            onClose={() => setUgUpgrade(false)}
          />
        )}

        {assocOpen && (
          <AssignSheet songId={song.id} onClose={() => setAssocOpen(false)} />
        )}


        {showTranspose && (
          <div className="transpose">
            {/* Chaque bloc « libellé + molette » est insécable : Transposer et
                Capo restent groupés ; si la place manque, Capo passe à la
                ligne en entier (une 2ᵉ ligne qui commence par « Capo »). */}
            <span className="transpose-unit">
              <span className="lbl">Transposer</span>
              <div className="stepper">
                <button
                  title="Accords plus bas (capo +1) — la tonalité réelle ne change pas"
                  onClick={() => {
                    setShift((s) => s - 1);
                    setCapo((c) => Math.min(11, c + 1));
                  }}
                >
                  ♭
                </button>
                <span>
                  {shownKey !== ''
                    ? shownKey
                    : shift === 0
                      ? '—'
                      : `${shift > 6 ? shift - 12 : shift} ½t`}
                </span>
                <button
                  title="Accords plus haut (capo −1)"
                  onClick={() => {
                    setShift((s) => s + 1);
                    if (capo > 0) setCapo((c) => c - 1);
                  }}
                >
                  ♯
                </button>
              </div>
            </span>
            {!displayReal && (
              <span className="transpose-unit">
                <span className="lbl">Capo</span>
                <div className="stepper">
                  <button
                    title="Le capo change ce qui sonne, pas les accords affichés"
                    onClick={() => setCapo((c) => Math.max(0, c - 1))}
                  >
                    −
                  </button>
                  <span>{capo}</span>
                  <button onClick={() => setCapo((c) => Math.min(11, c + 1))}>
                    ＋
                  </button>
                </div>
              </span>
            )}
            {realKeyShown !== '' && (
              <span
                className="help"
                style={{ margin: 0, whiteSpace: 'nowrap' }}
              >
                🔊 sonne en{' '}
                <strong style={{ color: 'var(--text)' }}>{realKeyShown}</strong>
              </span>
            )}
            {/* Une seule fonction « musicien » : afficher les accords à jouer
                sans capo (pratique pour la basse / la tonalité réelle). */}
            <button
              className="btn ghost small"
              style={displayReal ? { color: 'var(--accent)' } : undefined}
              title="Afficher les accords tels qu'ils doivent être joués sans capo — pratique pour la basse"
              onClick={toggleReal}
            >
              {displayReal ? '✓ Accords sans capo' : 'Accords sans capo'}
            </button>
            {(shift !== 0 || capo !== song.capo) && (
              <button
                className="btn ghost small"
                onClick={() => {
                  setShift(0);
                  setCapo(song.capo);
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {view === 'complete' && !displayReal && capo > 0 && realKeyShown !== '' && (
          <p className="help" style={{ marginTop: -8 }}>
            🎸 Capo {capo} : tu joues des formes de {shownShapeKey} — ça sonne
            en {realKeyShown}.
          </p>
        )}

        <SongBody
          song={{ ...song, rehearsalNotes: contextNotes }}
          view={view}
          semitones={displayShift}
          capo={0}
          preferFlat={preferFlat}
          fontSize={fontSize}
        />

        <div className="rowactions">
          <button className="btn" onClick={() => navigate(`/stage/song/${song.id}`)}>
            <Icon name="play" size={14} /> Scène
          </button>
          <button
            className="btn ghost"
            onClick={() => setFontSize((f) => Math.max(0.8, +(f - 0.1).toFixed(2)))}
          >
            A−
          </button>
          <button
            className="btn ghost"
            onClick={() => setFontSize((f) => Math.min(1.8, +(f + 0.1).toFixed(2)))}
          >
            A＋
          </button>
        </div>

        {showNotes && (
          <div className="notesbox">
            <div className="label" style={{ display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>
                Notes de répétition
                {current.bandId !== '' && bandName(current.bandId) !== ''
                  ? ` · contexte ${bandName(current.bandId)}`
                  : ' · solo / tous'}
              </span>
              <button
                className="btn ghost small"
                onClick={() => setNoteModal('new')}
              >
                ＋ Note
              </button>
            </div>
            {allNotes.length === 0 && (
              <p className="help" style={{ margin: 0 }}>
                Le journal du travail sur ce morceau : datées, signées,
                partagées au groupe ou personnelles. Dictée vocale 🎤.
              </p>
            )}
            {allNotes.map((n) => (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{ flex: 1, cursor: 'pointer' }}
                  title="Modifier la note"
                  onClick={() => setNoteModal(n)}
                >
                  <Icon name={n.visibility === 'privee' ? 'lock' : 'message'} size={13} />{' '}
                  {n.target !== '' ? `${n.target} : ` : ''}
                  {n.text}
                  {n.author !== '' && (
                    <em className="stauthor"> — {n.author}</em>
                  )}
                  <em className="stauthor"> · {relativeDay(n.createdAt)}</em>
                </span>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title="Supprimer la note (pour tout le monde)"
                  onClick={() => deleteNote(song.id, n.id)}
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showNotes && song.fanMessages.length > 0 && (
          <div className="notesbox" style={{ borderLeftColor: 'var(--heart)' }}>
            <div className="label">💬 Messages du public ({song.fanMessages.length})</div>
            {[...song.fanMessages]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((m) => (
                <div
                  key={m.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}
                >
                  <span style={{ flex: 1 }}>
                    « {m.text} »
                    <span className="stauthor">
                      {' '}
                      — {m.author !== '' ? m.author : 'anonyme'} ·{' '}
                      {new Date(m.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <button
                    className="btn ghost small"
                    style={{ color: 'var(--danger)' }}
                    title="Retirer ce message"
                    onClick={() =>
                      saveSong({
                        ...song,
                        fanMessages: song.fanMessages.filter((x) => x.id !== m.id),
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Réglages personnels du musicien : locaux, jamais partagés */}
        <details className="stfold">
          <summary>
            Mes réglages perso
            {song.mySetup?.instrument
              ? ` — ${song.mySetup.instrument}`
              : ''}
          </summary>
          <div className="spacer" />
          <Field label="Instrument joué sur ce morceau">
            <input
              type="text"
              value={song.mySetup?.instrument ?? ''}
              placeholder="Congas, cajon, guitare électro…"
              onChange={(e) =>
                saveSong({
                  ...song,
                  mySetup: {
                    instrument: e.target.value,
                    notes: song.mySetup?.notes ?? '',
                  },
                })
              }
            />
          </Field>
          <Field label="Réglages (ampli, effets, retours…)">
            <textarea
              value={song.mySetup?.notes ?? ''}
              placeholder={'Drive canal 2, delay 320 ms\nRetour : voix + claviers'}
              onChange={(e) =>
                saveSong({
                  ...song,
                  mySetup: {
                    instrument: song.mySetup?.instrument ?? '',
                    notes: e.target.value,
                  },
                })
              }
            />
          </Field>
          <p className="help">
            Personnel : visible uniquement dans ton application (et affiché en
            mode scène) — jamais inclus dans les partages.
          </p>
        </details>

        <div className="rowactions">
          <button className="btn ghost" onClick={() => setShare('groupe')}>
            <Icon name="users" size={15} /> Partager au groupe
          </button>
          <button className="btn ghost" onClick={() => setShare('public')}>
            <Icon name="mic" size={15} /> Partager au public
          </button>
        </div>
        <p className="help">
          Le partage « groupe » inclut accords, structure et notes partagées
          (jamais les notes 🔒 personnelles) ; le partage « public » ne montre
          que les paroles.
        </p>

        <div className="spacer" />
        <button
          className="btn ghost block"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => {
            if (
              confirm(
                `Supprimer « ${song.title || '(sans titre)'} » ? ` +
                  'Le morceau sera aussi retiré des setlists.',
              )
            ) {
              deleteSong(song.id);
              navigate('/');
            }
          }}
        >
          <Icon name="trash" size={15} /> Supprimer ce morceau
        </button>
      </div>

      {/* Lecture de setlist : précédent / suivant toujours accessibles */}
      {ctxSetlist && fromSetlist && (
        <div className="setnav">
          <button
            className="btn ghost"
            disabled={fromSetlist.index <= 0}
            onClick={() =>
              navigate(`/setlist/${ctxSetlist.id}/song/${fromSetlist.index - 1}`)
            }
          >
            <Icon name="chevron-left" size={16} /> Précédent
          </button>
          <button
            className="btn ghost"
            title="Revenir à la setlist"
            onClick={() => navigate(`/setlist/${ctxSetlist.id}`)}
          >
            <Icon name="list" size={15} /> {fromSetlist.index + 1}/
            {ctxSetlist.items.length}
          </button>
          <button
            className="btn ghost"
            disabled={fromSetlist.index >= ctxSetlist.items.length - 1}
            onClick={() =>
              navigate(`/setlist/${ctxSetlist.id}/song/${fromSetlist.index + 1}`)
            }
          >
            Suivant <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}

      <AutoScrollFab scroll={scroll} />

      {noteModal !== null && (
        <NoteModal
          song={song}
          author={prefs.userName}
          initialBandId={current.bandId}
          existing={noteModal === 'new' ? undefined : noteModal}
          onClose={() => setNoteModal(null)}
          onSave={(note) =>
            saveSong({
              ...song,
              rehearsalNotes:
                noteModal === 'new'
                  ? [...song.rehearsalNotes, note]
                  : song.rehearsalNotes.map((n) =>
                      n.id === note.id ? note : n,
                    ),
            })
          }
        />
      )}

      {share !== null && payload && (
        <ShareModal
          title={
            share === 'groupe'
              ? `Partage groupe — ${song.title}`
              : `Partage public — ${song.title}`
          }
          payload={payload}
          onClose={() => setShare(null)}
        />
      )}
    </>
  );
}
