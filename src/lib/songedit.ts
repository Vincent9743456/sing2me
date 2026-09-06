/**
 * PRÉPARATION D'UN ENREGISTREMENT DEPUIS L'ÉDITEUR (b499, lot 1 des tests
 * du 05/09/2026 — l'éditeur qui « se fige » chez Vincent).
 *
 * Ce calcul vivait dans le composant SongEdit : toute exception au milieu
 * (une donnée ancienne à la forme inattendue, une hypothèse de champ fausse)
 * y mourait EN SILENCE — « Enregistrer » ne faisait rien, sans un mot, et
 * sur un morceau multi-versions la feuille « Appliquer à… » restait ouverte,
 * son voile bloquant toute la page. Le pire des symptômes : un gel muet.
 *
 * Il vit désormais ici, en FONCTION PURE :
 *  · testable sans navigateur (scripts/test-editeur.mjs) ;
 *  · sans hypothèse de forme sur les lignes de structure — une donnée
 *    d'avant un champ n'a pas à faire perdre une session d'édition ;
 *  · et l'appelant peut l'encadrer : si malgré tout quelque chose casse,
 *    l'échec SE DIT à l'écran et la sortie « Enregistrer le texte seul »
 *    (enregistrementTexteSeul) écrit les paroles telles quelles — on ne
 *    perd JAMAIS le travail de quelqu'un parce qu'un calcul annexe a raté.
 */
import {
  propagateMainKeyCapo,
  switchVersion,
  syncActiveVersion,
} from './model';
import { parseDuration, Song } from '../types';

export interface ChampsEditeur {
  /** Le brouillon d'écran (copie de travail du morceau). */
  draft: Song;
  /** Le morceau tel qu'il est en bibliothèque (undefined en création). */
  existing: Song | undefined;
  durationText: string;
  tagsText: string;
  versionName: string;
  versionBandId: string;
}

/** Fige les champs édités dans la version courante du brouillon.
 *  L'originale (versions[0]) reste TOUJOURS personnelle (bandId ''). */
export function bakeDraft(
  d: Song,
  versionName: string,
  versionBandId: string,
): Song {
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

/**
 * Construit le morceau à enregistrer. `scope` = 'all' recopie la partition
 * affichée dans toutes les versions. Pure : ne touche ni au store ni au DOM.
 */
export function preparerEnregistrement(
  champs: ChampsEditeur,
  scope: 'current' | 'all',
): Song {
  const { draft, existing, durationText, tagsText, versionName, versionBandId } =
    champs;
  let base: Song = {
    ...draft,
    durationSec: parseDuration(durationText),
    tags: tagsText
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter((t) => t !== ''),
    // AUCUNE hypothèse sur la forme d'une ligne (b499) : une ligne d'avant
    // le champ `comment` (ou au label absent) faisait jeter `.trim()` — et
    // tout le geste d'enregistrement avec. On lit ce qui est là, c'est tout.
    structure: draft.structure.filter(
      (r) =>
        (r?.label ?? '').trim() !== '' ||
        (r?.chords ?? '').trim() !== '' ||
        (r?.comment ?? '').trim() !== '',
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
        structure: base.structure.map((r) => ({ ...r })),
        lyrics: base.lyrics,
        updatedAt: now,
      })),
    };
  }
  let song: Song = bakeDraft(base, versionName, versionBandId);
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
  // RELIRE, C'EST VÉRIFIER : un morceau « à vérifier » sort de la liste
  // dès qu'on l'a modifié à la main.
  if (song.needsCheck) song = { ...song, needsCheck: undefined };
  return song;
}

/**
 * LA SORTIE DE SECOURS (b499) : si `preparerEnregistrement` a levé une
 * exception malgré tout, on écrit le TEXTE BRUT — titre, artiste, paroles,
 * notes de structure — sur le morceau tel qu'il est en bibliothèque, sans
 * aucun des calculs annexes (durée, tags, portée multi-versions, capo…).
 * Le formatage se rattrapera ; une session d'édition perdue, jamais.
 */
export function enregistrementTexteSeul(champs: ChampsEditeur): Song {
  const { draft, existing } = champs;
  const socle = existing ?? draft;
  const now = new Date().toISOString();
  return {
    ...socle,
    title: draft.title,
    artist: draft.artist,
    lyrics: draft.lyrics,
    structureNotes: draft.structureNotes ?? socle.structureNotes,
    versions: (Array.isArray(socle.versions) ? socle.versions : []).map((v) =>
      v.id === socle.activeVersionId
        ? { ...v, lyrics: draft.lyrics, updatedAt: now }
        : v,
    ),
    needsCheck: undefined,
  };
}

/** La partition (accords/paroles/tonalité…) de la version éditée a-t-elle
 *  changé ? Sert à ne poser la question « toutes / cette version » que
 *  quand c'est pertinent. Pure, et sans hypothèse de forme (b499). */
export function partitionChangee(champs: ChampsEditeur): boolean {
  const { draft, existing } = champs;
  if (!existing) return false;
  const v = existing.versions.find((x) => x.id === draft.activeVersionId);
  if (!v) return true;
  return (
    v.lyrics !== draft.lyrics ||
    v.key !== draft.key ||
    v.tempo !== draft.tempo ||
    v.capo !== draft.capo ||
    JSON.stringify(v.structure ?? []) !== JSON.stringify(draft.structure ?? [])
  );
}

/** QUELQUE CHOSE a-t-il changé depuis l'ouverture de l'éditeur ? Tous les
 *  champs édités comptent — pas seulement la partition. */
export function editeurModifie(champs: ChampsEditeur): boolean {
  const { draft, existing, durationText, tagsText, versionName, versionBandId } =
    champs;
  if (!existing) return true;
  if (partitionChangee(champs)) return true;
  const v = existing.versions.find((x) => x.id === draft.activeVersionId);
  const tagsDraft = tagsText
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter((x) => x !== '')
    .join(',');
  return (
    draft.title !== existing.title ||
    draft.artist !== existing.artist ||
    (draft.structureNotes ?? '') !== (existing.structureNotes ?? '') ||
    parseDuration(durationText) !== existing.durationSec ||
    tagsDraft !== existing.tags.join(',') ||
    (versionName.trim() !== '' && versionName.trim() !== (v?.name ?? '')) ||
    versionBandId !== (v?.bandId ?? '')
  );
}

/** Retour d'un geste d'enregistrement encadré. */
export type ResultatEnregistrement =
  | { ok: true; song: Song }
  | { ok: false; erreur: string };

/**
 * Le geste complet, ENCADRÉ : jamais d'exception qui remonte (elle gèlerait
 * l'écran en silence — le bug de ce lot). L'échec devient une valeur, que
 * l'écran AFFICHE.
 */
export function enregistrerSansGeler(
  champs: ChampsEditeur,
  scope: 'current' | 'all',
): ResultatEnregistrement {
  try {
    return { ok: true, song: preparerEnregistrement(champs, scope) };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}
