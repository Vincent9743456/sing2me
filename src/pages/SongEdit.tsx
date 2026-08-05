import React, { useState } from 'react';

import { Field, TopBar } from '../components/ui';
import { KEY_CHOICES } from '../lib/chords';
import { importText } from '../lib/importer';
import {
  activeVersion,
  propagateMainKeyCapo,
  switchVersion,
  syncActiveVersion,
} from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptySong,
  formatDuration,
  makeId,
  parseDuration,
  Song,
  StructureRow,
} from '../types';

export function SongEdit({ id }: { id: string | null }) {
  const { songs, bands, saveSong, deleteSong } = useStore();
  const existing = id ? songs.find((s) => s.id === id) : undefined;
  const [draft, setDraft] = useState<Song>(() =>
    existing
      ? {
          ...existing,
          structure: existing.structure.map((x) => ({ ...x })),
          tags: [...existing.tags],
          versions: existing.versions.map((v) => ({ ...v })),
        }
      : emptySong(),
  );
  const [durationText, setDurationText] = useState(() =>
    formatDuration(draft.durationSec),
  );
  const [tagsText, setTagsText] = useState(() => draft.tags.join(', '));
  const [versionName, setVersionName] = useState(
    () => activeVersion(draft).name,
  );
  const [versionBandId, setVersionBandId] = useState(
    () => activeVersion(draft).bandId,
  );
  const isNew = existing === undefined;

  function update(patch: Partial<Song>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  /** Fige les champs édités dans la version courante du brouillon. */
  function bakeDraft(d: Song): Song {
    return syncActiveVersion({
      ...d,
      versions: d.versions.map((v) =>
        v.id === d.activeVersionId
          ? { ...v, name: versionName.trim() || v.name, bandId: versionBandId }
          : v,
      ),
    });
  }

  /** Change la version ÉDITÉE (sans toucher au morceau enregistré). */
  function switchEditVersion(vid: string) {
    if (vid === draft.activeVersionId) return;
    const d = switchVersion(bakeDraft(draft), vid);
    setDraft(d);
    setVersionName(activeVersion(d).name);
    setVersionBandId(activeVersion(d).bandId);
  }

  /** Applique la partition affichée à TOUTES les versions (action volontaire). */
  function propagateToAll() {
    if (
      !confirm(
        `Appliquer cette partition (paroles, accords, structure, tonalité, ` +
          `tempo, capo) aux ${draft.versions.length} versions du morceau ?\n\n` +
          'Les différences propres à chaque version (setlists, groupes) ' +
          'seront remplacées par ce contenu.',
      )
    )
      return;
    setDraft((d) => ({
      ...d,
      versions: d.versions.map((v) => ({
        ...v,
        key: d.key,
        tempo: d.tempo,
        capo: d.capo,
        structure: d.structure.map((r) => ({ ...r, id: makeId() })),
        lyrics: d.lyrics,
      })),
    }));
  }

  function onSave() {
    if (draft.title.trim() === '') {
      alert('Donne un titre à ton morceau.');
      return;
    }
    let song: Song = bakeDraft({
      ...draft,
      durationSec: parseDuration(durationText),
      tags: tagsText
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter((t) => t !== ''),
      structure: draft.structure.filter(
        (r) =>
          r.label.trim() !== '' ||
          r.chords.trim() !== '' ||
          r.comment.trim() !== '',
      ),
    });
    // Version PRINCIPALE modifiée → sa tonalité/son capo se répercutent
    // sur les versions qui la suivaient (et partent vers le groupe à la
    // synchro). Les versions au réglage propre ne bougent pas.
    if (
      existing &&
      existing.versions.length > 0 &&
      draft.activeVersionId === existing.versions[0].id
    ) {
      song = propagateMainKeyCapo(
        song,
        existing.versions[0].key,
        existing.versions[0].capo,
      );
    }
    // L'édition ne détourne jamais la version par défaut du morceau :
    // si on a édité une autre version, le morceau revient sur la sienne.
    if (
      existing &&
      existing.activeVersionId !== song.activeVersionId &&
      song.versions.some((v) => v.id === existing.activeVersionId)
    ) {
      song = switchVersion(song, existing.activeVersionId);
    }
    saveSong(song);
    navigate(`/song/${song.id}`);
  }

  function onDelete() {
    if (
      !confirm(`Supprimer « ${draft.title} » ? Le morceau sera retiré des setlists.`)
    )
      return;
    deleteSong(draft.id);
    navigate('/');
  }

  return (
    <>
      <TopBar
        title={isNew ? 'Nouveau morceau' : 'Modifier'}
        onBack={() => history.back()}
      />
      <div className="page">
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          🎵 Le morceau — commun à toutes les versions
        </h2>
        <p className="help">
          Ces champs modifient le morceau <strong>partout</strong> : toutes
          les versions et toutes les setlists.
        </p>
        <Field label="Titre">
          <input
            type="text"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label="Artiste">
          <input
            type="text"
            value={draft.artist}
            onChange={(e) => update({ artist: e.target.value })}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Durée (m:ss)">
            <input
              type="text"
              value={durationText}
              placeholder="3:45"
              onChange={(e) => setDurationText(e.target.value)}
            />
          </Field>
          <Field label="Tags (séparés par des virgules)">
            <input
              type="text"
              value={tagsText}
              placeholder="rock, slow, ouverture…"
              onChange={(e) => setTagsText(e.target.value)}
            />
          </Field>
        </div>

        <h2 className="pagetitle">
          🎼 La partition —{' '}
          {draft.versions.length > 1
            ? 'propre à la version choisie'
            : 'version unique'}
        </h2>
        <p className="help">
          {draft.versions.length > 1
            ? 'Ce qui suit ne modifie QUE la version sélectionnée ci-dessous — ' +
              'les versions liées à une setlist ou à un groupe gardent leurs ' +
              'propres réglages.'
            : "Ce morceau n'a qu'une version : ces champs s'appliquent à elle."}
        </p>
        {draft.versions.length > 1 && (
          <Field label="Version modifiée">
            <select
              value={draft.activeVersionId}
              onChange={(e) => switchEditVersion(e.target.value)}
            >
              {draft.versions.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {i === 0 ? ' — principale' : ''}
                  {v.key !== '' ? ` (${v.key})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {draft.versions.length > 1 && (
          <Field label="Nom de cette version">
            <input
              type="text"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </Field>
        )}
        {bands.length > 0 && (
          <Field label="Cette version est pour">
            <select
              value={versionBandId}
              onChange={(e) => setVersionBandId(e.target.value)}
            >
              <option value="">Solo (ma version par défaut)</option>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || 'Groupe sans nom'}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Tonalité">
            <select
              value={draft.key}
              onChange={(e) => update({ key: e.target.value })}
            >
              <option value="">—</option>
              {KEY_CHOICES.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
              {KEY_CHOICES.map((k) => (
                <option key={k + 'm'} value={k + 'm'}>
                  {k}m
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tempo (BPM)">
            <input
              type="number"
              value={draft.tempo > 0 ? draft.tempo : ''}
              onChange={(e) => update({ tempo: parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
          <Field label="Capo">
            <input
              type="number"
              value={draft.capo > 0 ? draft.capo : ''}
              onChange={(e) => update({ capo: parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
        </div>
        {draft.versions.length > 1 && (
          <p className="help">
            {draft.activeVersionId === draft.versions[0].id
              ? '⚑ Version principale : un changement de tonalité ou de capo ' +
                'est répercuté sur les versions qui la suivaient (celles sans ' +
                'réglage propre), et partagé avec le groupe à la ' +
                'synchronisation.'
              : 'Cette version garde ses propres tonalité et capo — la ' +
                "version principale n'est pas affectée."}
          </p>
        )}
        {draft.versions.length > 1 && (
          <>
            <button
              className="btn ghost block"
              title="Copie cette partition (paroles, accords, structure, tonalité) dans toutes les versions du morceau"
              onClick={propagateToAll}
            >
              ⇉ Appliquer cette partition à toutes les versions (
              {draft.versions.length})
            </button>
            <p className="help">
              Pour corriger le « fichier original » partout d'un coup — par
              exemple une faute dans les paroles reprise dans chaque version.
            </p>
          </>
        )}

        <h2 className="pagetitle">Structure</h2>
        <p className="help">
          L'arrangement stable du morceau, en écriture libre : enchaînements,
          départs, arrêts, consignes… (« intro batterie seule », « refrain
          x2 à la fin »). Pour le journal daté des répétitions (qui a dit
          quoi, partagé ou privé), utilise les Notes de répétition sur la
          fiche du morceau.
        </p>
        <textarea
          value={draft.structureNotes ?? ''}
          onChange={(e) => update({ structureNotes: e.target.value })}
          placeholder={'Intro batterie seule\nDernier refrain x2, a cappella sur 2 mesures\n…'}
          style={{ minHeight: 90 }}
        />

        <h2 className="pagetitle">Paroles + accords</h2>
        <p className="help">
          Un seul bloc continu. Accords entre crochets :
          [Am]Sous le ciel de [F]Port-Louis
        </p>
        <textarea
          className="mono"
          style={{ minHeight: 280 }}
          value={draft.lyrics}
          onChange={(e) => update({ lyrics: e.target.value })}
          placeholder={'[Am]Première ligne…\n\nSuite des paroles…'}
        />

        <div className="spacer" />
        <p className="help">
          💬 Les notes de répétition (partagées ou personnelles, dictée
          vocale…) s'ajoutent depuis la page du morceau.
        </p>
        <button className="btn block" onClick={onSave}>
          Enregistrer
        </button>
        {!isNew && (
          <>
            <div className="spacer" />
            <button className="btn danger block" onClick={onDelete}>
              Supprimer le morceau
            </button>
          </>
        )}
      </div>
    </>
  );
}
