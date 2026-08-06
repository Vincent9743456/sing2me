import React, { useState } from 'react';

import { Icon } from '../components/Icon';
import { MenuSheet } from '../components/Feedback';
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
  // Feuille « appliquer à toutes les versions / seulement celle-ci » à
  // l'enregistrement (quand le morceau a plusieurs versions).
  const [askScope, setAskScope] = useState(false);
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
  // Groupe de la version en cours d'édition (pour le bandeau de contexte).
  const editBand = bands.find((b) => b.id === versionBandId);
  const editBandColor = [
    'var(--band-1)',
    'var(--band-2)',
    'var(--band-3)',
    'var(--band-4)',
    'var(--band-5)',
    'var(--band-6)',
    'var(--band-7)',
  ][Math.max(0, bands.findIndex((b) => b.id === versionBandId)) % 7];
  // La version en cours d'édition est-elle l'originale maîtresse ?
  const editingOriginal = draft.versions[0]?.id === draft.activeVersionId;

  function update(patch: Partial<Song>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  /** Fige les champs édités dans la version courante du brouillon.
   *  L'originale (versions[0]) reste TOUJOURS personnelle (bandId '') : elle
   *  ne peut jamais être rattachée à un groupe depuis l'éditeur. */
  function bakeDraft(d: Song): Song {
    const isOriginal = d.versions[0]?.id === d.activeVersionId;
    return syncActiveVersion({
      ...d,
      versions: d.versions.map((v) =>
        v.id === d.activeVersionId
          ? {
              ...v,
              name: versionName.trim() || v.name,
              bandId: isOriginal ? '' : versionBandId,
            }
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

  /** La partition (accords/paroles/tonalité…) de la version éditée a-t-elle
   *  changé ? Sert à ne poser la question « toutes / cette version » que
   *  quand c'est pertinent. */
  function partitionChanged(): boolean {
    if (!existing) return false;
    const v = existing.versions.find((x) => x.id === draft.activeVersionId);
    if (!v) return true;
    return (
      v.lyrics !== draft.lyrics ||
      v.key !== draft.key ||
      v.tempo !== draft.tempo ||
      v.capo !== draft.capo ||
      JSON.stringify(v.structure) !== JSON.stringify(draft.structure)
    );
  }

  /** Enregistre — puis quitte l'édition et revient EN HAUT de la partition.
   *  `scope` = 'all' recopie la partition affichée dans toutes les versions. */
  function commitSave(scope: 'current' | 'all') {
    setAskScope(false);
    let base: Song = {
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
    };
    if (scope === 'all') {
      // La partition affichée remplace celle de TOUTES les versions —
      // chacune est donc modifiée : on tamponne son `updatedAt` propre
      // pour que la partition parte aussi vers le groupe à la synchro.
      const now = new Date().toISOString();
      base = {
        ...base,
        versions: base.versions.map((v) => ({
          ...v,
          key: base.key,
          tempo: base.tempo,
          capo: base.capo,
          structure: base.structure.map((r) => ({ ...r, id: makeId() })),
          lyrics: base.lyrics,
          updatedAt: now,
        })),
      };
    }
    let song: Song = bakeDraft(base);
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
    // On quitte l'édition et on revient EN HAUT de la partition.
    navigate(`/song/${song.id}`);
  }

  function onSave() {
    if (draft.title.trim() === '') {
      alert('Donne un titre à ton morceau.');
      return;
    }
    // Plusieurs versions + partition modifiée → demander la portée.
    if (existing && draft.versions.length > 1 && partitionChanged()) {
      setAskScope(true);
      return;
    }
    commitSave('current');
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
        {/* Bandeau : rappelle CE QUE tu modifies et si c'est partagé. */}
        <div
          className="versionbanner"
          style={versionBandId ? { borderLeftColor: editBandColor } : undefined}
        >
          <div className="vb-main">
            <div className="vb-title">
              <span>
                Tu modifies :{' '}
                {editingOriginal
                  ? 'la version originale'
                  : versionBandId
                    ? `version du groupe ${editBand?.name || 'sans nom'}`
                    : `version « ${versionName.trim() || activeVersion(draft).name} »`}
              </span>
              {editingOriginal ? (
                <span className="vb-solo">pilote</span>
              ) : versionBandId ? (
                <span className="vb-shared">partagée</span>
              ) : (
                <span className="vb-solo">perso</span>
              )}
            </div>
            <div className="vb-sub">
              {editingOriginal
                ? draft.versions.length > 1
                  ? 'Version maîtresse, personnelle : elle reste dans ta bibliothèque et sert de base aux autres versions (tonalité/capo se répercutent).'
                  : 'Version maîtresse, personnelle : la base de ce morceau.'
                : versionBandId
                  ? 'À l’enregistrement, tes changements partent vers tous les membres du groupe.'
                  : 'Modifications privées à cette version — les autres versions gardent leurs réglages.'}
            </div>
          </div>
        </div>
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
        {editingOriginal && (
          <p className="help">
            🔒 L’originale est toujours <strong>personnelle</strong> et reste
            dans ta bibliothèque. Pour une version dédiée à un groupe, utilise
            « Ajouter à… » depuis la partition.
          </p>
        )}
        {bands.length > 0 && !editingOriginal && (
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
          <p className="help">
            À l'enregistrement, Sing2Me te demandera si tes changements de
            partition valent pour <strong>cette version</strong> seulement ou
            pour <strong>toutes les versions</strong>.
          </p>
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
            <button
              className="btn ghost block"
              onClick={() => navigate(`/song/${draft.id}`)}
            >
              <Icon name="eye" size={15} /> Voir la partition
            </button>
            <div className="spacer" />
            <button className="btn danger block" onClick={onDelete}>
              Supprimer le morceau
            </button>
          </>
        )}
      </div>

      {askScope && (
        <MenuSheet
          title="Appliquer tes modifications à…"
          items={[
            {
              label: 'Cette version seulement',
              onClick: () => commitSave('current'),
            },
            {
              label: `Toutes les versions (${draft.versions.length})`,
              onClick: () => commitSave('all'),
            },
          ]}
          onClose={() => setAskScope(false)}
        />
      )}
    </>
  );
}
