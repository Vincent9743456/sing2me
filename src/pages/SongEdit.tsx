import React, { useEffect, useState } from 'react';

import { BandeauPourGroupe } from '../components/BandeauPourGroupe';
import { Icon } from '../components/Icon';
import { MenuSheet, useToast } from '../components/Feedback';
import { Field, TopBar } from '../components/ui';
import { SongDeleteSheet } from '../components/SongDeleteSheet';
import { t } from '../i18n';
import { KEY_CHOICES } from '../lib/chords';
import { propositionBloquee } from '../lib/limites';
import { useLimits } from '../components/useLimits';
import { activeVersion, switchVersion } from '../lib/model';
import {
  bakeDraft,
  ChampsEditeur,
  editeurModifie,
  enregistrementTexteSeul,
  enregistrerSansGeler,
  partitionChangee,
} from '../lib/songedit';
import { navigate } from '../router';
import { useStore } from '../store';
import { emptySong, formatDuration, Song } from '../types';

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
  /* AU PLAFOND, UNE PROPOSITION NE S'OUVRE PAS — l'éditeur non plus (b426) :
     il montre les paroles, exactement ce que le blocage protège. On renvoie
     vers la fiche, qui porte le message et la sortie. */
  const limites = useLimits();
  useEffect(() => {
    if (existing && propositionBloquee(existing, limites.peutAjouter)) {
      navigate(`/song/${existing.id}`);
    }
  }, [existing, limites.peutAjouter]);
  // Groupe de la version en cours d'édition (pour le bandeau de contexte).
  const editBand = bands.find((b) => b.id === versionBandId);
  /**
   * La version est-elle VRAIMENT rattachée à un groupe connu (b288, incohérence
   * signalée par Vincent) ? Un `bandId` peut désigner un groupe qui n'existe
   * plus localement (groupe quitté, ou identifiant local remplacé au retour
   * dans le groupe, b185) : c'est un rattachement ORPHELIN, exactement comme
   * en b281. La bannière le prenait pour « version du groupe / partagée » alors
   * que le sélecteur — qui ne connaît que les groupes réels — affichait « Moi
   * seul ». On tranche sur le groupe RÉSOLU : pas de groupe connu = version
   * personnelle, partout dans ce bandeau. On ne répare PAS la donnée (un
   * appareil qui n'a pas encore synchronisé ses groupes verrait à tort un vrai
   * groupe comme orphelin — même prudence qu'en b281).
   */
  const versionGroupe = editBand != null;
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

  /* Le calcul d'enregistrement vit dans src/lib/songedit.ts (b499) : pur,
     testé, et ENCADRÉ — une exception ne peut plus geler l'écran en
     silence. Ici ne restent que l'état d'écran et les gestes. */
  const toast = useToast();
  const [saveError, setSaveError] = useState<string | null>(null);
  function champs(): ChampsEditeur {
    return { draft, existing, durationText, tagsText, versionName, versionBandId };
  }

  /** Change la version ÉDITÉE (sans toucher au morceau enregistré). */
  function switchEditVersion(vid: string) {
    if (vid === draft.activeVersionId) return;
    const d = switchVersion(bakeDraft(draft, versionName, versionBandId), vid);
    setDraft(d);
    setVersionName(activeVersion(d).name);
    setVersionBandId(activeVersion(d).bandId);
  }

  /** Enregistre — puis quitte l'édition et revient EN HAUT de la partition.
   *  Un échec SE DIT (b499) : plus jamais un « Enregistrer » muet. */
  function commitSave(scope: 'current' | 'all') {
    setAskScope(false);
    const r = enregistrerSansGeler(champs(), scope);
    if (!r.ok) {
      setSaveError(r.erreur);
      return;
    }
    setSaveError(null);
    saveSong(r.song);
    // On quitte l'édition et on revient EN HAUT de la partition.
    navigate(`/song/${r.song.id}`);
  }

  /** La sortie de secours : le texte brut, tel quel, sans aucun calcul
   *  annexe — on ne perd jamais une session d'édition (b499). */
  function saveTexteSeul() {
    try {
      const song = enregistrementTexteSeul(champs());
      saveSong(song);
      navigate(`/song/${song.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  function onSave() {
    if (draft.title.trim() === '') {
      // Toast, pas alert() (règle 10) : le natif est muet dans certaines
      // installations iOS, et il bloquait le fil de l'app.
      toast.show(t('Donne un titre à ton morceau.'));
      return;
    }
    // Plusieurs versions + partition modifiée → demander la portée.
    if (existing && draft.versions.length > 1 && partitionChangee(champs())) {
      // On ferme le clavier AVANT d'ouvrir la feuille (b499) : ouverte
      // par-dessus un clavier iPad, elle pouvait naître mal placée — un
      // voile invisible qui bloque la page.
      (document.activeElement as HTMLElement | null)?.blur?.();
      setAskScope(true);
      return;
    }
    commitSave('current');
  }

  function modifie(): boolean {
    return editeurModifie(champs());
  }

  /**
   * « VOIR LA PARTITION » ENREGISTRE D'ABORD (b348, perte signalée par
   * Vincent : modifier, ouvrir la partition sans « Enregistrer », fermer —
   * les modifications étaient perdues en silence). Ce bouton emprunte le
   * MÊME chemin qu'« Enregistrer » (titre requis, question de portée quand
   * le morceau a plusieurs versions), qui se termine déjà sur la partition.
   * Sans modification, on ne fait que consulter — et un bouton qui consulte
   * n'écrit rien (b243).
   */
  function voirPartition() {
    if (!modifie()) {
      navigate(`/song/${draft.id}`);
      return;
    }
    onSave();
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
        title={isNew ? t('Ajouter un morceau') : t('Modifier')}
        onBack={() => history.back()}
      />
      <div className="page">
        {/* b472 (point 1) : « Écrire à la main » fait partie du trajet de
            création — l'intention « pour le groupe » s'y affiche aussi. */}
        {isNew && <BandeauPourGroupe />}
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
          style={versionGroupe ? { borderLeftColor: editBandColor } : undefined}
        >
          <div className="vb-main">
            <div className="vb-title">
              <span>
                {/* En CRÉATION on ne « modifie » rien (b429/E-3, passe UX
                    de Vincent) : la micro-copy suit l'état. */}
                {isNew ? t('Tu crées :') : t('Tu modifies :')}{' '}
                {editingOriginal
                  ? t('la version de référence')
                  : versionGroupe
                    ? t('version du groupe {band}', {
                        band: editBand?.name || t('sans nom'),
                      })
                    : t('version « {name} »', {
                        name: versionName.trim() || activeVersion(draft).name,
                      })}
              </span>
              {/* Pas de pastille qui répète le titre (b398) : « Tu
                  modifies : la version de référence » se suffit. */}
              {editingOriginal ? null : versionGroupe ? (
                <span className="vb-shared">{t('partagée')}</span>
              ) : (
                <span className="vb-solo">{t('perso')}</span>
              )}
            </div>
            {/* ÉPURÉ (b398) : plus de paragraphe descriptif — le nom et la
                pastille suffisent à dire ce qu'on modifie. */}
          </div>
        </div>
        {draft.versions.length > 1 && (
          <Field label={t('Version modifiée')}>
            <span className="versionpick block">
              <select
                value={draft.activeVersionId}
                onChange={(e) => switchEditVersion(e.target.value)}
              >
                {draft.versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    {i === 0 && !v.name.startsWith('⭐') ? '⭐ ' : ''}
                    {v.name}
                    {i === 0 ? ` — ${t('principale')}` : ''}
                    {v.key !== '' ? ` (${v.key})` : ''}
                  </option>
                ))}
              </select>
            </span>
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
              "À l'enregistrement, mojosong te demandera si tes changements de partition valent pour",
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
        {/* HIÉRARCHIE (b429/C-1, passe UX de Vincent) : Enregistrer reste
            la seule action pleine ; « Voir la partition » est de la
            NAVIGATION (elle enregistre déjà avant de partir — on ne change
            ni le label ni le comportement) ; « Supprimer » est démoté en
            contour rouge, isolé par un trait — plus de fond plein criard. */}
        <button className="btn block" onClick={onSave}>
          {t('Enregistrer')}
        </button>
        {saveError !== null && (
          <div
            className="help"
            role="alert"
            style={{
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius-s)',
              padding: 'var(--sp-3)',
              marginTop: 'var(--sp-3)',
            }}
          >
            <p style={{ margin: 0, color: 'var(--danger)' }}>
              {t("L'enregistrement a rencontré un problème — tes paroles ne sont pas perdues.")}
            </p>
            <p style={{ margin: 'var(--sp-2) 0' }}>
              {t('Détail technique : {detail}', { detail: saveError })}
            </p>
            <button className="btn ghost block" onClick={saveTexteSeul}>
              {t('💾 Enregistrer le texte seul (titre, artiste, paroles)')}
            </button>
          </div>
        )}
        {!isNew && (
          <>
            <div className="spacer" />
            <div style={{ textAlign: 'center' }}>
              <button className="btn ghost small" onClick={voirPartition}>
                <Icon name="eye" size={14} /> {t('Voir la partition')}
              </button>
            </div>
            <div className="sheetsep" aria-hidden="true" style={{ margin: 'var(--sp-4) 0' }} />
            <button
              className="btn ghost block"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => setSuppr(true)}
            >
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
