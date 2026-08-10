import React, { useState } from 'react';

import { Icon } from '../components/Icon';
import { MenuSheet } from '../components/Feedback';
import { Field, TopBar } from '../components/ui';
import { SongDeleteSheet } from '../components/SongDeleteSheet';
import { t } from '../i18n';
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
  const { songs, bands, saveSong } = useStore();
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
    // RELIRE, C'EST VÉRIFIER. Un morceau que l'import avait marqué
    // « à vérifier » sort de cette liste dès qu'on l'a modifié à la main :
    // c'est le geste qui prouve qu'on l'a regardé. Sans cela le badge
    // resterait à vie et il faudrait un bouton de plus pour l'enlever.
    if (song.needsCheck) song = { ...song, needsCheck: undefined };
    saveSong(song);
    // On quitte l'édition et on revient EN HAUT de la partition.
    navigate(`/song/${song.id}`);
  }

  function onSave() {
    if (draft.title.trim() === '') {
      alert(t('Donne un titre à ton morceau.'));
      return;
    }
    // Plusieurs versions + partition modifiée → demander la portée.
    if (existing && draft.versions.length > 1 && partitionChanged()) {
      setAskScope(true);
      return;
    }
    commitSave('current');
  }

  // La suppression passe par la feuille commune (b239) : c'est elle qui sait
  // qu'un morceau venu d'un groupe ne s'efface pas, et qu'un morceau
  // programmé par le groupe ne se supprime pas du tout.
  const [suppr, setSuppr] = useState(false);
  const enBibliotheque = songs.find((s) => s.id === draft.id);

  return (
    <>
      <TopBar
        live={false}
        title={isNew ? t('Nouveau morceau') : t('Modifier')}
        onBack={() => history.back()}
      />
      <div className="page">
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          {t('🎵 Le morceau — commun à toutes les versions')}
        </h2>
        <p className="help">
          {t('Ces champs modifient le morceau ')}
          <strong>{t('partout')}</strong>
          {t(' : toutes les versions et toutes les setlists.')}
        </p>
        <Field label={t('Titre')}>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <Field label={t('Artiste')}>
          <input
            type="text"
            value={draft.artist}
            onChange={(e) => update({ artist: e.target.value })}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label={t('Durée (m:ss)')}>
            <input
              type="text"
              value={durationText}
              placeholder="3:45"
              onChange={(e) => setDurationText(e.target.value)}
            />
          </Field>
          <Field label={t('Tags (séparés par des virgules)')}>
            <input
              type="text"
              value={tagsText}
              placeholder={t('rock, slow, ouverture…')}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </Field>
        </div>

        <h2 className="pagetitle">
          {t('🎼 La partition —')}{' '}
          {draft.versions.length > 1
            ? t('propre à la version choisie')
            : t('version unique')}
        </h2>
        {/* Bandeau : rappelle CE QUE tu modifies et si c'est partagé. */}
        <div
          className="versionbanner"
          style={versionBandId ? { borderLeftColor: editBandColor } : undefined}
        >
          <div className="vb-main">
            <div className="vb-title">
              <span>
                {t('Tu modifies :')}{' '}
                {editingOriginal
                  ? t('la version de référence')
                  : versionBandId
                    ? t('version du groupe {band}', {
                        band: editBand?.name || t('sans nom'),
                      })
                    : t('version « {name} »', {
                        name: versionName.trim() || activeVersion(draft).name,
                      })}
              </span>
              {editingOriginal ? (
                <span className="vb-ref">{t('⭐ référence')}</span>
              ) : versionBandId ? (
                <span className="vb-shared">{t('partagée')}</span>
              ) : (
                <span className="vb-solo">{t('perso')}</span>
              )}
            </div>
            <div className="vb-sub">
              {editingOriginal
                ? draft.versions.length > 1
                  ? t(
                      'Version maîtresse, personnelle : elle reste dans ta bibliothèque et sert de base aux autres versions (tonalité/capo se répercutent).',
                    )
                  : t('Version maîtresse, personnelle : la base de ce morceau.')
                : versionBandId
                  ? t(
                      'À l’enregistrement, tes changements partent vers tous les membres du groupe.',
                    )
                  : t(
                      'Modifications privées à cette version — les autres versions gardent leurs réglages.',
                    )}
            </div>
          </div>
        </div>
        {draft.versions.length > 1 && (
          <Field label={t('Version modifiée')}>
            <select
              value={draft.activeVersionId}
              onChange={(e) => switchEditVersion(e.target.value)}
            >
              {draft.versions.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {i === 0 ? ` — ${t('principale')}` : ''}
                  {v.key !== '' ? ` (${v.key})` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {draft.versions.length > 1 && (
          <Field label={t('Nom de cette version')}>
            <input
              type="text"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
            />
          </Field>
        )}
        {editingOriginal && (
          <p className="help">
            {t('🔒 L’originale est toujours ')}
            <strong>{t('personnelle')}</strong>
            {t(
              ' : c’est ta façon de le jouer, et la modifier se répercute sur les versions de groupe qui la suivent. Pour une version dédiée à un groupe, utilise « Ajouter à… » depuis la partition.',
            )}
          </p>
        )}
        {bands.length > 0 && !editingOriginal && (
          <Field label={t('Cette version est pour')}>
            <select
              value={versionBandId}
              onChange={(e) => setVersionBandId(e.target.value)}
            >
              <option value="">{t('Moi seul (version personnelle)')}</option>
              {bands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name || t('Groupe sans nom')}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label={t('Tonalité')}>
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
          <Field label={t('Tempo (BPM)')}>
            <input
              type="number"
              value={draft.tempo > 0 ? draft.tempo : ''}
              onChange={(e) => update({ tempo: parseInt(e.target.value, 10) || 0 })}
            />
          </Field>
          <Field label={t('Capo')}>
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
              ? t(
                  '⚑ Version principale : un changement de tonalité ou de capo est répercuté sur les versions qui la suivaient (celles sans réglage propre), et partagé avec le groupe à la synchronisation.',
                )
              : t(
                  "Cette version garde ses propres tonalité et capo — la version principale n'est pas affectée.",
                )}
          </p>
        )}
        {draft.versions.length > 1 && (
          <p className="help">
            {t(
              "À l'enregistrement, DodoSongs te demandera si tes changements de partition valent pour",
            )}{' '}
            <strong>{t('cette version')}</strong> {t('seulement ou pour')}{' '}
            <strong>{t('toutes les versions')}</strong>.
          </p>
        )}

        <h2 className="pagetitle">{t('Structure')}</h2>
        <p className="help">
          {t(
            "L'arrangement stable du morceau, en écriture libre : enchaînements, départs, arrêts, consignes… (« intro batterie seule », « refrain x2 à la fin »). Pour le journal daté des répétitions (qui a dit quoi, partagé ou privé), utilise les Notes de répétition sur la fiche du morceau.",
          )}
        </p>
        <textarea
          value={draft.structureNotes ?? ''}
          onChange={(e) => update({ structureNotes: e.target.value })}
          placeholder={t(
            'Intro batterie seule\nDernier refrain x2, a cappella sur 2 mesures\n…',
          )}
          style={{ minHeight: 90 }}
        />

        <h2 className="pagetitle">{t('Paroles + accords')}</h2>
        <p className="help">
          {t(
            'Un seul bloc continu. Accords entre crochets : [Am]Sous le ciel de [F]Port-Louis',
          )}
        </p>
        <textarea
          className="mono"
          style={{ minHeight: 280 }}
          value={draft.lyrics}
          onChange={(e) => update({ lyrics: e.target.value })}
          placeholder={t('[Am]Première ligne…\n\nSuite des paroles…')}
        />

        <div className="spacer" />
        <p className="help">
          {t(
            "💬 Les notes de répétition (partagées ou personnelles, dictée vocale…) s'ajoutent depuis la page du morceau.",
          )}
        </p>
        <button className="btn block" onClick={onSave}>
          {t('Enregistrer')}
        </button>
        {!isNew && (
          <>
            <div className="spacer" />
            <button
              className="btn ghost block"
              onClick={() => navigate(`/song/${draft.id}`)}
            >
              <Icon name="eye" size={15} /> {t('Voir la partition')}
            </button>
            <div className="spacer" />
            <button className="btn danger block" onClick={() => setSuppr(true)}>
              {t('Supprimer le morceau')}
            </button>
          </>
        )}
      </div>

      {suppr && enBibliotheque && (
        <SongDeleteSheet
          song={enBibliotheque}
          onDeleted={() => navigate('/')}
          onClose={() => setSuppr(false)}
        />
      )}

      {askScope && (
        <MenuSheet
          title={t('Appliquer tes modifications à…')}
          items={[
            {
              label: t('Cette version seulement'),
              onClick: () => commitSave('current'),
            },
            {
              label: t('Toutes les versions ({n})', { n: draft.versions.length }),
              onClick: () => commitSave('all'),
            },
          ]}
          onClose={() => setAskScope(false)}
        />
      )}
    </>
  );
}
