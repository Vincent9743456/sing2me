import React, { useEffect, useMemo, useRef, useState } from 'react';

import { TopBar } from '../components/ui';
import { Icon } from '../components/Icon';
import { MojoLoader } from '../components/MojoLoader';
import { SongBody } from '../components/SongBody';
import { extractDocxText } from '../lib/docx';
import { extractPdfPages } from '../lib/pdf';
import { splitSongs, DetectedSong, SourceSignal } from '../lib/songsplit';
import {
  analyzeImport,
  bandKeysMatch,
  findSameSong,
  importText,
  lyricsSimilarity,
  raisonDeVerifier,
  songKey,
} from '../lib/importer';
import {
  douteApresIA,
  fusionMiseEnForme,
  meritteUneMiseEnForme,
  nettoyerAvecEscalade,
} from '../lib/aiFormat';
import {
  fetchUgTab,
  searchUgTabs,
  UgSearchResult,
  ugTabToImportText,
} from '../lib/ug';
import { BandeauPourGroupe } from '../components/BandeauPourGroupe';
import { ConfirmSheet, useToast } from '../components/Feedback';
import { leverNouveauPourGroupe } from '../lib/nouveaupourgroupe';
import { signalerLimite } from '../components/UpgradeSheet';
import { useLimits } from '../components/useLimits';
import { t } from '../i18n';
import { compteMorceauxPerso } from '../lib/limites';
import { addSongAsVersion } from '../lib/model';
import { looksGarbled } from '../lib/textRepair';
import { parseUgTabHtml } from '../lib/ugHtml';
import { navigate } from '../router';
import { useStore } from '../store';
import { estBrouillon, Song } from '../types';

type AddMethod = 'ug' | 'doc' | 'bulk';

/** Une tâche de l'import en masse : un fichier déposé ou un lien. */
interface TacheBulk {
  label: string;
  url?: string;
  text?: string;
  fallbackTitle?: string;
}

interface BulkItem {
  url: string;
  status: 'pending' | 'loading' | 'ok' | 'dup' | 'skip' | 'limite' | 'error';
  title: string;
  message: string;
  /** Format problématique détecté → candidat au nettoyage IA ciblé */
  needsAi?: boolean;
  /** Morceau créé (pour le repasser à l'IA après coup) */
  songId?: string;
  /** Texte d'origine (base du nettoyage IA) */
  raw?: string;
  /** L'import a douté sur ce morceau : il est en bibliothèque, à relire. */
  check?: boolean;
}

/**
 * Garde-fou : l'import en masse sert à migrer SA collection (My tabs,
 * favoris), pas à aspirer le site. Plafond par fournée — largement
 * suffisant pour un profil, dissuasif pour un site entier.
 */
export const MAX_BULK_LINKS = 200;

/**
 * RECHERCHE SERVEUR DÉSACTIVÉE (b330, décision de Vincent) : le champ
 * « Rechercher un morceau » (résultats listés dans l'app via /api/tabs) ne
 * s'affiche plus — le chemin d'entrée est le flux « Recherche & création »
 * (b319). Tout le code reste en place : repasser à true le rallume.
 */
const RECHERCHE_SERVEUR = false;

/**
 * FORMATS ACCEPTÉS PAR LES SÉLECTEURS DE FICHIERS (b370, constat de
 * Vincent : « le fichier PDF n'est pas détecté — je ne le vois pas dans le
 * dossier ouvert pour l'import »). Le sélecteur d'iOS filtre par TYPE DE
 * CONTENU (UTI), pas par extension : une liste d'extensions dont certaines
 * lui sont inconnues (.cho, .crd, .onsong…) peut le faire griser des
 * fichiers parfaitement valides — le PDF le premier. On annonce donc les
 * types MIME des formats standards EN PLUS des extensions : chaque
 * sélecteur retient ce qu'il comprend.
 */
const FICHIERS_ACCEPTES = [
  'application/pdf',
  'text/plain',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt', '.text', '.cho', '.crd', '.pro', '.chopro', '.chordpro',
  '.onsong', '.docx', '.pdf', '.html', '.htm',
].join(',');

/**
 * Extrait les liens Ultimate Guitar d'un texte collé (un par ligne ou en
 * vrac). Seules les pages de partition individuelle sont retenues :
 * `/tab/artiste/chanson-…` et `/user/tab/view?h=…` (tablatures
 * personnelles). Les pages de listing (recherche, explore, tops, menus
 * d'une page enregistrée…) sont rejetées.
 */
export function extractUgLinks(input: string): string[] {
  const found = input.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    if (out.length >= MAX_BULK_LINKS) break;
    // Dans une page HTML enregistrée, les href encodent & en &amp;
    const url = raw.replace(/&amp;/g, '&').replace(/[),.;]+$/, '');
    try {
      const p = new URL(url);
      const hostOk =
        p.hostname === 'ultimate-guitar.com' ||
        p.hostname.endsWith('.ultimate-guitar.com');
      // Pages de partition uniquement : /tab/artiste/chanson ou
      // /user/tab/view (les /user/tab/download & co sont des boutons
      // d'action de la page, pas des partitions).
      const isTabPage =
        /^\/tab\/[^/]+\/[^/]+/.test(p.pathname) ||
        p.pathname === '/user/tab/view';
      // Clé canonique : même partition sur www./tabs. ou avec une
      // ancre « # » = un seul lien.
      const key = p.pathname + p.search;
      if (hostOk && isTabPage && !seen.has(key)) {
        seen.add(key);
        out.push(`https://tabs.ultimate-guitar.com${p.pathname}${p.search}`);
      }
    } catch {
      /* lien invalide : ignoré */
    }
  }
  return out;
}

/** Barre de progression du traitement en masse. */

export function Import({ mode }: { mode?: 'bulk' } = {}) {
  const { songs, deleted, saveSong } = useStore();
  // Limites du plan (b381, simplifié b386 — arbitrage Vincent : « 50
  // chansons c'est tout. Pas possible d'importer plus ») : l'import
  // s'arrête au plafond du gratuit, avec bilan — jamais en silence.
  const limites = useLimits();
  // #/import/bulk arrive directement sur l'import en masse (b295) : c'est le
  // parcours de qui migre toute une collection d'un coup.
  const [method, setMethod] = useState<AddMethod>(mode === 'bulk' ? 'bulk' : 'ug');
  // b472 (point 1) : une collection entière n'est pas « un morceau pour le
  // groupe » — entrer dans l'import en masse lève le marqueur, sans quoi le
  // PREMIER morceau du lot serait rattaché au groupe en silence.
  useEffect(() => {
    if (method === 'bulk') leverNouveauPourGroupe();
  }, [method]);
  // Pli « Autres façons d'importer » (fermé par défaut : un seul chemin
  // visible ; forcé ouvert quand une alternative est en cours).
  // b478 (audit D-3, amende le « fermé par défaut » de b371) : l'écran
  // était vide aux trois quarts — les trois autres chemins se montrent
  // d'emblée, le pli reste refermable.
  const [othersOpen, setOthersOpen] = useState(true);
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  /**
   * Plusieurs partitions repérées dans le fichier déposé. On PROPOSE le
   * découpage, on ne l'impose jamais : couper une chanson en deux au milieu
   * d'un couplet serait pire que laisser un recueil d'un bloc — lequel part
   * de toute façon marqué « à vérifier ».
   */
  const [multi, setMulti] = useState<{
    songs: DetectedSong[];
    confident: boolean;
    signal: SourceSignal;
  } | null>(null);
  /** L'utilisateur a préféré garder le recueil d'un bloc : on le note. */
  const [recueilRefuse, setRecueilRefuse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ugUrl, setUgUrl] = useState('');
  const [ugLoading, setUgLoading] = useState(false);
  const [ugQuery, setUgQuery] = useState(() => {
    // Proposition venue de l'espace du groupe → recherche pré-remplie
    try {
      const q = localStorage.getItem('sing2me/importQuery') ?? '';
      if (q !== '') localStorage.removeItem('sing2me/importQuery');
      return q;
    } catch {
      return '';
    }
  });
  const [ugSearching, setUgSearching] = useState(false);
  const [ugResults, setUgResults] = useState<UgSearchResult[] | null>(null);
  /** Le résultat en cours de chargement / chargé — repéré dans la liste. */
  const [ugChoisi, setUgChoisi] = useState('');
  // Mise en forme automatique (b220) : l'IA passe sur CHAQUE import d'une
  // partition. Le texte collé reste la source ; le résultat de l'IA vit à
  // côté, pour qu'on puisse toujours revenir en arrière.
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'running' | 'done' | 'failed'>(
    'idle',
  );
  const [aiErreur, setAiErreur] = useState('');
  const [garderOriginal, setGarderOriginal] = useState(false);
  const aiSeq = useRef(0);
  // Mémoire des textes déjà remis en forme : revenir sur ses pas ne
  // redéclenche pas un appel payant.
  const aiCache = useRef(new Map<string, string>());
  const [bulkInput, setBulkInput] = useState('');
  const [bulkFiles, setBulkFiles] = useState<{ name: string; text: string }[]>(
    [],
  );
  const [bulkItems, setBulkItems] = useState<BulkItem[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkAiRunning, setBulkAiRunning] = useState(false);
  // Morceaux écartés « déjà supprimés » à la fin d'un lot : la feuille de
  // confirmation est ouverte tant que l'utilisateur n'a pas tranché (b368).
  const [skipsAConfirmer, setSkipsAConfirmer] = useState(0);
  // ConfirmSheet appelle onConfirm PUIS onClose : ce repère évite que le
  // « décliner » (toast + retour bibliothèque) se rejoue après un « oui ».
  const redoChoisi = useRef(false);
  const [aiProg, setAiProg] = useState<{ done: number; total: number } | null>(
    null,
  );
  const bulkCancel = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bulkFileRef = useRef<HTMLInputElement | null>(null);
  // Les tâches du dernier lot (b356) : la reprise « réimporter quand même »
  // rejoue les écartées sans redemander le fichier.
  const bulkTasksRef = useRef<TacheBulk[]>([]);

  const bulkLinks = useMemo(() => extractUgLinks(bulkInput), [bulkInput]);
  const bulkTotal = bulkLinks.length + bulkFiles.length;

  /** L'analyse LOCALE du texte tel qu'il a été collé. */
  const previewLocal = useMemo(() => {
    if (text.trim() === '') return null;
    try {
      return importText(text, title || 'Morceau importé');
    } catch {
      return null;
    }
  }, [text, title]);

  /** L'analyse du texte remis en forme par l'IA, quand elle a répondu. */
  const previewIA = useMemo(() => {
    if (aiText === null || aiText.trim() === '') return null;
    try {
      return importText(aiText, title || 'Morceau importé');
    } catch {
      return null;
    }
  }, [aiText, title]);

  const utiliseIA = !garderOriginal && previewIA !== null;
  const preview = utiliseIA ? previewIA : previewLocal;
  const texteRetenu = utiliseIA ? (aiText as string) : text;

  /**
   * GROS DOUTE après la mise en forme (b220) : un constat de forme — du
   * texte perdu, des accords disparus, une partition toujours bancale.
   * Jamais un jugement sur les paroles ni sur les accords eux-mêmes.
   */
  const doute = useMemo(() => {
    if (!previewLocal) return '';
    if (!utiliseIA || !previewIA) {
      return raisonDeVerifier(text, previewLocal, {
        plusieursPartitions: recueilRefuse,
      });
    }
    if (recueilRefuse) return 'ce morceau contient peut-être plusieurs partitions';
    return douteApresIA(previewLocal, previewIA, aiText ?? '');
  }, [previewLocal, previewIA, utiliseIA, text, aiText, recueilRefuse]);

  // Jumeau détecté : MÊME logique que la validation (findSameSong — titre,
  // artiste, paroles), pour que l'annonce de l'aperçu dise exactement ce
  // qui va se passer (fusion en nouvelle version, jamais de doublon).
  const duplicate = useMemo(() => {
    if (!preview) return null;
    const currentTitle = title.trim() !== '' ? title : preview.song.title;
    const a = artist.trim() !== '' ? artist : preview.song.artist;
    return findSameSong(songs, currentTitle, preview.song.lyrics, a);
  }, [songs, title, artist, preview]);

  const issues = useMemo(
    () => (preview ? analyzeImport(texteRetenu, preview) : []),
    [texteRetenu, preview],
  );

  // Titre / artiste détectés → repris automatiquement (champs modifiables)
  useEffect(() => {
    if (!preview) return;
    if (preview.stats.hadTitle) setTitle((prev) => (prev.trim() === '' ? preview.song.title : prev));
    if (preview.stats.hadArtist) setArtist((a) => (a.trim() === '' ? preview.song.artist : a));
  }, [preview]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      let content: string;
      let pages: string[] = [];
      if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        const tab = parseUgTabHtml(await file.text());
        if (!tab) {
          setError(
            t(
              'Cette page enregistrée ne contient pas de partition lisible — pour une LISTE de partitions, passe par « 3 · Import en masse ».',
            ),
          );
          return;
        }
        content = ugTabToImportText(tab);
        if (tab.title) setTitle(tab.title);
        if (tab.artist) setArtist(tab.artist);
      } else if (lower.endsWith('.docx')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        content = await extractDocxText(bytes);
      } else if (lower.endsWith('.pdf')) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // Page par page : c'est le meilleur indice d'un recueil.
        pages = await extractPdfPages(bytes);
        content = pages.join('\n\n');
      } else {
        content = await file.text();
      }
      const decoupe = splitSongs(
        pages.length > 0 ? { pages, text: content } : { text: content },
      );
      setMulti(decoupe.songs.length >= 2 ? decoupe : null);
      setRecueilRefuse(false);
      setText(content);
      setFileName(file.name);
      if (title.trim() === '') {
        setTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      /*
       * LA CAUSE EXACTE NE SE PERD PLUS (chantier « Reprise de répertoire »).
       *
       * `extractPdfText` lève déjà le bon message — « ce PDF est un scan,
       * il ne contient pas de texte » — et ce `catch` le jetait pour
       * afficher un texte générique à sa place. La bonne explication
       * existait, à trois lignes de son affichage.
       *
       * Un échec doit toujours nommer sa cause : c'est ce qui distingue
       * « l'app est cassée » de « ce fichier-là ne peut pas être lu, voilà
       * quoi faire ». Le repli générique ne sert plus que si l'erreur est
       * muette.
       */
      const cause = err instanceof Error ? err.message.trim() : '';
      setError(
        cause !== ''
          ? cause
          : t(
              "Ce fichier n'a pas pu être lu. Essaie un fichier texte (.txt, .cho, .pro, .onsong) ou Word (.docx), ou colle le texte.",
            ),
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function loadUgUrl(url: string) {
    setError(null);
    setUgLoading(true);
    try {
      const tab = await fetchUgTab(url);
      setText(ugTabToImportText(tab));
      setFileName(null);
      if (tab.title) setTitle(tab.title);
      if (tab.artist) setArtist(tab.artist);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("L'import a échoué."));
    } finally {
      setUgLoading(false);
    }
  }

  async function onUgSearch() {
    if (ugQuery.trim() === '' || ugSearching) return;
    setMethod('ug');
    setError(null);
    setUgSearching(true);
    setUgResults(null);
    setUgChoisi('');
    try {
      const results = await searchUgTabs(ugQuery.trim());
      setUgResults(results);
      if (results.length === 0) {
        setError(t('Aucune version trouvée pour cette recherche.'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('La recherche a échoué.'));
    } finally {
      setUgSearching(false);
    }
  }

  // Recherche AUTOMATIQUE au fil de la frappe : 400 ms après la dernière
  // touche (plus de bouton « Chercher » — Entrée reste en secours clavier).
  // Un numéro de série ignore les réponses périmées si on retape entre-temps.
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = ugQuery.trim();
    if (q.length < 3) return;
    // (nom `timer` et pas `t` : `t` est la fonction de traduction)
    const timer = window.setTimeout(() => {
      const seq = ++searchSeq.current;
      setMethod('ug');
      setError(null);
      setUgSearching(true);
      setUgResults(null);
      setUgChoisi('');
      searchUgTabs(q)
        .then((results) => {
          if (seq !== searchSeq.current) return;
          setUgResults(results);
          if (results.length === 0) {
            setError(t('Aucune version trouvée pour cette recherche.'));
          }
        })
        .catch((e: unknown) => {
          if (seq !== searchSeq.current) return;
          setError(e instanceof Error ? e.message : t('La recherche a échoué.'));
        })
        .finally(() => {
          if (seq === searchSeq.current) setUgSearching(false);
        });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ugQuery]);

  /**
   * MISE EN FORME AUTOMATIQUE (b220) — l'IA passe sur chaque partition
   * importée, sans qu'on le demande.
   *
   * Jamais bloquante : l'aperçu s'affiche tout de suite avec l'analyse
   * locale, le bouton d'ajout reste actif, et si l'IA n'aboutit pas on
   * garde simplement ce qu'on avait. Le texte collé n'est pas remplacé —
   * il faut pouvoir y revenir.
   */
  useEffect(() => {
    const source = text;
    if (!meritteUneMiseEnForme(source)) {
      setAiText(null);
      setAiState('idle');
      return;
    }
    const dejaVu = aiCache.current.get(source);
    if (dejaVu !== undefined) {
      setAiText(dejaVu);
      setAiState('done');
      setAiErreur('');
      return;
    }
    const seq = ++aiSeq.current;
    setAiText(null);
    setAiState('idle');
    // Le temps de la frappe : personne ne remet en forme un texte encore
    // en train d'être écrit.
    const timer = window.setTimeout(() => {
      if (seq !== aiSeq.current) return;
      setAiState('running');
      setAiErreur('');
      const hint = [title.trim(), artist.trim()]
        .filter((x) => x !== '')
        .join(' — ');
      // Deux étages (b432) : la passe rapide traite, l'analyse locale juge,
      // le modèle fort ne repasse que si elle a douté.
      const local = importText(source, title.trim() || 'Morceau importé');
      nettoyerAvecEscalade(
        source,
        title.trim() || 'Morceau importé',
        hint || undefined,
        local,
      )
        .then(({ cleaned }) => {
          if (seq !== aiSeq.current) return;
          if (aiCache.current.size > 4) aiCache.current.clear();
          aiCache.current.set(source, cleaned);
          setAiText(cleaned);
          setAiState('done');
        })
        .catch((e: unknown) => {
          if (seq !== aiSeq.current) return;
          setAiErreur(
            e instanceof Error ? e.message : t('la mise en forme a échoué'),
          );
          setAiState('failed');
        });
    }, 1600);
    return () => window.clearTimeout(timer);
    // Le titre et l'artiste ne servent que d'indice : les changer ne
    // relance pas un appel payant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Un nouveau texte = un nouveau choix à faire.
  useEffect(() => {
    setGarderOriginal(false);
  }, [text]);

  /**
   * Créer un morceau par partition détectée. Chacun repasse par le parseur
   * normal, et hérite du filet de sécurité (raison du doute) comme
   * n'importe quel import.
   *
   * PUIS L'IA REPREND CHAQUE MORCEAU (b364, constat de Vincent : « le
   * formatage automatique n'est pas très efficace »). Ce chemin — un
   * fichier-recueil découpé en plusieurs partitions — était le SEUL import
   * qui n'appelait jamais l'IA : b220 dit pourtant qu'elle passe sur tous.
   * Même architecture en deux temps que l'import en masse : les morceaux
   * entrent d'abord en bibliothèque (rapide, hors ligne), puis l'IA les met
   * au propre un par un. Quitter l'écran n'annule rien : les morceaux non
   * repris gardent leur analyse locale, un état parfaitement valable.
   */
  async function onImportMulti() {
    if (!multi || bulkAiRunning) return;
    let crees = 0;
    let doutes = 0;
    // Plafond du plan (b386) : on remplit jusqu'à la limite, puis on
    // s'arrête — les jumeaux (nouvelles versions) ne comptent pas.
    let places =
      limites.maxMorceaux === null
        ? Infinity
        : Math.max(0, limites.maxMorceaux - compteMorceauxPerso(songs.filter((x) => !estBrouillon(x))));
    let horsPlan = 0;
    // Les morceaux créés, avec leur texte d'origine : la passe IA travaille
    // sur CES objets (jamais sur l'état `songs`, en retard d'un rendu).
    const aReprendre: { song: Song; raw: string }[] = [];
    for (const d of multi.songs) {
      const outcome = importText(d.text, d.title || 'Morceau importé');
      const song = outcome.song;
      if (d.title !== '') song.title = d.title;
      const doute = raisonDeVerifier(d.text, outcome);
      if (doute !== '') {
        song.needsCheck = { reason: doute };
        doutes++;
      }
      // Un jumeau déjà présent devient une version, comme partout ailleurs.
      // (Il ne part pas à l'IA : elle réécrirait le morceau entier, pas la
      // version — même règle que les doublons de l'import en masse.)
      const twin = findSameSong(songs, song.title, song.lyrics, song.artist);
      if (twin) {
        saveSong(addSongAsVersion(twin, song, 'Version importée', false));
      } else if (places <= 0) {
        horsPlan++;
      } else {
        places--;
        saveSong(song);
        aReprendre.push({ song, raw: d.text });
        crees++;
      }
    }
    if (horsPlan > 0) signalerLimite('LIMIT_SONGS');
    setMulti(null);
    setText('');
    setFileName(null);
    // Deuxième temps : la mise en forme IA, avec le même Mojo de progression
    // que l'import en masse. Jamais bloquante — un échec laisse l'analyse
    // locale, et on n'arrête pas un lot pour poser une question (b220).
    bulkCancel.current = false;
    setBulkAiRunning(true);
    let total = aReprendre.length;
    let done = 0;
    // Les échecs se comptent et se disent (b365) : un appel IA raté ne doit
    // jamais se fondre dans un bilan de succès.
    let echecs = 0;
    setAiProg({ done, total });
    for (const item of aReprendre) {
      if (bulkCancel.current) break;
      try {
        const hint = [item.song.title, item.song.artist]
          .filter((x) => x && x.trim() !== '')
          .join(' — ');
        const local = importText(item.raw, item.song.title);
        // Deux étages (b432) : rapide pour tous, fort si la passe a douté.
        const { mef } = await nettoyerAvecEscalade(
          item.raw,
          item.song.title,
          hint || undefined,
          local,
        );
        saveSong({
          ...mef.song,
          id: item.song.id,
          title: item.song.title,
          artist: item.song.artist !== '' ? item.song.artist : mef.song.artist,
          createdAt: item.song.createdAt,
        });
      } catch {
        // Le morceau garde son analyse locale — rien n'est perdu, mais
        // l'échec se compte et le bilan le dira.
        echecs++;
      }
      done++;
      setAiProg({ done, total });
    }
    setBulkAiRunning(false);
    setAiProg(null);
    toast.show(
      (crees > 1
        ? t('{n} morceaux ajoutés à ta bibliothèque.', { n: crees })
        : t('{n} morceau ajouté à ta bibliothèque.', { n: crees })) +
        (doutes > 0 ? ' ' + t('{n} à vérifier.', { n: doutes }) : '') +
        (horsPlan > 0
          ? ' ' + t('{n} non importés — bibliothèque gratuite pleine.', { n: horsPlan })
          : '') +
        (echecs > 0
          ? ' ' + t('{e} en échec — réessaie dans un moment', { e: echecs }) + '.'
          : ''),
    );
    navigate('/');
  }

  function onImport() {
    if (text.trim() === '' || !previewLocal) return;
    // La mise en forme de l'IA est retenue par défaut (b220) ; en cas de
    // gros doute, la partition d'AVANT est gardée avec le morceau pour
    // qu'on puisse y revenir — ici, ou plus tard depuis la bibliothèque.
    const { song } = fusionMiseEnForme(
      text,
      previewLocal,
      texteRetenu,
      utiliseIA ? previewIA : null,
      doute,
    );
    if (title.trim() !== '') song.title = title.trim();
    if (artist.trim() !== '') song.artist = artist.trim();
    // Détection de doublon (titre / artiste / paroles) : si le morceau
    // existe déjà — Idée comprise (b132) — on l'ajoute comme NOUVELLE
    // VERSION plutôt que de créer un doublon dans la bibliothèque.
    const twin = findSameSong(songs, song.title, song.lyrics, song.artist);
    if (twin) {
      let merged = addSongAsVersion(twin, song, 'Version importée');
      // Importer un morceau qui n'était encore qu'une PROPOSITION vaut
      // validation : on l'a réimporté, donc on le joue (b274).
      const validated = merged.idea === true;
      if (validated) merged = { ...merged, idea: false };
      saveSong(merged);
      toast.show(
        t('Ajouté comme nouvelle version de « {title} »', { title: twin.title }) +
          (validated ? t(' — proposition validée ✓') : ''),
      );
      navigate(`/song/${merged.id}`);
      return;
    }
    // Plafond du plan (b386) : un NOUVEAU morceau seulement s'il reste de
    // la place (une nouvelle version d'un existant passe toujours).
    if (!limites.peutAjouter) {
      signalerLimite('LIMIT_SONGS');
      return;
    }
    saveSong(song);
    navigate(`/song/${song.id}`);
  }

  /**
   * Dépôt en masse : une page .html enregistrée (My tabs, favoris…) livre
   * ses liens UG d'un coup ; les fichiers de partitions (txt, ChordPro,
   * OnSong, Word) sont gardés pour import direct.
   */
  async function onBulkFiles(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const files = Array.from(e.target.files ?? []);
    const linksFound: string[] = [];
    const docs: { name: string; text: string }[] = [];
    const failed: string[] = [];
    /**
     * UN RECUEIL SE DÉCOUPE DÈS LE DÉPÔT (b357, demande de Vincent :
     * « il faut que l'import en masse couvre ce cas d'usage — un seul
     * fichier avec toutes les partitions dedans »). Le découpage n'agit
     * que quand il est SÛR de lui (directives ChordPro, en-têtes Title:
     * répétés, recueil paginé — même module que l'import à l'unité) :
     * dans le doute, le fichier reste un seul morceau plutôt que de
     * couper une chanson en deux. Fait au dépôt, pas à l'import : le
     * compteur et le bouton annoncent le vrai nombre de morceaux.
     */
    const eclate = (
      name: string,
      entree: { text?: string; pages?: string[] },
    ): { name: string; text: string }[] => {
      const d = splitSongs(entree);
      if (d.confident && d.songs.length >= 2) {
        return d.songs.map((s, i) => ({
          name: s.title || `${name} · ${i + 1}`,
          text: s.text,
        }));
      }
      return [
        { name, text: entree.text ?? entree.pages?.join('\n\n') ?? '' },
      ];
    };
    for (const f of files) {
      const lower = f.name.toLowerCase();
      try {
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
          const html = await f.text();
          // Page de PARTITION enregistrée (dont tablatures personnelles) ?
          const tab = parseUgTabHtml(html);
          if (tab) {
            docs.push({
              name: tab.title || f.name,
              text: ugTabToImportText(tab),
            });
          } else {
            // Sinon : page de LISTE (mes partitions, favoris) → liens
            const links = extractUgLinks(html);
            if (links.length === 0)
              failed.push(
                t('{name} (ni partition ni lien de page de partition)', {
                  name: f.name,
                }),
              );
            else linksFound.push(...links);
          }
        } else if (lower.endsWith('.docx')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          docs.push(...eclate(f.name, { text: await extractDocxText(bytes) }));
        } else if (lower.endsWith('.pdf')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          // Les PAGES du PDF sont le meilleur signal de découpage d'un
          // recueil (une chanson par page) : on les garde séparées.
          docs.push(...eclate(f.name, { pages: await extractPdfPages(bytes) }));
        } else {
          docs.push(...eclate(f.name, { text: await f.text() }));
        }
      } catch (err) {
        failed.push(
          `${f.name}${
            err instanceof Error && err.message !== ''
              ? ` (${err.message})`
              : ''
          }`,
        );
      }
    }
    if (linksFound.length > 0) {
      setBulkInput((prev) =>
        (prev.trim() !== '' ? prev + '\n' : '') + linksFound.join('\n'),
      );
    }
    if (docs.length > 0) setBulkFiles((prev) => [...prev, ...docs]);
    if (failed.length > 0) {
      setError(t('Non retenus : {list}', { list: failed.join(', ') }));
    }
    if (bulkFileRef.current) bulkFileRef.current.value = '';
  }

  /** Import en masse : fichiers puis liens, ajoutés à la chaîne.
   *  `reprise` (b356) : relance sur un sous-ensemble de tâches — les
   *  morceaux écartés par une pierre tombale — avec `sansTombstones` : un
   *  refus SILENCIEUX protège (on ne ressuscite pas un supprimé sans le
   *  dire), mais un refus sans issue emprisonne — la reprise est un geste
   *  explicite de l'utilisateur, la garde n'a plus à s'y opposer. */
  async function onBulkImport(
    reprise?: TacheBulk[],
    sansTombstones = false,
  ) {
    if ((reprise ? reprise.length : bulkTotal) === 0 || bulkRunning) return;
    setError(null);
    bulkCancel.current = false;
    setBulkRunning(true);
    setAiProg(null);
    const tasks: TacheBulk[] = reprise ?? [
      ...bulkFiles.map((f) => ({
        label: f.name,
        text: f.text,
        fallbackTitle: f.name.replace(/\.[^.]+$/, ''),
      })),
      ...bulkLinks.map((url) => ({ label: url, url })),
    ];
    bulkTasksRef.current = tasks;
    const items: BulkItem[] = tasks.map((t) => ({
      url: t.label,
      status: 'pending',
      title: '',
      message: '',
    }));
    setBulkItems([...items]);
    // Bibliothèque vue par la boucle : l'état React ne se met pas à jour
    // pendant le parcours, on tient donc notre propre liste pour les doublons.
    const known = [...songs];
    // Plafond du plan (b386) : le lot remplit jusqu'à la limite du gratuit
    // puis s'arrête — jamais en silence (statut « limite » + bilan). Les
    // doublons, réparations et nouvelles versions ne comptent pas.
    let places =
      limites.maxMorceaux === null
        ? Infinity
        : Math.max(0, limites.maxMorceaux - compteMorceauxPerso(songs.filter((x) => !estBrouillon(x))));
    // Titres supprimés volontairement de mojosong : on ne les réimporte pas
    // (même garde-fou que la synchro de groupe). L'utilisateur peut toujours
    // les récupérer explicitement via « 2 · Document ou lien ».
    const removedTitles = new Set(
      deleted.map((t) => t.key).filter((k): k is string => !!k),
    );
    for (let i = 0; i < items.length; i++) {
      if (bulkCancel.current) {
        items[i] = { ...items[i], status: 'error', message: t('Annulé') };
        setBulkItems([...items]);
        continue;
      }
      items[i] = { ...items[i], status: 'loading' };
      setBulkItems([...items]);
      try {
        const task = tasks[i];
        let raw: string;
        let fallbackTitle: string;
        let tabTitle = '';
        let tabArtist = '';
        if (task.url) {
          // UG limite le débit (429) : reprises avec attente progressive.
          let tab;
          for (let attempt = 0; ; attempt++) {
            try {
              tab = await fetchUgTab(task.url);
              break;
            } catch (e) {
              const msg = e instanceof Error ? e.message : '';
              if (
                !msg.includes('429') ||
                attempt >= 3 ||
                bulkCancel.current
              ) {
                throw msg.includes('429')
                  ? new Error(
                      t(
                        'Le service limite le débit — relance l’import dans quelques minutes, les morceaux déjà importés seront ignorés',
                      ),
                    )
                  : e;
              }
              const wait = [5, 15, 30][attempt] ?? 30;
              items[i] = {
                ...items[i],
                message: t('⏳ Le service demande une pause — nouvel essai dans {wait} s', {
                  wait,
                }),
              };
              setBulkItems([...items]);
              await new Promise((r) => setTimeout(r, wait * 1000));
            }
          }
          raw = ugTabToImportText(tab);
          fallbackTitle = tab.title || 'Morceau importé';
          tabTitle = tab.title;
          tabArtist = tab.artist;
        } else {
          raw = task.text ?? '';
          fallbackTitle = task.fallbackTitle || 'Morceau importé';
          // Nom de fichier « Titre - Artiste » → les deux champs
          const dash = fallbackTitle.match(/^(.{2,}?)\s+[-–—]\s+(.{2,})$/);
          if (dash) {
            fallbackTitle = dash[1].trim();
            tabArtist = dash[2].trim();
          }
        }
        const res = importText(raw, fallbackTitle);
        const song = res.song;
        if (tabTitle) song.title = tabTitle;
        if (tabArtist && (!res.stats.hadArtist || song.artist === ''))
          song.artist = tabArtist;
        if (song.lyrics.trim() === '') {
          throw new Error(t('fichier vide ou illisible'));
        }
        // Même principe qu'à l'unité : l'IA n'est proposée que si l'analyse
        // détecte un vrai problème de format — et seulement pour ces morceaux.
        // Police PDF brouillée (chaque lettre substituée) → décodage IA.
        const garbled = looksGarbled(raw);
        const needsAi =
          garbled ||
          analyzeImport(raw, res).some((x) => x.severity === 'warn');
        const existing = findSameSong(
          known,
          song.title,
          song.lyrics,
          song.artist,
        );
        if (
          !sansTombstones &&
          !existing &&
          [...removedTitles].some((k) =>
            bandKeysMatch(k, songKey(song.title, song.artist)),
          )
        ) {
          items[i] = {
            ...items[i],
            status: 'skip',
            title: song.title,
            message: t(
              'supprimé de mojosong — non réimporté (passe par « Document ou lien » pour le récupérer)',
            ),
          };
        } else if (existing && garbled) {
          // Le PDF est brouillé et le morceau (tout aussi brouillé) est
          // déjà dans la bibliothèque : on le marque pour le décodage IA,
          // qui remplacera son contenu en place.
          items[i] = {
            ...items[i],
            status: 'ok',
            title: existing.title,
            message: t('⚠ police PDF brouillée — décodage IA proposé'),
            needsAi: true,
            songId: existing.id,
            raw,
          };
        } else if (existing) {
          // Ré-import de meilleure qualité (ex. PDF ré-extrait après
          // réparation) : le morceau existant n'a aucun accord alors que
          // le nouveau en a → on met à jour son contenu (même identité,
          // les setlists et notes sont préservées).
          const freshHasChords = /\[[A-G][#b]?[^\]]*\]/.test(song.lyrics);
          const existingHasChords = /\[[A-G][#b]?[^\]]*\]/.test(
            existing.lyrics,
          );
          if (freshHasChords && !existingHasChords) {
            const repaired = {
              ...existing,
              artist: existing.artist !== '' ? existing.artist : song.artist,
              key: song.key,
              tempo: song.tempo || existing.tempo,
              capo: song.capo,
              structure: song.structure,
              lyrics: song.lyrics,
              updatedAt: new Date().toISOString(),
              versions: existing.versions.map((v) =>
                v.id === existing.activeVersionId
                  ? {
                      ...v,
                      key: song.key,
                      tempo: song.tempo || v.tempo,
                      capo: song.capo,
                      structure: song.structure,
                      lyrics: song.lyrics,
                    }
                  : v,
              ),
            };
            saveSong(repaired);
            const ki = known.findIndex((s) => s.id === existing.id);
            if (ki !== -1) known[ki] = repaired;
            items[i] = {
              ...items[i],
              status: 'ok',
              title: existing.title,
              message: t('🔧 mis à jour (accords récupérés)'),
            };
          } else {
            // Doublon : si le contenu diffère des versions déjà présentes,
            // on l'ajoute comme NOUVELLE VERSION (sans détourner la version
            // par défaut) ; s'il est identique, on l'ignore.
            const identical = existing.versions.some(
              (v) => lyricsSimilarity(song.lyrics, v.lyrics) >= 0.95,
            );
            if (identical) {
              items[i] = {
                ...items[i],
                status: 'dup',
                title: song.title,
                message: t('déjà présent (« {title} »)', { title: existing.title }),
              };
            } else {
              const merged = addSongAsVersion(
                existing,
                song,
                'Version importée',
                false,
              );
              saveSong(merged);
              const ki = known.findIndex((s) => s.id === existing.id);
              if (ki !== -1) known[ki] = merged;
              items[i] = {
                ...items[i],
                status: 'ok',
                title: existing.title,
                message: t('➕ ajouté comme nouvelle version'),
              };
            }
          }
        } else if (places <= 0) {
          // Bibliothèque gratuite pleine (b386) : le morceau n'entre pas,
          // et sa ligne le dit.
          items[i] = {
            ...items[i],
            status: 'limite',
            title: song.title,
            message: t('non importé — bibliothèque gratuite pleine'),
          };
        } else {
          // Filet : la raison du doute reste sur le morceau, pour qu'il se
          // retrouve d'un geste dans « à vérifier ».
          places--;
          const doute = raisonDeVerifier(raw, res);
          if (doute !== '') song.needsCheck = { reason: doute };
          saveSong(song);
          known.push(song);
          items[i] = {
            ...items[i],
            status: 'ok',
            check: doute !== '',
            title: song.title,
            message: garbled ? t('⚠ police PDF brouillée — décodage IA') : '',
            needsAi,
            songId: song.id,
            raw,
          };
        }
      } catch (e) {
        items[i] = {
          ...items[i],
          status: 'error',
          message: e instanceof Error ? e.message : t("L'import a échoué."),
        };
      }
      setBulkItems([...items]);
      // Pause entre deux liens : on reste courtois avec UG (évite le 429).
      if (tasks[i].url && i < items.length - 1 && !bulkCancel.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setBulkRunning(false);
    // Le plafond atteint s'annonce UNE fois, à la fin du lot (jamais au
    // milieu : un lot de trois cents fichiers ne s'arrête pas pour ça).
    if (items.some((x) => x.status === 'limite')) signalerLimite('LIMIT_SONGS');
    // Les morceaux sont en bibliothèque : l'IA les reprend maintenant, un
    // par un (b220). Rien n'attendait ce passage pour être jouable.
    if (!bulkCancel.current) await onBulkAi(items);
    /**
     * L'IMPORT VALIDÉ RAMÈNE À LA BIBLIOTHÈQUE (b355, demande de Vincent) :
     * les morceaux sont là-bas, c'est là qu'on doit atterrir — avec un
     * toast qui résume le lot. On RESTE sur l'écran si rien n'est entré
     * (tout en échec : les raisons sont sous les yeux, il faut les lire)
     * ou si l'utilisateur a interrompu le lot.
     */
    if (!bulkCancel.current) {
      const skips = items.filter((x) => x.status === 'skip').length;
      if (skips > 0) {
        // LA DÉCISION SE POSE EN FACE (b368, retour de Vincent : « la
        // demande de confirmation apparaît en bas de la page »). Des
        // morceaux écartés parce qu'il les avait SUPPRIMÉS autrefois, ça
        // mérite une vraie question, pas un bouton à dénicher sous le
        // bilan : une feuille s'ouvre à la fin du lot — réimporter, ou
        // laisser de côté. On ne quitte pas l'écran tant qu'elle attend.
        setSkipsAConfirmer(skips);
      } else {
        bilanEtRetour(items);
      }
    }
  }

  /** Toast de fin d'import (chiffres non nuls seulement) + retour à la
   *  bibliothèque si quelque chose est entré (b355). */
  function bilanEtRetour(items: BulkItem[]) {
    const ok = items.filter((x) => x.status === 'ok').length;
    const dup = items.filter((x) => x.status === 'dup').length;
    const err = items.filter((x) => x.status === 'error').length;
    const lim = items.filter((x) => x.status === 'limite').length;
    if (ok === 0) return;
    const parts = [
      ok > 1
        ? t('{n} morceaux ajoutés', { n: ok })
        : t('{n} morceau ajouté', { n: ok }),
    ];
    if (dup > 0)
      parts.push(
        dup > 1
          ? t('{n} déjà présents', { n: dup })
          : t('{n} déjà présent', { n: dup }),
      );
    if (lim > 0) parts.push(t('{n} non importés (plan gratuit)', { n: lim }));
    if (err > 0) parts.push(t('{n} en échec', { n: err }));
    toast.show(`✓ ${parts.join(' · ')}`);
    navigate('/');
  }

  /** Relance l'import sur les seuls morceaux écartés « déjà supprimés » —
   *  geste explicite de l'utilisateur, la garde anti-résurrection s'efface. */
  function reimporterLesSupprimes() {
    if (!bulkItems) return;
    const items = bulkItems;
    const redo = bulkTasksRef.current.filter(
      (_, i) => items[i]?.status === 'skip',
    );
    void onBulkImport(redo, true);
  }

  /**
   * MISE EN FORME DE TOUT LE LOT (b220).
   *
   * Deux temps, volontairement : les morceaux entrent d'abord en
   * bibliothèque (rapide, hors ligne, sans dépendre de personne), PUIS
   * l'IA les reprend un par un. Un import de cent fichiers n'attend donc
   * pas cent appels avant de montrer quoi que ce soit.
   *
   * Et surtout : on ne s'arrête JAMAIS pour poser une question au milieu
   * d'un lot. Quand la mise en forme laisse un gros doute, le morceau
   * garde sa partition d'avant (`beforeAi`) et part en bibliothèque avec
   * son « 🔎 À vérifier » — le musicien tranchera quand il voudra.
   *
   * Quitter l'écran interrompt la reprise : les morceaux non traités
   * gardent leur analyse locale, ce qui est un état parfaitement valable.
   */
  async function onBulkAi(liste?: BulkItem[]) {
    const source = liste ?? bulkItems;
    if (!source || bulkAiRunning) return;
    setError(null);
    setBulkAiRunning(true);
    const items = [...source];
    const aTraiter = items.filter((x) => x.songId && x.raw);
    const total = aTraiter.length;
    let done = 0;
    setAiProg({ done, total });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.songId || !it.raw) continue;
      if (bulkCancel.current) break;
      items[i] = { ...it, message: t('✨ mise en forme…') };
      setBulkItems([...items]);
      try {
        const old = songs.find((s) => s.id === it.songId);
        if (!old) throw new Error('morceau introuvable');
        // Indice titre/artiste : précieux pour décoder les PDF brouillés.
        const hint = [old.title || it.title, old.artist]
          .filter((x) => x && x.trim() !== '')
          .join(' — ');
        const local = importText(it.raw, it.title || 'Morceau importé');
        // Deux étages (b432) : rapide pour tous, fort si la passe a douté.
        const { mef } = await nettoyerAvecEscalade(
          it.raw,
          it.title || 'Morceau importé',
          hint || undefined,
          local,
        );
        saveSong({
          ...mef.song,
          id: old.id,
          title: old.title,
          artist: old.artist !== '' ? old.artist : mef.song.artist,
          idea: old.idea,
          createdAt: old.createdAt,
          hearts: old.hearts,
          fanMessages: old.fanMessages,
          rehearsalNotes: old.rehearsalNotes,
        });
        items[i] = {
          ...it,
          needsAi: false,
          check: mef.doute !== '',
          message:
            mef.doute !== ''
              ? '🔎 ' + t('mis en forme — à vérifier')
              : '✨ ' + t('mis en forme'),
        };
      } catch (e) {
        // Un échec ne casse rien : le morceau garde son analyse locale.
        items[i] = {
          ...it,
          message:
            '· ' +
            (e instanceof Error ? e.message : t('mise en forme non aboutie')),
        };
      }
      done++;
      setAiProg({ done, total });
      setBulkItems([...items]);
    }
    setBulkAiRunning(false);
  }

  const loadingMsg = ugLoading ? (
    <p className="help" style={{ textAlign: 'center' }}>
      {t('Récupération de la partition…')}
    </p>
  ) : null;
  const errorCard = error ? (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>{error}</div>
  ) : null;

  // Éditeur commun (recherche ET document/lien) : n'apparaît qu'une fois une
  // partition chargée — titre/artiste, aperçu de l'analyse, nettoyage IA au
  // besoin, puis ajout à la bibliothèque ou aux idées.
  const importEditor =
    text.trim() !== '' ? (
      <>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('Titre')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('Artiste')}</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>
        </div>
        {preview && (
          <div className="card">
            {/* Plus de rappel « Titre : X — Artiste : Y » (b371) : les deux
                champs sont juste AU-DESSUS — répéter leur contenu deux
                centimètres plus bas n'informait personne. */}
            {/* Message humain — le détail technique (parties, lignes
                fusionnées) n'apprend rien d'utile ici. */}
            <div className="help">
              {[
                preview.stats.mergedChordLines > 0 ||
                /\[[A-G][#b]?/.test(preview.song.lyrics)
                  ? t('✓ Accords et paroles récupérés')
                  : t('✓ Paroles récupérées'),
                preview.song.key !== ''
                  ? t('tonalité {key}', { key: preview.song.key })
                  : '',
              ]
                .filter((x) => x !== '')
                .join(' · ')}
            </div>
            {issues.length === 0 ? (
              <div style={{ color: 'var(--accent)', marginTop: 8 }}>
                {t('✓ Analyse : rien à corriger.')}
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {issues.map((i, k) => (
                  <div
                    key={k}
                    className={i.severity === 'info' ? 'help' : ''}
                    style={
                      i.severity === 'warn'
                        ? { color: 'var(--accent)' }
                        : undefined
                    }
                  >
                    {i.severity === 'warn' ? '⚠ ' : 'ℹ '}
                    {i.text}
                  </div>
                ))}
              </div>
            )}
            {duplicate && (
              <div style={{ marginTop: 8 }}>
                {t('ℹ Tu as déjà « {title} »', { title: duplicate.title })}
                {duplicate.idea === true ? t(' (en proposition)') : ''}
                {t(' : cet import le rejoindra comme nouvelle version — aucun doublon.')}
              </div>
            )}
          </div>
        )}
        {/* Aperçu de la partition telle qu'elle sera enregistrée : on la
            montre AVANT de l'ajouter à la bibliothèque. */}
        {preview && preview.song.lyrics.trim() !== '' && (
          <div className="card importpreview">
            <div className="help" style={{ marginBottom: 6 }}>
              {t('Aperçu de la partition')}
            </div>
            <div className="importpreview-body">
              <SongBody
                song={{
                  ...preview.song,
                  title: title.trim() || preview.song.title,
                  artist: artist.trim() || preview.song.artist,
                }}
                view="complete"
              />
            </div>
          </div>
        )}
        {/* Mise en forme automatique (b220). Jamais bloquante : l'aperçu
            est déjà là, le bouton d'ajout aussi. */}
        {previewLocal && aiState === 'running' && (
          <p className="help">{t('✨ Mise en forme de la partition…')}</p>
        )}
        {previewLocal && aiState === 'failed' && (
          <p className="help">
            {t(
              'La mise en forme automatique n’a pas abouti — ta partition est reprise telle quelle.',
            )}
            {aiErreur !== '' ? ` (${aiErreur})` : ''}
          </p>
        )}
        {previewLocal && aiState === 'done' && previewIA && doute === '' && (
          <p className="help">
            ✨ {t('Mise en forme appliquée.')}{' '}
            <button
              className="btn ghost small"
              onClick={() => setGarderOriginal(!garderOriginal)}
            >
              {garderOriginal
                ? t('Revenir à la version mise en forme')
                : t('Garder ma version d’origine')}
            </button>
          </p>
        )}
        {/* GROS DOUTE : on ne tranche pas à sa place. */}
        {previewLocal && aiState === 'done' && previewIA && doute !== '' && (
          <>
            <div className="card" style={{ borderColor: 'var(--warn)' }}>
              <div style={{ color: 'var(--warn)' }}>
                🔎 {t('La mise en forme laisse un doute : {raison}.', {
                  raison: doute,
                })}
              </div>
              <p className="help" style={{ marginBottom: 0 }}>
                {t(
                  'Compare l’aperçu ci-dessus et choisis. Sans réponse, la version mise en forme est gardée et le morceau reste marqué « à vérifier ».',
                )}
              </p>
              <div className="rowactions">
                <button
                  className={`btn ${garderOriginal ? 'ghost' : ''}`}
                  onClick={() => setGarderOriginal(false)}
                >
                  {t('Version mise en forme')}
                </button>
                <button
                  className={`btn ${garderOriginal ? '' : 'ghost'}`}
                  onClick={() => setGarderOriginal(true)}
                >
                  {t('Ma version d’origine')}
                </button>
              </div>
            </div>
            <div className="spacer" />
          </>
        )}
        {/* L'option « garder comme idée » a disparu (b274, arbitrage de
            Vincent). Un morceau qu'on importe, on l'importe : il entre dans
            la bibliothèque. Ce qui reste en attente d'une décision vient du
            DEHORS — un groupe, un bœuf — et rien d'autre. */}
        {/* Action principale COLLANTE : visible même en défilant la longue
            partition (elle se cale au-dessus de la barre d'onglets). */}
        <div className="stickyaction">
          <button
            className="btn block"
            onClick={() => onImport()}
            disabled={text.trim() === ''}
          >
            {t('Ajouter à ma bibliothèque')}
          </button>
        </div>
      </>
    ) : null;

  // Import en masse : progression réelle pour Mojo (items traités / total).
  const bulkDone = bulkItems
    ? bulkItems.filter((x) => x.status !== 'pending' && x.status !== 'loading')
        .length
    : 0;
  const bulkCount = bulkItems ? bulkItems.length : 0;

  return (
    <>
      {/* Le ← va vers un PARENT EXPLICITE (règle du projet) : l'import
          s'ouvre depuis la bibliothèque, on y revient — jamais
          history.back(), qui peut renvoyer n'importe où (b371). */}
      <TopBar live={false} title={t('Ajouter un morceau')} onBack={() => navigate('/')} />
      <div className="page">
        {/* b472 (point 1) : l'intention « pour le groupe » se VOIT pendant
            tout le trajet de création, et s'écarte d'un geste. */}
        {method !== 'bulk' && <BandeauPourGroupe />}
        {/* Mojo EN LIGNE, plus en surcouche (b371) : l'overlay plein écran
            recouvrait la liste de progression ET le bouton « Arrêter » —
            pendant tout un import en masse, impossible de suivre le détail
            ou d'interrompre. En ligne, tout reste visible et actionnable. */}
        <MojoLoader
          inline
          active={bulkRunning}
          label={t('On installe ton répertoire…')}
          value={bulkDone}
          max={bulkCount}
        />
        <MojoLoader
          inline
          active={bulkAiRunning}
          label={t('On met tes partitions au propre…')}
          value={aiProg?.done}
          max={aiProg?.total}
        />
        {/* 1 — RECHERCHE SERVEUR DÉSACTIVÉE (b330, décision de Vincent :
            « on a décidé de ne plus l'utiliser — garde-le en mémoire si nous
            décidions de le réactiver »). Le champ « Rechercher un morceau »
            (recherche côté serveur, résultats listés dans l'app) est masqué
            derrière ce drapeau ; tout son code (onUgSearch, ugResults,
            loadUgUrl…) reste en place. Repasser le drapeau à true suffit à
            le rallumer. Le chemin d'entrée est désormais le flux b319. */}
        {RECHERCHE_SERVEUR && (
          <div className="field">
            <label>{t('Rechercher un morceau')}</label>
            {/* La recherche part toute seule pendant la frappe (400 ms) —
                pas de bouton ; Entrée lance tout de suite (secours clavier). */}
            <input
              type="text"
              value={ugQuery}
              placeholder={t('Titre et artiste — ex. Angie Rolling Stones')}
              onChange={(e) => setUgQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onUgSearch();
              }}
            />
            <p className="help" style={{ marginTop: 4 }}>
              {ugSearching
                ? t('Recherche en cours…')
                : t('Tape le titre (et l’artiste) : les résultats arrivent tout seuls.')}
            </p>
          </div>
        )}

        {/* Recherche & création via Ultimate Guitar (b319) : l'utilisateur
            navigue LUI-MÊME sur le site (nouvel onglet), copie la partition,
            revient la coller — mise en forme 100 % locale. Décision Vincent :
            le nom s'affiche (texte seul, jamais de logo). */}
        {/* LE CHEMIN RECOMMANDÉ PORTE LE BOUTON AMBRE (b371, charte : un
            seul bouton ambre par écran — celui qui fait avancer). Il était
            en ghost : l'écran d'accueil de l'import n'avait AUCUNE action
            principale. Masqué dès qu'une partition est chargée (b355). */}
        {!(text.trim() !== '' && method === 'ug') && (
          <>
            <button
              // Ambre sur l'écran d'accueil seulement : dans les flux
              // Document/Import en masse, l'action qui fait avancer est la
              // leur — un seul bouton ambre par écran (charte).
              className={method === 'ug' ? 'btn block' : 'btn ghost block'}
              onClick={() => navigate('/creer')}
            >
              {/* « Chercher sur le web » (b472, demande de Vincent — annule
                  la levée b319) : la source ne se nomme plus à l'écran. */}
              <Icon name="search" size={16} /> {t('Chercher sur le web')}
            </button>
            {/* Une ligne pour situer le parcours (b331 ; respiration b478 —
                audit D-3 : elle se cognait dans le bouton). */}
            <p className="help" style={{ marginTop: 10, marginBottom: 'var(--sp-4)' }}>
              {t('Choisis un résultat : la partition se met en forme toute seule.')}
            </p>
          </>
        )}

        {RECHERCHE_SERVEUR && method === 'ug' && ugResults !== null && ugResults.length > 0 && (
          <div
            className="card"
            style={{
              // Une fois une partition chargée, la liste se fait petite : elle
              // reste à portée sans repousser l'aperçu hors de l'écran.
              maxHeight: text.trim() !== '' ? 150 : 320,
              overflowY: 'auto',
              padding: 6,
            }}
          >
            {text.trim() !== '' && (
              <p className="help" style={{ margin: '2px 6px 6px' }}>
                {t('Une autre version ? Elles sont toujours là.')}
              </p>
            )}
            {ugResults.map((r, i) => (
              <div
                className={`row ${r.url === ugChoisi ? 'active' : ''}`}
                key={i}
                onClick={() => {
                  // La liste RESTE (retour de Marco) : en choisir une ne doit
                  // pas obliger à refaire la recherche pour essayer la
                  // suivante — c'est justement quand la première ne convient
                  // pas qu'on veut la deuxième.
                  setUgChoisi(r.url);
                  void loadUgUrl(r.url);
                }}
              >
                <div className="grow">
                  <div className="title">
                    {r.url === ugChoisi ? '✓ ' : ''}
                    {r.title}
                    {r.version > 1 ? ` (v${r.version})` : ''}
                  </div>
                  <div className="sub">
                    {[
                      r.artist,
                      r.type,
                      r.rating > 0 ? `★ ${r.rating}` : '',
                      r.votes > 0 ? t('{n} votes', { n: r.votes }) : '',
                    ]
                      .filter((x) => x !== '')
                      .join(' · ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Flux recherche : messages + éditeur d'import (si partition chargée) */}
        {method === 'ug' && (
          <>
            {loadingMsg}
            {errorCard}
            {importEditor}
          </>
        )}

        {/* 2 — Un seul chemin visible par défaut : les alternatives vivent
            derrière ce pli discret (ouvert d'office si l'une est en cours,
            masqué dès qu'une partition est chargée : l'écran devient
            « aperçu et validation », rien d'autre). */}
        {!(text.trim() !== '' && method === 'ug') && (
        <>
        <div className="spacer" />
        <details
          className="stfold"
          open={othersOpen || method !== 'ug'}
          onToggle={(e) => setOthersOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>{t("Autres façons d'importer")}</summary>
          {/* b478 (audit D-3) : les trois chemins se PRÉSENTENT — une ligne
              chacun, au lieu d'un écran aux trois quarts vide où il fallait
              deviner ce que cachait le pli. */}
          <p className="help" style={{ margin: '8px 0 4px' }}>
            {t('Un document ou un lien (PDF, Word, ChordPro, OnSong…), toute une collection d’un coup, ou une partition écrite à la main.')}
          </p>
          <div className="chips" style={{ margin: '8px 0 12px' }}>
            <button
              className={`chip ${method === 'doc' ? '' : 'off'}`}
              onClick={() => setMethod(method === 'doc' ? 'ug' : 'doc')}
            >
              {t('Document ou lien')}
            </button>
            <button
              className={`chip ${method === 'bulk' ? '' : 'off'}`}
              onClick={() => setMethod(method === 'bulk' ? 'ug' : 'bulk')}
            >
              {t('Import en masse')}
            </button>
            <button className="chip off" onClick={() => navigate('/song/new')}>
              {t('Écrire à la main')}
            </button>
          </div>
        </details>
        </>
        )}

        {method === 'doc' && multi && (
          <div
            className="card"
            style={{ borderColor: 'var(--warn)', marginBottom: 'var(--sp-3)' }}
          >
            <strong>
              {t('Ce fichier contient sans doute {n} partitions.', {
                n: multi.songs.length,
              })}
            </strong>
            <p className="help" style={{ marginTop: 4 }}>
              {multi.songs
                .map((d) => d.title)
                .filter((x) => x !== '')
                .slice(0, 8)
                .join(' · ')}
              {multi.songs.length > 8 ? ' …' : ''}
            </p>
            <div className="rowactions" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => void onImportMulti()}>
                {t('Créer {n} morceaux', { n: multi.songs.length })}
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  setMulti(null);
                  setRecueilRefuse(true);
                }}
                title={t(
                  'Le fichier restera un seul morceau, marqué à vérifier',
                )}
              >
                {t('N’en faire qu’un seul')}
              </button>
            </div>
          </div>
        )}
        {method === 'doc' && (
          <>
            <div className="field">
              <label>{t('Coller un lien vers la partition')}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="url"
                  value={ugUrl}
                  placeholder="https://…"
                  onChange={(e) => setUgUrl(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={() => void loadUgUrl(ugUrl.trim())}
                  disabled={ugUrl.trim() === '' || ugLoading}
                >
                  {ugLoading ? '…' : t('Récupérer')}
                </button>
              </div>
              <p className="help" style={{ marginTop: 4 }}>
                {t(
                  "Un lien reconnu est importé automatiquement. Sinon, ouvre la page, copie son texte et colle-le ci-dessous : l'analyse (et l'IA si besoin) reconstruit la partition.",
                )}
              </p>
            </div>
            <div className="spacer" />
            <button
              className="btn ghost block"
              onClick={() => fileRef.current?.click()}
            >
              {t('Choisir un fichier (txt, cho, pro, onsong, docx, pdf…)')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={FICHIERS_ACCEPTES}
              style={{ display: 'none' }}
              onChange={onFile}
            />
            {fileName && (
              <p className="help" style={{ textAlign: 'center' }}>
                {t('Fichier : ')}{fileName}
              </p>
            )}
            <div className="spacer" />
            {/* Coller le texte à la main : replié par défaut pour alléger
                l'écran — le lien et le fichier restent accessibles d'un geste. */}
            <details className="stfold" open={text.trim() !== ''}>
              <summary>{t('Ou coller le texte de la partition')}</summary>
              <div className="spacer" />
              <textarea
                className="mono"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t(
                  'Formats reconnus automatiquement :\n\n' +
                    '• Accords au-dessus des paroles :\n' +
                    '    Am        F\n' +
                    "    Sous le ciel qui s'endort\n\n" +
                    '• ChordPro / OnSong :\n' +
                    '    {title: Mon morceau}  ou  Title: Mon morceau\n' +
                    "    [Am]Sous le ciel [F]qui s'endort\n\n" +
                    '• Sections : [Couplet 1], Refrain:, [Verse], [Chorus]…',
                )}
              />
            </details>
            {loadingMsg}
            {errorCard}
            {importEditor}
          </>
        )}

        {method === 'bulk' && (
          <>
            <button
              className="btn ghost block"
              onClick={() => bulkFileRef.current?.click()}
              disabled={bulkRunning}
            >
              {t('Choisir des fichiers (txt, pdf, docx, html…)')}
            </button>
            <input
              ref={bulkFileRef}
              type="file"
              multiple
              accept={FICHIERS_ACCEPTES}
              style={{ display: 'none' }}
              onChange={(e) => void onBulkFiles(e)}
            />
            {/* Le mode d'emploi ne s'affiche que TANT QU'IL SERT (b355,
                retour de Vincent : une fois le fichier déposé, il fallait
                défiler tout le pavé pour trouver quoi faire). Dès qu'un
                fichier ou un lien est prêt, il s'efface : place aux
                actions. */}
            {/* L'AIDE TIENT EN TROIS LIGNES (b371, demande de Vincent :
                « uniquement les infos nécessaires »). L'ancien pavé mêlait
                trois procédures en un paragraphe — et parlait de Ctrl+S à
                quelqu'un qui est sur son téléphone. */}
            {bulkTotal === 0 && (
              <>
                <p className="help" style={{ marginBottom: 4 }}>
                  {t(
                    '• Tes fichiers (txt, ChordPro, OnSong, Word, PDF) : un recueil est découpé en autant de morceaux.',
                  )}
                </p>
                <p className="help" style={{ marginBottom: 4 }}>
                  {t(
                    '• Depuis un site de partitions (sur ordinateur) : affiche toutes tes partitions sur la page, enregistre-la (Ctrl+S) et dépose le fichier .html.',
                  )}
                </p>
                <p className="help">
                  {t(
                    '• Plusieurs fichiers ? Dépose-les tous d’un coup — les morceaux s’additionnent, sans doublon.',
                  )}
                </p>
              </>
            )}
            {bulkFiles.length > 0 && (
              <p className="help">
                {bulkFiles.length > 1
                  ? t('{n} fichiers prêts :', { n: bulkFiles.length })
                  : t('{n} fichier prêt :', { n: bulkFiles.length })}{' '}
                {bulkFiles.map((f) => f.name).join(', ')}{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!bulkRunning) setBulkFiles([]);
                  }}
                >
                  {t('retirer')}
                </a>
              </p>
            )}
            {/* L'ACTION D'ABORD (b355) : dès qu'il y a quelque chose à
                importer, le bouton est là, sous la liste des fichiers —
                plus rien à chercher en bas d'écran. */}
            {!bulkRunning ? (
              <button
                className="btn block"
                onClick={() => void onBulkImport()}
                disabled={bulkTotal === 0}
              >
                {t('Tout ajouter à ma bibliothèque')}
                {bulkTotal > 0 ? ` (${bulkTotal})` : ''}
              </button>
            ) : (
              // La progression vit dans le Mojo en ligne (b371) — ici, la
              // seule chose qui compte : pouvoir s'arrêter.
              <button
                className="btn ghost block"
                onClick={() => {
                  bulkCancel.current = true;
                }}
              >
                {t('Arrêter après le morceau en cours')}
              </button>
            )}
            <div className="spacer" />
            <div className="field">
              <label>{t('Ou colle des liens de pages de partition (un par ligne)')}</label>
              <textarea
                className="mono"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                disabled={bulkRunning}
                placeholder={
                  'https://…/tab/…\n' +
                  'https://…/tab/…\n' +
                  'https://…/user/tab/view?h=…'
                }
              />
              <p className="help" style={{ marginTop: 4 }}>
                {t(
                  'Tu peux coller en vrac (texte, page copiée…) : seules les pages de partition sont retenues, sans doublons. Cet import sert à récupérer',
                )}{' '}
                <strong>{t('ta')}</strong>{' '}
                {t('collection (tes partitions, tes favoris) —')} {MAX_BULK_LINKS}{' '}
                {t('liens max par fournée.')}
                {bulkLinks.length > 0 && (
                  <>
                    {' '}
                    <strong>
                      {bulkLinks.length > 1
                        ? t('{n} liens détectés{cap}.', {
                            n: bulkLinks.length,
                            cap:
                              bulkLinks.length >= MAX_BULK_LINKS
                                ? t(' (plafond atteint)')
                                : '',
                          })
                        : t('{n} lien détecté{cap}.', {
                            n: bulkLinks.length,
                            cap:
                              bulkLinks.length >= MAX_BULK_LINKS
                                ? t(' (plafond atteint)')
                                : '',
                          })}
                    </strong>
                  </>
                )}
              </p>
            </div>
            {/* Le bouton d'import vit AU-DESSUS du champ de liens (b355). */}
            {bulkItems && (
              <div className="card" style={{ marginTop: 12, padding: 8 }}>
                {bulkItems.map((it, i) => (
                  <div
                    key={i}
                    className="help"
                    style={{
                      padding: '3px 0',
                      color:
                        it.status === 'ok'
                          ? 'var(--ok)'
                          : it.status === 'error'
                            ? 'var(--danger)'
                            : undefined,
                    }}
                  >
                    {it.status === 'pending' && '· '}
                    {it.status === 'loading' && '⏳ '}
                    {it.status === 'ok' && '✓ '}
                    {it.status === 'dup' && '≈ '}
                    {it.status === 'skip' && '⊘ '}
                    {it.status === 'limite' && '⊘ '}
                    {it.status === 'error' && '✗ '}
                    {it.title !== ''
                      ? it.title
                      : it.url.replace(/^https:\/\/(tabs\.)?ultimate-guitar\.com/, '…')}
                    {it.message !== '' && ` — ${it.message}`}
                  </div>
                ))}
                {/* BILAN SANS LES ZÉROS (b368, retour de Vincent : « moins
                    d'infos ») : « 0 importé · 0 déjà présent · 0 échec »
                    noyait le seul chiffre qui comptait. On ne dit que ce
                    qui s'est produit. */}
                {!bulkRunning &&
                  (() => {
                    const ok = bulkItems.filter((x) => x.status === 'ok').length;
                    const dup = bulkItems.filter((x) => x.status === 'dup').length;
                    const skip = bulkItems.filter((x) => x.status === 'skip').length;
                    const lim = bulkItems.filter((x) => x.status === 'limite').length;
                    const err = bulkItems.filter((x) => x.status === 'error').length;
                    const check = bulkItems.filter((x) => x.check).length;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <strong>
                          {ok > 1
                            ? t('{n} importés', { n: ok })
                            : t('{n} importé', { n: ok })}
                        </strong>
                        {dup > 0 && (
                          <>
                            {' · '}
                            {dup > 1
                              ? t('{n} déjà présents', { n: dup })
                              : t('{n} déjà présent', { n: dup })}
                          </>
                        )}
                        {skip > 0 && (
                          <>
                            {' · '}
                            {skip > 1
                              ? t('{n} supprimés de mojosong (non réimportés)', { n: skip })
                              : t('{n} supprimé de mojosong (non réimporté)', { n: skip })}
                          </>
                        )}
                        {lim > 0 && (
                          <>
                            {' · '}
                            <span style={{ color: 'var(--warn)' }}>
                              {t('{n} non importés (plan gratuit)', { n: lim })}
                            </span>
                          </>
                        )}
                        {err > 0 && (
                          <>
                            {' · '}
                            {err > 1
                              ? t('{n} échecs', { n: err })
                              : t('{n} échec', { n: err })}
                          </>
                        )}
                        {/* Lucidité de l'import : combien sont à relire.
                            Sans ce chiffre, un import de quarante fichiers
                            a l'air parfait. */}
                        {check > 0 && (
                          <>
                            {' · '}
                            <span style={{ color: 'var(--warn)' }}>
                              {t('{n} à vérifier', { n: check })}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })()}
              </div>
            )}
            {/* UN REFUS SANS ISSUE EMPRISONNE (b356, constat de Vincent :
                tout son lot écarté par les pierres tombales, écran figé).
                La garde anti-résurrection reste la règle pour l'import
                silencieux — mais quand l'utilisateur VOIT le refus, il
                doit pouvoir passer outre d'un geste explicite. */}
            {bulkItems &&
              !bulkRunning &&
              !bulkAiRunning &&
              bulkItems.some((x) => x.status === 'skip') && (
                <button
                  className="btn ghost block"
                  style={{ marginTop: 10 }}
                  onClick={() => reimporterLesSupprimes()}
                >
                  ↩{' '}
                  {bulkItems.filter((x) => x.status === 'skip').length > 1
                    ? t('Réimporter quand même les {n} morceaux supprimés autrefois', {
                        n: bulkItems.filter((x) => x.status === 'skip').length,
                      })
                    : t('Réimporter quand même le morceau supprimé autrefois')}
                </button>
              )}
            {/* Plus de deuxième barre pendant la mise en forme (b371) : le
                Mojo en ligne porte déjà la progression, et chaque ligne du
                lot affiche son état. */}
            {/* La mise en forme s'enchaîne toute seule après l'import
                (b220). Ce qui reste manuel : la RELANCER si on a quitté
                l'écran en cours de route, ou si le serveur a dit non. */}
            {bulkItems &&
              !bulkRunning &&
              !bulkAiRunning &&
              bulkItems.some((x) => x.songId && x.raw) && (
                <>
                  <div className="spacer" />
                  <button
                    className="btn ghost block"
                    onClick={() => void onBulkAi()}
                  >
                    {t('✨ Reprendre la mise en forme')}
                  </button>
                  <p className="help">
                    {t(
                      'Chaque morceau garde son titre et son artiste. Les partitions où la mise en forme laisse un doute sont marquées « à vérifier » : tu les retrouves d’un geste dans ta bibliothèque, avec la possibilité de revenir à la version d’origine.',
                    )}
                  </p>
                </>
              )}
            {errorCard}
          </>
        )}

        {/* « Écrire à la main » vit dans « Autres façons d'importer » —
            plus de deuxième chemin en bas de page. */}

        {/* RÉVERSIBILITÉ — discrète mais permanente, sur tous les chemins
            d'import. On demande à quelqu'un de confier sa collection : il a
            le droit de savoir qu'il peut la reprendre. */}
        <p
          className="help"
          style={{ marginTop: 'var(--sp-5)', textAlign: 'center' }}
        >
          {t(
            'Tes morceaux restent à toi : tu peux tout réexporter à tout moment (carnet PDF ou fichiers texte), et rien n’est jamais supprimé sans toi.',
          )}
        </p>
      </div>

      {/* La question « réimporter les supprimés ? » s'ouvre EN FACE à la fin
          du lot (b368) — deux issues claires, jamais un bouton à chercher en
          bas de page. Décliner ferme la feuille : le bouton discret sous le
          bilan reste là si l'on change d'avis. */}
      {skipsAConfirmer > 0 && (
        <ConfirmSheet
          title={
            skipsAConfirmer > 1
              ? t('{n} morceaux déjà supprimés', { n: skipsAConfirmer })
              : t('{n} morceau déjà supprimé', { n: skipsAConfirmer })
          }
          message={
            skipsAConfirmer > 1
              ? t(
                  'Tu avais supprimé ces morceaux de ta bibliothèque : ils n’ont pas été réimportés. Veux-tu les faire revenir ?',
                )
              : t(
                  'Tu avais supprimé ce morceau de ta bibliothèque : il n’a pas été réimporté. Veux-tu le faire revenir ?',
                )
          }
          confirmLabel={
            skipsAConfirmer > 1 ? t('↩ Réimporter ces morceaux') : t('↩ Réimporter ce morceau')
          }
          onConfirm={() => {
            redoChoisi.current = true;
            reimporterLesSupprimes();
          }}
          onClose={() => {
            setSkipsAConfirmer(0);
            if (redoChoisi.current) {
              redoChoisi.current = false;
              return;
            }
            // On les laisse de côté : si le reste du lot est entré, on
            // termine l'import comme d'habitude (toast + bibliothèque).
            if (bulkItems) bilanEtRetour(bulkItems);
          }}
        />
      )}
    </>
  );
}
