/**
 * RECHERCHE & CRÉATION D'UNE PARTITION (b319, PIVOT b334 : tout dans
 * mojosong).
 *
 * Un champ de recherche unique → les RÉSULTATS s'affichent DANS l'app
 * (recherche serveur existante, la même que « Meilleure version ? ») → en
 * choisir un récupère la partition (fn=fetch) → mise en forme LOCALE
 * (importText : accords détectés et fusionnés, sections reconnues — aucun
 * appel IA) → aperçu avec titre / artiste / tonalité éditables (accords en
 * bleu via SongBody) → validation.
 *
 * HISTORIQUE DU PIVOT (b319→b334) : la spec d'origine faisait naviguer
 * l'utilisateur LUI-MÊME sur le site d'UG (nouvel onglet), copie manuelle,
 * collage — aucune requête serveur. Sur iPhone avec l'app UG installée, ce
 * parcours s'est révélé impraticable (b320-b332 : lien universel, page
 * mobile qui force l'app, préférence iOS mémorisée). Décision explicite de
 * Vincent (b334, après les dérogations lien b322 et l'échec constaté) :
 * recherche ET récupération passent par NOTRE serveur — même exposition que
 * « Meilleure version ? », en production depuis des mois.
 *
 * Le libellé disait « Ultimate Guitar » (levée b319) ; depuis b472 (demande
 * de Vincent) il redevient neutre : « Chercher sur le web » — la règle §A.5
 * s'applique à nouveau partout.
 *
 * L'écran de COLLAGE reste en repli : « Recoller un autre texte » depuis
 * l'aperçu, reprise d'un ancien brouillon — texte traité 100 % en local,
 * lien récupéré par le serveur (b322/b325).
 *
 * Brouillon : invisible de tout (répertoire, compteurs, synchro), TTL 6 h,
 * une seule création à la fois. Déduplication à la validation : jamais de
 * fusion silencieuse — l'utilisateur arbitre.
 */
import React, { useMemo, useState } from 'react';

import { BandeauPourGroupe } from '../components/BandeauPourGroupe';
import { useToast } from '../components/Feedback';
import { signalerLimite } from '../components/UpgradeSheet';
import { useLimits } from '../components/useLimits';
import { Icon } from '../components/Icon';
import { SongBody } from '../components/SongBody';
import { TopBar } from '../components/ui';
import { t } from '../i18n';
import { findSameSong, importText } from '../lib/importer';
import { addSongAsVersion } from '../lib/model';
import {
  fetchUgTab,
  searchUgTabs,
  UgSearchResult,
  ugContentToText,
  ugTabToImportText,
} from '../lib/ug';
import { navigate } from '../router';
import { useStore } from '../store';
import { estBrouillon, Song } from '../types';
import { extractUgLinks } from './Import';

/** Étape courante, déduite de l'état du brouillon (reprise au bon endroit). */
function etapeCourante(draft: Song | null): 'recherche' | 'colle' | 'apercu' {
  return draft === null
    ? 'recherche'
    : draft.lyrics.trim() === ''
      ? 'colle'
      : 'apercu';
}

/**
 * SESSION DE RECHERCHE, AU NIVEAU MODULE (b477, audit N-1). Les résultats
 * vivaient dans l'état du composant : QUITTER le flux (Annuler, ← depuis
 * l'écran d'ajout) démontait l'écran et perdait requête, résultats et
 * position — b472 ne protégeait que les allers-retours À L'INTÉRIEUR du
 * flux. Cette mémoire survit au démontage : on peut sortir, revenir par
 * « Chercher sur le web », et retrouver sa liste. Elle ne se vide qu'au
 * rechargement de l'app (mémoire vive, jamais persistée) et quand une
 * NOUVELLE recherche la remplace.
 */
let memoireRecherche: {
  query: string;
  resultats: UgSearchResult[] | null;
  dernierChoisi: string;
  filtreArtiste: string;
  filtreType: string;
  /** Aperçus de contenu déjà récupérés (b477/C-9), par URL de résultat. */
  apercus: Record<string, string>;
} | null = null;

/** Types de la source en clair (b477/C-9) : « Chords »/« Tabs » bruts ne
 *  disaient pas ce qu'on allait obtenir. Traduits au rendu (t()). */
const TYPES_LISIBLES: Record<string, string> = {
  Chords: 'Accords',
  Tabs: 'Tablature',
  'Bass Tabs': 'Basse (tablature)',
  'Ukulele Chords': 'Ukulélé (accords)',
  'Drum Tabs': 'Batterie (tablature)',
};
const typeLisible = (type: string) => TYPES_LISIBLES[type] ?? type;

export function Compose({ draftId }: { draftId: string | null }) {
  const { songs, saveSong, purgeBrouillon } = useStore();
  // Plafond du plan (b390) : créer, c'est ajouter — même garde que le ＋.
  const limites = useLimits();
  const toast = useToast();

  const draft = useMemo(
    () => songs.find((s) => s.id === draftId && estBrouillon(s)) ?? null,
    [songs, draftId],
  );

  const [query, setQuery] = useState(() => memoireRecherche?.query ?? '');
  const [colle, setColle] = useState('');
  // Champs éditables de l'aperçu (pré-remplis par le parsing ; la
  // validation vaut confirmation — pas de dialogue intermédiaire).
  const [titre, setTitre] = useState<string | null>(null);
  const [artiste, setArtiste] = useState<string | null>(null);
  const [tonalite, setTonalite] = useState<string | null>(null);
  // Doublon détecté à la validation : l'utilisateur arbitre.
  const [double, setDouble] = useState<Song | null>(null);

  const validees = useMemo(() => songs.filter((s) => !estBrouillon(s)), [songs]);

  /* ── Étape 1 : recherche → résultats DANS l'app (b334) ──────────── */
  const [resultats, setResultats] = useState<UgSearchResult[] | null>(
    () => memoireRecherche?.resultats ?? null,
  );
  const [rechercheEnCours, setRechercheEnCours] = useState(false);
  const [choixEnCours, setChoixEnCours] = useState('');
  // b472 (point 4) : le dernier résultat ouvert reste marqué ✓ — au retour
  // dans la liste, on retrouve où l'on en était (et la ligne est recadrée).
  const [dernierChoisi, setDernierChoisi] = useState(
    () => memoireRecherche?.dernierChoisi ?? '',
  );
  // b472 (point 5) : filtre par artiste SUR la liste — quand une recherche
  // rend vingt versions (« sweet dreams » : Eurythmics, Marilyn Manson…),
  // un appui isole celles de l'artiste voulu. Simple vue filtrée, locale.
  const [filtreArtiste, setFiltreArtiste] = useState(
    () => memoireRecherche?.filtreArtiste ?? '',
  );
  // b477 (C-9) : filtre par TYPE (accords / tablature…) sur la liste.
  const [filtreType, setFiltreType] = useState(
    () => memoireRecherche?.filtreType ?? '',
  );
  const typesDesResultats = useMemo(() => {
    if (resultats === null) return [];
    const vus: string[] = [];
    for (const r of resultats) {
      if (r.type !== '' && !vus.includes(r.type)) vus.push(r.type);
    }
    return vus;
  }, [resultats]);
  // b477 (C-9) : aperçus de contenu récupérés à la demande, par URL.
  const [apercus, setApercus] = useState<Record<string, string>>(
    () => memoireRecherche?.apercus ?? {},
  );
  const [apercuEnCours, setApercuEnCours] = useState('');
  // La mémoire de module suit l'état : sortir du flux ne perd plus rien.
  React.useEffect(() => {
    memoireRecherche = {
      query,
      resultats,
      dernierChoisi,
      filtreArtiste,
      filtreType,
      apercus,
    };
  }, [query, resultats, dernierChoisi, filtreArtiste, filtreType, apercus]);

  /** Aperçu de contenu À LA DEMANDE (b477/C-9) : un aperçu automatique de
   *  tous les résultats coûterait une récupération de page PAR ligne — la
   *  limite de débit de la source tuerait la recherche. Un tap = une
   *  récupération (cache CDN 24 h côté serveur), gardée en mémoire de
   *  session ; un second tap replie. */
  async function chargerApercu(r: UgSearchResult) {
    if (apercus[r.url] !== undefined) {
      setApercus((a) => {
        const { [r.url]: _lu, ...reste } = a;
        void _lu;
        return reste;
      });
      return;
    }
    if (apercuEnCours !== '') return;
    setApercuEnCours(r.url);
    try {
      const tab = await fetchUgTab(r.url);
      const lignes = ugContentToText(tab.content)
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim() !== '');
      setApercus((a) => ({
        ...a,
        [r.url]: lignes.slice(0, 3).join('\n') || t('(contenu vide)'),
      }));
    } catch {
      setApercus((a) => ({
        ...a,
        [r.url]: t('Aperçu indisponible pour l’instant — réessaie dans un moment.'),
      }));
    } finally {
      setApercuEnCours('');
    }
  }
  const artistesDesResultats = useMemo(() => {
    if (resultats === null) return [];
    const compte = new Map<string, number>();
    for (const r of resultats) {
      const a = r.artist.trim();
      if (a !== '') compte.set(a, (compte.get(a) ?? 0) + 1);
    }
    return [...compte.entries()]
      .sort((x, y) => y[1] - x[1])
      .map((x) => x[0])
      .slice(0, 8);
  }, [resultats]);
  const resultatsAffiches = useMemo(() => {
    if (resultats === null) return null;
    return resultats
      .filter((r) => filtreArtiste === '' || r.artist === filtreArtiste)
      .filter((r) => filtreType === '' || r.type === filtreType);
  }, [resultats, filtreArtiste, filtreType]);

  async function lancerRecherche() {
    const q = query.trim();
    if (q === '' || rechercheEnCours) return;
    setRechercheEnCours(true);
    setResultats(null);
    setFiltreArtiste('');
    setFiltreType('');
    setDernierChoisi('');
    setApercus({});
    try {
      const bruts = await searchUgTabs(q);
      // b477 (C-9) : doublons stricts (même titre, artiste, type, version)
      // rendus par la pagination de la source — le mieux voté reste (la
      // liste arrive triée par votes).
      const vus = new Set<string>();
      setResultats(
        bruts.filter((r) => {
          const k = `${r.title}|${r.artist}|${r.type}|${r.version}`;
          if (vus.has(k)) return false;
          vus.add(k);
          return true;
        }),
      );
    } catch (e) {
      toast.show(e instanceof Error ? e.message : t('La recherche a échoué.'));
    } finally {
      setRechercheEnCours(false);
    }
  }

  /** Choisir un résultat : récupération + mise en forme locale → aperçu. */
  async function choisirResultat(r: UgSearchResult) {
    if (choixEnCours !== '') return;
    // Plafond du plan (b390) : le bouton reste ACTIF — au clic, la feuille
    // propose de passer en illimité au lieu de créer un 51ᵉ morceau.
    if (!limites.peutAjouter) {
      signalerLimite('LIMIT_SONGS');
      return;
    }
    setChoixEnCours(r.url);
    setDernierChoisi(r.url);
    try {
      const tab = await fetchUgTab(r.url);
      // Une seule création en cours : la nouvelle remplace l'ancien
      // brouillon (pas de cimetière).
      for (const s of songs) if (estBrouillon(s)) purgeBrouillon(s.id);
      const res = importText(ugTabToImportText(tab), tab.title || r.title);
      const brouillon: Song = {
        ...res.song,
        artist: res.song.artist || tab.artist || r.artist,
        status: 'formatting',
      };
      saveSong(brouillon);
      setTitre(null);
      setArtiste(null);
      setTonalite(null);
      navigate(`/creer/${brouillon.id}`);
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : t("L'import du lien a échoué."),
      );
    } finally {
      setChoixEnCours('');
    }
  }

  /* ── Récupération de route (b323) : si le brouillon visé a disparu mais
     qu'un autre vit encore, on y ramène ; et l'écran ouvert SANS identifiant
     reprend le brouillon vivant au lieu de repartir de zéro. ─────────── */
  /* b477 (audit N-1) : PLUS AUCUN REBOND AUTOMATIQUE vers le brouillon —
     « Chercher sur le web » disait ouvrir la recherche et rouvrait le
     dernier aperçu (la récupération b323 rebondissait dès qu'un brouillon
     vivait). La reprise est désormais une ACTION EXPLICITE : une carte
     « ↩ Reprendre : {titre} » s'affiche sur l'écran de recherche quand un
     brouillon attend. Un vrai rechargement sur /creer/{id} rouvre toujours
     le brouillon par sa route — la protection b323 qui compte. */
  const brouillonVivant = useMemo(
    () => (draft === null ? (songs.find((s) => estBrouillon(s)) ?? null) : null),
    [draft, songs],
  );

  // b472 (point 4) : au retour dans la liste, la ligne du résultat qu'on
  // vient de consulter est recadrée — on reprend l'exploration où on était.
  React.useEffect(() => {
    if (etapeCourante(draft) !== 'recherche' || dernierChoisi === '') return;
    document
      .querySelector('[data-resultat="choisi"]')
      ?.scrollIntoView({ block: 'center' });
  }, [draft, dernierChoisi]);

  const [lienEnCours, setLienEnCours] = useState(false);

  /* ── Étape 2 : collage → mise en forme locale ───────────────────── */
  async function appliquerTexte(texte: string) {
    if (!draft || texte.trim() === '' || lienEnCours) return;
    let brut = texte;
    let fallbackTitle = draft.title;
    /*
     * REPLI PAR LIEN (b322, DÉROGATION EXPLICITE de Vincent à sa propre
     * spec « aucune requête vers UG depuis l'app/backend ») : la page
     * mobile d'UG force l'ouverture de son application au clic sur un
     * résultat — la copie du CONTENU y est impossible, mais la copie du
     * LIEN (partage) fonctionne. Si le texte collé est un lien de
     * partition, on récupère donc la partition via NOTRE serveur — le
     * chemin qui existe déjà dans l'import (« Coller un lien », fn=fetch).
     * Un texte ordinaire reste traité 100 % en local, comme avant.
     */
    const liens = extractUgLinks(texte);
    if (liens.length > 0 && texte.trim().split(/\s+/).length <= 3) {
      setLienEnCours(true);
      try {
        const tab = await fetchUgTab(liens[0]);
        brut = ugTabToImportText(tab);
        if (tab.title) fallbackTitle = tab.title;
      } catch (e) {
        toast.show(
          e instanceof Error ? e.message : t("L'import du lien a échoué."),
        );
        setLienEnCours(false);
        return;
      }
      setLienEnCours(false);
    }
    // 100 % local : importText détecte accords, sections, métadonnées.
    // Les valeurs parsées ÉCRASENT la requête initiale (elle n'était
    // qu'une requête, potentiellement fautive).
    const res = importText(brut, fallbackTitle);
    saveSong({
      ...res.song,
      id: draft.id,
      createdAt: draft.createdAt,
      status: 'formatting',
    });
    setTitre(null);
    setArtiste(null);
    setTonalite(null);
  }

  async function collerDepuisPressePapiers() {
    // Lecture du presse-papiers UNIQUEMENT sur geste explicite (bouton) —
    // exigence de la spec, et seule forme permise par le web de toute façon.
    try {
      const texte = await navigator.clipboard.readText();
      if (texte.trim() === '') {
        toast.show(t('Le presse-papiers est vide — copie d’abord la partition.'));
        return;
      }
      setColle(texte);
      await appliquerTexte(texte);
    } catch {
      toast.show(
        t('Ce navigateur ne permet pas de coller ici — utilise la zone de texte.'),
      );
    }
  }

  /* ── Étape 3 : validation (avec arbitrage de doublon) ───────────── */
  function valider() {
    if (!draft) return;
    const tFinal = (titre ?? draft.title).trim() || draft.title;
    const aFinal = (artiste ?? draft.artist).trim();
    const kFinal = (tonalite ?? draft.key).trim();
    // Filet : la fiche jumelle peut être arrivée par la synchro PENDANT la
    // mise en forme (autre appareil). Jamais de fusion silencieuse.
    const jumeau = findSameSong(validees, tFinal, draft.lyrics, aFinal);
    if (jumeau) {
      setDouble(jumeau);
      return;
    }
    enregistrer(tFinal, aFinal, kFinal);
  }

  function enregistrer(tFinal: string, aFinal: string, kFinal: string) {
    if (!draft) return;
    // La validation EFFACE `status` : la fiche entre dans le répertoire et
    // dans la synchro comme n'importe quel morceau.
    const { status: _s, ...valide } = draft;
    void _s;
    saveSong({
      ...valide,
      title: tFinal,
      artist: aFinal,
      key: kFinal,
      updatedAt: new Date().toISOString(),
    });
    toast.show(t('Partition enregistrée dans ta bibliothèque.'));
    navigate(`/song/${draft.id}`);
  }

  /** Doublon — choix « remplacer » : la nouvelle mise en forme devient une
   *  version ACTIVE de la fiche existante (rien n'est détruit : l'ancien
   *  contenu reste dans ses versions — cohérent avec l'import, b135). */
  function remplacerExistante() {
    if (!draft || !double) return;
    const maj = addSongAsVersion(
      double,
      { ...draft, title: (titre ?? draft.title).trim() || draft.title },
      t('Nouvelle mise en forme'),
      true,
    );
    saveSong(maj);
    purgeBrouillon(draft.id);
    toast.show(t('La partition existante a été mise à jour.'));
    navigate(`/song/${double.id}`);
  }

  function abandonner() {
    if (draft) purgeBrouillon(draft.id);
    navigate('/import');
  }

  /* ── Rendu ──────────────────────────────────────────────────────── */

  // Reprise (spec) : si le brouillon vise un morceau déjà validé, le dire
  // AVANT de continuer — continuer reste légitime (deux arrangements).
  const dejaLa = useMemo(() => {
    if (!draft || draft.lyrics.trim() !== '') return null;
    return findSameSong(validees, draft.title, '', draft.artist);
  }, [draft, validees]);

  const etape = etapeCourante(draft);

  return (
    <>
      {/* Barre de titre standard (b372, demande de Vincent : « il faut un
          bouton pour revenir à l'écran qui précède ») : cet écran n'avait ni
          retour ni gouttière d'encoche. Le ← va vers un parent EXPLICITE —
          l'écran « Ajouter un morceau », d'où l'on vient (règle du projet,
          jamais history.back()). */}
      <TopBar
        live={false}
        title={t('Ajouter un morceau')}
        // b472 (point 4) : depuis l'aperçu d'un résultat, le ← revient à la
        // LISTE des résultats (encore en mémoire), pas au début du flux —
        // même chemin que le geste retour du téléphone.
        onBack={() =>
          etape !== 'recherche' && resultats !== null
            ? navigate('/creer')
            : navigate('/import')
        }
      />
      <div className="page">

      {/* b472 (point 1) : l'intention « pour le groupe » suit le trajet. */}
      <BandeauPourGroupe />

      {etape === 'recherche' && (
        <>
          <p className="help">
            {t('Tape le titre (et l’artiste) : choisis une partition, elle se met en forme toute seule.')}
          </p>
          {/* b477 (audit N-2) : un VRAI formulaire — Entrée et la touche
              « rechercher » du clavier mobile lancent la requête (le
              onKeyDown seul ne couvrait pas iOS), et le clavier se referme
              à la soumission pour que les résultats s'affichent en plein. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
              void lancerRecherche();
            }}
          >
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              autoFocus
              placeholder={t('Titre, artiste… (ex. hallelujah cohen)')}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="spacer" />
            <button
              type="submit"
              className="btn block"
              disabled={query.trim() === '' || rechercheEnCours}
            >
              {rechercheEnCours
                ? t('Recherche en cours…')
                : (
                    <>
                      <Icon name="search" size={16} />{' '}
                      {t('Chercher sur le web')}
                    </>
                  )}
            </button>
          </form>
          {/* b477 (audit N-1) : la reprise d'un brouillon est une action
              NOMMÉE — plus jamais un effet caché du bouton de recherche. */}
          {brouillonVivant && (
            <div className="card" style={{ marginTop: 'var(--sp-3)' }}>
              <button
                className="btn ghost block"
                onClick={() => navigate(`/creer/${brouillonVivant.id}`)}
              >
                ↩{' '}
                {t('Reprendre : {titre}', {
                  titre: [brouillonVivant.title, brouillonVivant.artist]
                    .filter((x) => x.trim() !== '')
                    .join(' — ') || t('brouillon en cours'),
                })}
              </button>
            </div>
          )}
          {resultats !== null && resultats.length === 0 && (
            <p className="help">
              {t('Aucun résultat — précise le titre (et l’artiste).')}
            </p>
          )}
          {/* b472 (point 5) : quand plusieurs artistes cohabitent dans les
              résultats, une rangée de pastilles isole ceux d'un artiste. */}
          {resultats !== null && artistesDesResultats.length > 1 && (
            <div
              className="chips scrollrow"
              style={{ marginTop: 'var(--sp-3)', alignItems: 'center' }}
            >
              <span className="help" style={{ margin: 0 }}>
                {t('Artiste :')}
              </span>
              <button
                className={`chip ${filtreArtiste === '' ? '' : 'off'}`}
                onClick={() => setFiltreArtiste('')}
              >
                {t('Tous')}
              </button>
              {artistesDesResultats.map((a) => (
                <button
                  key={a}
                  className={`chip ${filtreArtiste === a ? '' : 'off'}`}
                  onClick={() => setFiltreArtiste(filtreArtiste === a ? '' : a)}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
          {/* b477 (C-9) : filtre par TYPE quand plusieurs cohabitent —
              « accords seuls » et « tablature » ne servent pas au même
              musicien. */}
          {resultats !== null && typesDesResultats.length > 1 && (
            <div
              className="chips scrollrow"
              style={{ marginTop: 'var(--sp-2)', alignItems: 'center' }}
            >
              <span className="help" style={{ margin: 0 }}>
                {t('Type :')}
              </span>
              <button
                className={`chip ${filtreType === '' ? '' : 'off'}`}
                onClick={() => setFiltreType('')}
              >
                {t('Tous')}
              </button>
              {typesDesResultats.map((ty) => (
                <button
                  key={ty}
                  className={`chip ${filtreType === ty ? '' : 'off'}`}
                  onClick={() => setFiltreType(filtreType === ty ? '' : ty)}
                >
                  {t(typeLisible(ty))}
                </button>
              ))}
            </div>
          )}
          {resultatsAffiches !== null && resultatsAffiches.length > 0 && (
            <div className="card" style={{ marginTop: 'var(--sp-3)', padding: 6 }}>
              {resultatsAffiches.map((r, i) => (
                <div
                  className={`row ${r.url === dernierChoisi ? 'active' : ''}`}
                  key={i}
                  data-resultat={r.url === dernierChoisi ? 'choisi' : undefined}
                  style={{ cursor: 'pointer', flexWrap: 'wrap' }}
                  onClick={() => void choisirResultat(r)}
                >
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="title">
                      {r.url === dernierChoisi ? '✓ ' : ''}
                      {r.title}
                      {r.version > 1 ? ` (v${r.version})` : ''}
                    </div>
                    <div className="sub">
                      {/* b477 (C-9) : le type en CLAIR — « Accords » /
                          « Tablature », pas les libellés bruts. */}
                      {[
                        r.artist,
                        r.type !== '' ? t(typeLisible(r.type)) : '',
                        r.rating > 0 ? `★ ${r.rating}` : '',
                        r.votes > 0 ? t('{n} votes', { n: r.votes }) : '',
                      ]
                        .filter((x) => x !== '')
                        .join(' · ')}
                    </div>
                  </div>
                  {choixEnCours === r.url ? (
                    <span className="help">{t('⏳ Récupération…')}</span>
                  ) : (
                    /* b477 (C-9) : aperçu du CONTENU à la demande — un tap,
                       une récupération, pour trancher sans ouvrir. */
                    <button
                      className="btn ghost small"
                      title={t('Voir les premières lignes de cette partition')}
                      onClick={(e) => {
                        e.stopPropagation();
                        void chargerApercu(r);
                      }}
                    >
                      {apercuEnCours === r.url ? '⏳' : `👁 ${t('Aperçu')}`}
                    </button>
                  )}
                  {apercus[r.url] !== undefined && (
                    <div
                      className="help"
                      style={{
                        flexBasis: '100%',
                        whiteSpace: 'pre-wrap',
                        margin: '4px 0 2px',
                        fontFamily:
                          "ui-monospace, 'Cascadia Mono', Consolas, monospace",
                      }}
                    >
                      {apercus[r.url]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {etape === 'colle' && draft && (
        <>
          <p className="help">
            {t('Recherche en cours : ')}
            <strong>{draft.title}</strong>
          </p>
          {dejaLa && (
            <div className="card" style={{ marginBottom: 10 }}>
              <p className="help" style={{ margin: 0 }}>
                {t('« {titre} » existe déjà dans ton répertoire.', {
                  titre: dejaLa.title,
                })}{' '}
                <button
                  className="btn ghost small"
                  onClick={() => {
                    purgeBrouillon(draft.id);
                    navigate(`/song/${dejaLa.id}`);
                  }}
                >
                  {t('L’ouvrir')}
                </button>{' '}
                {t('— ou continue : deux arrangements du même titre sont légitimes.')}
              </p>
            </div>
          )}
          {/* Écran de REPLI depuis b334 (« Recoller un autre texte », reprise
              d'un ancien brouillon) : coller un texte de partition — traité
              100 % en local — ou un lien de partition, récupéré par le
              serveur (b322). */}
          <p className="help">
            {t('Colle une partition (accords + paroles) ou le lien d’une partition.')}
          </p>
          <button className="btn block" onClick={() => void collerDepuisPressePapiers()}>
            📋 {t('Coller la partition copiée')}
          </button>
          <div className="spacer" />
          <textarea
            rows={8}
            value={colle}
            placeholder={t('…ou colle-la ici à la main.')}
            onChange={(e) => {
              const v = e.target.value;
              setColle(v);
              // Un LIEN collé se traite TOUT SEUL (b325, retour de Vincent) :
              // pas de bouton à chercher — la récupération et la mise en
              // forme partent dès le collage. Un TEXTE de partition, lui,
              // attend le bouton « Mettre en forme » (on ne déclenche pas
              // une mise en forme pendant que l'utilisateur écrit).
              if (
                !lienEnCours &&
                extractUgLinks(v).length > 0 &&
                v.trim().split(/\s+/).length <= 3
              ) {
                void appliquerTexte(v);
              }
            }}
          />
          {colle.trim() !== '' && (
            <button
              className="btn block"
              disabled={lienEnCours}
              onClick={() => void appliquerTexte(colle)}
            >
              {lienEnCours ? t('⏳ Récupération…') : t('Mettre en forme')}
            </button>
          )}
          <div className="spacer" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {resultats !== null && resultats.length > 0 && (
              <button className="btn ghost" onClick={() => navigate('/creer')}>
                ← {t('Retour aux résultats')}
              </button>
            )}
            <button className="btn ghost" onClick={abandonner}>
              {t('Annuler')}
            </button>
          </div>
        </>
      )}

      {etape === 'apercu' && draft && (
        <>
          {/* Titre / artiste / tonalité éditables — pré-remplis par le
              parsing, la validation vaut confirmation. */}
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              style={{ flex: 2, minWidth: 140 }}
              value={titre ?? draft.title}
              placeholder={t('Titre')}
              onChange={(e) => setTitre(e.target.value)}
            />
            <input
              type="text"
              style={{ flex: 2, minWidth: 120 }}
              value={artiste ?? draft.artist}
              placeholder={t('Artiste')}
              onChange={(e) => setArtiste(e.target.value)}
            />
            <input
              type="text"
              style={{ flex: 1, minWidth: 60 }}
              value={tonalite ?? draft.key}
              placeholder={t('Tonalité')}
              onChange={(e) => setTonalite(e.target.value)}
            />
          </div>
          <div className="spacer" />
          <div className="card importpreview">
            <div className="importpreview-body">
              <SongBody
                song={{
                  ...draft,
                  title: (titre ?? draft.title).trim() || draft.title,
                  artist: artiste ?? draft.artist,
                }}
                view="complete"
              />
            </div>
          </div>
          <div className="spacer" />
          {double === null ? (
            <>
              <button className="btn block" onClick={valider}>
                {t('Enregistrer dans ma bibliothèque')}
              </button>
              <div className="spacer" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* b477 (audit C-4) : le libellé suit la PROVENANCE. Venu de
                    la recherche → « Choisir un autre résultat » (qui EST le
                    retour à la liste, b472/N-1). Venu du collage → l'ancien
                    « Recoller un autre texte », qui redevient exact. */}
                {resultats !== null && resultats.length > 0 ? (
                  <button className="btn ghost" onClick={() => navigate('/creer')}>
                    ← {t('Choisir un autre résultat')}
                  </button>
                ) : (
                  /* Retour vers le collage : le brouillon est CONSERVÉ
                     (l'utilisateur veut peut-être copier une autre version). */
                  <button
                    className="btn ghost"
                    onClick={() => {
                      saveSong({ ...draft, lyrics: '', status: 'draft' });
                      setColle('');
                    }}
                  >
                    ↩ {t('Recoller un autre texte')}
                  </button>
                )}
                <button className="btn ghost" onClick={abandonner}>
                  {t('Annuler')}
                </button>
              </div>
            </>
          ) : (
            /* Doublon détecté : l'utilisateur arbitre — jamais de fusion ni
               de suppression silencieuse. */
            <div className="card">
              <p className="help" style={{ marginTop: 0 }}>
                {t('« {titre} » existe déjà dans ton répertoire. Que veux-tu faire ?', {
                  titre: double.title,
                })}
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <button
                  className="btn ghost block"
                  onClick={() => {
                    purgeBrouillon(draft.id);
                    navigate(`/song/${double.id}`);
                  }}
                >
                  {t('Ouvrir la partition existante')}
                </button>
                <button className="btn ghost block" onClick={remplacerExistante}>
                  {t('La remplacer par cette mise en forme')}
                </button>
                <button
                  className="btn ghost block"
                  onClick={() =>
                    enregistrer(
                      (titre ?? draft.title).trim() || draft.title,
                      (artiste ?? draft.artist).trim(),
                      (tonalite ?? draft.key).trim(),
                    )
                  }
                >
                  {t('Garder les deux')}
                </button>
                <button className="btn ghost block" onClick={() => setDouble(null)}>
                  {t('↩ Revenir à l’aperçu')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
