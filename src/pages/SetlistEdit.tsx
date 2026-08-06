import React, { useEffect, useMemo, useRef, useState } from 'react';

import { ShareModal } from '../components/ShareModal';
import { gearIcon } from '../components/GearEditor';
import { Icon } from '../components/Icon';
import { SongCollector } from '../components/SongPicker';
import { StagePlan } from '../components/StagePlan';
import { Field, Modal, TopBar } from '../components/ui';
import { announceBandSong } from '../lib/bands';
import { semitonesBetween, spellingForKey, transposeContent, transposeKeyName } from '../lib/chords';
import { normalizeTitle } from '../lib/importer';
import {
  creatorMember,
  duplicateVersion,
  notesForBand,
  notesForShare,
  resolveVersion,
  switchVersion,
  transposeChordSequence,
  versionForBand,
} from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptyBand,
  emptySetlist,
  emptySetup,
  formatDuration,
  makeId,
  Setlist,
  SharePayload,
  Song,
  songSeconds,
  StageSetup,
} from '../types';

export function SetlistEdit({ id }: { id: string | null }) {
  const {
    songs,
    setlists,
    saveSetlist,
    deleteSetlist,
    bands,
    saveBand,
    saveSong,
    clearBandRemoval,
    artist,
    prefs,
  } = useStore();
  const existing = id ? setlists.find((s) => s.id === id) : undefined;
  const [draft, setDraft] = useState<Setlist>(() => {
    if (existing) {
      return { ...existing, items: existing.items.map((x) => ({ ...x })) };
    }
    // Nouvelle setlist : reprendre le contexte (groupe/solo) de l'encart
    // d'où l'on vient, s'il a été transmis.
    const base = emptySetlist();
    try {
      const b = sessionStorage.getItem('sing2me/newSetlistBand');
      if (b !== null) {
        sessionStorage.removeItem('sing2me/newSetlistBand');
        return { ...base, bandId: b };
      }
    } catch {
      /* stockage indisponible */
    }
    return base;
  });
  const [picker, setPicker] = useState(false);
  const [gearPicker, setGearPicker] = useState(false);
  const [share, setShare] = useState<'groupe' | 'public' | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const isNew = existing === undefined;

  // Édition directe : chaque changement est enregistré automatiquement
  // (pas de bouton « Enregistrer »). On saute le tout premier rendu pour
  // ne pas recréer une nouvelle setlist restée vierge.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveSetlist(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const songById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs],
  );

  const bandName = (bid: string) =>
    bands.find((b) => b.id === bid)?.name ?? '';

  // Durées estimées : durée réelle si renseignée, sinon 5 min. On
  // distingue les morceaux joués de ceux « en réserve ».
  const secondsOf = (its: Setlist['items']) =>
    its.reduce((sum, it) => sum + songSeconds(songById.get(it.songId)), 0);
  const playedItems = draft.items.filter((it) => it.reserve !== true);
  const reserveItems = draft.items.filter((it) => it.reserve === true);
  const playedSec = secondsOf(playedItems);
  const hasEstimate = playedItems.some(
    (it) => (songById.get(it.songId)?.durationSec ?? 0) <= 0,
  );

  function update(patch: Partial<Setlist>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  const setup = draft.setup ?? emptySetup();
  function updateSetup(patch: Partial<StageSetup>) {
    setDraft((d) => ({
      ...d,
      setup: { ...(d.setup ?? emptySetup()), ...patch },
    }));
  }

  /** Inventaires disponibles : le mien + ceux des musiciens du groupe. */
  const gearSources = [
    {
      owner: prefs.userName || artist.name || 'Moi',
      items: artist.gear ?? [],
    },
    ...(bands.find((b) => b.id === (draft.bandId ?? ''))?.members ?? []).map(
      (m) => ({ owner: m.name || 'Musicien', items: m.gear ?? [] }),
    ),
  ].filter((s) => s.items.length > 0);

  /** Ajoute / retire un matériel du plan de scène. */
  function toggleGear(gearId: string, name: string, owner: string, category: string) {
    const placed = setup.positions.some((p) => p.id === gearId);
    if (placed) {
      updateSetup({
        positions: setup.positions.filter((p) => p.id !== gearId),
      });
    } else {
      updateSetup({
        positions: [
          ...setup.positions,
          {
            id: gearId,
            label: name,
            instrument: owner,
            x: Math.min(0.9, 0.12 + ((setup.positions.length * 0.16) % 0.76)),
            y: 0.78,
            kind: 'gear' as const,
            category: category as StageSetup['positions'][number]['category'],
          },
        ],
      });
    }
  }

  /** Place d'un coup les musiciens du groupe sur le plan de scène. */
  function seedPositions() {
    const band = bands.find((b) => b.id === (draft.bandId ?? ''));
    const members = band?.members ?? [];
    if (members.length === 0) return;
    const present = new Set(setup.positions.map((p) => p.id));
    const added = members
      .filter((m) => !present.has(m.id))
      .map((m, i) => ({
        id: m.id,
        label: m.name || 'Musicien',
        instrument: m.instrument,
        x: 0.5 + (i - (members.length - 1) / 2) * 0.22,
        y: 0.45,
      }))
      .map((p) => ({ ...p, x: Math.min(0.92, Math.max(0.08, p.x)) }));
    if (added.length > 0) {
      updateSetup({ positions: [...setup.positions, ...added] });
    }
  }

  /**
   * Ajoute un morceau à la setlist. Si la setlist appartient à un GROUPE et
   * que le morceau n'y est pas encore, il entre automatiquement au
   * répertoire du groupe (version de groupe créée + annonce + propagation).
   */
  function addSongToSetlist(song: Song) {
    const bandId = draft.bandId ?? '';
    let versionId = versionForBand(song, bandId)?.id ?? '';
    if (bandId !== '' && versionId === '') {
      const b = bands.find((x) => x.id === bandId);
      const prev = song.activeVersionId;
      const updated = switchVersion(
        duplicateVersion(song, b?.name || 'Groupe', bandId),
        prev,
      );
      saveSong(updated);
      clearBandRemoval(bandId, normalizeTitle(song.title));
      void announceBandSong(
        b?.cloudId,
        prefs.userName || artist.name || 'Moi',
        song.title,
        song.artist,
      );
      versionId = versionForBand(updated, bandId)?.id ?? '';
    }
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { id: makeId(), songId: song.id, note: '', keyOverride: '', versionId },
      ],
    }));
  }

  function moveItem(from: number, to: number) {
    setDraft((d) => {
      if (to < 0 || to >= d.items.length || from === to) return d;
      const items = [...d.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...d, items };
    });
  }

  /**
   * Ouvre la partition d'un morceau dans la version jouée par CETTE
   * setlist (consultation ou édition) — la version active du morceau
   * bascule dessus pour que l'édition modifie la bonne interprétation.
   */
  function openItemSong(
    item: Setlist['items'][number],
    edit: boolean,
  ) {
    const song = songById.get(item.songId);
    if (!song) return;
    let vid = (item.versionId ?? '') || song.activeVersionId;
    let nextDraft = draft;
    // Modifier depuis la setlist alors que l'item suit la « Version
    // active » : proposer de créer la version dédiée — sinon les
    // changements toucheraient la version d'origine (partout).
    if (edit && (item.versionId ?? '') === '') {
      const makeOwn = confirm(
        "Ce morceau utilise sa version d'origine dans cette setlist.\n\n" +
          'OK — créer une version propre à cette setlist : tes ' +
          "modifications ne toucheront pas l'original.\n" +
          "Annuler — modifier la version d'origine (changement visible " +
          'partout).',
      );
      if (makeOwn) {
        const vname =
          draft.name.trim() !== '' ? draft.name.trim() : 'Version setlist';
        const updated = duplicateVersion(song, vname, draft.bandId ?? '');
        vid = updated.activeVersionId;
        saveSong(updated); // reste actif le temps de l'édition
        nextDraft = {
          ...draft,
          items: draft.items.map((it) =>
            it.id === item.id ? { ...it, versionId: vid } : it,
          ),
        };
        setDraft(nextDraft);
        saveSetlist(nextDraft);
        navigate(`/song/${song.id}/edit`);
        return;
      }
    }
    if (vid !== song.activeVersionId) {
      saveSong(switchVersion(song, vid));
    }
    saveSetlist(nextDraft); // ne pas perdre les réglages en cours
    if (edit) {
      navigate(`/song/${song.id}/edit`);
    } else {
      // Lecture DANS la setlist : précédent/suivant + retour direct
      const idx = nextDraft.items.findIndex((it) => it.id === item.id);
      navigate(`/setlist/${nextDraft.id}/song/${Math.max(0, idx)}`);
    }
  }

  const payload = useMemo<SharePayload | null>(() => {
    if (share === null) return null;
    const groupe = share === 'groupe';
    const included = draft.items
      .map((it) => {
        const found = songById.get(it.songId);
        if (!found) return null;
        const song = resolveVersion(found, it.versionId ?? '');
        const usedVersion =
          found.versions.find(
            (v) => v.id === ((it.versionId ?? '') || found.activeVersionId),
          ) ?? null;
        const versionBandId = usedVersion?.bandId ?? '';
        // On applique la tonalité spécifique du concert au contenu partagé.
        let baked: Song = song;
        if (it.keyOverride !== '' && song.key !== '') {
          const semis = semitonesBetween(song.key, it.keyOverride) ?? 0;
          const flat = spellingForKey(it.keyOverride);
          baked = {
            ...song,
            key: it.keyOverride,
            lyrics: transposeContent(song.lyrics, semis, flat),
            structure: song.structure.map((r) => ({
              ...r,
              chords: transposeChordSequence(r.chords, semis, flat),
            })),
          };
        }
        baked = {
          ...baked,
          versions: [],
          mySetup: undefined,
          idea: undefined,
          noSolo: undefined,
          rehearsalNotes: notesForShare(
            notesForBand(baked.rehearsalNotes, versionBandId),
            groupe ? 'groupe' : 'public',
          ),
          structure: baked.structure.map((r) => ({
            ...r,
            comment: groupe ? r.comment : '',
          })),
        };
        return { baked, it };
      })
      .filter((x): x is { baked: Song; it: Setlist['items'][number] } => x !== null);
    return {
      v: 1,
      type: 'setlist',
      view: groupe ? 'complete' : 'paroles',
      setlist: {
        name: draft.name,
        comment: draft.comment,
        // Sono & scène : partagé au groupe uniquement, jamais au public
        setup: groupe ? draft.setup : undefined,
      },
      songs: included.map((x) => x.baked),
      itemKeys: included.map((x) =>
        x.it.keyOverride !== '' ? x.it.keyOverride : (x.baked.key ?? ''),
      ),
      itemNotes: included.map((x) => (groupe ? x.it.note : '')),
    };
  }, [draft, songById, share]);

  return (
    <>
      <TopBar
        title={isNew ? 'Nouvelle setlist' : draft.name || 'Setlist'}
        onBack={() => navigate('/setlists')}
      />
      <div className="page">
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          Morceaux ({playedItems.length}
          {playedSec > 0
            ? ` · ${hasEstimate ? '≈ ' : ''}${formatDuration(playedSec)}`
            : ''}
          {reserveItems.length > 0
            ? ` · ${reserveItems.length} en réserve`
            : ''}
          )
        </h2>
        {hasEstimate && (
          <p className="help" style={{ marginTop: -6 }}>
            Durée estimée à 5 min pour les morceaux dont la durée n'est pas
            renseignée — renseigne-la sur la fiche du morceau pour affiner.
          </p>
        )}

        {draft.items.map((item, idx) => {
          const song = songById.get(item.songId);
          const keyOptions =
            song && song.key !== ''
              ? Array.from({ length: 12 }, (_v, i) =>
                  transposeKeyName(song.key, i),
                )
              : [];
          return (
            <div
              className={`slitem ${overIndex === idx ? 'dragover' : ''} ${
                item.reserve ? 'reserve' : ''
              }`}
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(idx);
              }}
              onDragLeave={() => setOverIndex(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveItem(dragIndex, idx);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <span className="drag" title="Glisser pour réordonner">
                <Icon name="grip" size={18} />
              </span>
              <span className="num">{idx + 1}.</span>
              <div className="grow">
                <div
                  className="title"
                  style={{ cursor: song ? 'pointer' : 'default' }}
                  title="Voir la partition"
                  onClick={() => openItemSong(item, false)}
                >
                  {song?.title ?? '(morceau supprimé)'}
                  {song && song.artist !== '' && (
                    <span className="stauthor"> — {song.artist}</span>
                  )}
                </div>
                <div
                  style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}
                >
                  {keyOptions.length > 0 && (
                    <select
                      value={item.keyOverride}
                      style={{ width: 'auto', padding: '4px 6px', fontSize: '0.8rem' }}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          items: d.items.map((it) =>
                            it.id === item.id
                              ? { ...it, keyOverride: e.target.value }
                              : it,
                          ),
                        }))
                      }
                    >
                      <option value="">Tonalité : {song?.key}</option>
                      {keyOptions
                        .filter((k) => k !== song?.key)
                        .map((k) => (
                          <option key={k} value={k}>
                            → {k}
                          </option>
                        ))}
                    </select>
                  )}
                  {song && (
                    <select
                      value={item.versionId ?? ''}
                      style={{ width: 'auto', padding: '4px 6px', fontSize: '0.8rem' }}
                      title="Version jouée dans cette setlist"
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '__newsl__') {
                          // Interprétation propre à cette setlist :
                          // copie de la version courante, nommée d'après
                          // elle. IMPORTANT : le morceau REVIENT ensuite
                          // sur sa version d'origine — la version setlist
                          // n'existe que pour cette setlist, elle ne
                          // devient pas la version par défaut du morceau.
                          const vname =
                            draft.name.trim() !== ''
                              ? draft.name.trim()
                              : 'Version setlist';
                          const prevActive = song.activeVersionId;
                          let updated = duplicateVersion(
                            song,
                            vname,
                            draft.bandId ?? '',
                          );
                          const newVid = updated.activeVersionId;
                          updated = switchVersion(updated, prevActive);
                          saveSong(updated);
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((it) =>
                              it.id === item.id
                                ? { ...it, versionId: newVid }
                                : it,
                            ),
                          }));
                          return;
                        }
                        setDraft((d) => ({
                          ...d,
                          items: d.items.map((it) =>
                            it.id === item.id
                              ? { ...it, versionId: value }
                              : it,
                          ),
                        }));
                      }}
                    >
                      <option value="">Version active</option>
                      {song.versions.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                          {v.bandId !== '' && bandName(v.bandId) !== ''
                            ? ` · ${bandName(v.bandId)}`
                            : ''}
                        </option>
                      ))}
                      <option value="__newsl__">
                        ＋ Version pour cette setlist…
                      </option>
                    </select>
                  )}
                  <input
                    type="text"
                    value={item.note}
                    placeholder="Note (départ batterie, medley…)"
                    style={{ flex: 1, minWidth: 140, padding: '4px 8px', fontSize: '0.8rem' }}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        items: d.items.map((it) =>
                          it.id === item.id
                            ? { ...it, note: e.target.value }
                            : it,
                        ),
                      }))
                    }
                  />
                  <button
                    className="btn ghost small"
                    title="Voir la partition (version de cette setlist)"
                    aria-label="Voir la partition"
                    onClick={() => openItemSong(item, false)}
                  >
                    <Icon name="eye" size={14} />
                  </button>
                  <button
                    className="btn ghost small"
                    title="Modifier la partition (version de cette setlist)"
                    aria-label="Modifier la partition"
                    onClick={() => openItemSong(item, true)}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    className="btn ghost small"
                    style={
                      item.reserve
                        ? { color: 'var(--accent)', fontWeight: 700 }
                        : undefined
                    }
                    title={
                      item.reserve
                        ? 'En réserve — cliquer pour le remettre dans le set joué'
                        : 'Mettre en réserve (joué seulement si besoin — hors durée prévue)'
                    }
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        items: d.items.map((it) =>
                          it.id === item.id
                            ? { ...it, reserve: !it.reserve }
                            : it,
                        ),
                      }))
                    }
                  >
                    {item.reserve ? '☆ En réserve' : '☆ Réserve'}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  className="btn ghost small"
                  onClick={() => moveItem(idx, idx - 1)}
                >
                  <Icon name="chevron-up" size={16} />
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => moveItem(idx, idx + 1)}
                >
                  <Icon name="chevron-down" size={16} />
                </button>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((it) => it.id !== item.id),
                    }))
                  }
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>
          );
        })}

        <button className="btn ghost block" onClick={() => setPicker(true)}>
          <Icon name="plus" size={16} /> Ajouter un morceau
        </button>

        <div className="spacer" />
        <details className="stfold" open={isNew}>
          <summary>
            Infos de la setlist — groupe :{' '}
            {bandName(draft.bandId ?? '') || 'aucun'}
          </summary>
          <div className="spacer" />
        <Field label="Nom">
          <input
            type="text"
            value={draft.name}
            placeholder="Concert du 15 août"
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        <Field label="Commentaire">
          <input
            type="text"
            value={draft.comment}
            placeholder="Set acoustique, 45 minutes…"
            onChange={(e) => update({ comment: e.target.value })}
          />
        </Field>
        <Field label="Groupe">
          <select
            value={draft.bandId ?? ''}
            onChange={(e) => {
              let bandId = e.target.value;
              if (bandId === '__create__') {
                const name = prompt('Nom du groupe');
                if (name === null || name.trim() === '') return;
                // Le créateur est automatiquement le premier musicien
                const b = {
                  ...emptyBand(),
                  name: name.trim(),
                  members: [creatorMember(artist, prefs.userName)],
                };
                saveBand(b);
                bandId = b.id;
              }
              // Les morceaux basculent sur la version de ce groupe
              // (s'ils en ont une) — modifiable morceau par morceau ensuite.
              setDraft((d) => ({
                ...d,
                bandId,
                items: d.items.map((it) => {
                  const s = songById.get(it.songId);
                  if (!s) return it;
                  return {
                    ...it,
                    versionId: versionForBand(s, bandId)?.id ?? '',
                  };
                }),
              }));
            }}
          >
            <option value="">Solo (par défaut)</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || 'Groupe sans nom'}
              </option>
            ))}
            <option value="__create__">＋ Créer un groupe…</option>
          </select>
          <p className="help" style={{ marginTop: 4 }}>
            La setlist utilise les versions des morceaux propres à ce groupe
            (profil complet du groupe : page Artiste 👤 → Mes groupes).
          </p>
        </Field>
          <p className="help">
            Glisse-dépose les morceaux pour réordonner (ou ↑ ↓). Chaque
            morceau peut avoir une tonalité, une version et une note propres
            à cette setlist.
          </p>
        </details>
        <details className="stfold">
          <summary>Sono &amp; scène — matériel, branchements, plan, réglages</summary>
          <div className="spacer" />
          <div className="field">
            <label>Plan de scène (déplace chacun au doigt ou à la souris)</label>
            <StagePlan
              positions={setup.positions}
              onChange={(positions) => updateSetup({ positions })}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {(draft.bandId ?? '') !== '' && (
                <button className="btn ghost small" onClick={seedPositions}>
                  <Icon name="users" size={14} /> Placer les musiciens du groupe
                </button>
              )}
              <button
                className="btn ghost small"
                onClick={() => setGearPicker(true)}
              >
                <Icon name="speaker" size={14} /> Piocher le matériel des
                musiciens
              </button>
            </div>
          </div>
          <Field label="Matériel">
            <textarea
              value={setup.gear}
              placeholder={'Sono 2×12", console 8 pistes, 3 micros SM58, DI basse…'}
              onChange={(e) => updateSetup({ gear: e.target.value })}
            />
          </Field>
          <Field label="Branchements (patch, DI, retours…)">
            <textarea
              value={setup.wiring}
              placeholder={'Voie 1 : chant lead\nVoie 2 : guitare (DI)\nVoie 3-4 : claviers…'}
              onChange={(e) => updateSetup({ wiring: e.target.value })}
            />
          </Field>
          <Field label="Effets & réglages sono">
            <textarea
              value={setup.sound}
              placeholder={'Reverb légère sur le chant, delay refrain de « Angie », retours…'}
              onChange={(e) => updateSetup({ sound: e.target.value })}
            />
          </Field>
        </details>


        <div className="rowactions">
          {draft.items.length > 0 && (
            <>
              <button
                className="btn ghost"
                title="Vue d'ensemble propre et imprimable"
                onClick={() => navigate(`/setlist/${draft.id}/apercu`)}
              >
                <Icon name="clipboard" size={15} /> Imprimer
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  saveSetlist(draft);
                  navigate(`/stage/${draft.id}`);
                }}
              >
                <Icon name="play" size={14} /> Mode scène
              </button>
              <button
                className="btn ghost"
                title="Vue chanteur sans partition"
                onClick={() => {
                  saveSetlist(draft);
                  navigate(`/remote/${draft.id}`);
                }}
              >
                <Icon name="sliders" size={15} /> Régie
              </button>
            </>
          )}
          {draft.items.length > 0 && (
            <>
              <button className="btn ghost" onClick={() => setShare('groupe')}>
                <Icon name="users" size={15} /> Partager au groupe
              </button>
              <button className="btn ghost" onClick={() => setShare('public')}>
                <Icon name="mic" size={15} /> Partager au public
              </button>
            </>
          )}
          {!isNew && (
            <button
              className="btn danger"
              onClick={() => {
                if (confirm(`Supprimer « ${draft.name} » ?`)) {
                  deleteSetlist(draft.id);
                  navigate('/setlists');
                }
              }}
            >
              Supprimer
            </button>
          )}
        </div>
      </div>

      {picker && (
        <SongCollector
          title="Ajouter des morceaux"
          alreadyIn={draft.items.map((it) => it.songId)}
          confirmLabel={(n) => `Ajouter ${n} morceau${n > 1 ? 'x' : ''}`}
          onConfirm={(ids) => {
            for (const id of ids) {
              const s = songs.find((x) => x.id === id);
              if (s) addSongToSetlist(s);
            }
          }}
          onClose={() => setPicker(false)}
        />
      )}

      {gearPicker && (
        <Modal
          title="Matériel des musiciens"
          onClose={() => setGearPicker(false)}
        >
          <p className="help" style={{ marginTop: 0 }}>
            Pioché dans « Mon matériel » (fiche Artiste) et dans le matériel
            des musiciens du groupe. Un clic le place sur le plan de scène ;
            un second l'en retire — de quoi vérifier que rien ne manque.
          </p>
          {gearSources.length === 0 && (
            <p className="help">
              Aucun matériel déclaré pour l'instant : remplis « Mon
              matériel » dans l'onglet Artiste, et celui des musiciens dans
              la fiche du groupe (section Musiciens → Matériel).
            </p>
          )}
          {gearSources.map((src) => (
            <div key={src.owner} style={{ marginBottom: 10 }}>
              <div className="help" style={{ fontWeight: 700, marginBottom: 4 }}>
                {src.owner}
              </div>
              {src.items.map((g) => {
                const placed = setup.positions.some((p) => p.id === g.id);
                return (
                  <div
                    className="row"
                    key={g.id}
                    onClick={() =>
                      toggleGear(
                        g.id,
                        (g.qty ?? 1) > 1 ? `${g.name} ×${g.qty}` : g.name,
                        src.owner,
                        g.category,
                      )
                    }
                  >
                    <Icon name={gearIcon(g.category)} size={15} />
                    <div className="grow">
                      <div className="title">
                        {g.name}
                        {(g.qty ?? 1) > 1 && (
                          <span className="stauthor"> ×{g.qty}</span>
                        )}
                      </div>
                    </div>
                    {placed ? (
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                        ✓ Sur le plan
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
          ))}
          <button
            className="btn ghost block"
            onClick={() => setGearPicker(false)}
          >
            Fermer
          </button>
        </Modal>
      )}

      {share !== null && payload && (
        <ShareModal
          title={
            share === 'groupe'
              ? `Partage groupe — ${draft.name}`
              : `Partage public — ${draft.name}`
          }
          payload={payload}
          onClose={() => setShare(null)}
        />
      )}
    </>
  );
}
