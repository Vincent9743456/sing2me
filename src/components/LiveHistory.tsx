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

import { ConfirmSheet, PromptSheet, useToast } from './Feedback';
import { Icon } from './Icon';
import { StageList } from './StageList';
import { usePastLives } from './usePastLives';
import { MojoLoader } from './MojoLoader';
import { t } from '../i18n';
import { dureesLive, fetchDiag, triMots } from '../lib/live';
import { PastLive } from '../lib/pastlives';
import { useStore } from '../store';

function jourLong(iso: string): string {
  const d = new Date(iso);
  // Dates en fr-FR (voir rapport i18n) : format court, lisible d'un coup.
  return `${d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LiveHistory() {
  const { prefs, savePrefs } = useStore();
  // Récupération et calcul mis en commun (b207) : le même crochet sert à la
  // fiche Artiste et au retour affiché sur un concert joué.
  const { lives, messages, loading, failed, ready } = usePastLives();
  const [open, setOpen] = useState<string | null>(null);
  /**
   * Historique replié (b204, demande de Vincent) : « ne présenter que les 3
   * derniers lives avec un petit bouton afficher plus ». Une soirée par
   * ligne, l'écran se remplit vite — et les concerts à venir, qui sont
   * au-dessus, se retrouvaient noyés. Les lives sont TOUS déjà chargés (une
   * seule requête) : c'est de la lisibilité, et le rendu cesse de croître
   * avec l'ancienneté du compte. Le jour où l'historique se comptera en
   * centaines, c'est ici qu'on classera par année ou par mois.
   */
  const PREMIERS = 3;
  const PAS = 10;
  const [montre, setMontre] = useState(PREMIERS);
  const [renaming, setRenaming] = useState<PastLive | null>(null);
  const [deleting, setDeleting] = useState<PastLive | null>(null);
  const toast = useToast();
  // Lives retirés de MON historique : un simple classement personnel, jamais
  // propagé aux autres membres du groupe (b183).
  const caches = prefs.hiddenLives ?? [];

  function nomDe(live: PastLive): string {
    const donne = (prefs.liveNames ?? {})[live.id] ?? '';
    return donne !== '' ? donne : live.concertTitle;
  }
  /**
   * Retirer un live de MON historique. Rien n'est effacé côté serveur : si
   * c'était un concert de groupe, il appartient aussi aux autres membres, et
   * eux seuls décident de le garder (instruction Vincent, b183).
   */
  function supprimer(live: PastLive) {
    const next = [...caches.filter((id) => id !== live.id), live.id];
    savePrefs({ ...prefs, hiddenLives: next.slice(-500) });
    setOpen(null);
    toast.show(t('Live retiré de ton historique.'));
  }
  function renommer(live: PastLive, nom: string) {
    const next = { ...(prefs.liveNames ?? {}) };
    if (nom.trim() === '') delete next[live.id];
    else next[live.id] = nom.trim().slice(0, 80);
    savePrefs({ ...prefs, liveNames: next });
  }

  if (!ready) return null;
  if (loading) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        {/* Mojo pendant le chargement des lives (b307), à l'endroit même où
            la liste va apparaître — inline, pas une surcouche. */}
        <MojoLoader inline active label={t('On retrouve tes lives…')} />
      </>
    );
  }
  if (failed) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        <p className="help">
          {t('Historique indisponible pour l’instant — il reviendra.')}
        </p>
      </>
    );
  }
  if (lives.length === 0) {
    return (
      <>
        <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
        <p className="help">
          {t('Aucun live pour l’instant — lance-en un depuis le bouton GO LIVE.')}
        </p>
        <Diagnostic
          liveKey={prefs.liveKey}
          recus={messages?.length ?? 0}
          rattaches={0}
        />
      </>
    );
  }

  const ouvert = lives.find((l) => l.id === open) ?? null;
  const visibles = lives.slice(0, montre);
  const restants = lives.length - visibles.length;

  return (
    <>
      <h2 className="pagetitle">{t('Tes derniers lives')}</h2>
      <div className="list">
        {visibles.map((l) => (
          <div
            className="row"
            key={l.id}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen(l.id === open ? null : l.id)}
          >
            <div className="grow">
              <div className="title">
                {nomDe(l) !== '' ? nomDe(l) : jourLong(l.startedAt)}
                {l.endedAt === null && (
                  <span className="stauthor"> · {t('en cours')}</span>
                )}
              </div>
              <div className="sub">
                {nomDe(l) !== '' && <>{jourLong(l.startedAt)} · </>}
                {l.band !== '' ? l.band : t('Solo')}
                {l.startedBy !== '' && (
                  <> · {t('lancé par {qui}', { qui: l.startedBy })}</>
                )}
                {l.setlist !== '' && <> · {l.setlist}</>}
                {' · '}
                {t('❤ {h} · 💬 {m} · 👥 {u}', {
                  h: l.hearts,
                  m: l.messages.length,
                  u: l.uniques,
                })}
              </div>
            </div>
            <Icon name="chevron-right" size={16} />
          </div>
        ))}
      </div>
      {restants > 0 && (
        <div style={{ textAlign: 'center', marginTop: 'var(--sp-2)' }}>
          <button
            className="btn ghost small"
            onClick={() => setMontre((n) => n + PAS)}
          >
            {restants > 1
              ? t('Afficher plus ({n} lives plus anciens)', { n: restants })
              : t('Afficher le live précédent')}
          </button>
        </div>
      )}

      {ouvert && (
        <StageList onClose={() => setOpen(null)}>
          <div className="inner">
            <button className="btn block" onClick={() => setOpen(null)}>
              {t('← Fermer')}
            </button>
            <h2 style={{ textAlign: 'center', margin: '16px 0 2px' }}>
              {nomDe(ouvert) !== '' ? nomDe(ouvert) : jourLong(ouvert.startedAt)}
            </h2>
            <p className="help" style={{ textAlign: 'center', marginTop: 0 }}>
              {jourLong(ouvert.startedAt)}
              {ouvert.endedAt !== null && <> → {heure(ouvert.endedAt)}</>}
              {' · '}
              {ouvert.band !== '' ? ouvert.band : t('Solo')}
              {ouvert.startedBy !== '' && (
                <> · {t('lancé par {qui}', { qui: ouvert.startedBy })}</>
              )}
              {ouvert.setlist !== '' && <> · {ouvert.setlist}</>}
            </p>
            <div className="rowactions" style={{ justifyContent: 'center' }}>
              <button
                className="btn ghost small"
                onClick={() => setRenaming(ouvert)}
              >
                {t('✏️ Nommer ce live')}
              </button>
              <button
                className="btn ghost small"
                onClick={() => setDeleting(ouvert)}
              >
                {t('🗑 Supprimer')}
              </button>
            </div>

            <div className="statgrid" style={{ marginTop: 'var(--sp-3)' }}>
              <div className="statcard">
                <div className="statvalue">{ouvert.hearts}</div>
                <div className="statlabel">❤ {t('reçus')}</div>
              </div>
              <div className="statcard">
                <div className="statvalue">{ouvert.messages.length}</div>
                <div className="statlabel">💬 {t('mots du public')}</div>
              </div>
              <div className="statcard">
                <div className="statvalue">{ouvert.uniques}</div>
                <div className="statlabel">👥 {t('spectateurs')}</div>
              </div>
            </div>

            {ouvert.songs.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  🎵 {t('MORCEAUX JOUÉS')}
                </div>
                {ouvert.songs
                  .slice()
                  .sort((a, b) => a.played_at.localeCompare(b.played_at))
                  .map((s, i) => (
                    <div className="strow" key={i}>
                      <span className="stlabel">{heure(s.played_at)}</span>
                      <span style={{ flex: 1 }}>{s.song_title}</span>
                      {s.hearts > 0 && (
                        <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                          ❤ {s.hearts}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {ouvert.messages.length > 0 && (
              <div className="card" style={{ marginBottom: 10 }}>
                <div className="help" style={{ marginBottom: 8 }}>
                  💬 {t('MOTS DU PUBLIC')}
                </div>
                {ouvert.messages.map((m, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    « {m.body} »
                    <div className="stauthor">
                      — {m.author !== '' ? m.author : t('anonyme')} ·{' '}
                      {heure(m.created_at)}
                      {m.song_title !== '' && (
                        <>{t(' · pendant « {titre} »', { titre: m.song_title })}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ouvert.songs.length === 0 && ouvert.messages.length === 0 && (
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Rien n’a été enregistré pendant ce live.')}
              </p>
            )}
          </div>
        </StageList>
      )}

      <Diagnostic
        liveKey={prefs.liveKey}
        recus={messages?.length ?? 0}
        rattaches={lives.reduce((n, l) => n + l.messages.length, 0)}
      />

      {deleting && (
        <ConfirmSheet
          title={t('Supprimer ce live ?')}
          message={t(
            'Il disparaît de TON historique. Si c’était un concert de groupe, les autres membres gardent le leur.',
          )}
          confirmLabel={t('Supprimer')}
          danger
          onConfirm={() => {
            supprimer(deleting);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}

      {renaming && (
        <PromptSheet
          title={t('Nommer ce live')}
          placeholder={t('Par exemple : soirée chez Marco')}
          initialValue={nomDe(renaming)}
          confirmLabel={t('Enregistrer')}
          onSubmit={(v) => {
            renommer(renaming, v);
            setRenaming(null);
          }}
          onClose={() => setRenaming(null)}
        />
      )}
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
        <p className="help">{data.note ?? t('Le direct n’est pas configuré.')}</p>
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
