import React, { useEffect } from 'react';

import { AccountProvider, useAccount } from './components/Account';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Feedback';
import { InstallHint } from './components/InstallHint';
import { UpdateHint } from './components/UpdateHint';
import { NotificationsProvider, useNotifications } from './components/Notifications';
import { OnAirButton, OnAirProvider } from './components/OnAir';
import { TabBar } from './components/ui';
import { Artist } from './pages/Artist';
import { Settings } from './pages/Settings';
import { Songbook } from './pages/Songbook';
import { BandChat } from './pages/BandChat';
import { Bands } from './pages/Bands';
import { BandEdit } from './pages/BandEdit';
import { Live } from './pages/Live';
import { ConcertEdit, Concerts } from './pages/Concerts';
import { Import } from './pages/Import';
import { Follow } from './pages/Follow';
import { Remote } from './pages/Remote';
import { Library } from './pages/Library';
import { SetlistEdit } from './pages/SetlistEdit';
import { SetlistSono } from './pages/SetlistSono';
import { SetlistView } from './pages/SetlistView';
import { Setlists } from './pages/Setlists';
import { SharePage } from './pages/SharePage';
import { SongEdit } from './pages/SongEdit';
import { SongView } from './pages/SongView';
import { Stage } from './pages/Stage';
import { Terms } from './pages/Terms';
import { Report } from './pages/Report';
import { PublicArtist, publicNameFromPath } from './pages/PublicArtist';
import { RESERVED_NAMES } from './lib/publicName';
import { makeKeepSong } from './lib/keepSong';
import { Welcome } from './pages/Welcome';
import { resolveLang, setLang } from './i18n';
import { useRoute } from './router';
import { StoreProvider, useStore } from './store';

/**
 * Langue de l'interface (b156) : fixée AVANT le rendu des enfants, à
 * partir du réglage (« automatique » = langue du téléphone). Le `key`
 * force le remontage de l'arbre quand la langue change : tous les
 * écrans se réaffichent aussitôt dans la nouvelle langue.
 */
function Localized({ children }: { children: React.ReactNode }) {
  const { prefs } = useStore();
  const lang = resolveLang(prefs.lang);
  setLang(lang);
  return <React.Fragment key={lang}>{children}</React.Fragment>;
}

/** Page live DANS l'app : on injecte « Garder ce morceau » (store présent).
 *  L'entrée publique légère rend <Live /> sans rien — aucun store chargé. */
function LiveInApp({ code }: { code: string }) {
  const { songs, saveSong } = useStore();
  return <Live code={code} onKeep={makeKeepSong({ songs, saveSong })} />;
}

function Screen() {
  const route = useRoute();
  const { badge } = useNotifications();
  const account = useAccount();

  // Chaque page s'ouvre en haut. Les pages à mémoire de position (la
  // bibliothèque) restaurent ensuite leur propre défilement par-dessus.
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  // Lien dictable (chantier 4) : livemyband.fr/lenom → page publique de
  // l'artiste. Détecté sur le CHEMIN (pas le hash), donc prioritaire.
  const pubName = publicNameFromPath();
  if (pubName && !RESERVED_NAMES.has(pubName)) {
    return <PublicArtist name={pubName} />;
  }

  // Pages publiques (spectateurs) : sans navigation ni bouton ON AIR
  if (route.name === 'share') {
    return <SharePage data={route.data} shortId={route.shortId} />;
  }
  if (route.name === 'live') {
    return <LiveInApp code={route.code} />;
  }
  if (route.name === 'cgu') {
    return (
      <div className="public">
        <Terms />
      </div>
    );
  }
  if (route.name === 'report') {
    return (
      <div className="public">
        <Report />
      </div>
    );
  }
  // Portail d'entrée (décision Vincent, b120) : compte obligatoire pour
  // l'app musicien. Le test est LOCAL (session en localStorage) — un compte
  // déjà connecté ouvre l'app même sans réseau (mode avion). Les pages
  // publiques ci-dessus ne passent jamais par ici ; si l'authentification
  // n'est pas configurée (déploiement sans cloud), on n'enferme personne.
  if (account && account.available && account.email === null) {
    return <Welcome />;
  }

  // Mode scène : plein écran, mais le bouton ON AIR reste accessible
  if (route.name === 'stage') {
    return (
      <>
        <Stage setlistId={route.setlistId} songId={route.songId} />
        <OnAirButton />
      </>
    );
  }

  let page: React.ReactNode;
  switch (route.name) {
    case 'library':
      page = <Library />;
      break;
    case 'song':
      page = <SongView id={route.id} key={route.id} />;
      break;
    case 'songEdit':
      page = <SongEdit id={route.id} key={route.id ?? 'new'} />;
      break;
    case 'import':
      page = <Import />;
      break;
    case 'setlists':
      page = <Setlists />;
      break;
    case 'setlist':
      page = <SetlistView id={route.id} key={route.id} />;
      break;
    case 'setlistEdit':
      page = <SetlistEdit id={route.id} key={route.id ?? 'new'} />;
      break;
    case 'setlistSono':
      page = <SetlistSono id={route.id} key={route.id} />;
      break;
    case 'songInSet':
      page = (
        <SongView
          id=""
          fromSetlist={{ setlistId: route.setlistId, index: route.index }}
          key={`${route.setlistId}:${route.index}`}
        />
      );
      break;
    case 'concerts':
      page = <Concerts />;
      break;
    case 'concert':
      page = <ConcertEdit id={route.id} key={route.id ?? 'new'} />;
      break;
    case 'artist':
      page = <Artist />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    case 'songbook':
      page = <Songbook />;
      break;
    case 'bands':
      page = <Bands />;
      break;
    case 'band':
      page = <BandEdit id={route.id} key={route.id} />;
      break;
    case 'bandChat':
      page = <BandChat id={route.id} key={route.id} />;
      break;
    case 'follow':
      page = <Follow code={route.code} />;
      break;
    case 'remote':
      page = <Remote setlistId={route.setlistId} key={route.setlistId} />;
      break;
  }

  // Le bouton « GO LIVE » vit DANS la barre de titre de chaque page
  // (TopBar, prop `live`) : même endroit partout, jamais flottant. Les
  // pages où lancer un direct n'a pas de sens passent `live={false}`.
  // Seul le mode scène (sans barre) garde le bouton flottant, ci-dessus.
  return (
    <div className="app">
      {page}
      <TabBar current={route.name} bandsBadge={badge} />
      <InstallHint />
      <UpdateHint />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <Localized>
          <AccountProvider>
            <ToastProvider>
              <NotificationsProvider>
                <OnAirProvider>
                  <Screen />
                </OnAirProvider>
              </NotificationsProvider>
            </ToastProvider>
          </AccountProvider>
        </Localized>
      </StoreProvider>
    </ErrorBoundary>
  );
}
