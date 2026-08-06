/** Liens de recherche du morceau sur les plateformes (souvenir de concert). */
export function streamLinks(title: string, artist: string) {
  const q = encodeURIComponent(`${title} ${artist}`.trim());
  return [
    { name: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { name: 'Apple Music', url: `https://music.apple.com/search?term=${q}` },
    { name: 'Deezer', url: `https://www.deezer.com/search/${q}` },
  ];
}
