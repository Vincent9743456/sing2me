import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '../components/Icon';
import { CoachMark } from '../components/CoachMark';
import { ConfirmSheet, MenuSheet } from '../components/Feedback';
import { SongCollector } from '../components/SongPicker';
import { Accordion, AccordionNav, Field, TopBar } from '../components/ui';
import { announceBandSong } from '../lib/bands';
import { semitonesBetween, spellingForKey, transposeContent, transposeKeyName } from '../lib/chords';
import { songKey } from '../lib/importer';
import {
  creatorMember,
  duplicateVersion,
  SOLO_BAND_ID,
  notesForBand,
  notesForShare,
  resolveVersion,
  switchVersion,
  transposeChordSequence,
  versionForBand,
} from '../lib/model';
import { getValidSession } from '../lib/auth';
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

  // Édition directe : chaque changement est enregistré automatiquement
  // (pas de bouton « Enregistrer »). On saute le tout premier rendu pour
  // ne pas recréer une nouvelle setlist restée vierge.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Auteur posé à la toute première sauvegarde (b146) : lui seul pourra
    // retirer la setlist du groupe.
    saveSetlist(
      isNew && (draft.createdBy ?? '') === ''
        ? {
            ...draft,
            createdBy: myId,
            createdByName: prefs.userName || artist.name || '',
          }
        : draft,
    );
    setSaved(true);
    const t = window.setTimeout(() => setSaved(false), 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

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
    // Setlist de groupe → version du groupe ; setlist solo → version Solo
    // dédiée si elle existe (sinon l'originale, comme avant).
    let versionId =
      versionForBand(song, bandId === '' ? SOLO_BAND_ID : bandId)?.id ?? '';
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
   * setlist (consultation ou édition) — la version active du morceau
   * bascule dessus pour que l'édition modifie la bonne interprétation.
   */
  function openItemSong(
    item: Setlist['items'][number],
    edit: boolean,
  ) {
    const song = songById.get(item.songId);
    if (!song) return;
    let vid = (item.versionId ?? '') || song.activeVersionId;
    let nextDraft = draft;
    // Plus de « version setlist » (décision Vincent, b113) : modifier
    // depuis la setlist modifie la version affichée du morceau. Les
    // ajustements propres à un concert passent par la tonalité de l'item
    // (keyOverride), pas par une version.
    if (vid !== song.activeVersionId) {
      saveSong(switchVersion(song, vid));
    }
    saveSetlist(nextDraft); // ne pas perdre les réglages en cours
    if (edit) {
      navigate(`/song/${song.id}/edit`);
    } else {
      // Lecture DANS la setlist : précédent/suivant + retour direct
      const idx = nextDraft.items.findIndex((it) => it.id === item.id);
      navigate(`/setlist/${nextDraft.id}/song/${Math.max(0, idx)}`);
    }
  }

  return (
    <>
      {/* L'en-tête montre le NOM de la setlist (« Sans titre » à défaut) —
          un tap dessus met le champ Nom en édition. */}
      <TopBar
        title={
          <span
            style={{ cursor: 'pointer' }}
            title="Modifier le nom"
            onClick={() => nameRef.current?.focus()}
          >
            {draft.name || 'Sans titre'}
          </span>
        }
        onBack={() => navigate('/setlists')}
        right={
          !isNew ? (
            <button
              className="btn icon"
              title="Autres actions"
              aria-label="Autres actions"
              onClick={() => setHeadMenu(true)}
            >
              <Icon name="more" size={20} />
            </button>
          ) : undefined
        }
      />
      <div className="page">
        {/* Le nom d'abord — premier élément, hors section repliée. */}
        <Field label="Nom">
          <input
            ref={nameRef}
            type="text"
            value={draft.name}
            placeholder="Concert du 15 août"
            onChange={(e) => update({ name: e.target.value })}
          />
        </Field>
        {/* Action principale de l'écran, visible sans défiler. */}
        <button className="btn block" onClick={() => setPicker(true)}>
          <Icon name="plus" size={16} /> Ajouter un morceau
        </button>
        <div className="spacer" />
        {/* L'explication du glisser-déposer n'a de sens qu'à partir de
            2 morceaux — et tient en une ligne. */}
        {draft.items.length >= 2 && (
          <CoachMark
            id="setlist-reorder"
            text="Glisse les morceaux pour changer l'ordre."
          />
        )}
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          Morceaux ({playedItems.length}
          {playedSec > 0
            ? ` · ${hasEstimate ? '≈ ' : ''}${formatDuration(playedSec)}`
            : ''}
          {reserveItems.length > 0
            ? ` · ${reserveItems.length} en réserve`
            : ''}
          )
        </h2>
        {hasEstimate && (
          <p className="help" style={{ marginTop: -6 }}>
            Durée estimée à 5 min pour les morceaux dont la durée n'est pas
            renseignée — renseigne-la sur la fiche du morceau pour affiner.
          </p>
        )}

        {/* Conteneur mesuré par le glisser tactile (b148). */}
        <div ref={listRef}>
        {draft.items.map((item, idx) => {
          const song = songById.get(item.songId);
          const keyOptions =
            song && song.key !== ''
              ? Array.from({ length: 12 }, (_v, i) =>
                  transposeKeyName(song.key, i),
                )
              : [];
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
                title="Glisser pour réordonner"
                aria-label="Glisser pour réordonner"
                onPointerDown={(e) => onHandleDown(e, idx)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
              >
                <Icon name="grip" size={18} />
              </span>
              <span className="num">{idx + 1}.</span>
              <div className="grow">
                <div
                  className="title"
                  style={{ cursor: song ? 'pointer' : 'default' }}
                  title="Voir la partition"
                  onClick={() => openItemSong(item, false)}
                >
                  {song?.title ?? '(morceau supprimé)'}
                  {song && song.artist !== '' && (
                    <span className="stauthor"> — {song.artist}</span>
                  )}
                </div>
                <div
                  style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  {/* Voir la partition = un clic sur le titre (ci-dessus) ;
                      ici on ne garde que Modifier + Réserve pour désencombrer. */}
                  <button
                    className="btn ghost small"
                    title="Modifier la partition (version de cette setlist)"
                    aria-label="Modifier la partition"
                    onClick={() => openItemSong(item, true)}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    className="btn ghost small"
                    style={
                      item.reserve
                        ? { color: 'var(--accent)', fontWeight: 700 }
                        : undefined
                    }
                    title={
                      item.reserve
                        ? 'En réserve — cliquer pour le remettre dans le set joué'
                        : 'Mettre en réserve (joué seulement si besoin — hors durée prévue)'
                    }
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        items: d.items.map((it) =>
                          it.id === item.id
                            ? { ...it, reserve: !it.reserve }
                            : it,
                        ),
                      }))
                    }
                  >
                    {item.reserve ? '☆ En réserve' : '☆ Réserve'}
                  </button>
                </div>
                {/* Réglages propres à la setlist (tonalité, version, note) :
                    repliés par défaut pour garder la ligne compacte, dispo
                    d'un clic. Le résumé rappelle ce qui a été personnalisé. */}
                <details className="slmore">
                  <summary>
                    {[
                      item.keyOverride !== '' ? `→ ${item.keyOverride}` : '',
                      (item.versionId ?? '') !== ''
                        ? (song?.versions.find((v) => v.id === item.versionId)
                            ?.name ?? '')
                        : '',
                      item.note.trim() !== '' ? '📝' : '',
                    ]
                      .filter((x) => x !== '')
                      .join(' · ') || 'Tonalité, version, note…'}
                  </summary>
                  <div
                    style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}
                  >
                    {keyOptions.length > 0 && (
                      <select
                        value={item.keyOverride}
                        style={{ width: 'auto', padding: '4px 6px', fontSize: '0.8rem' }}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((it) =>
                              it.id === item.id
                                ? { ...it, keyOverride: e.target.value }
                                : it,
                            ),
                          }))
                        }
                      >
                        <option value="">Tonalité : {song?.key}</option>
                        {keyOptions
                          .filter((k) => k !== song?.key)
                          .map((k) => (
                            <option key={k} value={k}>
                              → {k}
                            </option>
                          ))}
                      </select>
                    )}
                    {song && (
                      <select
                        value={item.versionId ?? ''}
                        style={{ width: 'auto', padding: '4px 6px', fontSize: '0.8rem' }}
                        title="Version jouée dans cette setlist"
                        onChange={(e) => {
                          const value = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            items: d.items.map((it) =>
                              it.id === item.id
                                ? { ...it, versionId: value }
                                : it,
                            ),
                          }));
                        }}
                      >
                        <option value="">Version active</option>
                        {song.versions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.bandId !== '' && bandName(v.bandId) !== ''
                              ? ` · ${bandName(v.bandId)}`
                              : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      value={item.note}
                      placeholder="Note (départ batterie, medley…)"
                      style={{ flex: 1, minWidth: 140, padding: '4px 8px', fontSize: '0.8rem' }}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          items: d.items.map((it) =>
                            it.id === item.id
                              ? { ...it, note: e.target.value }
                              : it,
                          ),
                        }))
                      }
                    />
                  </div>
                </details>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((it) => it.id !== item.id),
                    }))
                  }
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>
          );
        })}
        </div>

        <div className="spacer" />
        <Accordion
          title="Infos de la setlist"
          sub={[
            `Groupe : ${bandName(draft.bandId ?? '') || 'Solo'}`,
            // Auteur rappelé quand ce n'est pas moi (b147).
            !isAuthor && (draft.createdByName ?? '') !== ''
              ? `créée par ${draft.createdByName}`
              : '',
          ]
            .filter((x) => x !== '')
            .join(' · ')}
          defaultOpen={isNew}
        >
        <Field label="Commentaire">
          <input
            type="text"
            value={draft.comment}
            placeholder="Set acoustique, 45 minutes…"
            onChange={(e) => update({ comment: e.target.value })}
          />
        </Field>
        <Field label="Groupe">
          <select
            value={draft.bandId ?? ''}
            onChange={(e) => {
              let bandId = e.target.value;
              if (bandId === '__create__') {
                const name = prompt('Nom du groupe');
                if (name === null || name.trim() === '') return;
                // Le créateur est automatiquement le premier musicien
                const b = {
                  ...emptyBand(),
                  name: name.trim(),
                  owned: true,
                  members: [creatorMember(artist, prefs.userName)],
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
            <option value="">Solo (par défaut)</option>
            {bands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || 'Groupe sans nom'}
              </option>
            ))}
            <option value="__create__">＋ Créer un groupe…</option>
          </select>
          <p className="help" style={{ marginTop: 4 }}>
            La setlist utilise les versions propres à ce groupe.
          </p>
        </Field>
        </Accordion>
        {/* Mots du public reçus pendant les concerts joués sur cette
            setlist (b139) : ils appartiennent au concert, pas au morceau
            qui passait à cet instant. */}
        {(draft.fanMessages ?? []).length > 0 && (
          <Accordion
            title="💬 Mots du public"
            sub={`${(draft.fanMessages ?? []).length} message${
              (draft.fanMessages ?? []).length > 1 ? 's' : ''
            } reçu${(draft.fanMessages ?? []).length > 1 ? 's' : ''} en concert`}
          >
            {[...(draft.fanMessages ?? [])]
              .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
              .map((m) => (
                <div key={m.id} className="notesbox" style={{ marginBottom: 8 }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {m.author.trim() !== '' ? m.author : 'Un spectateur'}
                  </div>
                </div>
              ))}
          </Accordion>
        )}

        {/* Sono & scène : écran dédié — la rangée dit si c'est renseigné. */}
        <AccordionNav
          title="🔊 Sono & scène"
          sub={
            sonoFilled
              ? 'Renseignée — matériel, branchements, plan'
              : 'Vide — matériel, branchements, plan'
          }
          onClick={() => {
            saveSetlist(draft);
            navigate(`/setlist/${draft.id}/sono`);
          }}
        />

        <div className="rowactions">
          {draft.items.length > 0 && (
            <>
              <button
                className="btn ghost"
                title="Vue d'ensemble propre et imprimable"
                onClick={() => navigate(`/setlist/${draft.id}/apercu`)}
              >
                <Icon name="clipboard" size={15} /> Imprimer
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  saveSetlist(draft);
                  navigate(`/stage/${draft.id}`);
                }}
              >
                <Icon name="play" size={14} /> Mode scène
              </button>
              <button
                className="btn ghost"
                title="Vue chanteur sans partition"
                onClick={() => {
                  saveSetlist(draft);
                  navigate(`/remote/${draft.id}`);
                }}
              >
                <Icon name="sliders" size={15} /> Régie
              </button>
            </>
          )}
          {/* Décision produit (Vincent, août 2026) : les partitions ne
              circulent QUE par le répertoire de groupe ou le QR ON AIR —
              pas de partage de setlist par lien. Supprimer vit dans le
              menu « … » de l'en-tête (une seule occurrence, confirmée). */}
        </div>
        {saved && <div className="savedhint">✓ Enregistré</div>}
      </div>

      {picker && (
        <SongCollector
          title="Ajouter des morceaux"
          alreadyIn={draft.items.map((it) => it.songId)}
          confirmLabel={(n) => `Ajouter ${n} morceau${n > 1 ? 'x' : ''}`}
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
          title={draft.name || 'Sans titre'}
          items={
            isAuthor
              ? [
                  {
                    label: 'Supprimer la setlist',
                    icon: 'trash' as const,
                    danger: true,
                    onClick: () => setConfirmDelete(true),
                  },
                ]
              : [
                  {
                    // Seul l'auteur retire une setlist de groupe (b146) :
                    // on le DIT plutôt que de masquer l'action sans raison.
                    label: `Créée par ${
                      draft.createdByName || 'un autre musicien'
                    } — elle seule peut la supprimer`,
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
          title={`Supprimer « ${draft.name || 'Sans titre'} » ?`}
          message={
            (draft.bandId ?? '') !== ''
              ? 'Elle disparaîtra pour tous les membres du groupe. Tu la garderas dans tes setlists, simplement détachée du groupe.'
              : 'Les morceaux restent dans ta bibliothèque — seule la setlist disparaît.'
          }
          confirmLabel="Supprimer"
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
