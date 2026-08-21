/**
 * Onglet Setlists : un sélecteur de contexte en haut (solo, chaque groupe,
 * les contextes libres) et UNE liste dessous — plus de capsules à déplier
 * une par une (arbitrage Vincent, b211). La génération IA a été retirée
 * (b294, arbitrage Vincent — simplification).
 */
import React, { useEffect, useState } from 'react';

import { LiveBanner } from '../components/LiveBanner';
import { ConfirmSheet } from '../components/Feedback';
import { SwipeRow } from '../components/SwipeRow';
import { Empty, Field, HeaderPlus, Modal, TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { t } from '../i18n';
import { versionForBand } from '../lib/model';
import { getValidSession } from '../lib/auth';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptySetlist,
  formatDuration,
  makeId,
  Setlist,
  Song,
  songSeconds,
} from '../types';

/** Couleurs des pastilles de groupe (tokens --band-*, stables par ordre). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

export function Setlists() {
  const {
    setlists,
    songs,
    bands,
    artist,
    prefs,
    concerts,
    saveSetlist,
    deleteSetlist,
    removeSetlistFromBand,
  } = useStore();
  // E5 : la setlist du prochain concert (date la plus proche) est mise en avant.
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextConcertSetlistId =
    [...concerts]
      .filter((c) => (c.setlistId ?? '') !== '' && c.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.setlistId ?? '';
  /**
   * Sélecteur de contexte, en haut de l'écran (arbitrage Vincent, b211) —
   * même geste que les répertoires de l'onglet Morceaux : une rangée qui
   * défile, une seule liste dessous. Les capsules dépliables obligeaient à
   * ouvrir chaque groupe pour retrouver une setlist ; avec quelques groupes,
   * l'écran ne montrait plus que des en-têtes.
   * Valeurs : null = toutes, '' = solo, un id de groupe, ou 'ctx:<label>'.
   */
  const [ctxFilter, setCtxFilter] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('sing2me/setlistCtx');
      return v === null ? null : v;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (ctxFilter === null) localStorage.removeItem('sing2me/setlistCtx');
      else localStorage.setItem('sing2me/setlistCtx', ctxFilter);
    } catch {
      /* stockage indisponible : le filtre sera simplement à re-choisir */
    }
  }, [ctxFilter]);
  const [createOpen, setCreateOpen] = useState(false);
  // Suppression : confirmée par une feuille (jamais confirm() natif).
  const [confirmDel, setConfirmDel] = useState<Setlist | null>(null);
  // Mon compte : pour savoir de quelles setlists je suis l'auteur (b146).
  const [myId, setMyId] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await getValidSession();
      if (s && !cancelled) setMyId(s.userId);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /**
   * Qui peut retirer cette setlist ? Son auteur. Une setlist SOLO est
   * toujours la mienne ; une setlist de groupe sans auteur connu (créée
   * avant b146) reste supprimable par chacun — on ne bloque pas
   * l'existant.
   */
  const canDelete = (sl: Setlist) =>
    (sl.bandId ?? '') === '' ||
    (sl.createdBy ?? '') === '' ||
    (myId !== '' && sl.createdBy === myId);
  const songById = new Map(songs.map((s) => [s.id, s]));

  // Durée « jouée » (hors réserve), estimée à 5 min si non renseignée.
  const playedInfo = (sl: Setlist) => {
    const played = sl.items.filter((it) => it.reserve !== true);
    const sec = played.reduce(
      (sum, it) => sum + songSeconds(songById.get(it.songId)),
      0,
    );
    const estimated = played.some(
      (it) => (songById.get(it.songId)?.durationSec ?? 0) <= 0,
    );
    const reserve = sl.items.length - played.length;
    return { count: played.length, sec, estimated, reserve };
  };

  /** Contextes libres existants (setlists solo portant un label). */
  const contextes = [
    ...new Set(
      setlists
        .filter((s) => (s.bandId ?? '') === '' && (s.context ?? '') !== '')
        .map((s) => s.context as string),
    ),
  ].sort((a, b) => a.localeCompare(b, 'fr'));

  /** Les setlists du contexte choisi, la plus récemment modifiée en tête. */
  const visibles = [...setlists]
    .filter((sl) => {
      if (ctxFilter === null) return true;
      if (ctxFilter === '')
        return (sl.bandId ?? '') === '' && (sl.context ?? '') === '';
      if (ctxFilter.startsWith('ctx:'))
        return (sl.bandId ?? '') === '' && sl.context === ctxFilter.slice(4);
      return (sl.bandId ?? '') === ctxFilter;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  /** À qui appartient cette setlist, en toutes lettres (b211). */
  const contexteDe = (sl: Setlist): string =>
    (sl.bandId ?? '') !== ''
      ? `👥 ${bands.find((b) => b.id === sl.bandId)?.name || t('Groupe sans nom')}`
      : (sl.context ?? '') !== ''
        ? `🎉 ${sl.context}`
        : `🎤 ${t('Solo')}`;

  /** Le ＋ crée directement dans le contexte affiché ; sans contexte
   *  choisi, il demande lequel (une action, un geste). */
  const createHere = () => {
    if (ctxFilter === null) setCreateOpen(true);
    else if (ctxFilter.startsWith('ctx:')) createSetlist('', ctxFilter.slice(4));
    else createSetlist(ctxFilter);
  };

  const setlistRow = (sl: Setlist) => {
    const info = playedInfo(sl);
    // La suppression se RÉVÈLE (b352, demande de Vincent — même geste que
    // les groupes, b254) : balayage vers la gauche ou appui long, plus de
    // corbeille qui traîne sur la ligne. La corbeille ne s'offre qu'à qui
    // PEUT supprimer (b146 : l'auteur, quand la setlist est partagée).
    if (!canDelete(sl)) {
      return (
        <div
          className="row"
          key={sl.id}
          onClick={() => navigate(`/setlist/${sl.id}`)}
        >
          {setlistRowContenu(sl, info)}
        </div>
      );
    }
    return (
      <SwipeRow
        key={sl.id}
        label={sl.name || t('cette setlist')}
        onDelete={() => setConfirmDel(sl)}
        onClick={() => navigate(`/setlist/${sl.id}`)}
      >
        {setlistRowContenu(sl, info)}
      </SwipeRow>
    );
  };

  const setlistRowContenu = (
    sl: Setlist,
    info: ReturnType<typeof playedInfo>,
  ) => {
    return (
      <>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="title">
            {sl.name || t('(sans nom)')}
            {sl.id === nextConcertSetlistId && (
              <span className="badge-next">{t('Prochain concert')}</span>
            )}
          </div>
          <div
            className="sub"
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {[
              // Sans filtre, la liste mélange tous les contextes : chaque
              // ligne dit d'où elle vient (b211).
              ctxFilter === null ? contexteDe(sl) : '',
              // Auteur rappelé quand ce n'est pas moi (b147) : on sait à
              // qui appartient une setlist partagée.
              !canDelete(sl) && (sl.createdByName ?? '') !== ''
                ? t('de {nom}', { nom: sl.createdByName ?? '' })
                : '',
              info.count > 1
                ? t('{n} morceaux', { n: info.count })
                : t('{n} morceau', { n: info.count }),
              info.sec > 0 ? `${info.estimated ? '≈ ' : ''}${formatDuration(info.sec)}` : '',
              info.reserve > 0
                ? t('{n} en réserve', { n: info.reserve })
                : '',
              sl.partyType && sl.partyType.trim() !== '' ? sl.partyType : '',
              sl.comment,
            ]
              .filter((x) => x !== undefined && x !== '')
              .join(' · ')}
          </div>
        </div>
        {sl.items.length > 0 && (
          <>
            <button
              className="btn ghost small"
              title={t('Régie (chanteur sans partition)')}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/remote/${sl.id}`);
              }}
            >
              <Icon name="sliders" size={16} />
            </button>
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/stage/${sl.id}`);
              }}
            >
              <Icon name="play" size={13} /> {t('Scène')}
            </button>
          </>
        )}
        {/* La corbeille visible est partie (b352) : la suppression se
            révèle au balayage / appui long, comme pour les groupes. */}
      </>
    );
  };

  /** Crée une setlist dans ce contexte et l'ouvre directement (éditable). */
  /**
   * Ouvre l'éditeur d'une NOUVELLE setlist — sans rien enregistrer (b146).
   * Avant, la setlist était créée aussitôt : revenir en arrière sans rien
   * saisir laissait une coquille « (sans nom) · 0 morceau », qui partait
   * ensuite en synchro chez tous les membres du groupe. Elle n'existe
   * désormais qu'à la première saisie réelle (nom, morceau…).
   */
  function createSetlist(newBandId: string, context = '') {
    try {
      sessionStorage.setItem('sing2me/newSetlistBand', newBandId);
      sessionStorage.setItem('sing2me/newSetlistContext', context);
    } catch {
      /* stockage indisponible : le contexte sera simplement à re-choisir */
    }
    navigate('/setlist/new');
  }

  // « createInNewBand » retirée en b349 : un groupe se crée dans l'onglet
  // Groupes, jamais en passant par une setlist — le rattachement se fait à
  // un groupe EXISTANT (arbitrage Vincent).

  /** Pastille de la capsule : photo si dispo, sinon emoji sur fond coloré. */
  const capAvatar = (photo: string, fallback: string, color: string) =>
    photo !== '' ? (
      <img
        src={photo}
        alt=""
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    ) : (
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.3rem',
          flexShrink: 0,
        }}
      >
        {fallback}
      </span>
    );

  return (
    <>
      {/* Plus de raccourci « satellite » manuel (décision Vincent) : quand le
          leader passe ON AIR, la bannière LiveBanner invite les membres. */}
      <TopBar
        title={t('Setlists')}
        right={<HeaderPlus label={t('Nouvelle setlist')} onClick={createHere} />}
      />
      <div className="page">
        <LiveBanner />
        {/* Pas de bouton ici (b377, capture de Vincent : « 2 boutons pour
            créer une setlist ») : le bouton ambre flottant en bas est LE
            chemin — même arbitrage qu'à l'époque du deuxième bouton sous la
            liste. L'état vide explique, il ne double pas l'action. */}
        {setlists.length === 0 && (
          <Empty>
            <div
              style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 6 }}
            >
              {t('Ta première setlist')}
            </div>
            {t(
              'Crée ta première setlist pour ton prochain concert — tu glisseras tes morceaux dans l’ordre.',
            )}
          </Empty>
        )}

        {/* Sélecteur de contexte, en haut (arbitrage Vincent, b211) : une
            rangée qui défile, comme les répertoires de l'onglet Morceaux. */}
        {setlists.length > 0 && (bands.length > 0 || contextes.length > 0) && (
          <div
            className="chips filterchips scrollrow"
            style={{ alignItems: 'center' }}
          >
            <button
              className={`chip ${ctxFilter === null ? '' : 'off'}`}
              onClick={() => setCtxFilter(null)}
            >
              {t('Toutes')}
            </button>
            <button
              className={`chip ${ctxFilter === '' ? '' : 'off'}`}
              title={t('Mes setlists solo')}
              onClick={() => setCtxFilter(ctxFilter === '' ? null : '')}
            >
              <Icon name="mic" size={12} />{' '}
              {artist.name !== '' ? artist.name : t('Solo')}
            </button>
            {bands.map((b, i) => (
              <button
                key={b.id}
                className={`chip ${ctxFilter === b.id ? '' : 'off'}`}
                onClick={() => setCtxFilter(ctxFilter === b.id ? null : b.id)}
              >
                {/* La couleur du groupe = un point discret ; l'encadrement
                    signale la sélection (même règle qu'en bibliothèque). */}
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: BAND_COLORS[i % BAND_COLORS.length],
                    marginRight: 2,
                  }}
                />
                {b.name || t('Groupe sans nom')}
              </button>
            ))}
            {contextes.map((ctx) => (
              <button
                key={`ctx:${ctx}`}
                className={`chip ${ctxFilter === `ctx:${ctx}` ? '' : 'off'}`}
                onClick={() =>
                  setCtxFilter(ctxFilter === `ctx:${ctx}` ? null : `ctx:${ctx}`)
                }
              >
                🎉 {ctx}
              </button>
            ))}
          </div>
        )}

        {/* Une seule liste : plus de capsules à déplier une par une. La
            création n'a qu'UN bouton — le jaune en bas à droite (b351,
            demande de Vincent : la carte en pointillés sous la liste
            faisait doublon). */}
        {setlists.length > 0 && (
          <div className="list" style={{ marginTop: 'var(--sp-2)' }}>
            {visibles.length === 0 && (
              <p className="help" style={{ margin: '6px 0' }}>
                {t('Rien encore ici — le bouton en bas à droite crée une setlist.')}
              </p>
            )}
            {visibles.map(setlistRow)}
          </div>
        )}
      </div>


      {confirmDel && (
        <ConfirmSheet
          title={t('Supprimer « {nom} » ?', {
            nom: confirmDel.name || t('cette setlist'),
          })}
          message={
            (confirmDel.bandId ?? '') !== ''
              ? t(
                  'Elle disparaîtra pour tous les membres du groupe. Tu la garderas dans tes setlists, simplement détachée du groupe.',
                )
              : t(
                  'Les morceaux restent dans ta bibliothèque — seule la setlist disparaît.',
                )
          }
          confirmLabel={t('Supprimer')}
          danger
          onConfirm={() => {
            if ((confirmDel.bandId ?? '') !== '') {
              removeSetlistFromBand(confirmDel.id);
            } else {
              deleteSetlist(confirmDel.id);
            }
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {createOpen && (
        <Modal
          title={t('Créer une setlist')}
          onClose={() => setCreateOpen(false)}
        >
          {/* Plus de « capsule » à créer ici (b349, arbitrage Vincent :
              « une setlist est soit sans appartenance, soit appartenant à
              un groupe — le groupe de rattachement doit être existant »).
              Un groupe se crée dans l'onglet Groupes, sa maison (règle 1).
              Les rangées « contexte » ne s'affichent que pour qui en a
              déjà : l'existant garde une place, rien de neuf ne s'y crée. */}
          <p className="help" style={{ marginTop: 0 }}>
            {t('Pour toi, ou pour un de tes groupes ?')}
          </p>
          <div
            className="row"
            onClick={() => {
              setCreateOpen(false);
              createSetlist('');
            }}
          >
            {capAvatar(artist.photo ?? '', '🎤', 'var(--surface-high)')}
            <div className="grow" style={{ marginLeft: 10 }}>
              <div className="title">
                {t('Solo')}
                {artist.name !== '' ? ` — ${artist.name}` : ''}
              </div>
            </div>
            <span className="chevron">
              <Icon name="plus" size={16} />
            </span>
          </div>
          {bands.map((b, i) => (
            <div
              className="row"
              key={b.id}
              onClick={() => {
                setCreateOpen(false);
                createSetlist(b.id);
              }}
            >
              {capAvatar(
                b.photo ?? '',
                '👥',
                BAND_COLORS[i % BAND_COLORS.length],
              )}
              <div className="grow" style={{ marginLeft: 10 }}>
                <div className="title">{b.name || t('Groupe sans nom')}</div>
              </div>
              <span className="chevron">
                <Icon name="plus" size={16} />
              </span>
            </div>
          ))}
          {[
            ...new Set(
              setlists
                .filter(
                  (s) => (s.bandId ?? '') === '' && (s.context ?? '') !== '',
                )
                .map((s) => s.context as string),
            ),
          ]
            .sort((a, b) => a.localeCompare(b, 'fr'))
            .map((ctx) => (
              <div
                className="row"
                key={`ctx:${ctx}`}
                onClick={() => {
                  setCreateOpen(false);
                  createSetlist('', ctx);
                }}
              >
                {capAvatar('', '🎉', 'var(--surface-high)')}
                <div className="grow" style={{ marginLeft: 10 }}>
                  <div className="title">{ctx}</div>
                </div>
                <span className="chevron">
                  <Icon name="plus" size={16} />
                </span>
              </div>
            ))}
        </Modal>
      )}
    </>
  );
}
