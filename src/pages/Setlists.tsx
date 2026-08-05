/**
 * Onglet Setlists : les setlists rangées par contexte — un encart par
 * groupe, un encart Solo, et un encart « IA » qui compose une setlist en
 * un clic selon le type de soirée. Vue synthétique au clic.
 */
import React, { useState } from 'react';

import { Empty, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { versionForBand } from '../lib/model';
import { generateSetlistAI, repertoireForContext } from '../lib/setlistAI';
import { navigate } from '../router';
import { useStore } from '../store';
import {
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
  const { setlists, songs, bands, saveSetlist } = useStore();
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
          <div className="title">{sl.name || '(sans nom)'}</div>
          <div
            className="sub"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[
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
      </div>
    );
  };

  /** Un encart : titre (+ pastille) et ses setlists, ou une invite à créer. */
  const groupSection = (
    title: React.ReactNode,
    list: Setlist[],
    newBandId: string,
  ) => (
    <div className="stgroup">
      <div className="stgroup-head">
        <span className="stgroup-title">{title}</span>
        <button
          className="btn ghost small"
          title="Nouvelle setlist dans cet encart"
          onClick={() => {
            // Le contexte (groupe/solo) est transmis à l'éditeur sans
            // créer de setlist vide tant qu'elle n'est pas enregistrée.
            try {
              sessionStorage.setItem('sing2me/newSetlistBand', newBandId);
            } catch {
              /* stockage indisponible */
            }
            navigate('/setlist/new');
          }}
        >
          <Icon name="plus" size={14} /> Nouvelle
        </button>
      </div>
      {list.length === 0 ? (
        <p className="help" style={{ margin: '2px 0 0' }}>
          Aucune setlist pour l'instant.
        </p>
      ) : (
        <div className="list">{list.map(setlistRow)}</div>
      )}
    </div>
  );

  return (
    <>
      <TopBar
        title="Setlists"
        right={
          <button
            className="btn icon"
            title="Suivre le groupe (concert)"
            onClick={() => navigate('/follow')}
          >
            <Icon name="antenna" size={20} />
          </button>
        }
      />
      <div className="page">
        {setlists.length === 0 && bands.length === 0 && (
          <Empty>
            Aucune setlist pour l'instant.
            <br />
            Crée-en une par groupe ou en solo, ou laisse l'IA t'en proposer une
            selon l'ambiance.
          </Empty>
        )}

        {bands.map((b, i) =>
          groupSection(
            <>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: BAND_COLORS[i % BAND_COLORS.length],
                  marginRight: 6,
                  verticalAlign: 'middle',
                }}
              />
              {b.name || 'Groupe sans nom'}
            </>,
            byBand(b.id),
            b.id,
          ),
        )}

        {groupSection(
          <>
            <Icon name="mic" size={14} /> Solo
          </>,
          byBand(''),
          '',
        )}

        <AiSetlistCard
          songs={songs}
          bands={bands}
          onCreated={(sl) => {
            saveSetlist(sl);
            navigate(`/setlist/${sl.id}/edit`);
          }}
        />
      </div>
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
    <div className="stgroup stgroup-ai">
      <div className="stgroup-head">
        <span className="stgroup-title">✨ Setlist par l'IA</span>
      </div>
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
    </div>
  );
}
