import React, { useEffect } from 'react';

import { AccountProvider } from './components/Account';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Feedback';
import { InstallHint } from './components/InstallHint';
import { NotificationsProvider, useNotifications } from './components/Notifications';
import { OnAirButton, OnAirProvider } from './components/OnAir';
import { TabBar } from './components/ui';
import { Artist } from './pages/Artist';
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
import { SetlistView } from './pages/SetlistView';
import { Setlists } from './pages/Setlists';
import { SharePage } from './pages/SharePage';
import { SongEdit } from './pages/SongEdit';
import { SongView } from './pages/SongView';
import { Stage } from './pages/Stage';
import { Terms } from './pages/Terms';
import { Report } from './pages/Report';
import { Route, useRoute } from './router';
import { StoreProvider } from './store';

function Screen() {
  const route = useRoute();
  const { badge } = useNotifications();

  // Chaque page s'ouvre en haut. Les pages à mémoire de position (la
  // bibliothèque) restaurent ensuite leur propre défilement par-dessus.
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  // Pages publiques (spectateurs) : sans navigation ni bouton ON AIR
  if (route.name === 'share') {
    return <SharePage data={route.data} shortId={route.shortId} />;
  }
  if (route.name === 'live') {
    return <Live />;
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
      page = <Follow />;
      break;
    case 'remote':
      page = <Remote setlistId={route.setlistId} key={route.setlistId} />;
      break;
  }

  // Le bouton « GO LIVE » ne s'affiche que là où lancer un direct a du sens
  // (bibliothèque, setlists, groupes, artiste…). Sur la fiche d'un morceau,
  // l'édition, l'import ou une discussion, il n'a rien à faire là et libère la
  // barre du haut (le titre respire).
  const hideLive = new Set<Route['name']>([
    'song',
    'songEdit',
    'songInSet',
    'import',
    'concert',
    'bandChat',
  ]);
  return (
    <div className="app">
      {page}
      <TabBar current={route.name} bandsBadge={badge} />
      {!hideLive.has(route.name) && <OnAirButton />}
      <InstallHint />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AccountProvider>
          <ToastProvider>
            <NotificationsProvider>
              <OnAirProvider>
                <Screen />
              </OnAirProvider>
            </NotificationsProvider>
          </ToastProvider>
        </AccountProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
