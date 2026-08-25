/**
 * Historique des directs (b176) — sur l'onglet Live.
 *
 * Ce composant AFFICHE ; il ne décide pas de ce qu'est un live. Ce découpage
 * vit dans `src/lib/pastlives.ts`, partagé avec le compteur de la fiche
 * Artiste : un direct = un appui sur GO LIVE, borné par la ligne que le
 * serveur enregistre à ce moment-là. Les morceaux archivés et les mots du
 * public s'y rattachent par leur horaire.
 *
 * Le nom donné après coup vit dans les préférences (`prefs.liveNames`) :
 * côté serveur un direct n'a qu'une date, l'artiste seul sait que c'était
 * « la soirée chez Marco ».
 */
import React, { useState } from 'react';

import { Icon } from './Icon';
import { usePastLives } from './usePastLives';
import { MojoLoader } from './MojoLoader';
import { t } from '../i18n';
import { dureesLive, fetchDiag, triMots } from '../lib/live';
import {
  cleMois,
  dateDeTitre,
  dateRelative,
  heureCourte,
  libelleMois,
  sansActivite,
} from '../lib/livedates';
import { diagActif } from '../lib/modediag';
import { PastLive } from '../lib/pastlives';
import { navigate } from '../router';
import { useStore } from '../store';

/** A7 — le sous-titre : date relative traduite + heure. */
function sousTitreDate(iso: string): string {
  const r = dateRelative(iso);
  const h = heureCourte(iso);
  if (r.quand === 'aujourdhui') return `${t("Aujourd'hui")} · ${h}`;
  if (r.quand === 'hier') return `${t('Hier')} · ${h}`;
  if (r.quand === 'ilya') return `${t('Il y a {n} jours', { n: r.jours })} · ${h}`;
  return `${r.texte} · ${h}`;
}

export function LiveHistory() {
  const { prefs } = useStore();
  // Récupération et calcul mis en commun (b207) : le même crochet sert à la
  // fiche Artiste et au retour affiché sur un concert joué.
  const { lives, messages, loading, failed, ready } = usePastLives();
  // Le « Afficher plus » de b204 est remplacé par le regroupement PAR MOIS
  // (b359, lot A de la refonte Live) : mois courant ouvert, précédents
  // repliés — l'écran ne croît plus avec l'ancienneté du compte.
  // Le PANNEAU superposé a disparu en b361 (lot C) : toucher une carte ouvre
  // le récap, une vraie route (#/pastlive/:id) — nommer et supprimer un live
  // vivent là-bas désormais.

  function nomDe(live: PastLive): string {
    const donne = (prefs.liveNames ?? {})[live.id] ?? '';
    return donne !== '' ? donne : live.concertTitle;
  }

  if (!ready) return null;
  if (loading) {
    return (
      <>
        <h2 className="pagetitle">{t('Historique')}</h2>
        {/* Mojo pendant le chargement des lives (b307), à l'endroit même où
            la liste va apparaître — inline, pas une surcouche. */}
        <MojoLoader inline active label={t('On retrouve tes lives…')} />
      </>
    );
  }
  if (failed) {
    return (
      <>
        <h2 className="pagetitle">{t('Historique')}</h2>
        <p className="help">
          {t('Historique indisponible pour l’instant — il reviendra.')}
        </p>
      </>
    );
  }
  if (lives.length === 0) {
    return (
      <>
        <h2 className="pagetitle">{t('Historique')}</h2>
        <p className="help">
          {t('Aucun live pour l’instant — lance-en un depuis le bouton « Live ».')}
        </p>
        <Diagnostic
          liveKey={prefs.liveKey}
          recus={messages?.length ?? 0}
          rattaches={0}
        />
      </>
    );
  }

  /**
   * A4/A6 — la carte unifiée : titre (nom, sinon « Live du 17 août »),
   * sous-titre (date relative · heure · formation), compteurs seulement
   * s'ils sont non nuls, en icônes vectorielles avec libellés pluriels.
   */
  const carte = (l: PastLive, estompee = false) => {
    const compteurs: React.ReactNode[] = [];
    if (l.uniques > 0) {
      compteurs.push(
        <span key="u">
          <Icon name="users" size={12} />{' '}
          {l.uniques > 1
            ? t('{n} spectateurs', { n: l.uniques })
            : t('{n} spectateur', { n: l.uniques })}
        </span>,
      );
    }
    if (l.hearts > 0) {
      compteurs.push(
        <span key="h">
          <Icon name="heart" size={12} />{' '}
          {l.hearts > 1
            ? t('{n} cœurs', { n: l.hearts })
            : t('{n} cœur', { n: l.hearts })}
        </span>,
      );
    }
    if (l.messages.length > 0) {
      compteurs.push(
        <span key="m">
          <Icon name="message" size={12} />{' '}
          {l.messages.length > 1
            ? t('{n} mots', { n: l.messages.length })
            : t('{n} mot', { n: l.messages.length })}
        </span>,
      );
    }
    return (
      <div
        className="row"
        key={l.id}
        style={{ cursor: 'pointer', opacity: estompee ? 0.55 : undefined }}
        onClick={() => navigate(`/pastlive/${l.id}`)}
      >
        <div className="grow">
          <div className="title">
            {nomDe(l) !== ''
              ? nomDe(l)
              : t('Live du {date}', { date: dateDeTitre(l.startedAt) })}
            {l.endedAt === null && (
              <span className="stauthor"> · {t('en cours')}</span>
            )}
          </div>
          <div className="sub">
            {sousTitreDate(l.startedAt)}
            {' · '}
            {l.band !== '' ? l.band : t('Solo')}
          </div>
          {compteurs.length > 0 && (
            <div className="sub" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {compteurs}
            </div>
          )}
        </div>
        <Icon name="chevron-right" size={16} />
      </div>
    );
  };

  /**
   * A5/A8 — les sessions SANS ACTIVITÉ (0 spectateur, 0 cœur, 0 mot) sont
   * des tests : regroupées sous un repli fermé en bas de section. Le reste
   * est regroupé PAR MOIS, le mois courant ouvert, les précédents repliés.
   */
  const actifs = lives.filter((l) => !sansActivite(l));
  const inactifs = lives.filter((l) => sansActivite(l));
  const parMois = new Map<string, PastLive[]>();
  for (const l of actifs) {
    const k = cleMois(l.startedAt);
    parMois.set(k, [...(parMois.get(k) ?? []), l]);
  }
  const moisCourant = cleMois(new Date().toISOString());
  const moisTries = [...parMois.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <>
      {/* A3 : « Tes derniers lives » → « Historique ». */}
      <h2 className="pagetitle">{t('Historique')}</h2>
      {moisTries.map((k) =>
        k === moisCourant ? (
          <div className="list" key={k}>
            {(parMois.get(k) ?? []).map((l) => carte(l))}
          </div>
        ) : (
          <details className="stfold" key={k}>
            <summary style={{ minHeight: 44, textTransform: 'uppercase' }}>
              {libelleMois(k)} ({(parMois.get(k) ?? []).length})
            </summary>
            <div className="list">{(parMois.get(k) ?? []).map((l) => carte(l))}</div>
          </details>
        ),
      )}
      {actifs.length === 0 && inactifs.length > 0 && (
        <p className="help" style={{ margin: '2px 0 8px' }}>
          {t('Rien à montrer encore — tes sessions d’essai sont repliées ci-dessous.')}
        </p>
      )}
      {inactifs.length > 0 && (
        <details className="stfold">
          <summary style={{ minHeight: 44 }}>
            {inactifs.length > 1
              ? t('{n} sessions sans activité', { n: inactifs.length })
              : t('{n} session sans activité', { n: inactifs.length })}
          </summary>
          <div className="list">{inactifs.map((l) => carte(l, true))}</div>
        </details>
      )}

      <Diagnostic
        liveKey={prefs.liveKey}
        recus={messages?.length ?? 0}
        rattaches={lives.reduce((n, l) => n + l.messages.length, 0)}
      />

    </>
  );
}

/**
 * « Pourquoi c'est vide ? » (b178) — replié par défaut, en petits
 * caractères : ça ne s'adresse pas à l'usage courant, mais ça évite un
 * aller-retour d'une journée quand un écran reste à zéro sans raison.
 */
/**
 * Diagnostic ON AIR — RÉSERVÉ AU DÉPANNAGE (b198).
 *
 * Il a servi : c'est lui qui a fini par dire « column live_messages.author
 * does not exist », après trois corrections à l'aveugle. Mais des noms de
 * tables et des messages d'erreur SQL n'ont rien à faire sous les yeux d'un
 * musicien (demande de Vincent) — il ne s'affiche donc plus qu'en ouvrant
 * l'app avec `?diag=1`, et reste invisible le reste du temps.
 */
function diagDemande(): boolean {
  // b342 : le mode peut aussi être activé DANS l'app (cinq appuis sur le
  // numéro de version) — l'app installée n'a pas de barre d'adresse.
  if (diagActif()) return true;
  try {
    return (
      new URLSearchParams(location.search).get('diag') === '1' ||
      location.hash.includes('diag=1')
    );
  } catch {
    return false;
  }
}

function Diagnostic({
  liveKey,
  recus,
  rattaches,
}: {
  liveKey: string;
  /** Mots du public que l'app a bien reçus du serveur. */
  recus: number;
  /** Ceux qui ont trouvé leur live. */
  rattaches: number;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchDiag>>>(null);
  const [asked, setAsked] = useState(false);
  const tri = triMots();
  if (!diagDemande()) return null;
  return (
    <details
      className="stfold"
      onToggle={(e) => {
        if (!(e.currentTarget as HTMLDetailsElement).open || asked) return;
        setAsked(true);
        void fetchDiag(liveKey).then(setData);
      }}
    >
      <summary>{t('Pourquoi c’est vide ?')}</summary>
      <div className="spacer" />
      {data === null ? (
        <p className="help">{t('Vérification…')}</p>
      ) : data.configured === false ? (
        <p className="help">{data.note ?? t('Le live n’est pas configuré.')}</p>
      ) : (
        <div className="card">
          {/* La table peut être pleine et l'écran vide : ces deux chiffres
              disent lequel des deux maillons casse (b186). */}
          <div className="strow">
            <span style={{ flex: 1, fontSize: '0.8rem' }}>
              {t('mots reçus par l’app')}
            </span>
            <span className="stauthor" style={{ fontSize: '0.78rem' }}>
              {t('{n} reçus · {m} rattachés à un live', {
                n: recus,
                m: rattaches,
              })}
            </span>
          </div>
          {/* Le maillon exact : combien de lignes le serveur a LU, et combien
              il en a gardé pour ce compte (b191). « 0 lu » = lecture en
              échec ; « lu > gardé » = ils appartiennent à quelqu'un d'autre. */}
          <div className="strow">
            <span style={{ flex: 1, fontSize: '0.8rem' }}>{t('tri côté serveur')}</span>
            <span className="stauthor" style={{ fontSize: '0.78rem' }}>
              {tri.read === null
                ? t('lecture en échec : {d}', { d: tri.detail || '?' })
                : t('{n} lus · {m} pour moi', { n: tri.read, m: tri.kept ?? 0 })}
            </span>
          </div>
          {/* b341 — où partent les secondes du chargement : durée vue par
              l'app, et chrono étape par étape du serveur (avec sa région
              d'exécution). Le delta entre les deux = réseau + démarrage à
              froid Vercel. */}
          {(['historique', 'mots'] as const).map((quoi) => {
            const d = dureesLive()[quoi];
            if (!d) return null;
            const s = d.serveur;
            const etapes =
              s === null
                ? t('(pas de chrono serveur — vieille version déployée ?)')
                : Object.entries(s)
                    .filter(([k]) => k !== 'region')
                    .map(([k, v]) => `${k} ${String(v)}`)
                    .join(' · ') + (s.region ? ` · ${String(s.region)}` : '');
            return (
              <div className="strow" key={quoi}>
                <span style={{ flex: 1, fontSize: '0.8rem' }}>
                  {quoi === 'historique'
                    ? t('durée — historique')
                    : t('durée — mots du public')}
                </span>
                <span className="stauthor" style={{ fontSize: '0.78rem' }}>
                  {t('{n} ms vus par l’app', { n: d.clientMs })} — {etapes}
                </span>
              </div>
            );
          })}
          {data.tables.map((tb) => (
            <div className="strow" key={tb.table}>
              <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {tb.table}
              </span>
              <span className="stauthor" style={{ fontSize: '0.78rem' }}>
                {!tb.ok
                  ? t('inaccessible : {d}', { d: tb.detail || '?' })
                  : tb.rows === 0
                    ? t('vide')
                    : t('{n} ligne(s)', { n: tb.rows ?? 0 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
