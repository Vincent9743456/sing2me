import React, { useEffect, useMemo, useRef, useState } from 'react';

import { AutoScrollFab, useAutoScroll } from '../components/AutoScroll';
import { useOnAirSetlist, useOnAirSong } from '../components/OnAir';
import { LivePublicSong } from '../lib/live';
import { NoteModal } from '../components/NoteModal';
import { Icon } from '../components/Icon';
import { SongBody } from '../components/SongBody';
import { Empty, Field, Modal, TopBar } from '../components/ui';
import {
  semitonesBetween,
  spellingForKey,
  transposeKeyName,
} from '../lib/chords';
import {
  activeVersion,
  notesForBand,
  promoteVersionToOriginal,
  removeVersion,
  renameVersion,
  setSongCapo,
  switchVersion,
  transposeSong,
  versionForBand,
} from '../lib/model';
import { parolesPubliques } from '../lib/publiclyrics';
import { PublicEye, PublicPreview } from '../components/PublicPreview';
import { songKey } from '../lib/importer';
import { applyUgTextToSong, UgUpgradeModal } from '../components/UgUpgrade';
import { AssignSheet } from '../components/SongPicker';
import {
  ConfirmSheet,
  MenuSheet,
  PromptSheet,
  useToast,
} from '../components/Feedback';
import { CoachMark } from '../components/CoachMark';
import { t } from '../i18n';
import { navigate } from '../router';
import { useStore } from '../store';
import {
  emptySetlist,
  formatDuration,
  makeId,
  Setlist,
  Song,
  SongNote,
  ViewMode,
} from '../types';

/** Couleur de repérage par groupe (identique à la bibliothèque). */
const BAND_COLORS = [
  'var(--band-1)',
  'var(--band-2)',
  'var(--band-3)',
  'var(--band-4)',
  'var(--band-5)',
  'var(--band-6)',
  'var(--band-7)',
];

/** « aujourd'hui », « hier », sinon la date courte. */
function relativeDay(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000,
  );
  if (diff <= 0) return t("aujourd'hui");
  if (diff === 1) return t('hier');
  if (diff < 7) return t('il y a {n} j', { n: diff });
  // Date courte : reste en fr-FR (voir rapport i18n).
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function SongView({
  id,
  fromSetlist,
}: {
  id: string;
  /** Lecture depuis une setlist : navigation précédent/suivant intégrée */
  fromSetlist?: { setlistId: string; index: number };
}) {
  const {
    songs,
    bands,
    prefs,
    artist,
    saveSong,
    deleteSong,
    acceptSong,
    setlists,
    saveSetlist,
    recordBandRemoval,
    clearBandRemoval,
    deleteNote,
    replaceNote,
  } = useStore();

  // Contexte setlist : le morceau vient de l'item courant
  const ctxSetlist = fromSetlist
    ? setlists.find((s) => s.id === fromSetlist.setlistId)
    : undefined;
  const ctxItem = ctxSetlist?.items[fromSetlist?.index ?? -1];
  const song = songs.find((s) => s.id === (ctxItem?.songId ?? id));

  // Vue unique : tout le monde voit la partition en entier.
  const view: ViewMode = 'complete';
  // b169 — la tonalité et le capo ne sont PLUS des réglages d'écran mémorisés
  // sur l'appareil : transposer modifie la version, poser un capo modifie la
  // version. C'est la seule façon pour que le mode scène et le direct voient
  // la même chose que le musicien qui lit sa partition.
  //
  // Seule exception, documentée : dans une setlist, la tonalité choisie pour
  // CE concert (`keyOverride`) reste un décalage d'affichage — elle appartient
  // au concert, pas à la version.
  const inSetlistOverride =
    !!fromSetlist && !!ctxItem && ctxItem.keyOverride !== '';
  const shift =
    inSetlistOverride && song && song.key !== ''
      ? (((semitonesBetween(song.key, ctxItem.keyOverride) ?? 0) % 12) + 12) % 12
      : 0;
  const capo = song?.capo ?? 0;
  // null = fermé · 'new' = nouvelle note · sinon la note à modifier
  const [noteModal, setNoteModal] = useState<'new' | SongNote | null>(null);
  const [ugUpgrade, setUgUpgrade] = useState(false);
  // Éditeur « Ajouter à un groupe / une setlist » (à la demande).
  const [assocOpen, setAssocOpen] = useState(false);
  // Actions « versions » (menu ⋯), création et suppression de version.
  const [versionMenu, setVersionMenu] = useState(false);
  const [delVersionOpen, setDelVersionOpen] = useState(false);
  // Promotion en référence + renommage (feedback Marco, b135).
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const toast = useToast();
  const [delSongOpen, setDelSongOpen] = useState(false);
  // 👁 Vue du public : la partition bascule sur ce que liront les
  // spectateurs. Un geste, au même endroit que ce qu'il change (b223).
  const [vuePublic, setVuePublic] = useState(false);
  const scroll = useAutoScroll(undefined, song?.id);

  // En lecture de setlist : bascule sur la version de l'item, puis
  // applique la tonalité spécifique du concert (keyOverride).
  useEffect(() => {
    if (!fromSetlist || !song || !ctxItem) return;
    const vid = (ctxItem.versionId ?? '') || song.activeVersionId;
    if (vid !== song.activeVersionId) {
      saveSong(switchVersion(song, vid));
      return; // l'effet repassera avec la bonne version en place
    }
    // La tonalité du concert (keyOverride) est appliquée par `shift`, dérivé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSetlist?.index, song?.activeVersionId]);

  // Modèle tonalité : song.key = tonalité des FORMES écrites (accords posés).
  //   Tonalité réelle (ce qui sonne) = formes + capo.
  //   shift = transposition des formes ; capo = capodastre (choix perso).
  // Vue « réelle » (sans capo) : préférence du musicien (ex. bassiste), locale.
  const [displayReal, setDisplayReal] = useState(
    () => localStorage.getItem('sing2me/showRealKey') === '1',
  );
  function toggleReal() {
    setDisplayReal((v) => {
      const next = !v;
      try {
        localStorage.setItem('sing2me/showRealKey', next ? '1' : '0');
      } catch {
        /* stockage indisponible */
      }
      return next;
    });
  }
  const shownShapeKey =
    song && song.key !== '' ? transposeKeyName(song.key, shift) : '';
  const realKeyShown =
    song && song.key !== '' ? transposeKeyName(song.key, shift + capo) : '';
  // Décalage réellement appliqué aux accords affichés : formes seules, ou
  // formes + capo quand on demande la tonalité réelle (sans capo).
  const displayShift = displayReal ? shift + capo : shift;
  const shownKey = displayReal ? realKeyShown : shownShapeKey;
  const preferFlat = spellingForKey(shownKey);

  // Ce que voit le chanteur → publié si la session est active
  // (paroles pour le public, accords pour la vue musicien du QR)
  useOnAirSong(
    song
      ? {
          title: song.title,
          artist: song.artist,
          lyrics: parolesPubliques(song),
          chords: song.lyrics,
          chordKey: song.key,
          // Formes affichées (le musicien voit ça) ; la tonalité réelle se
          // déduit avec le capo, côté vue musicien.
          playedKey: shownShapeKey !== '' ? shownShapeKey : song.key,
          capo,
        }
      : null,
    `${shownShapeKey || song?.key || ''}:${capo}`,
  );

  // Lecture d'un morceau DANS une setlist : on diffuse aussi la setlist au
  // public (il peut la parcourir), comme en mode scène.
  const publicSetlist = useMemo<LivePublicSong[] | null>(
    () =>
      ctxSetlist
        ? ctxSetlist.items
            .map((it) => songs.find((s) => s.id === it.songId))
            .filter((s): s is Song => s != null)
            .map((s) => ({
              title: s.title,
              artist: s.artist,
              lyrics: parolesPubliques(s),
            }))
        : null,
    [ctxSetlist, songs],
  );
  useOnAirSetlist(publicSetlist, ctxSetlist?.name ?? '');


  if (!song) {
    return (
      <>
        <TopBar live={false} title={t('Morceau')} onBack={() => navigate('/')} />
        <Empty>{t("Ce morceau n'existe plus.")}</Empty>
      </>
    );
  }

  const current = activeVersion(song);
  const curBandId = current.bandId ?? '';
  const isBandVersion = curBandId !== '';
  const isMainVersion = current.id === song.versions[0]?.id;
  const bandColorFor = (bid: string) =>
    BAND_COLORS[
      Math.max(0, bands.findIndex((x) => x.id === bid)) % BAND_COLORS.length
    ];
  // Transposer n'a aucun sens dans la vue du public : elle ne montre pas un
  // seul accord. Un écran, une mission (règle 3).
  const showTranspose =
    !vuePublic && (view === 'complete' || view === 'accords');
  // Notes du contexte courant : solo/tous + celles du groupe de la version
  const contextNotes = notesForBand(song.rehearsalNotes, current.bandId);
  // Journal : la note la plus récente en premier
  const allNotes = [...contextNotes].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  );
  const showNotes = view === 'complete' || view === 'structure';
  const bandName = (bid: string) =>
    bands.find((b) => b.id === bid)?.name ?? '';

  /**
   * Transpose (b169). Deux cibles, selon où l'on se trouve — et le repli de
   * l'écran le dit (« Tonalité » vs « Tonalité de ce concert ») :
   *  • en lecture normale, on modifie LA VERSION : les accords sont réécrits,
   *    la scène et le direct voient le changement ;
   *  • en lecture de setlist, on modifie la tonalité de CE concert
   *    (`keyOverride` de l'item) — la version des autres concerts est intacte.
   * `withCapo` : le ♭ pose un capo de plus et le ♯ en retire un, pour que ce
   * qui SONNE ne change pas quand on déplace les formes d'accords.
   */
  function transpose(semitones: number, withCapo: boolean) {
    if (!song) return;
    if (inSetlistOverride || (fromSetlist && ctxItem)) {
      const base = ctxItem?.keyOverride !== '' ? ctxItem?.keyOverride : song.key;
      if (!base || base === '') return;
      setItemKey(transposeKeyName(base, semitones));
      return;
    }
    let next = transposeSong(song, semitones);
    if (withCapo) {
      next = setSongCapo(next, semitones < 0 ? capo + 1 : Math.max(0, capo - 1));
    }
    saveSong(next);
  }

  /** Pose le capo SUR LA VERSION : la scène et le direct doivent le voir. */
  function changeCapo(value: number) {
    if (!song) return;
    saveSong(setSongCapo(song, value));
  }

  /** Tonalité de ce concert (item de setlist) — '' = celle de la version. */
  function setItemKey(key: string) {
    if (!ctxSetlist || !ctxItem) return;
    saveSetlist({
      ...ctxSetlist,
      items: ctxSetlist.items.map((it) =>
        it.id === ctxItem.id ? { ...it, keyOverride: key } : it,
      ),
      updatedAt: new Date().toISOString(),
    });
  }

  /** Bascule vers une autre version existante (le sélecteur ne propose plus
   *  que de vraies versions — la création passe par le menu ⋯). */
  function onVersionChange(value: string) {
    if (!song) return;
    saveSong(switchVersion(song, value));
  }


  /** Supprime la version affichée ; si c'est celle d'un groupe, retire aussi
   *  le morceau du répertoire du groupe (propagé à tous — chacun garde sa
   *  copie perso). */
  function confirmDeleteVersion() {
    if (!song) return;
    const inBand = (current.bandId ?? '') !== '';
    if (inBand) {
      recordBandRemoval(current.bandId, songKey(song.title, song.artist));
    }
    saveSong(removeVersion(song, current.id));
  }

  // Appartenances actuelles (pour l'état compact).
  const memberBands = bands.filter((b) => versionForBand(song, b.id) !== null);
  const memberSetlists = setlists.filter((sl) =>
    sl.items.some((it) => it.songId === song.id),
  );

  /** Applique une partition UG mieux notée : remplace ou nouvelle version. */
  function applyUgTab(text: string, mode: 'replace' | 'version') {
    if (!song) return;
    saveSong(applyUgTextToSong(song, text, mode));
    setUgUpgrade(false);
  }

  return (
    <>
      <TopBar
        live={false}
        title={
          ctxSetlist
            ? t('{title} · {setlist}', {
                title: song.title || t('(sans titre)'),
                setlist: ctxSetlist.name || t('Setlist'),
              })
            : song.title || t('(sans titre)')
        }
        onBack={() =>
          ctxSetlist ? navigate(`/setlist/${ctxSetlist.id}`) : navigate('/')
        }
        right={
          <>
            {/* « Scène » (action principale) tout à droite — demande Vincent. */}
            <button
              className="btn ghost small"
              title={t('Modifier la partition (paroles, accords, structure…)')}
              onClick={() => navigate(`/song/${song.id}/edit`)}
            >
              <Icon name="edit" size={15} /> {t('Modifier')}
            </button>
            <button
              className="btn small"
              title={
                ctxSetlist
                  ? t('Mode scène — la setlist entière (le public peut la suivre)')
                  : t('Mode scène (plein écran)')
              }
              onClick={() =>
                navigate(
                  ctxSetlist
                    ? // On emporte la position : le mode scène s'ouvre sur
                      // CE morceau, pas sur le premier du set (b164).
                      `/stage/${ctxSetlist.id}/${fromSetlist?.index ?? 0}`
                    : `/stage/song/${song.id}`,
                )
              }
            >
              <Icon name="play" size={14} /> {t('Scène')}
            </button>
          </>
        }
      />
      <div className="page">
        {song.idea === true && (
          <div
            className="card"
            style={{
              borderColor: 'var(--accent-dark)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ flex: 1 }}>
              💡 <strong>{t('Idée à travailler')}</strong>
              <br />
              <span className="help">
                {t(
                  'Jouable partout, mais pas encore validée dans ta bibliothèque.',
                )}
              </span>
            </span>
            <button
              className="btn small"
              /* Même règle que « ✓ Accepter » et que la programmation dans
                 une setlist : elle vit dans le store (b206). C'était le
                 TROISIÈME endroit à écrire l'adoption d'un morceau à sa
                 façon — et deux d'entre eux avaient déjà divergé (b205). */
              onClick={() => acceptSong(song.id)}
            >
              {t('✓ Valider dans la bibliothèque')}
            </button>
          </div>
        )}
        <div className="songmeta chips">
          {song.artist !== '' &&
            song.artist.trim().toLowerCase() !==
              (artist.name ?? '').trim().toLowerCase() && (
              <span className="chip static off">{song.artist}</span>
            )}
          {song.tempo > 0 && <span className="chip static">{song.tempo} BPM</span>}
          {song.durationSec > 0 && (
            <span className="chip static">{formatDuration(song.durationSec)}</span>
          )}
          {song.tags.map((t) => (
            <span className="chip static off" key={t}>
              {t}
            </span>
          ))}
          <button
            className={`chip ${song.noSolo === true ? 'off' : ''}`}
            title={
              song.noSolo === true
                ? t('Déqualifié du répertoire solo — cliquer pour le requalifier')
                : t(
                    'Jouable en solo (par défaut) — cliquer pour le déqualifier si tu ne peux pas le jouer seul',
                  )
            }
            onClick={() =>
              saveSong({
                ...song,
                noSolo: song.noSolo === true ? undefined : true,
              })
            }
          >
            <Icon name="mic" size={12} />{' '}
            {song.noSolo === true ? t('Pas en solo') : t('Solo ✓')}
          </button>
          {song.hearts > 0 && (
            <span className="chip static" style={{ color: 'var(--heart)' }}>
              ❤ {song.hearts}
            </span>
          )}
          {/* 👁 L'œil doit être VISIBLE sur la partition (correction de
              Vincent, b223) : rangé sous les notes de répétition, il
              n'existait pas. */}
          <PublicEye
            song={song}
            actif={vuePublic}
            onToggle={() => setVuePublic((v) => !v)}
          />
          {/* En haut de page (demande Vincent) : proposer une meilleure
              partition dès l'arrivée sur le morceau. */}
          {!isBandVersion && song.versions.length < 2 && (
            <button
              className="btn ai small"
              title={t(
                'Sing2Me cherche la version la mieux notée de cette partition et te la propose',
              )}
              onClick={() => setUgUpgrade(true)}
            >
              {t('★ Meilleure version ?')}
            </button>
          )}
        </div>

        {/* Bandeau de version : dit toujours CE QUE tu consultes et si c'est
            partagé. Absent pour un morceau simple (1 version perso) — Lot D. */}
        {(isBandVersion || song.versions.length >= 2) && (
          <div
            className="versionbanner"
            style={
              isBandVersion
                ? { borderLeftColor: bandColorFor(curBandId) }
                : undefined
            }
          >
            <div className="vb-main">
              <div className="vb-title">
                <span>
                  {isBandVersion
                    ? t('Version du groupe {band}', { band: bandName(curBandId) || '—' })
                    : isMainVersion
                      ? t('Version de référence')
                      : t('Version « {name} »', { name: current.name })}
                </span>
                {isBandVersion ? (
                  <span className="vb-shared">{t('partagée')}</span>
                ) : isMainVersion ? (
                  <span className="vb-ref">{t('⭐ référence')}</span>
                ) : (
                  <span className="vb-solo">{t('perso')}</span>
                )}
              </div>
              <div className="vb-sub">
                {isBandVersion
                  ? t(
                      'Tes modifications de cette version arrivent chez tous les membres du groupe.',
                    )
                  : isMainVersion
                    ? t(
                        'Version maîtresse, personnelle : elle reste dans ta bibliothèque et sert de base aux autres (tonalité/capo se répercutent).',
                      )
                    : t('À toi seul — cette version n’est pas partagée.')}
              </div>
            </div>
            {song.versions.length >= 2 && (
              <select
                value={current.id}
                aria-label={t('Changer de version affichée')}
                onChange={(e) => onVersionChange(e.target.value)}
              >
                {song.versions.map((v) => {
                  const bn =
                    v.bandId !== '' ? bandName(v.bandId) : '';
                  // Évite « Vince et Marcus · Vince et Marcus » quand le nom
                  // de version reprend déjà celui du groupe.
                  const suffix =
                    bn !== '' && bn.trim() !== v.name.trim()
                      ? ` · ${bn}`
                      : '';
                  return (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {suffix}
                      {v.key !== '' ? ` (${v.key})` : ''}
                    </option>
                  );
                })}
              </select>
            )}
            <button
              className="btn ghost small"
              aria-label={t('Actions sur les versions')}
              title={t(
                'Versions : référence, renommer, meilleure version, supprimer',
              )}
              onClick={() => setVersionMenu(true)}
            >
              ⋯
            </button>
          </div>
        )}

        {ugUpgrade && (
          <UgUpgradeModal
            song={song}
            onApply={applyUgTab}
            onClose={() => setUgUpgrade(false)}
          />
        )}

        {assocOpen && (
          <AssignSheet songId={song.id} onClose={() => setAssocOpen(false)} />
        )}


        {/* La partition d'abord (« un écran = une mission ») : la
            transposition vit dans un pli qui affiche toujours la tonalité
            et le capo courants — un tap pour l'ouvrir, zéro place perdue. */}
        <CoachMark
          id="song-transpose"
          text={t('Tonalité et capo sont ici — tout se transpose.')}
        />
        {showTranspose && (
          <details className="stfold">
            <summary>
              {inSetlistOverride ? t('🎵 Tonalité de ce concert') : t('🎵 Tonalité')}
              {shownKey !== '' ? ` ${shownKey}` : ''}
              {capo > 0 ? ` · ${t('Capo')} ${capo}` : ''} — {t('transposer')}
            </summary>
            <div className="spacer" />
            <div className="transpose">
            {/* Chaque bloc « libellé + molette » est insécable : Transposer et
                Capo restent groupés ; si la place manque, Capo passe à la
                ligne en entier (une 2ᵉ ligne qui commence par « Capo »). */}
            <span className="transpose-unit">
              <span className="lbl">{t('Transposer')}</span>
              <div className="stepper">
                <button
                  title={t(
                    'Accords plus bas (capo +1) — la tonalité réelle ne change pas',
                  )}
                  onClick={() => transpose(-1, true)}
                >
                  ♭
                </button>
                <span>
                  {shownKey !== ''
                    ? shownKey
                    : shift === 0
                      ? '—'
                      : t('{n} ½t', { n: shift > 6 ? shift - 12 : shift })}
                </span>
                <button
                  title={t('Accords plus haut (capo −1)')}
                  onClick={() => transpose(1, true)}
                >
                  ♯
                </button>
              </div>
            </span>
            {!displayReal && (
              <span className="transpose-unit">
                <span className="lbl">{t('Capo')}</span>
                <div className="stepper">
                  <button
                    title={t('Le capo change ce qui sonne, pas les accords affichés')}
                    onClick={() => changeCapo(capo - 1)}
                  >
                    −
                  </button>
                  <span>{capo}</span>
                  <button onClick={() => changeCapo(capo + 1)}>＋</button>
                </div>
              </span>
            )}
            {/* Une seule fonction « musicien » : afficher les accords à jouer
                sans capo (pratique pour la basse / la tonalité réelle). */}
            <button
              className="btn ghost small"
              style={displayReal ? { color: 'var(--accent)' } : undefined}
              title={t(
                "Afficher les accords tels qu'ils doivent être joués sans capo — pratique pour la basse",
              )}
              onClick={toggleReal}
            >
              {displayReal ? t('✓ Accords sans capo') : t('Accords sans capo')}
            </button>
            {inSetlistOverride && (
              <button
                className="btn ghost small"
                title={t('Rejouer ce morceau dans la tonalité de la version')}
                onClick={() => setItemKey('')}
              >
                {t('Tonalité d’origine')}
              </button>
            )}
            </div>
          </details>
        )}

        {vuePublic ? (
          <PublicPreview
            song={song}
            onSave={saveSong}
            onClose={() => setVuePublic(false)}
          />
        ) : (
          <SongBody
            song={{ ...song, rehearsalNotes: contextNotes }}
            view={view}
            semitones={displayShift}
            capo={0}
            preferFlat={preferFlat}
            fontSize={1}
          />
        )}

        {/* Pas de rangée Scène / A− / A+ ici (décision Vincent) : « Scène »
            est déjà dans l'en-tête, et la taille du texte se règle en mode
            scène, là où on en a besoin. */}

        {/* Sous la partition (la lecture d'abord) : appartenances (où le
            morceau EST) + accès versions pour un morceau simple. */}
        <div
          className="hstack"
          style={{
            marginBottom: 8,
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span className="help">{t('Dans :')}</span>
          {memberBands.length === 0 && memberSetlists.length === 0 && (
            <span className="help" style={{ margin: 0 }}>
              {t('aucun groupe ni setlist')}
            </span>
          )}
          {memberBands.map((b) => (
            <span key={b.id} className="chip static">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background:
                    BAND_COLORS[
                      bands.findIndex((x) => x.id === b.id) % BAND_COLORS.length
                    ],
                  marginRight: 4,
                }}
              />
              {b.name || t('Groupe sans nom')}
            </span>
          ))}
          {memberSetlists.map((sl) => (
            <span key={sl.id} className="chip static">
              {sl.name || t('(sans nom)')}
            </span>
          ))}
          <button
            className="chip off"
            title={t('Ajouter ce morceau à un groupe ou une setlist')}
            onClick={() => setAssocOpen(true)}
          >
            {t('＋ Ajouter à…')}
          </button>
        </div>

        {/* Modèle des versions (décisions Vincent, b113, simplifié b211) :
            l'originale + une version par groupe — rien d'autre. Plus de
            « version Solo » (l'originale EST ma façon de le jouer seul),
            pas de versions de setlist. */}

        {showNotes && (
          <div className="notesbox">
            <div className="label" style={{ display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>
                {t('Notes de répétition')}
                {current.bandId !== '' && bandName(current.bandId) !== ''
                  ? t(' · contexte {band}', { band: bandName(current.bandId) })
                  : t(' · solo / tous')}
              </span>
              <button
                className="btn ghost small"
                onClick={() => setNoteModal('new')}
              >
                {t('＋ Note')}
              </button>
            </div>
            {allNotes.length === 0 && (
              <p className="help" style={{ margin: 0 }}>
                {t(
                  'Le journal du travail sur ce morceau : datées, signées, partagées au groupe ou personnelles. Dictée vocale 🎤.',
                )}
              </p>
            )}
            {allNotes.map((n) => (
              <div
                key={n.id}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'baseline',
                  marginBottom: 6,
                }}
              >
                <span
                  style={{ flex: 1, cursor: 'pointer' }}
                  title={t('Modifier la note')}
                  onClick={() => setNoteModal(n)}
                >
                  <Icon name={n.visibility === 'privee' ? 'lock' : 'message'} size={13} />{' '}
                  {n.text}
                  {n.author !== '' && (
                    <em className="stauthor"> — {n.author}</em>
                  )}
                  <em className="stauthor"> · {relativeDay(n.createdAt)}</em>
                </span>
                <button
                  className="btn ghost small"
                  style={{ color: 'var(--danger)' }}
                  title={t('Supprimer la note (pour tout le monde)')}
                  onClick={() => deleteNote(song.id, n.id)}
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showNotes && song.fanMessages.length > 0 && (
          <div className="notesbox" style={{ borderLeftColor: 'var(--heart)' }}>
            <div className="label">
              {t('💬 Messages du public ({n})', { n: song.fanMessages.length })}
            </div>
            {[...song.fanMessages]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((m) => (
                <div
                  key={m.id}
                  style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6 }}
                >
                  <span style={{ flex: 1 }}>
                    « {m.text} »
                    <span className="stauthor">
                      {' '}
                      — {m.author !== '' ? m.author : t('anonyme')} ·{' '}
                      {/* Date courte : reste en fr-FR (voir rapport i18n). */}
                      {new Date(m.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <button
                    className="btn ghost small"
                    style={{ color: 'var(--danger)' }}
                    title={t('Retirer ce message')}
                    onClick={() =>
                      saveSong({
                        ...song,
                        fanMessages: song.fanMessages.filter((x) => x.id !== m.id),
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Réglages personnels du musicien : locaux, jamais partagés */}
        <details className="stfold">
          <summary>
            {t('Mes réglages perso')}
            {song.mySetup?.instrument
              ? ` — ${song.mySetup.instrument}`
              : ''}
          </summary>
          <div className="spacer" />
          <Field label={t('Instrument joué sur ce morceau')}>
            <input
              type="text"
              value={song.mySetup?.instrument ?? ''}
              placeholder={t('Congas, cajon, guitare électro…')}
              onChange={(e) =>
                saveSong({
                  ...song,
                  mySetup: {
                    instrument: e.target.value,
                    notes: song.mySetup?.notes ?? '',
                  },
                })
              }
            />
          </Field>
          <Field label={t('Réglages (ampli, effets, retours…)')}>
            <textarea
              value={song.mySetup?.notes ?? ''}
              placeholder={t('Drive canal 2, delay 320 ms\nRetour : voix + claviers')}
              onChange={(e) =>
                saveSong({
                  ...song,
                  mySetup: {
                    instrument: song.mySetup?.instrument ?? '',
                    notes: e.target.value,
                  },
                })
              }
            />
          </Field>
          <p className="help">
            {t(
              'Personnel : visible uniquement dans ton application (et affiché en mode scène) — jamais inclus dans les partages.',
            )}
          </p>
        </details>

        {/* Décision produit (Vincent, août 2026) : une chanson ne circule
            QUE de deux façons — poussée dans le répertoire d'un groupe
            (« Ajouter à… », synchro auto) ou diffusée par QR en mode ON AIR.
            Aucun envoi de copie par lien depuis la fiche morceau. */}

        <div className="spacer" />
        <button
          className="btn ghost block"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => setDelSongOpen(true)}
        >
          <Icon name="trash" size={15} /> {t('Supprimer ce morceau')}
        </button>
        {delSongOpen && (
          <ConfirmSheet
            title={t('Supprimer « {title} » ?', {
              title: song.title || t('(sans titre)'),
            })}
            message={t('Le morceau sera aussi retiré des setlists.')}
            confirmLabel={t('Supprimer')}
            danger
            onConfirm={() => {
              deleteSong(song.id);
              navigate('/');
            }}
            onClose={() => setDelSongOpen(false)}
          />
        )}
      </div>

      {/* Lecture de setlist : précédent / suivant toujours accessibles */}
      {ctxSetlist && fromSetlist && (
        <div className="setnav">
          <button
            className="btn ghost"
            disabled={fromSetlist.index <= 0}
            onClick={() =>
              navigate(`/setlist/${ctxSetlist.id}/song/${fromSetlist.index - 1}`)
            }
          >
            <Icon name="chevron-left" size={16} /> {t('Précédent')}
          </button>
          <button
            className="btn ghost"
            title={t('Revenir à la setlist')}
            onClick={() => navigate(`/setlist/${ctxSetlist.id}`)}
          >
            <Icon name="list" size={15} /> {fromSetlist.index + 1}/
            {ctxSetlist.items.length}
          </button>
          <button
            className="btn ghost"
            disabled={fromSetlist.index >= ctxSetlist.items.length - 1}
            onClick={() =>
              navigate(`/setlist/${ctxSetlist.id}/song/${fromSetlist.index + 1}`)
            }
          >
            {t('Suivant')} <Icon name="chevron-right" size={16} />
          </button>
        </div>
      )}

      <AutoScrollFab scroll={scroll} />

      {versionMenu && (
        <MenuSheet
          title={t('Version « {name} »', { name: current.name })}
          items={[
            {
              label: t('★ Chercher une meilleure version (IA)'),
              icon: 'star',
              onClick: () => setUgUpgrade(true),
            },
            ...(!isMainVersion
              ? [
                  {
                    label: t('⭐ En faire la version de référence'),
                    icon: 'star' as const,
                    onClick: () => setPromoteOpen(true),
                  },
                ]
              : []),
            {
              label: t('Renommer la version'),
              icon: 'edit' as const,
              onClick: () => setRenameOpen(true),
            },
            ...(song.versions.length > 1
              ? [
                  {
                    label: isBandVersion
                      ? t('Retirer cette version (et le morceau du groupe)')
                      : t('Supprimer la version « {name} »', { name: current.name }),
                    icon: 'trash' as const,
                    danger: true,
                    onClick: () => setDelVersionOpen(true),
                  },
                ]
              : []),
          ]}
          onClose={() => setVersionMenu(false)}
        />
      )}

      {promoteOpen && (
        <ConfirmSheet
          title={t('« {name} » devient la référence ?', { name: current.name })}
          message={
            (current.bandId ?? '') === ''
              ? t(
                  "Son contenu remplace l'originale (l'ancien contenu est effacé), et cette version disparaît — elle EST devenue l'originale. Les autres versions ne bougent pas.",
                )
              : t(
                  "Son contenu remplace celui de l'originale (l'ancien contenu est effacé). Cette version reste attachée à son contexte.",
                )
          }
          confirmLabel={t('En faire la référence')}
          onConfirm={() => {
            saveSong(promoteVersionToOriginal(song, current.id));
            toast.show(t('C’est maintenant la version de référence ⭐'));
          }}
          onClose={() => setPromoteOpen(false)}
        />
      )}

      {renameOpen && (
        <PromptSheet
          title={t('Renommer la version')}
          initialValue={current.name}
          placeholder={t('Nom de la version')}
          confirmLabel={t('Renommer')}
          onSubmit={(name) => saveSong(renameVersion(song, current.id, name))}
          onClose={() => setRenameOpen(false)}
        />
      )}

      {delVersionOpen && (
        <ConfirmSheet
          title={t('Supprimer la version « {name} » ?', { name: current.name })}
          message={
            isBandVersion
              ? t(
                  'Le morceau sortira aussi du répertoire du groupe pour tous les membres (chacun garde sa partition personnelle).',
                )
              : isMainVersion
                ? t('La version suivante devient la référence du morceau.')
                : t('Les autres versions du morceau sont conservées.')
          }
          confirmLabel={t('Supprimer la version')}
          danger
          onConfirm={confirmDeleteVersion}
          onClose={() => setDelVersionOpen(false)}
        />
      )}

      {noteModal !== null && (
        <NoteModal
          song={song}
          author={prefs.userName}
          initialBandId={current.bandId}
          existing={noteModal === 'new' ? undefined : noteModal}
          onClose={() => setNoteModal(null)}
          onSave={(note, replaces) => {
            // Note vivante (b154) : la fusion IA remplace l'ancienne note
            // (retrait + pierre tombale + ajout), sinon ajout/édition.
            if (noteModal === 'new' && replaces) {
              replaceNote(song.id, replaces, note);
              return;
            }
            saveSong({
              ...song,
              rehearsalNotes:
                noteModal === 'new'
                  ? [...song.rehearsalNotes, note]
                  : song.rehearsalNotes.map((n) =>
                      n.id === note.id ? note : n,
                    ),
            });
          }}
        />
      )}
    </>
  );
}
