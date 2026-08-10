import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { CoachMark } from '../components/CoachMark';
import { ConfirmSheet, MenuSheet } from '../components/Feedback';
import { SongCollector } from '../components/SongPicker';
import {
  Accordion,
  AccordionNav,
  Field,
  SaveBar,
  TopBar,
} from '../components/ui';
import { announceBandSong } from '../lib/bands';
import { t } from '../i18n';
import { songKey } from '../lib/importer';
import {
  creatorMember,
  duplicateVersion,
  notesForBand,
  notesForShare,
  resolveVersion,
  switchVersion,
  transposeChordSequence,
  versionForBand,
} from '../lib/model';
import { getValidSession, monId } from '../lib/auth';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptyBand,
  emptySetlist,
  emptySetup,
  formatDuration,
  makeId,
  Setlist,
  SharePayload,
  Song,
  songSeconds,

} from '../types';

export function SetlistEdit({ id }: { id: string | null }) {
  const {
    songs,
    setlists,
    saveSetlist,
    deleteSetlist,
    removeSetlistFromBand,
    bands,
    saveBand,
    saveSong,
    clearBandRemoval,
    artist,
    prefs,
  } = useStore();
  const existing = id ? setlists.find((s) => s.id === id) : undefined;
  const [draft, setDraft] = useState<Setlist>(() => {
    if (existing) {
      return { ...existing, items: existing.items.map((x) => ({ ...x })) };
    }
    // Nouvelle setlist : reprendre le contexte (groupe/solo) de l'encart
    // d'où l'on vient, s'il a été transmis.
    const base = emptySetlist();
    try {
      const b = sessionStorage.getItem('sing2me/newSetlistBand');
      const ctx = sessionStorage.getItem('sing2me/newSetlistContext');
      if (b !== null) {
        sessionStorage.removeItem('sing2me/newSetlistBand');
        sessionStorage.removeItem('sing2me/newSetlistContext');
        return { ...base, bandId: b, context: ctx ?? '' };
      }
    } catch {
      /* stockage indisponible */
    }
    return base;
  });
  const [picker, setPicker] = useState(false);
  /**
   * Glisser-déposer TACTILE des morceaux (b148) — Pointer Events, l'API
   * qui marche au doigt (iPhone/Android) comme à la souris. Le drag HTML5
   * (`draggable`) n'existe pas au toucher sur iOS : la poignée était
   * inerte sur téléphone. Principe : la poignée capture le pointeur, et
   * la liste se réordonne EN DIRECT dès que le doigt franchit le milieu
   * d'un voisin — on voit le morceau se placer pendant le geste.
   */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragRef = useRef<{ idx: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragY = useRef(0);
  const rafRef = useRef<number | null>(null);

  /** Défilement automatique près des bords pendant le glisser. */
  function autoScrollLoop() {
    const step = () => {
      if (!dragRef.current) {
        rafRef.current = null;
        return;
      }
      const y = dragY.current;
      const margin = 110;
      if (y < margin) window.scrollBy(0, -Math.ceil((margin - y) / 6));
      else if (y > window.innerHeight - margin) {
        window.scrollBy(0, Math.ceil((y - (window.innerHeight - margin)) / 6));
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(step);
  }

  function onHandleDown(e: React.PointerEvent, idx: number) {
    // La capture peut être refusée (pointeur déjà relâché, environnement
    // de test) : le glisser marche quand même tant que le doigt reste sur
    // la liste — on ne laisse jamais une exception casser le geste.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture indisponible */
    }
    dragRef.current = { idx };
    dragY.current = e.clientY;
    setDragIdx(idx);
    autoScrollLoop();
  }

  function onHandleMove(e: React.PointerEvent) {
    const st = dragRef.current;
    if (!st || !listRef.current) return;
    dragY.current = e.clientY;
    const items = Array.from(
      listRef.current.querySelectorAll<HTMLElement>('.slitem'),
    );
    let target = st.idx;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (i < st.idx && e.clientY < r.top + r.height / 2) {
        target = i;
        break;
      }
      if (i > st.idx && e.clientY > r.top + r.height / 2) target = i;
    }
    if (target !== st.idx) {
      moveItem(st.idx, target);
      st.idx = target;
      setDragIdx(target);
    }
  }

  function onHandleUp() {
    dragRef.current = null;
    setDragIdx(null);
  }
  // Menu « … » de l'en-tête + confirmation de suppression (jamais de
  // confirm() natif — règle 10).
  const [headMenu, setHeadMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // « ✓ Enregistré » discret et transitoire après chaque modification.
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const isNew = existing === undefined;
  // Mon identifiant de compte : sert à savoir si JE suis l'auteur.
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
  // Qui peut retirer cette setlist du groupe ? Son auteur uniquement
  // (b146). Sans auteur connu (setlists d'avant), chacun garde la main.
  const author = draft.createdBy ?? '';
  const isAuthor = author === '' || (myId !== '' && author === myId);

  /**
   * Deux régimes d'enregistrement (b149, demande Vincent) :
   * - les GESTES sur les morceaux (ajout, déplacement, retrait, réserve,
   *   tonalité, version, note d'item) restent FLUIDES : enregistrés
   *   aussitôt, « ✓ Enregistré » discret ;
   * - les CHAMPS (nom, commentaire, groupe) attendent une VALIDATION
   *   visible : la barre « Valider / Annuler » apparaît dès la première
   *   frappe, rien ne part avant confirmation.
   * `lastSaved` est la dernière version enregistrée : les gestes morceaux
   * l'emportent AVEC les champs déjà validés (jamais ceux en cours de
   * frappe).
   */
  const [lastSaved, setLastSaved] = useState<Setlist | null>(
    existing ? { ...existing, items: existing.items.map((x) => ({ ...x })) } : null,
  );
  const metaDirty =
    draft.name !== (lastSaved?.name ?? '') ||
    draft.comment !== (lastSaved?.comment ?? '') ||
    (draft.bandId ?? '') !== (lastSaved?.bandId ?? '');

  const stamp = (sl: Setlist): Setlist =>
    (sl.createdBy ?? '') === ''
      ? {
          ...sl,
          createdBy: myId,
          createdByName: prefs.userName || artist.name || '',
        }
      : sl;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Geste morceau : on enregistre les items avec les MÉTA validées.
    const itemsChanged =
      JSON.stringify(draft.items) !== JSON.stringify(lastSaved?.items ?? []) ||
      JSON.stringify(draft.setup ?? null) !==
        JSON.stringify(lastSaved?.setup ?? null);
    if (!itemsChanged) return;
    const toSave = stamp(
      lastSaved
        ? {
            ...draft,
            name: lastSaved.name,
            comment: lastSaved.comment,
            bandId: lastSaved.bandId,
          }
        : draft,
    );
    saveSetlist(toSave);
    setLastSaved(toSave);
    setSaved(true);
    const t = window.setTimeout(() => setSaved(false), 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  /** Valide les champs (nom, commentaire, groupe) — bouton visible. */
  function confirmMeta() {
    const toSave = stamp(draft);
    saveSetlist(toSave);
    setLastSaved(toSave);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  /** Le brouillon avec les MÉTA validées uniquement — pour les
   *  enregistrements de passage (navigation), jamais la frappe en cours. */
  const withValidatedMeta = (d: Setlist): Setlist =>
    lastSaved
      ? {
          ...d,
          name: lastSaved.name,
          comment: lastSaved.comment,
          bandId: lastSaved.bandId,
        }
      : d;

  /** Abandonne les champs en attente (les morceaux, eux, sont déjà à jour). */
  function cancelMeta() {
    if (!lastSaved) {
      navigate('/setlists');
      return;
    }
    setDraft((d) => ({
      ...d,
      name: lastSaved.name,
      comment: lastSaved.comment,
      bandId: lastSaved.bandId,
    }));
  }

  const songById = useMemo(
    () => new Map(songs.map((s) => [s.id, s])),
    [songs],
  );

  const bandName = (bid: string) =>
    bands.find((b) => b.id === bid)?.name ?? '';

  // Durées estimées : durée réelle si renseignée, sinon 5 min. On
  // distingue les morceaux joués de ceux « en réserve ».
  const secondsOf = (its: Setlist['items']) =>
    its.reduce((sum, it) => sum + songSeconds(songById.get(it.songId)), 0);
  const playedItems = draft.items.filter((it) => it.reserve !== true);
  const reserveItems = draft.items.filter((it) => it.reserve === true);
  const playedSec = secondsOf(playedItems);
  const hasEstimate = playedItems.some(
    (it) => (songById.get(it.songId)?.durationSec ?? 0) <= 0,
  );

  function update(patch: Partial<Setlist>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  // Sono & scène vit sur son PROPRE écran (#/setlist/:id/sono) — ici on ne
  // garde que l'état « renseignée ou vide » pour la rangée de navigation.
  const setup = draft.setup ?? emptySetup();
  const sonoFilled =
    setup.positions.length > 0 ||
    setup.gear.trim() !== '' ||
    setup.wiring.trim() !== '' ||
    setup.sound.trim() !== '';

  /**
   * Ajoute un morceau à la setlist. Si la setlist appartient à un GROUPE et
   * que le morceau n'y est pas encore, il entre automatiquement au
   * répertoire du groupe (version de groupe créée + annonce + propagation).
   */
  function addSongToSetlist(song: Song) {
    const bandId = draft.bandId ?? '';
    // Setlist de groupe → version du groupe ; setlist solo → l'originale
    // (plus de « version Solo » depuis b211).
    let versionId = versionForBand(song, bandId)?.id ?? '';
    if (bandId !== '' && versionId === '') {
      const b = bands.find((x) => x.id === bandId);
      const prev = song.activeVersionId;
      const updated = switchVersion(
        duplicateVersion(song, b?.name || 'Groupe', bandId),
        prev,
      );
      saveSong(updated);
      clearBandRemoval(bandId, songKey(song.title, song.artist));
      void announceBandSong(
        b?.cloudId,
        prefs.userName || artist.name || 'Moi',
        song.title,
        song.artist,
      );
      versionId = versionForBand(updated, bandId)?.id ?? '';
    }
    if (versionId === '') versionId = versionForBand(song, '')?.id ?? '';
    setDraft((d) => ({
      ...d,
      items: [
        ...d.items,
        { id: makeId(), songId: song.id, note: '', keyOverride: '', versionId },
      ],
    }));
  }

  function moveItem(from: number, to: number) {
    setDraft((d) => {
      if (to < 0 || to >= d.items.length || from === to) return d;
      const items = [...d.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      return { ...d, items };
    });
  }

  /**
   * Ouvre la partition d'un morceau dans la version jouée par CETTE
   * setlist — la version active du morceau bascule dessus pour que la
   * lecture (et une éventuelle édition depuis la partition) porte sur la
   * bonne interprétation. Modifier vit sur la partition, plus ici (b150).
   */
  function openItemSong(item: Setlist['items'][number]) {
    const song = songById.get(item.songId);
    if (!song) return;
    const vid = (item.versionId ?? '') || song.activeVersionId;
    if (vid !== song.activeVersionId) {
      saveSong(switchVersion(song, vid));
    }
    saveSetlist(stamp(withValidatedMeta(draft))); // ne pas perdre les réglages en cours
    // Lecture DANS la setlist : précédent/suivant + retour direct
    const idx = draft.items.findIndex((it) => it.id === item.id);
    navigate(`/setlist/${draft.id}/song/${Math.max(0, idx)}`);
  }

  return (
    <>
      {/* L'en-tête montre le NOM de la setlist (« Sans titre » à défaut) —
          un tap dessus met le champ Nom en édition. */}
      <TopBar
        title={
          <span
            style={{ cursor: 'pointer' }}
            title={t('Modifier le nom')}
            onClick={() => nameRef.current?.focus()}
          >
            {draft.name || t('Sans titre')}
          </span>
        }
        onBack={() => navigate('/setlists')}
        right={
          !isNew ? (
            <button
              className="btn icon"
              title={t('Autres actions')}
              aria-label={t('Autres actions')}
              onClick={() => setHeadMenu(true)}
            >
              <Icon name="more" size={20} />
            </button>
          ) : undefined
        }
      />
      <div className="page">
        {/* Le nom d'abord — premier élément, hors section repliée. */}
        <Field label={t('Nom')}>
          <input
            ref={nameRef}
            type="text"
            value={draft.name}
            placeholder={t('Concert du 15 août')}
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        {/* Action principale de l'écran, visible sans défiler. */}
        <button className="btn block" onClick={() => setPicker(true)}>
          <Icon name="plus" size={16} /> {t('Ajouter un morceau')}
        </button>
        <div className="spacer" />
        {/* L'explication du glisser-déposer n'a de sens qu'à partir de
            2 morceaux — et tient en une ligne. */}
        {draft.items.length >= 2 && (
          <CoachMark
            id="setlist-reorder"
            text={t("Glisse les morceaux pour changer l'ordre.")}
          />
        )}
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          {t('Morceaux')} ({playedItems.length}
          {playedSec > 0
            ? ` · ${hasEstimate ? '≈ ' : ''}${formatDuration(playedSec)}`
            : ''}
          {reserveItems.length > 0
            ? ` · ${t('{n} en réserve', { n: reserveItems.length })}`
            : ''}
          )
        </h2>
        {hasEstimate && (
          <p className="help" style={{ marginTop: -6 }}>
            {t(
              "Durée estimée à 5 min pour les morceaux dont la durée n'est pas renseignée — renseigne-la sur la fiche du morceau pour affiner.",
            )}
          </p>
        )}

        {/* Conteneur mesuré par le glisser tactile (b148). */}
        <div ref={listRef}>
        {draft.items.map((item, idx) => {
          const song = songById.get(item.songId);
          return (
            <div
              className={`slitem ${dragIdx === idx ? 'dragover' : ''} ${
                item.reserve ? 'reserve' : ''
              }`}
              key={item.id}
            >
              {/* La poignée porte le glisser tactile (b148) : capture du
                  pointeur + réordonnancement en direct. `touch-action:
                  none` (CSS) empêche iOS de transformer le geste en
                  défilement de page. */}
              <span
                className="drag"
                title={t('Glisser pour réordonner')}
                aria-label={t('Glisser pour réordonner')}
                onPointerDown={(e) => onHandleDown(e, idx)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <Icon name="grip" size={18} />
              </span>
              <span className="num">{idx + 1}.</span>
              {/* Écran volontairement MINIMAL (b150, demande Vincent) :
                  voir la setlist, changer l'ordre, ajouter/retirer, mettre
                  en réserve — rien d'autre. Modifier la partition se fait
                  depuis la partition (un tap sur le titre l'ouvre). */}
              <div className="grow" style={{ minWidth: 0 }}>
                <div
                  className="title"
                  style={{ cursor: song ? 'pointer' : 'default' }}
                  title={t('Voir la partition')}
                  onClick={() => openItemSong(item)}
                >
                  {song?.title ?? t('(morceau supprimé)')}
                  {song && song.artist !== '' && (
                    <span className="stauthor"> — {song.artist}</span>
                  )}
                </div>
                {item.reserve && (
                  <div className="slreserve">
                    {t('☆ En réserve — jouée si besoin')}
                  </div>
                )}
              </div>
              <button
                className="btn icon"
                style={{ color: 'var(--danger)' }}
                title={t('Retirer de la setlist')}
                aria-label={t('Retirer de la setlist')}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    items: d.items.filter((it) => it.id !== item.id),
                  }))
                }
              >
                <Icon name="x" size={16} />
              </button>
              {/* Réserve : étoile discrète, tout à droite. */}
              <button
                className="btn icon"
                style={{
                  color: item.reserve ? 'var(--accent)' : 'var(--text-faint)',
                }}
                title={
                  item.reserve
                    ? t('En réserve — cliquer pour la remettre dans le set joué')
                    : t(
                        'Mettre en réserve (jouée seulement si besoin — hors durée prévue)',
                      )
                }
                aria-label={
                  item.reserve
                    ? t('Retirer de la réserve')
                    : t('Mettre en réserve')
                }
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    items: d.items.map((it) =>
                      it.id === item.id ? { ...it, reserve: !it.reserve } : it,
                    ),
                  }))
                }
              >
                <Icon name="star" size={17} />
              </button>
            </div>
          );
        })}
        </div>

        <div className="spacer" />
        <Accordion
          title={t('Infos de la setlist')}
          sub={[
            t('Groupe : {nom}', {
              nom: bandName(draft.bandId ?? '') || t('Solo'),
            }),
            // Auteur rappelé quand ce n'est pas moi (b147).
            !isAuthor && (draft.createdByName ?? '') !== ''
              ? t('créée par {nom}', { nom: draft.createdByName ?? '' })
              : '',
          ]
            .filter((x) => x !== '')
            .join(' · ')}
          defaultOpen={isNew}
        >
        <Field label={t('Commentaire')}>
          <input
            type="text"
            value={draft.comment}
            placeholder={t('Set acoustique, 45 minutes…')}
            onChange={(e) => update({ comment: e.target.value })}
          />
        </Field>
        <Field label={t('Groupe')}>
          <select
            value={draft.bandId ?? ''}
            onChange={(e) => {
              let bandId = e.target.value;
              if (bandId === '__create__') {
                const name = prompt(t('Nom du groupe'));
                if (name === null || name.trim() === '') return;
                // Le créateur est automatiquement le premier musicien
                const b = {
                  ...emptyBand(),
                  name: name.trim(),
                  owned: true,
                  members: [creatorMember(artist, prefs.userName, monId())],
                };
                saveBand(b);
                bandId = b.id;
              }
              // Les morceaux basculent sur la version de ce groupe
              // (s'ils en ont une) — modifiable morceau par morceau ensuite.
              setDraft((d) => ({
                ...d,
                bandId,
                items: d.items.map((it) => {
                  const s = songById.get(it.songId);
                  if (!s) return it;
                  return {
                    ...it,
                    versionId: versionForBand(s, bandId)?.id ?? '',
                  };
                }),
              }));
            }}
          >
            <option value="">{t('Solo (par défaut)')}</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || t('Groupe sans nom')}
              </option>
            ))}
            <option value="__create__">{t('＋ Créer un groupe…')}</option>
          </select>
          <p className="help" style={{ marginTop: 4 }}>
            {t('La setlist utilise les versions propres à ce groupe.')}
          </p>
        </Field>
        </Accordion>
        {/* Mots du public reçus pendant les concerts joués sur cette
            setlist (b139) : ils appartiennent au concert, pas au morceau
            qui passait à cet instant. */}
        {(draft.fanMessages ?? []).length > 0 && (
          <Accordion
            title={t('💬 Mots du public')}
            sub={
              (draft.fanMessages ?? []).length > 1
                ? t('{n} messages reçus en concert', {
                    n: (draft.fanMessages ?? []).length,
                  })
                : t('{n} message reçu en concert', {
                    n: (draft.fanMessages ?? []).length,
                  })
            }
          >
            {[...(draft.fanMessages ?? [])]
              .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
              .map((m) => (
                <div key={m.id} className="notesbox" style={{ marginBottom: 8 }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {m.author.trim() !== '' ? m.author : t('Un spectateur')}
                  </div>
                </div>
              ))}
          </Accordion>
        )}

        {/* Sono & scène : écran dédié — la rangée dit si c'est renseigné. */}
        <AccordionNav
          title={t('🔊 Sono & scène')}
          sub={
            sonoFilled
              ? t('Renseignée — matériel, branchements, plan')
              : t('Vide — matériel, branchements, plan')
          }
          onClick={() => {
            saveSetlist(stamp(withValidatedMeta(draft)));
            navigate(`/setlist/${draft.id}/sono`);
          }}
        />

        <div className="rowactions">
          {draft.items.length > 0 && (
            <>
              <button
                className="btn ghost"
                title={t("Vue d'ensemble propre et imprimable")}
                onClick={() => navigate(`/setlist/${draft.id}/apercu`)}
              >
                <Icon name="clipboard" size={15} /> {t('Imprimer')}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  saveSetlist(stamp(withValidatedMeta(draft)));
                  navigate(`/stage/${draft.id}`);
                }}
              >
                <Icon name="play" size={14} /> {t('Mode scène')}
              </button>
              <button
                className="btn ghost"
                title={t('Vue chanteur sans partition')}
                onClick={() => {
                  saveSetlist(stamp(withValidatedMeta(draft)));
                  navigate(`/remote/${draft.id}`);
                }}
              >
                <Icon name="sliders" size={15} /> {t('Régie')}
              </button>
            </>
          )}
          {/* Décision produit (Vincent, août 2026) : les partitions ne
              circulent QUE par le répertoire de groupe ou le QR ON AIR —
              pas de partage de setlist par lien. Supprimer vit dans le
              menu « … » de l'en-tête (une seule occurrence, confirmée). */}
        </div>
        {saved && !metaDirty && (
          <div className="savedhint">{t('✓ Enregistré')}</div>
        )}
      </div>

      {/* Validation visible des champs (b149) : rien ne part sans elle. */}
      <SaveBar
        visible={metaDirty}
        onSave={confirmMeta}
        onCancel={cancelMeta}
        label={isNew && lastSaved === null ? 'Créer la setlist' : 'Valider'}
      />

      {picker && (
        <SongCollector
          title={t('Ajouter des morceaux')}
          alreadyIn={draft.items.map((it) => it.songId)}
          confirmLabel={(n) =>
            n > 1
              ? t('Ajouter {n} morceaux', { n })
              : t('Ajouter {n} morceau', { n })
          }
          onConfirm={(ids) => {
            for (const id of ids) {
              const s = songs.find((x) => x.id === id);
              if (s) addSongToSetlist(s);
            }
          }}
          onClose={() => setPicker(false)}
        />
      )}

      {headMenu && (
        <MenuSheet
          title={draft.name || t('Sans titre')}
          items={
            isAuthor
              ? [
                  {
                    label: t('Supprimer la setlist'),
                    icon: 'trash' as const,
                    danger: true,
                    onClick: () => setConfirmDelete(true),
                  },
                ]
              : [
                  {
                    // Seul l'auteur retire une setlist de groupe (b146) :
                    // on le DIT plutôt que de masquer l'action sans raison.
                    label: t('Créée par {nom} — elle seule peut la supprimer', {
                      nom: draft.createdByName || t('un autre musicien'),
                    }),
                    icon: 'lock' as const,
                    onClick: () => undefined,
                  },
                ]
          }
          onClose={() => setHeadMenu(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmSheet
          title={t('Supprimer « {nom} » ?', {
            nom: draft.name || t('Sans titre'),
          })}
          message={
            (draft.bandId ?? '') !== ''
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
            // Setlist de GROUPE : elle disparaît chez les membres mais
            // reste chez son auteur, détachée (b146). Solo : suppression
            // franche.
            if ((draft.bandId ?? '') !== '') {
              removeSetlistFromBand(draft.id);
            } else {
              deleteSetlist(draft.id);
            }
            navigate('/setlists');
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
