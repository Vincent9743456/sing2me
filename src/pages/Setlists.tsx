/**
 * Onglet Setlists : les setlists rangées par contexte — un encart par
 * groupe, un encart Solo, et un encart « IA » qui compose une setlist en
 * un clic selon le type de soirée. Vue synthétique au clic.
 */
import React, { useEffect, useState } from 'react';

import { LiveBanner } from '../components/LiveBanner';
import { ConfirmSheet } from '../components/Feedback';
import { Empty, Field, Modal, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { creatorMember, versionForBand } from '../lib/model';
import { generateSetlistAI, repertoireForContext } from '../lib/setlistAI';
import { getValidSession } from '../lib/auth';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptyBand,
  emptySetlist,
  formatDuration,
  makeId,
  Setlist,
  Song,
  songSeconds,
} from '../types';

/** Couleurs des pastilles de groupe (tokens --band-*, stables par ordre). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

/** Suggestions de types de soirée pour la génération IA. */
const PARTY_PRESETS = [
  'Entre potes',
  'Bœuf / jam',
  'Concert',
  'Bar / restau',
  'Mariage',
  'Anniversaire',
];

export function Setlists() {
  const {
    setlists,
    songs,
    bands,
    artist,
    prefs,
    concerts,
    saveSetlist,
    deleteSetlist,
    removeSetlistFromBand,
    saveBand,
  } = useStore();
  // E5 : la setlist du prochain concert (date la plus proche) est mise en avant.
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextConcertSetlistId =
    [...concerts]
      .filter((c) => (c.setlistId ?? '') !== '' && c.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.setlistId ?? '';
  // Capsules dépliées (par clé : id de groupe, '' pour Solo, 'ai' pour l'IA).
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  // Suppression : confirmée par une feuille (jamais confirm() natif).
  const [confirmDel, setConfirmDel] = useState<Setlist | null>(null);
  // Mon compte : pour savoir de quelles setlists je suis l'auteur (b146).
  const [myId, setMyId] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (s && !cancelled) setMyId(s.userId);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /**
   * Qui peut retirer cette setlist ? Son auteur. Une setlist SOLO est
   * toujours la mienne ; une setlist de groupe sans auteur connu (créée
   * avant b146) reste supprimable par chacun — on ne bloque pas
   * l'existant.
   */
  const canDelete = (sl: Setlist) =>
    (sl.bandId ?? '') === '' ||
    (sl.createdBy ?? '') === '' ||
    (myId !== '' && sl.createdBy === myId);
  const [newName, setNewName] = useState('');
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const songById = new Map(songs.map((s) => [s.id, s]));

  // Durée « jouée » (hors réserve), estimée à 5 min si non renseignée.
  const playedInfo = (sl: Setlist) => {
    const played = sl.items.filter((it) => it.reserve !== true);
    const sec = played.reduce(
      (sum, it) => sum + songSeconds(songById.get(it.songId)),
      0,
    );
    const estimated = played.some(
      (it) => (songById.get(it.songId)?.durationSec ?? 0) <= 0,
    );
    const reserve = sl.items.length - played.length;
    return { count: played.length, sec, estimated, reserve };
  };

  const byBand = (bandId: string) =>
    [...setlists]
      .filter((s) => (s.bandId ?? '') === bandId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const setlistRow = (sl: Setlist) => {
    const info = playedInfo(sl);
    return (
      <div
        className="row"
        key={sl.id}
        onClick={() => navigate(`/setlist/${sl.id}`)}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="title">
            {sl.name || '(sans nom)'}
            {sl.id === nextConcertSetlistId && (
              <span className="badge-next">Prochain concert</span>
            )}
          </div>
          <div
            className="sub"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[
              // Auteur rappelé quand ce n'est pas moi (b147) : on sait à
              // qui appartient une setlist partagée.
              !canDelete(sl) && (sl.createdByName ?? '') !== ''
                ? `de ${sl.createdByName}`
                : '',
              `${info.count} morceau${info.count > 1 ? 'x' : ''}`,
              info.sec > 0 ? `${info.estimated ? '≈ ' : ''}${formatDuration(info.sec)}` : '',
              info.reserve > 0 ? `${info.reserve} en réserve` : '',
              sl.partyType && sl.partyType.trim() !== '' ? sl.partyType : '',
              sl.comment,
            ]
              .filter((x) => x !== undefined && x !== '')
              .join(' · ')}
          </div>
        </div>
        {sl.items.length > 0 && (
          <>
            <button
              className="btn ghost small"
              title="Régie (chanteur sans partition)"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/remote/${sl.id}`);
              }}
            >
              <Icon name="sliders" size={16} />
            </button>
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/stage/${sl.id}`);
              }}
            >
              <Icon name="play" size={13} /> Scène
            </button>
          </>
        )}
        {/* Retirer une setlist : réservé à son auteur quand elle est
            partagée avec un groupe (b146). */}
        {canDelete(sl) && (
          <button
            className="btn icon"
            style={{ color: 'var(--danger)', flexShrink: 0 }}
            title="Supprimer cette setlist"
            aria-label="Supprimer cette setlist"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDel(sl);
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>
    );
  };

  /** Crée une setlist dans ce contexte et l'ouvre directement (éditable). */
  /**
   * Ouvre l'éditeur d'une NOUVELLE setlist — sans rien enregistrer (b146).
   * Avant, la setlist était créée aussitôt : revenir en arrière sans rien
   * saisir laissait une coquille « (sans nom) · 0 morceau », qui partait
   * ensuite en synchro chez tous les membres du groupe. Elle n'existe
   * désormais qu'à la première saisie réelle (nom, morceau…).
   */
  function createSetlist(newBandId: string, context = '') {
    try {
      sessionStorage.setItem('sing2me/newSetlistBand', newBandId);
      sessionStorage.setItem('sing2me/newSetlistContext', context);
    } catch {
      /* stockage indisponible : le contexte sera simplement à re-choisir */
    }
    navigate('/setlist/new');
  }

  /** Crée un nouveau groupe (auto-créé) puis une setlist dedans. */
  function createInNewBand(name: string) {
    const b = {
      ...emptyBand(),
      name: name.trim(),
      owned: true,
      members: [creatorMember(artist, prefs.userName)],
    };
    saveBand(b);
    setCreateOpen(false);
    createSetlist(b.id);
  }

  /** Pastille de la capsule : photo si dispo, sinon emoji sur fond coloré. */
  const capAvatar = (photo: string, fallback: string, color: string) =>
    photo !== '' ? (
      <img
        src={photo}
        alt=""
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    ) : (
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.3rem',
          flexShrink: 0,
        }}
      >
        {fallback}
      </span>
    );

  /** Une capsule : repliée par défaut, dépliable au clic. */
  const capsule = (
    key: string,
    name: string,
    avatar: React.ReactNode,
    list: Setlist[],
    onCreate: () => void,
  ) => {
    const isOpen = open.has(key);
    return (
      <div className={`stgroup ${isOpen ? 'open' : ''}`} key={key || 'solo'}>
        <button className="capsule-head" onClick={() => toggle(key)}>
          {avatar}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="capsule-title">{name}</div>
            <div className="capsule-count">
              {list.length} setlist{list.length > 1 ? 's' : ''}
            </div>
          </div>
          <span className={`capsule-chevron ${isOpen ? 'open' : ''}`}>
            <Icon name="chevron-down" size={18} />
          </span>
        </button>
        {isOpen && (
          <div className="list capsule-body">
            {list.map(setlistRow)}
            <div className="row createcard" onClick={onCreate}>
              <Icon name="plus" size={16} /> Créer une setlist
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Plus de raccourci « satellite » manuel (décision Vincent) : quand le
          leader passe ON AIR, la bannière LiveBanner invite les membres. */}
      <TopBar title="Setlists" />
      <div className="page">
        <LiveBanner />
        {setlists.length === 0 && (
          <Empty>
            <div
              style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}
            >
              Ta première setlist
            </div>
            Crée ta première setlist pour ton prochain concert — tu glisseras
            tes morceaux dans l’ordre.
            <div className="spacer" />
            <button className="btn" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={16} /> Créer une setlist
            </button>
          </Empty>
        )}

        {/* Solo toujours en premier (setlists solo, hors capsules de contexte). */}
        {capsule(
          '',
          `Solo${artist.name !== '' ? ` — ${artist.name}` : ''}`,
          capAvatar(artist.photo ?? '', '🎤', 'var(--surface-high)'),
          setlists.filter(
            (s) => (s.bandId ?? '') === '' && (s.context ?? '') === '',
          ),
          () => createSetlist(''),
        )}

        {bands.map((b, i) =>
          capsule(
            b.id,
            b.name || 'Groupe sans nom',
            capAvatar(
              b.photo ?? '',
              '👥',
              BAND_COLORS[i % BAND_COLORS.length],
            ),
            byBand(b.id),
            () => createSetlist(b.id),
          ),
        )}

        {/* Capsules contextuelles (ex. « Soirée entre amis ») : solo + label. */}
        {[
          ...new Set(
            setlists
              .filter((s) => (s.bandId ?? '') === '' && (s.context ?? '') !== '')
              .map((s) => s.context as string),
          ),
        ]
          .sort((a, b) => a.localeCompare(b, 'fr'))
          .map((ctx) =>
            capsule(
              `ctx:${ctx}`,
              ctx,
              capAvatar('', '🎉', 'var(--surface-high)'),
              setlists.filter(
                (s) => (s.bandId ?? '') === '' && s.context === ctx,
              ),
              () => createSetlist('', ctx),
            ),
          )}

        {/* Capsule IA : dépliable comme les autres — même style (l'icône ✨
            suffit à la distinguer, sans bordure ni fond orange). */}
        <div className={`stgroup ${open.has('ai') ? 'open' : ''}`}>
          <button className="capsule-head" onClick={() => toggle('ai')}>
            <span className="capsule-ai-badge" aria-hidden="true">
              ✨
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="capsule-title">Setlist par l'IA</div>
              <div className="capsule-count">
                Une setlist proposée selon l'ambiance
              </div>
            </div>
            <span className={`capsule-chevron ${open.has('ai') ? 'open' : ''}`}>
              <Icon name="chevron-down" size={18} />
            </span>
          </button>
          {open.has('ai') && (
            <div className="capsule-body">
              <AiSetlistCard
                songs={songs}
                bands={bands}
                onCreated={(sl) => {
                  saveSetlist(sl);
                  navigate(`/setlist/${sl.id}`);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Action principale unique, au même endroit que « Nouveau morceau »
          dans l'onglet Morceaux (bas droite). */}
      <button className="btn libfab" onClick={() => setCreateOpen(true)}>
        <Icon name="plus" size={17} /> Créer une setlist
      </button>

      {confirmDel && (
        <ConfirmSheet
          title={`Supprimer « ${confirmDel.name || 'cette setlist'} » ?`}
          message={
            (confirmDel.bandId ?? '') !== ''
              ? 'Elle disparaîtra pour tous les membres du groupe. Tu la garderas dans tes setlists, simplement détachée du groupe.'
              : 'Les morceaux restent dans ta bibliothèque — seule la setlist disparaît.'
          }
          confirmLabel="Supprimer"
          danger
          onConfirm={() => {
            if ((confirmDel.bandId ?? '') !== '') {
              removeSetlistFromBand(confirmDel.id);
            } else {
              deleteSetlist(confirmDel.id);
            }
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {createOpen && (
        <Modal
          title="Créer une setlist"
          onClose={() => {
            setCreateOpen(false);
            setNewName('');
          }}
        >
          <p className="help" style={{ marginTop: 0 }}>
            Dans quelle capsule ? Choisis-en une existante, ou crée-en une
            nouvelle plus bas.
          </p>
          <div
            className="row"
            onClick={() => {
              setCreateOpen(false);
              createSetlist('');
            }}
          >
            {capAvatar(artist.photo ?? '', '🎤', 'var(--surface-high)')}
            <div className="grow" style={{ marginLeft: 10 }}>
              <div className="title">
                Solo{artist.name !== '' ? ` — ${artist.name}` : ''}
              </div>
            </div>
            <span className="chevron">
              <Icon name="plus" size={16} />
            </span>
          </div>
          {bands.map((b, i) => (
            <div
              className="row"
              key={b.id}
              onClick={() => {
                setCreateOpen(false);
                createSetlist(b.id);
              }}
            >
              {capAvatar(
                b.photo ?? '',
                '👥',
                BAND_COLORS[i % BAND_COLORS.length],
              )}
              <div className="grow" style={{ marginLeft: 10 }}>
                <div className="title">{b.name || 'Groupe sans nom'}</div>
              </div>
              <span className="chevron">
                <Icon name="plus" size={16} />
              </span>
            </div>
          ))}
          {[
            ...new Set(
              setlists
                .filter(
                  (s) => (s.bandId ?? '') === '' && (s.context ?? '') !== '',
                )
                .map((s) => s.context as string),
            ),
          ]
            .sort((a, b) => a.localeCompare(b, 'fr'))
            .map((ctx) => (
              <div
                className="row"
                key={`ctx:${ctx}`}
                onClick={() => {
                  setCreateOpen(false);
                  createSetlist('', ctx);
                }}
              >
                {capAvatar('', '🎉', 'var(--surface-high)')}
                <div className="grow" style={{ marginLeft: 10 }}>
                  <div className="title">{ctx}</div>
                </div>
                <span className="chevron">
                  <Icon name="plus" size={16} />
                </span>
              </div>
            ))}
          <div className="spacer" />
          <Field label="Nouvelle capsule">
            <input
              type="text"
              value={newName}
              placeholder="Nom (un groupe, ou un contexte : « Soirée entre amis »…)"
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <div className="rowactions">
            <button
              className="btn"
              disabled={newName.trim() === ''}
              title="Crée le groupe (tu en es le premier musicien) et une setlist dedans"
              onClick={() => {
                createInNewBand(newName.trim());
                setNewName('');
              }}
            >
              <Icon name="users" size={14} /> Comme groupe
            </button>
            <button
              className="btn ghost"
              disabled={newName.trim() === ''}
              title="Crée une capsule contextuelle (ex. « Soirée entre amis »), sans groupe"
              onClick={() => {
                const ctx = newName.trim();
                setNewName('');
                setCreateOpen(false);
                createSetlist('', ctx);
              }}
            >
              🎉 Comme contexte
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Encart « IA » : compose une setlist selon le type de soirée. */
function AiSetlistCard({
  songs,
  bands,
  onCreated,
}: {
  songs: Song[];
  bands: { id: string; name: string }[];
  onCreated: (sl: Setlist) => void;
}) {
  const [partyType, setPartyType] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [bandId, setBandId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Répertoire disponible pour le contexte choisi (groupe précis ou solo).
  const available = repertoireForContext(songs, bandId).length;
  const contextLabel =
    bandId === ''
      ? 'en solo'
      : bands.find((b) => b.id === bandId)?.name || 'ce groupe';

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { result, songs: lib } = await generateSetlistAI(
        songs,
        partyType.trim(),
        minutes,
        bandId,
      );
      const items = result.order
        .map((idx) => lib[idx])
        .filter((s): s is Song => s != null)
        .map((s) => ({
          id: makeId(),
          songId: s.id,
          note: '',
          keyOverride: '',
          versionId: versionForBand(s, bandId)?.id ?? '',
        }));
      if (items.length === 0) {
        setError("L'IA n'a retenu aucun morceau — réessaie.");
        return;
      }
      onCreated({
        ...emptySetlist(),
        name: result.name || `Setlist ${partyType.trim() || 'IA'}`,
        comment: result.comment,
        bandId,
        partyType: partyType.trim(),
        items,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Génération impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="help" style={{ margin: '2px 0 8px' }}>
        Un ordre proposé selon l'ambiance, dans le répertoire {contextLabel} (
        {available} morceau{available > 1 ? 'x' : ''}).
      </p>
      <div className="chips" style={{ marginBottom: 8 }}>
        {PARTY_PRESETS.map((p) => (
          <button
            key={p}
            className={`chip ${partyType === p ? '' : 'off'}`}
            onClick={() => setPartyType(partyType === p ? '' : p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <input
          type="text"
          value={partyType}
          placeholder="Type de soirée (ou précise…)"
          style={{ flex: 1, minWidth: 160 }}
          onChange={(e) => setPartyType(e.target.value)}
        />
        <label className="help" style={{ margin: 0 }}>
          Durée
          <input
            type="number"
            value={minutes}
            min={5}
            max={300}
            step={5}
            style={{ width: 70, marginLeft: 6, padding: '4px 6px' }}
            onChange={(e) =>
              setMinutes(
                Math.max(5, Math.min(300, parseInt(e.target.value, 10) || 60)),
              )
            }
          />{' '}
          min
        </label>
        {bands.length > 0 && (
          <select
            value={bandId}
            title="Contexte de la setlist (solo ou groupe)"
            style={{ width: 'auto', padding: '4px 6px' }}
            onChange={(e) => setBandId(e.target.value)}
          >
            <option value="">Solo</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || 'Groupe sans nom'}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn"
          disabled={busy || available === 0}
          onClick={() => void generate()}
        >
          {busy ? 'Génération…' : '✨ Générer'}
        </button>
      </div>
      {available === 0 && (
        <p className="help" style={{ marginBottom: 0 }}>
          Aucun morceau {contextLabel} pour l'instant — affecte des morceaux à
          ce répertoire d'abord.
        </p>
      )}
      {error !== '' && (
        <p className="help" style={{ color: 'var(--danger)', marginBottom: 0 }}>
          {error}
        </p>
      )}
    </>
  );
}
