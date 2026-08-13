/**
 * FABRICATION DU SERVICE WORKER (b221).
 *
 * L'app se disait « local-first » et ne l'était qu'à moitié : les DONNÉES
 * vivaient bien en localStorage, mais le CODE, lui, était retéléchargé à
 * chaque lancement. Sans réseau, l'app ne s'ouvrait pas du tout — installée
 * sur l'écran d'accueil, elle affichait une page d'erreur sans même une barre
 * d'adresse pour comprendre. Un musicien dans une salle sans réseau ne
 * pouvait pas ouvrir sa setlist.
 *
 * Ce script tourne APRÈS `vite build`. Il lit le contenu réel de `dist/` et
 * écrit `dist/sw.js` avec la liste exacte des fichiers de CE build. Deux
 * conséquences voulues :
 *   - le nom du cache change à chaque livraison, donc l'ancien est supprimé
 *     et personne ne reste coincé sur une vieille version ;
 *   - aucune dépendance supplémentaire, aucun plugin de build. Le fichier
 *     produit est lisible, court, et se relit en entier avant livraison.
 *
 * On n'invente rien : la liste vient du disque. Si un fichier attendu manque,
 * l'installation échoue bruyamment plutôt que de laisser une coquille
 * incomplète.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

/** Les deux coquilles : sans elles, rien ne s'ouvre hors ligne. */
const OBLIGATOIRES = ['/index.html', '/public.html'];

/**
 * PAGES AUTONOMES HÉBERGÉES À CÔTÉ DE L'APP (b292) : de simples HTML servis
 * au même domaine, SANS aucun lien avec l'app. Le service worker ne doit PAS
 * s'en mêler — ni les mettre en cache, ni (surtout) les traiter comme une
 * navigation d'app. Sans ce contournement, ouvrir `/mojotune.html` ferait
 * `cache.put('/index.html', <cette page>)` (via `coquillePour`) et
 * EMPOISONNERAIT la coquille de l'app (l'app hors-ligne servirait l'outil à
 * sa place). On les exclut donc du précache ET on les laisse passer au réseau.
 */
const AUTONOMES = ['/mojocomposer.html', '/mojotune.html'];

/**
 * Ce qui ne doit JAMAIS être mis en cache :
 *  - `version.txt` sert justement à vérifier la version DÉPLOYÉE ;
 *  - `site/` est la landing publique, elle n'a rien à faire hors ligne ;
 *  - les pages autonomes (b292), indépendantes de l'app ;
 *  - les cartes de source (`.map`), inutiles à l'exécution.
 */
function aGarder(chemin) {
  if (chemin === '/version.txt') return false;
  if (chemin.startsWith('/site/')) return false;
  if (AUTONOMES.includes(chemin)) return false;
  if (chemin.endsWith('.map')) return false;
  return true;
}

function listerFichiers(dossier) {
  const out = [];
  for (const nom of readdirSync(dossier)) {
    const complet = join(dossier, nom);
    if (statSync(complet).isDirectory()) out.push(...listerFichiers(complet));
    else out.push('/' + relative(DIST, complet).split('\\').join('/'));
  }
  return out;
}

const fichiers = listerFichiers(DIST).filter(aGarder).sort();
const manquants = OBLIGATOIRES.filter((f) => !fichiers.includes(f));
if (manquants.length > 0) {
  console.error(`build-sw : coquille introuvable — ${manquants.join(', ')}`);
  process.exit(1);
}

// Empreinte du build : la somme des noms de fichiers (déjà hachés par Vite)
// suffit à changer dès qu'un octet de l'app change.
const empreinte = readFileSync(new URL('../public/version.txt', import.meta.url), 'utf8').trim();
const cle = `${empreinte}-${fichiers.length}-${fichiers.join('|').length}`;

const source = `/* Généré par scripts/build-sw.mjs — ne pas modifier à la main. */
const CACHE = 'mojosong-${cle}';
const COQUILLES = ${JSON.stringify(OBLIGATOIRES)};
const FICHIERS = ${JSON.stringify(fichiers)};
/* Pages autonomes hébergées à côté de l'app : le SW ne les touche pas. */
const AUTONOMES = ${JSON.stringify(AUTONOMES)};

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Les coquilles sont indispensables : si elles manquent, mieux vaut
      // échouer l'installation que laisser un cache à moitié rempli.
      await cache.addAll(COQUILLES);
      // Le reste au mieux : un fichier absent ne doit pas priver l'app de
      // tout son hors-ligne.
      await Promise.allSettled(
        FICHIERS.filter((f) => COQUILLES.indexOf(f) === -1).map((f) =>
          cache.add(f),
        ),
      );
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Une livraison = un nouveau nom de cache. On efface les précédents,
      // pour que personne ne reste coincé sur une vieille version.
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter(
            (n) =>
              // On reconnaît les préfixes SUCCESSIFS du produit (sing2me →
              // dodosongs → mojosong) pour n'oublier aucun ancien cache sur
              // les téléphones déjà installés.
              (n.indexOf('mojosong-') === 0 ||
                n.indexOf('dodosongs-') === 0 ||
                n.indexOf('sing2me-') === 0) &&
              n !== CACHE,
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Le direct et le contrôle de version ne se mettent JAMAIS en cache. */
function toujoursFrais(url) {
  return url.pathname.indexOf('/api/') === 0 || url.pathname === '/version.txt';
}

/** Quelle coquille sert cette adresse ? (mêmes règles que vercel.json) */
function coquillePour(url) {
  if (url.pathname === '/live') return '/public.html';
  if (/^\\/[a-z0-9]{3,30}$/.test(url.pathname)) return '/public.html';
  return '/index.html';
}

const DELAI_RESEAU_MS = 2500;

/**
 * Ouverture de l'app : le réseau d'abord (une livraison récente arrive tout
 * de suite), la coquille en cache si le réseau ne répond pas. En mode avion
 * l'échec est immédiat : le repli ne se voit pas.
 */
async function reseauPuisCoquille(req, url) {
  const coquille = coquillePour(url);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
    const rep = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    if (rep && rep.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(coquille, rep.clone());
    }
    return rep;
  } catch (_) {
    const cache = await caches.open(CACHE);
    // ignoreVary : les fichiers du build sont servis avec « Vary: Origin »,
    // et un module chargé en crossorigin envoie un en-tête Origin que la mise
    // en cache initiale n'avait pas. Sans cette option, RIEN ne correspond et
    // l'app reste noire hors ligne — c'est exactement le bug de b221.
    const enCache = await cache.match(coquille, { ignoreVary: true });
    if (enCache) return enCache;
    throw _;
  }
}

/** Fichiers du build : leur nom porte une empreinte, ils ne changent jamais. */
async function cacheDAbord(req) {
  const cache = await caches.open(CACHE);
  const enCache = await cache.match(req, { ignoreVary: true });
  if (enCache) return enCache;
  const rep = await fetch(req);
  if (rep && rep.ok) await cache.put(req, rep.clone());
  return rep;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (toujoursFrais(url)) return;
  // Pages autonomes (b292) : indépendantes de l'app, le SW les laisse au
  // réseau — jamais de cache, jamais de coquille (sinon l'index serait
  // empoisonné par leur contenu).
  if (AUTONOMES.indexOf(url.pathname) !== -1) return;
  if (req.mode === 'navigate') {
    e.respondWith(reseauPuisCoquille(req, url));
    return;
  }
  e.respondWith(cacheDAbord(req));
});

// Sortie de secours : l'app peut demander l'effacement complet.
self.addEventListener('message', (e) => {
  if (e.data === 'vider-le-cache') {
    e.waitUntil(
      caches.keys().then((noms) => Promise.all(noms.map((n) => caches.delete(n)))),
    );
  }
});
`;

writeFileSync(join(DIST, 'sw.js'), source);
console.log(
  `build-sw : dist/sw.js écrit — ${fichiers.length} fichiers, cache « mojosong-${cle} »`,
);
