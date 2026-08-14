/**
 * REDIRECTION 302 VERS LA RECHERCHE UG (b321).
 *
 * Pourquoi côté serveur : le relais JavaScript (b320) ne suffisait pas — sur
 * l'iPhone de Vincent, le LIEN UNIVERSEL interceptait encore la navigation et
 * ouvrait l'application UG installée (où la copie est impossible). Or iOS
 * n'évalue les liens universels que sur l'URL D'ORIGINE de la navigation,
 * jamais sur la destination d'une redirection HTTP : en passant par une 302
 * depuis NOTRE domaine, le navigateur atterrit sur UG sans réveiller l'app.
 *
 * AUCUNE requête vers UG ne part d'ici : on n'envoie qu'un en-tête Location
 * au navigateur de l'utilisateur — c'est lui qui navigue (même posture
 * juridique que b319).
 */
export default function handler(req, res) {
  const q = String(req.query?.q ?? '').slice(0, 200);
  const url =
    'https://www.ultimate-guitar.com/search.php?search_type=title&value=' +
    encodeURIComponent(q);
  res.setHeader('cache-control', 'no-store');
  res.redirect(302, url);
}
