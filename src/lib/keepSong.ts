/**
 * « Garder ce morceau » (bœuf, multi-live b121) : copie PERSONNELLE du
 * morceau diffusé, déposée dans les PROPOSITIONS — jamais partagée ni synchronisée
 * vers un groupe. Module APP SEULEMENT : il touche au store et au modèle,
 * il ne doit JAMAIS être importé par l'entrée publique légère (budget
 * spectateur < 100 Ko). L'app l'injecte dans la page Live via la prop
 * onKeep ; l'entrée publique ne passe rien.
 */
import { LiveSong } from './live';
import { normalizeTitle } from './normalizeTitle';
import { emptySong, Song } from '../types';

export function makeKeepSong(store: {
  songs: Song[];
  saveSong: (song: Song) => void;
}): (song: LiveSong) => string {
  return (song) => {
    const key = normalizeTitle(song.title);
    if (
      key !== '' &&
      store.songs.some((x) => normalizeTitle(x.title) === key)
    ) {
      return 'Déjà dans ta bibliothèque';
    }
    const base = emptySong();
    const content =
      song.chords && song.chords !== '' ? song.chords : song.lyrics;
    const k = song.chordKey ?? song.playedKey ?? '';
    store.saveSong({
      ...base,
      title: song.title,
      artist: song.artist,
      key: k,
      capo: song.capo ?? 0,
      lyrics: content,
      structure: [],
      versions: base.versions.map((v) => ({
        ...v,
        key: k,
        capo: song.capo ?? 0,
        lyrics: content,
        structure: [],
      })),
      idea: true,
      keptAtJam: true,
    });
    return 'Gardé dans tes propositions';
  };
}
