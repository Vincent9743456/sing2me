/** Données de démonstration (premier lancement). Chansons originales fictives. */
import { migrateSong } from './lib/model';
import { makeId, Song } from './types';

export function seedSongs(): Song[] {
  const now = new Date().toISOString();
  const base: unknown[] = [
    {
      id: makeId(),
      title: 'Lumière du soir (démo)',
      artist: 'Sing2Me',
      key: 'Am',
      tempo: 92,
      capo: 0,
      durationSec: 225,
      tags: ['ballade', 'démo'],
      structure: [
        {
          id: makeId(),
          label: 'Intro',
          chords: 'Am F C G',
          comment: 'arpèges, x2 — batterie seule au début',
        },
        {
          id: makeId(),
          label: 'Couplet',
          chords: 'Am F C G',
          comment: 'batterie entre au 2e couplet',
        },
        { id: makeId(), label: 'Refrain', chords: 'F C G Am', comment: '' },
        {
          id: makeId(),
          label: 'Pont',
          chords: 'Dm Am Dm E7',
          comment: 'on s’arrête sur le E7, reprise tous ensemble',
        },
        {
          id: makeId(),
          label: 'Final',
          chords: '',
          comment: 'refrain a capella avec le public',
        },
      ],
      lyrics:
        "[Am]Sous le ciel qui [F]s'endort\n" +
        '[C]La ville allume ses [G]lampes\n' +
        '[Am]Je cherche encore un [F]accord\n' +
        '[C]Qui ressemble à ta [G]voix\n' +
        '\n' +
        '[F]Chante-moi la [C]lumière du soir\n' +
        '[G]Encore une fois, [Am]encore\n' +
        '[F]Chante-moi ce [C]vieux refrain\n' +
        '[G]Qui nous mène jusqu’au ma[Am]tin\n' +
        '\n' +
        '[Dm]Et si la nuit [Am]tombe\n' +
        '[Dm]On chantera plus [E7]fort',
      notes: 'Démarrer en douceur. Fin : refrain a capella avec le public.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeId(),
      title: 'Route 62 (démo)',
      artist: 'Sing2Me',
      key: 'E',
      tempo: 128,
      capo: 0,
      durationSec: 190,
      tags: ['rock', 'démo'],
      structure: [
        { id: makeId(), label: 'Intro', chords: 'E A E B7', comment: 'riff guitare' },
        { id: makeId(), label: 'Couplet', chords: 'E A E B7', comment: '' },
        {
          id: makeId(),
          label: 'Refrain',
          chords: 'A E B7 E',
          comment: 'bien caler la basse avec la grosse caisse',
        },
      ],
      lyrics:
        '[E]Le moteur chante sur la [A]route\n' +
        '[E]Le soleil tape sur le [B7]toit\n' +
        '[E]On roule sans un [A]doute\n' +
        '[E]Vers un [B7]endroit qu’on ne connaît [E]pas\n' +
        '\n' +
        '[A]Route soixante-[E]deux\n' +
        '[B7]Emmène-nous [E]loin\n' +
        '[A]Tant qu’on est [E]deux\n' +
        '[B7]On ne craint [E]rien',
      notes: 'Tempo soutenu.',
      createdAt: now,
      updatedAt: now,
    },
  ];
  // La migration ajoute versions et notes de répétition.
  return base.map(migrateSong);
}
