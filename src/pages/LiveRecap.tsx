/**
 * RÉCAP D'UN LIVE JOUÉ (b361, refonte Live lot C) — une vraie route
 * (#/pastlive/:id), plus un panneau superposé : on peut y arriver, y
 * revenir, et la partager entre écrans sans état caché.
 *
 * Le ← revient TOUJOURS sur l'onglet Live (`navigate('/concerts')`), jamais
 * `history.back()` — règle du projet : un retour va vers un parent explicite.
 *
 * Ce que cet écran ajoute au panneau qu'il remplace :
 *   • le nom se modifie en place (crayon sur le titre), plus de feuille ;
 *   • les occurrences consécutives d'un même morceau sont FUSIONNÉES à
 *     l'affichage (plage horaire, cœurs additionnés) — le serveur archive
 *     une ligne par transition d'état, les données ne bougent pas ;
 *   • un mot du public se SUPPRIME (corbeille + confirmation) : en base
 *     (compte propriétaire, b192) ET dans les copies locales du livre d'or
 *     des morceaux/setlists de cet appareil ;
 *   • des liens discrets vers le concert planifié et la setlist jouée.
 */
import React, { useMemo, useState } from 'react';

import { ConfirmSheet, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { MojoLoader } from '../components/MojoLoader';
import { TopBar } from '../components/ui';
import { retireMotDuCache, usePastLives } from '../components/usePastLives';
import { t } from '../i18n';
import { LiveMessage, supprimerMotDuPublic } from '../lib/live';
import { dateAbsolue, dateDeTitre, fusionneConsecutifs, heureCourte } from '../lib/livedates';
import { navigate } from '../router';
import { useStore } from '../store';

/** Clé d'une copie locale du livre d'or (posée par OnAir.syncHearts, b175). */
function cleLocale(m: LiveMessage): string {
  return `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`;
}

export function LiveRecap({ id }: { id: string }) {
  const { prefs, savePrefs, songs, setlists, saveSong, saveSetlist } = useStore();
  const { lives, loading, ready } = usePastLives();
  const toast = useToast();

  const live = lives.find((l) => l.id === id) ?? null;

  // Édition du nom EN PLACE : le crayon ouvre un champ sur le titre même.
  const [edition, setEdition] = useState(false);
  const [brouillonNom, setBrouillonNom] = useState('');
  // Mots supprimés pendant cette visite : l'affichage suit le geste tout de
  // suite, sans attendre le rafraîchissement de l'historique.
  const [motsRetires, setMotsRetires] = useState<Set<string>>(new Set());
  const [motASupprimer, setMotASupprimer] = useState<LiveMessage | null>(null);
  const [suppressionLive, setSuppressionLive] = useState(false);

  const nomDonne = live ? ((prefs.liveNames ?? {})[live.id] ?? '') : '';
  const titre =
    live === null
      ? ''
      : nomDonne !== ''
        ? nomDonne
        : live.concertTitle !== ''
          ? live.concertTitle
          : t('Live du {date}', { date: dateDeTitre(live.startedAt) });

  const messages = useMemo(
    () =>
      (live?.messages ?? []).filter(
        (m) => !motsRetires.has(cleLocale(m)),
      ),
    [live, motsRetires],
  );
  const morceaux = useMemo(
    () =>
      fusionneConsecutifs(
        (live?.songs ?? []).map((s) => ({
          song_title: s.song_title,
          played_at: s.played_at,
          hearts: s.hearts,
        })),
      ),
    [live],
  );
  // C22 — la setlist jouée n'est qu'un NOM côté serveur : le lien n'existe
  // que si UNE seule setlist locale porte ce nom (un homonyme rendrait le
  // lien menteur — même règle que les pages publiques, b231).
  const setlistLocale = useMemo(() => {
    if (!live || live.setlist === '') return null;
    const memes = setlists.filter((sl) => sl.name.trim() === live.setlist.trim());
    return memes.length === 1 ? memes[0] : null;
  }, [live, setlists]);

  function renommer(nom: string) {
    if (!live) return;
    const next = { ...(prefs.liveNames ?? {}) };
    if (nom.trim() === '') delete next[live.id];
    else next[live.id] = nom.trim().slice(0, 80);
    savePrefs({ ...prefs, liveNames: next });
  }

  /**
   * Retirer ce live de MON historique (b183 : classement personnel — rien
   * n'est effacé côté serveur, les autres membres gardent le leur).
   */
  function retirerLive() {
    if (!live) return;
    const caches = prefs.hiddenLives ?? [];
    const next = [...caches.filter((x) => x !== live.id), live.id];
    savePrefs({ ...prefs, hiddenLives: next.slice(-500) });
    toast.show(t('Live retiré de ton historique.'));
    navigate('/concerts');
  }

  /**
   * Supprimer un mot du public : en BASE (le serveur vérifie que le live
   * m'appartient), puis dans les copies locales que le livre d'or a posées
   * sur les morceaux et setlists de cet appareil (arbitrage Vincent, b361).
   */
  async function supprimerMot(m: LiveMessage) {
    const cle = cleLocale(m);
    try {
      if ((m.id ?? '') !== '') {
        await supprimerMotDuPublic(prefs.liveKey, m.id as string);
        retireMotDuCache(m.id as string);
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('Suppression impossible.'));
      return;
    }
    for (const s of songs) {
      if (s.fanMessages.some((fm) => fm.id === cle)) {
        saveSong({ ...s, fanMessages: s.fanMessages.filter((fm) => fm.id !== cle) });
      }
    }
    for (const sl of setlists) {
      if ((sl.fanMessages ?? []).some((fm) => fm.id === cle)) {
        saveSetlist({
          ...sl,
          fanMessages: (sl.fanMessages ?? []).filter((fm) => fm.id !== cle),
        });
      }
    }
    setMotsRetires((prev) => new Set([...prev, cle]));
    toast.show(t('Mot supprimé.'));
  }

  const retour = () => navigate('/concerts');

  if (!ready || (loading && live === null)) {
    return (
      <>
        <TopBar title={t('Récap du live')} onBack={retour} live={false} />
        <div className="page">
          <MojoLoader inline active label={t('On retrouve tes lives…')} />
        </div>
      </>
    );
  }

  if (live === null) {
    return (
      <>
        <TopBar title={t('Récap du live')} onBack={retour} live={false} />
        <div className="page">
          <p className="help">
            {t('Ce live n’est plus dans ton historique — il a peut-être été retiré.')}
          </p>
          <button className="btn ghost" onClick={retour}>
            {t('← Retour à l’onglet Live')}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={t('Récap du live')} onBack={retour} live={false} />
      <div className="page">
        {/* Titre + crayon : le nom se modifie EN PLACE (C21). */}
        {edition ? (
          <input
            autoFocus
            defaultValue={nomDonne}
            placeholder={t('Par exemple : soirée chez Marco')}
            aria-label={t('Nommer ce live')}
            style={{ fontSize: '1.3rem', fontWeight: 700 }}
            onChange={(e) => setBrouillonNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                renommer(brouillonNom);
                setEdition(false);
              }
              if (e.key === 'Escape') setEdition(false);
            }}
            onBlur={() => {
              renommer(brouillonNom);
              setEdition(false);
            }}
          />
        ) : (
          <h2 className="pagetitle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 0 }}>{titre}</span>
            <button
              className="btn icon"
              aria-label={t('Nommer ce live')}
              onClick={() => {
                // On édite le nom DONNÉ, pas le titre par défaut : un champ
                // vidé rend simplement son titre automatique au live.
                setBrouillonNom(nomDonne);
                setEdition(true);
              }}
            >
              <Icon name="edit" size={16} />
            </button>
          </h2>
        )}
        <p className="help" style={{ marginTop: 0 }}>
          {dateAbsolue(live.startedAt)} · {heureCourte(live.startedAt)}
          {live.endedAt !== null && <> → {heureCourte(live.endedAt)}</>}
          {' · '}
          {live.band !== '' ? live.band : t('Solo')}
          {live.startedBy !== '' && (
            <> · {t('lancé par {qui}', { qui: live.startedBy })}</>
          )}
        </p>
        {/* C22 — liens discrets vers ce qui entoure ce live. */}
        {(live.concertId !== '' || setlistLocale !== null) && (
          <p className="help" style={{ marginTop: 0 }}>
            {live.concertId !== '' && (
              <a href={`#/concert/${live.concertId}`}>
                {t('Voir le concert « {titre} »', {
                  titre: live.concertTitle !== '' ? live.concertTitle : t('planifié'),
                })}
              </a>
            )}
            {live.concertId !== '' && setlistLocale !== null && ' · '}
            {setlistLocale !== null && (
              <a href={`#/setlist/${setlistLocale.id}`}>
                {t('Voir la setlist « {nom} »', { nom: setlistLocale.name })}
              </a>
            )}
          </p>
        )}

        <div className="statgrid" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="statcard">
            <div className="statvalue">{live.uniques}</div>
            <div className="statlabel">
              <Icon name="users" size={12} />{' '}
              {live.uniques > 1 ? t('spectateurs') : t('spectateur')}
            </div>
          </div>
          <div className="statcard">
            <div className="statvalue">{live.hearts}</div>
            <div className="statlabel">
              <Icon name="heart" size={12} />{' '}
              {live.hearts > 1 ? t('cœurs reçus') : t('cœur reçu')}
            </div>
          </div>
          <div className="statcard">
            <div className="statvalue">{messages.length}</div>
            <div className="statlabel">
              <Icon name="message" size={12} />{' '}
              {messages.length > 1 ? t('mots du public') : t('mot du public')}
            </div>
          </div>
        </div>

        {morceaux.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="help" style={{ marginBottom: 8 }}>
              {t('Morceaux joués')}
            </div>
            {morceaux.map((s, i) => (
              <div className="strow" key={i}>
                <span className="stlabel">
                  {heureCourte(s.de)}
                  {s.a !== s.de && <> → {heureCourte(s.a)}</>}
                </span>
                <span style={{ flex: 1 }}>{s.song_title}</span>
                {s.hearts > 0 && (
                  <span style={{ color: 'var(--live)', fontWeight: 700 }}>
                    <Icon name="heart" size={12} /> {s.hearts}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {messages.length > 0 && (
          <div className="card" style={{ marginBottom: 10 }}>
            <div className="help" style={{ marginBottom: 8 }}>
              {t('Mots du public')}
            </div>
            {messages.map((m) => (
              <div
                key={cleLocale(m)}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}
              >
                <div className="grow" style={{ minWidth: 0 }}>
                  « {m.body} »
                  <div className="stauthor">
                    — {m.author !== '' ? m.author : t('anonyme')} ·{' '}
                    {heureCourte(m.created_at)}
                    {m.song_title !== '' && (
                      <>{t(' · pendant « {titre} »', { titre: m.song_title })}</>
                    )}
                  </div>
                </div>
                {/* La corbeille n'apparaît que si la ligne porte son
                    identifiant (vieux serveur pas redéployé : pas de faux
                    bouton qui échouerait). Cible ≥ 44 px (D24). */}
                {(m.id ?? '') !== '' && (
                  <button
                    className="btn icon"
                    style={{ minWidth: 44, minHeight: 44 }}
                    aria-label={t('Supprimer ce mot')}
                    onClick={() => setMotASupprimer(m)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {morceaux.length === 0 && messages.length === 0 && (
          <p className="help">{t('Rien n’a été enregistré pendant ce live.')}</p>
        )}

        {/* Action destructive en LIEN discret, jamais en gros bouton. */}
        <div style={{ textAlign: 'center', marginTop: 'var(--sp-4)' }}>
          <button
            className="linklike"
            style={{ color: 'var(--danger)' }}
            onClick={() => setSuppressionLive(true)}
          >
            {t('Supprimer ce live')}
          </button>
        </div>
      </div>

      {motASupprimer && (
        <ConfirmSheet
          title={t('Supprimer ce mot ?')}
          message={t('Il disparaît du livre d’or, pour de bon.')}
          confirmLabel={t('Supprimer')}
          danger
          onConfirm={() => {
            void supprimerMot(motASupprimer);
            setMotASupprimer(null);
          }}
          onClose={() => setMotASupprimer(null)}
        />
      )}

      {suppressionLive && (
        <ConfirmSheet
          title={t('Supprimer « {nom} » ?', { nom: titre })}
          message={t(
            'Il disparaît de TON historique. Si c’était un concert de groupe, les autres membres gardent le leur.',
          )}
          confirmLabel={t('Supprimer')}
          danger
          onConfirm={() => {
            retirerLive();
            setSuppressionLive(false);
          }}
          onClose={() => setSuppressionLive(false)}
        />
      )}
    </>
  );
}
