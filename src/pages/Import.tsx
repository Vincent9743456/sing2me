import React, { useEffect, useMemo, useRef, useState } from 'react';

import { TopBar } from '../components/ui';
import { extractDocxText } from '../lib/docx';
import { extractPdfText } from '../lib/pdf';
import {
  analyzeImport,
  findDuplicate,
  findSameSong,
  importText,
  lyricsSimilarity,
  normalizeTitle,
} from '../lib/importer';
import {
  aiCleanText,
  fetchUgTab,
  searchUgTabs,
  UgSearchResult,
  ugTabToImportText,
} from '../lib/ug';
import { addSongAsVersion } from '../lib/model';
import { looksGarbled } from '../lib/textRepair';
import { parseUgTabHtml } from '../lib/ugHtml';
import { navigate } from '../router';
import { useStore } from '../store';

type AddMethod = 'ug' | 'doc' | 'bulk';

interface BulkItem {
  url: string;
  status: 'pending' | 'loading' | 'ok' | 'dup' | 'skip' | 'error';
  title: string;
  message: string;
  /** Format problématique détecté → candidat au nettoyage IA ciblé */
  needsAi?: boolean;
  /** Morceau créé (pour le repasser à l'IA après coup) */
  songId?: string;
  /** Texte d'origine (base du nettoyage IA) */
  raw?: string;
}

/**
 * Garde-fou : l'import en masse sert à migrer SA collection (My tabs,
 * favoris), pas à aspirer le site. Plafond par fournée — largement
 * suffisant pour un profil, dissuasif pour un site entier.
 */
export const MAX_BULK_LINKS = 200;

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
function ProgressBar({
  done,
  total,
  label,
}: {
  done: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div aria-live="polite">
      <div
        className={`progressbar ${done >= total ? 'done' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
      <p className="help" style={{ textAlign: 'center', marginTop: 2 }}>
        {label} : {done}/{total}
      </p>
    </div>
  );
}

export function Import() {
  const { songs, deleted, saveSong } = useStore();
  const [method, setMethod] = useState<AddMethod>('ug');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
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
  const [aiLoading, setAiLoading] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkFiles, setBulkFiles] = useState<{ name: string; text: string }[]>(
    [],
  );
  const [bulkItems, setBulkItems] = useState<BulkItem[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkAiRunning, setBulkAiRunning] = useState(false);
  const [aiProg, setAiProg] = useState<{ done: number; total: number } | null>(
    null,
  );
  const bulkCancel = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const bulkFileRef = useRef<HTMLInputElement | null>(null);

  const bulkLinks = useMemo(() => extractUgLinks(bulkInput), [bulkInput]);
  const bulkTotal = bulkLinks.length + bulkFiles.length;

  const preview = useMemo(() => {
    if (text.trim() === '') return null;
    try {
      return importText(text, title || 'Chanson importée');
    } catch {
      return null;
    }
  }, [text, title]);

  const duplicate = useMemo(() => {
    const t = title.trim() !== '' ? title : (preview?.song.title ?? '');
    return findDuplicate(songs, t);
  }, [songs, title, preview]);

  // Analyse automatique : l'IA n'est suggérée que si elle peut aider.
  const issues = useMemo(
    () => (preview ? analyzeImport(text, preview) : []),
    [text, preview],
  );
  const needsAi = issues.some((i) => i.severity === 'warn');

  // Titre / artiste détectés → repris automatiquement (champs modifiables)
  useEffect(() => {
    if (!preview) return;
    if (preview.stats.hadTitle) setTitle((t) => (t.trim() === '' ? preview.song.title : t));
    if (preview.stats.hadArtist) setArtist((a) => (a.trim() === '' ? preview.song.artist : a));
  }, [preview]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      let content: string;
      if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        const tab = parseUgTabHtml(await file.text());
        if (!tab) {
          setError(
            'Cette page enregistrée ne contient pas de partition Ultimate ' +
              'Guitar lisible — pour une LISTE de partitions (My tabs), passe ' +
              'par « 3 · Import en masse ».',
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
        content = await extractPdfText(bytes);
      } else {
        content = await file.text();
      }
      setText(content);
      setFileName(file.name);
      if (title.trim() === '') {
        setTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      setError(
        "Ce fichier n'a pas pu être lu. Essaie un fichier texte " +
          '(.txt, .cho, .pro, .onsong) ou Word (.docx), ou colle le texte.',
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
      setError(e instanceof Error ? e.message : "L'import a échoué.");
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
    try {
      const results = await searchUgTabs(ugQuery.trim());
      setUgResults(results);
      if (results.length === 0) {
        setError('Aucune version trouvée pour cette recherche.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La recherche a échoué.');
    } finally {
      setUgSearching(false);
    }
  }

  async function onAiClean() {
    if (text.trim() === '' || aiLoading) return;
    setError(null);
    setAiLoading(true);
    try {
      const hint = [title.trim(), artist.trim()]
        .filter((x) => x !== '')
        .join(' — ');
      setText(await aiCleanText(text, hint || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Le nettoyage IA a échoué.');
    } finally {
      setAiLoading(false);
    }
  }

  function onImport(asIdea: boolean) {
    if (text.trim() === '') return;
    const { song } = importText(text, title || 'Chanson importée');
    if (title.trim() !== '') song.title = title.trim();
    if (artist.trim() !== '') song.artist = artist.trim();
    if (asIdea) song.idea = true;
    // Détection de doublon (titre / artiste / paroles) : si le morceau
    // existe déjà, on l'ajoute comme NOUVELLE VERSION plutôt que de créer
    // un doublon dans la bibliothèque.
    const twin = findSameSong(songs, song.title, song.lyrics, song.artist);
    if (twin && twin.idea !== true) {
      const merged = addSongAsVersion(twin, song, 'Version importée');
      saveSong(merged);
      navigate(`/song/${merged.id}`);
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
            // Sinon : page de LISTE (My tabs, favoris) → liens
            const links = extractUgLinks(html);
            if (links.length === 0)
              failed.push(`${f.name} (ni partition ni lien Ultimate Guitar)`);
            else linksFound.push(...links);
          }
        } else if (lower.endsWith('.docx')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          docs.push({ name: f.name, text: await extractDocxText(bytes) });
        } else if (lower.endsWith('.pdf')) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          docs.push({ name: f.name, text: await extractPdfText(bytes) });
        } else {
          docs.push({ name: f.name, text: await f.text() });
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
      setError(`Non retenus : ${failed.join(', ')}`);
    }
    if (bulkFileRef.current) bulkFileRef.current.value = '';
  }

  /** Import en masse : fichiers puis liens, ajoutés à la chaîne. */
  async function onBulkImport(asIdea: boolean) {
    if (bulkTotal === 0 || bulkRunning) return;
    setError(null);
    bulkCancel.current = false;
    setBulkRunning(true);
    setAiProg(null);
    const tasks: {
      label: string;
      url?: string;
      text?: string;
      fallbackTitle?: string;
    }[] = [
      ...bulkFiles.map((f) => ({
        label: f.name,
        text: f.text,
        fallbackTitle: f.name.replace(/\.[^.]+$/, ''),
      })),
      ...bulkLinks.map((url) => ({ label: url, url })),
    ];
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
    // Titres supprimés volontairement de Sing2Me : on ne les réimporte pas
    // (même garde-fou que la synchro de groupe). L'utilisateur peut toujours
    // les récupérer explicitement via « 2 · Document ou lien ».
    const removedTitles = new Set(
      deleted.map((t) => t.key).filter((k): k is string => !!k),
    );
    for (let i = 0; i < items.length; i++) {
      if (bulkCancel.current) {
        items[i] = { ...items[i], status: 'error', message: 'Annulé' };
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
                      'Ultimate Guitar limite le débit — relance l’import dans ' +
                        'quelques minutes, les morceaux déjà importés seront ignorés',
                    )
                  : e;
              }
              const wait = [5, 15, 30][attempt] ?? 30;
              items[i] = {
                ...items[i],
                message: `⏳ Ultimate Guitar demande une pause — nouvel essai dans ${wait} s`,
              };
              setBulkItems([...items]);
              await new Promise((r) => setTimeout(r, wait * 1000));
            }
          }
          raw = ugTabToImportText(tab);
          fallbackTitle = tab.title || 'Chanson importée';
          tabTitle = tab.title;
          tabArtist = tab.artist;
        } else {
          raw = task.text ?? '';
          fallbackTitle = task.fallbackTitle || 'Chanson importée';
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
          throw new Error('fichier vide ou illisible');
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
        if (!existing && removedTitles.has(normalizeTitle(song.title))) {
          items[i] = {
            ...items[i],
            status: 'skip',
            title: song.title,
            message:
              'supprimé de Sing2Me — non réimporté (passe par « Document ou lien » pour le récupérer)',
          };
        } else if (existing && garbled) {
          // Le PDF est brouillé et le morceau (tout aussi brouillé) est
          // déjà dans la bibliothèque : on le marque pour le décodage IA,
          // qui remplacera son contenu en place.
          items[i] = {
            ...items[i],
            status: 'ok',
            title: existing.title,
            message: '⚠ police PDF brouillée — décodage IA proposé',
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
              message: '🔧 mis à jour (accords récupérés)',
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
                message: `déjà présent (« ${existing.title} »)`,
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
                message: '➕ ajouté comme nouvelle version',
              };
            }
          }
        } else {
          if (asIdea) song.idea = true;
          saveSong(song);
          known.push(song);
          items[i] = {
            ...items[i],
            status: 'ok',
            title: song.title,
            message: needsAi
              ? garbled
                ? '⚠ police PDF brouillée — décodage IA proposé'
                : '⚠ format à revoir — IA conseillée'
              : '',
            needsAi,
            songId: song.id,
            raw,
          };
        }
      } catch (e) {
        items[i] = {
          ...items[i],
          status: 'error',
          message: e instanceof Error ? e.message : "L'import a échoué.",
        };
      }
      setBulkItems([...items]);
      // Pause entre deux liens : on reste courtois avec UG (évite le 429).
      if (tasks[i].url && i < items.length - 1 && !bulkCancel.current) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setBulkRunning(false);
  }

  /** Nettoyage IA ciblé : uniquement les morceaux marqués ⚠ par l'analyse. */
  async function onBulkAi() {
    if (!bulkItems || bulkAiRunning || bulkRunning) return;
    setError(null);
    setBulkAiRunning(true);
    const items = [...bulkItems];
    const total = items.filter(
      (x) => x.needsAi && x.songId && x.raw,
    ).length;
    let done = 0;
    setAiProg({ done, total });
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.needsAi || !it.songId || !it.raw) continue;
      items[i] = { ...it, message: '✨ nettoyage IA…' };
      setBulkItems([...items]);
      try {
        const old = songs.find((s) => s.id === it.songId);
        if (!old) throw new Error('morceau introuvable');
        // Indice titre/artiste : précieux pour décoder les PDF brouillés.
        const hint = [old.title || it.title, old.artist]
          .filter((x) => x && x.trim() !== '')
          .join(' — ');
        const cleaned = await aiCleanText(it.raw, hint || undefined);
        const fresh = importText(cleaned, it.title || 'Chanson importée').song;
        saveSong({
          ...fresh,
          id: old.id,
          title: old.title,
          artist: old.artist !== '' ? old.artist : fresh.artist,
          idea: old.idea,
          createdAt: old.createdAt,
          hearts: old.hearts,
          fanMessages: old.fanMessages,
          rehearsalNotes: old.rehearsalNotes,
        });
        items[i] = { ...it, needsAi: false, message: '✨ nettoyé à l’IA' };
      } catch (e) {
        items[i] = {
          ...it,
          message:
            '⚠ ' +
            (e instanceof Error ? e.message : 'le nettoyage IA a échoué'),
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
      Récupération de la partition…
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
            <label>Titre (repris automatiquement)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Artiste (repris automatiquement)</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>
        </div>
        {preview && (
          <div className="card">
            <div className="help" style={{ marginBottom: 6 }}>
              APERÇU DE L'ANALYSE
            </div>
            <div>
              Titre : <strong>{title.trim() || preview.song.title}</strong>
              {(artist.trim() || preview.song.artist) !== '' && (
                <> — Artiste : {artist.trim() || preview.song.artist}</>
              )}
            </div>
            <div className="help" style={{ marginTop: 4 }}>
              {[
                preview.stats.structureRows > 0
                  ? `structure : ${preview.stats.structureRows} partie${preview.stats.structureRows > 1 ? 's' : ''}`
                  : 'pas de structure détectée',
                preview.song.key !== '' ? `tonalité ${preview.song.key}` : '',
                preview.stats.mergedChordLines > 0
                  ? `${preview.stats.mergedChordLines} lignes d'accords fusionnées`
                  : '',
              ]
                .filter((x) => x !== '')
                .join(' · ')}
            </div>
            {issues.length === 0 ? (
              <div style={{ color: 'var(--accent)', marginTop: 8 }}>
                ✅ Analyse : rien à corriger.
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
              <div style={{ color: 'var(--accent)', marginTop: 8 }}>
                ⚠ Un morceau nommé « {duplicate.title} » existe déjà — tu vas
                peut-être créer un doublon.
              </div>
            )}
          </div>
        )}
        {needsAi && (
          <>
            <button
              className="btn ghost block"
              onClick={() => void onAiClean()}
              disabled={aiLoading}
            >
              {aiLoading
                ? '✨ Nettoyage en cours…'
                : "✨ L'analyse suggère un nettoyage IA — corriger le format"}
            </button>
            <p className="help">
              L'IA réécrit la partition au format standard (accords [Am] dans
              les paroles, sections nommées) pour régler les points ⚠
              ci-dessus. Version en ligne + clé IA requises.
            </p>
            <div className="spacer" />
          </>
        )}
        <button
          className="btn block"
          onClick={() => onImport(false)}
          disabled={text.trim() === ''}
        >
          Ajouter à ma bibliothèque
        </button>
        <div className="spacer" />
        <button
          className="btn ghost block"
          onClick={() => onImport(true)}
          disabled={text.trim() === ''}
          title="Jouable tout de suite, mais rangé dans les idées à travailler"
        >
          Garder comme idée — à travailler avant validation
        </button>
        <p className="help" style={{ textAlign: 'center' }}>
          Une « idée » est jouable immédiatement (concert, demande du public…)
          mais reste dans ta réserve jusqu'à ce que tu la valides dans la
          bibliothèque.
        </p>
      </>
    ) : null;

  return (
    <>
      <TopBar title="Ajouter un morceau" onBack={() => history.back()} />
      <div className="page">
        {/* 1 — Recherche : la première chose visible, toujours en tête */}
        <div className="field">
          <label>Rechercher une chanson</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={ugQuery}
              placeholder="Titre et artiste — ex. Angie Rolling Stones"
              onChange={(e) => setUgQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onUgSearch();
              }}
            />
            <button
              className="btn"
              onClick={() => void onUgSearch()}
              disabled={ugQuery.trim() === '' || ugSearching}
            >
              {ugSearching ? '…' : 'Chercher'}
            </button>
          </div>
          <p className="help" style={{ marginTop: 4 }}>
            Le plus simple : Sing2Me trouve la meilleure version et importe
            accords, paroles et structure.
          </p>
        </div>

        {method === 'ug' && ugResults !== null && ugResults.length > 0 && (
          <div
            className="card"
            style={{ maxHeight: 320, overflowY: 'auto', padding: 6 }}
          >
            {ugResults.map((r, i) => (
              <div
                className="row"
                key={i}
                onClick={() => {
                  setUgResults(null);
                  void loadUgUrl(r.url);
                }}
              >
                <div className="grow">
                  <div className="title">
                    {r.title}
                    {r.version > 1 ? ` (v${r.version})` : ''}
                  </div>
                  <div className="sub">
                    {[
                      r.artist,
                      r.type,
                      r.rating > 0 ? `★ ${r.rating}` : '',
                      r.votes > 0 ? `${r.votes} votes` : '',
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

        {/* 2 — Autres façons d'ajouter un morceau, en secondaire, plus bas */}
        <div className="spacer" />
        <div
          className="help"
          style={{
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Ou importer autrement
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          <button
            className={`chip ${method === 'doc' ? '' : 'off'}`}
            onClick={() => setMethod(method === 'doc' ? 'ug' : 'doc')}
          >
            Document ou lien
          </button>
          <button
            className={`chip ${method === 'bulk' ? '' : 'off'}`}
            onClick={() => setMethod(method === 'bulk' ? 'ug' : 'bulk')}
          >
            Import en masse
          </button>
        </div>

        {method === 'doc' && (
          <>
            <div className="field">
              <label>Coller un lien vers la partition</label>
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
                  {ugLoading ? '…' : 'Récupérer'}
                </button>
              </div>
              <p className="help" style={{ marginTop: 4 }}>
                Un lien reconnu est importé automatiquement. Sinon, ouvre la
                page, copie son texte et colle-le ci-dessous : l'analyse (et
                l'IA si besoin) reconstruit la partition.
              </p>
            </div>
            <div className="spacer" />
            <button
              className="btn ghost block"
              onClick={() => fileRef.current?.click()}
            >
              Choisir un fichier (txt, cho, pro, onsong, docx, pdf…)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.text,.cho,.crd,.pro,.chopro,.chordpro,.onsong,.docx,.pdf,.html,.htm"
              style={{ display: 'none' }}
              onChange={onFile}
            />
            {fileName && (
              <p className="help" style={{ textAlign: 'center' }}>
                Fichier : {fileName}
              </p>
            )}
            <div className="spacer" />
            <div className="field">
              <label>Ou colle le texte de la partition</label>
              <textarea
                className="mono"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  'Formats reconnus automatiquement :\n\n' +
                  '• Accords au-dessus des paroles :\n' +
                  '    Am        F\n' +
                  "    Sous le ciel qui s'endort\n\n" +
                  '• ChordPro / OnSong :\n' +
                  '    {title: Ma chanson}  ou  Title: Ma chanson\n' +
                  "    [Am]Sous le ciel [F]qui s'endort\n\n" +
                  '• Sections : [Couplet 1], Refrain:, [Verse], [Chorus]…'
                }
              />
            </div>
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
              Déposer des fichiers — page Ultimate Guitar enregistrée (.html) ou
              partitions
            </button>
            <input
              ref={bulkFileRef}
              type="file"
              multiple
              accept=".html,.htm,.txt,.text,.cho,.crd,.pro,.chopro,.chordpro,.onsong,.docx,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => void onBulkFiles(e)}
            />
            <p className="help">
              <strong>Le plus simple pour Ultimate Guitar :</strong> ouvre ta
              page « My tabs » (ou tes favoris) et{' '}
              <strong>
                fais d'abord afficher toutes tes partitions sur la page
              </strong>{' '}
              (réglage du nombre par page, ou fais défiler / passe les pages en
              bas de liste jusqu'à tout voir). Ensuite enregistre la page
              (Ctrl+S) et dépose le fichier .html ici. S'il reste plusieurs
              pages, enregistre chacune : tu peux déposer tous les fichiers
              .html en une fois, les liens s'additionnent sans doublons.{' '}
              <strong>Tablatures personnelles (« Personal tabs »)</strong> :
              ouvre chaque tablature sur Ultimate Guitar et enregistre sa page
              (Ctrl+S) —
              dépose ces .html ici, la partition est extraite directement du
              fichier, sans passer par le serveur. Tu peux aussi déposer
              plusieurs fichiers de partitions exportés d'une autre
              application (txt, ChordPro, OnSong, Word, PDF) : un fichier = un
              morceau.
            </p>
            {bulkFiles.length > 0 && (
              <p className="help">
                📄 {bulkFiles.length} fichier
                {bulkFiles.length > 1 ? 's' : ''} de partition prêt
                {bulkFiles.length > 1 ? 's' : ''} :{' '}
                {bulkFiles.map((f) => f.name).join(', ')}{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (!bulkRunning) setBulkFiles([]);
                  }}
                >
                  retirer
                </a>
              </p>
            )}
            <div className="spacer" />
            <div className="field">
              <label>Ou colle des liens Ultimate Guitar (un par ligne)</label>
              <textarea
                className="mono"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                disabled={bulkRunning}
                placeholder={
                  'https://tabs.ultimate-guitar.com/tab/…\n' +
                  'https://tabs.ultimate-guitar.com/tab/…\n' +
                  'https://tabs.ultimate-guitar.com/user/tab/view?h=…'
                }
              />
              <p className="help" style={{ marginTop: 4 }}>
                Tu peux coller en vrac (texte, page copiée…) : seules les
                pages de partition sont retenues, sans doublons. Cet import
                sert à récupérer <strong>ta</strong> collection (My tabs,
                favoris) — {MAX_BULK_LINKS} liens max par fournée.
                {bulkLinks.length > 0 && (
                  <>
                    {' '}
                    <strong>
                      {bulkLinks.length} lien{bulkLinks.length > 1 ? 's' : ''}{' '}
                      détecté{bulkLinks.length > 1 ? 's' : ''}
                      {bulkLinks.length >= MAX_BULK_LINKS
                        ? ' (plafond atteint)'
                        : ''}
                      .
                    </strong>
                  </>
                )}
              </p>
            </div>
            {!bulkRunning ? (
              <>
                <button
                  className="btn block"
                  onClick={() => void onBulkImport(false)}
                  disabled={bulkTotal === 0}
                >
                  Tout ajouter à ma bibliothèque
                  {bulkTotal > 0 ? ` (${bulkTotal})` : ''}
                </button>
                <div className="spacer" />
                <button
                  className="btn ghost block"
                  onClick={() => void onBulkImport(true)}
                  disabled={bulkTotal === 0}
                >
                  Tout garder comme idées — à travailler
                </button>
              </>
            ) : (
              <>
                {bulkItems && (
                  <ProgressBar
                    done={
                      bulkItems.filter(
                        (x) => x.status !== 'pending' && x.status !== 'loading',
                      ).length
                    }
                    total={bulkItems.length}
                    label="Import en cours"
                  />
                )}
                <button
                  className="btn ghost block"
                  onClick={() => {
                    bulkCancel.current = true;
                  }}
                >
                  Arrêter après le morceau en cours
                </button>
              </>
            )}
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
                    {it.status === 'error' && '✗ '}
                    {it.title !== ''
                      ? it.title
                      : it.url.replace(/^https:\/\/(tabs\.)?ultimate-guitar\.com/, '…')}
                    {it.message !== '' && ` — ${it.message}`}
                  </div>
                ))}
                {!bulkRunning && (
                  <div style={{ marginTop: 8 }}>
                    <strong>
                      {bulkItems.filter((x) => x.status === 'ok').length}{' '}
                      importé
                      {bulkItems.filter((x) => x.status === 'ok').length > 1
                        ? 's'
                        : ''}
                    </strong>
                    {' · '}
                    {bulkItems.filter((x) => x.status === 'dup').length} déjà
                    présent
                    {bulkItems.filter((x) => x.status === 'dup').length > 1
                      ? 's'
                      : ''}
                    {bulkItems.some((x) => x.status === 'skip') && (
                      <>
                        {' · '}
                        {
                          bulkItems.filter((x) => x.status === 'skip').length
                        }{' '}
                        supprimé
                        {bulkItems.filter((x) => x.status === 'skip').length >
                        1
                          ? 's'
                          : ''}{' '}
                        de Sing2Me (non réimporté
                        {bulkItems.filter((x) => x.status === 'skip').length >
                        1
                          ? 's'
                          : ''}
                        )
                      </>
                    )}
                    {' · '}
                    {bulkItems.filter((x) => x.status === 'error').length} échec
                    {bulkItems.filter((x) => x.status === 'error').length > 1
                      ? 's'
                      : ''}
                  </div>
                )}
              </div>
            )}
            {aiProg && (
              <ProgressBar
                done={aiProg.done}
                total={aiProg.total}
                label={
                  bulkAiRunning
                    ? 'Nettoyage IA en cours'
                    : 'Nettoyage IA terminé'
                }
              />
            )}
            {bulkItems &&
              !bulkRunning &&
              bulkItems.some((x) => x.needsAi) && (
                <>
                  <div className="spacer" />
                  <button
                    className="btn ghost block"
                    onClick={() => void onBulkAi()}
                    disabled={bulkAiRunning}
                  >
                    {bulkAiRunning
                      ? '✨ Nettoyage IA en cours…'
                      : `✨ Nettoyer à l'IA les ${
                          bulkItems.filter((x) => x.needsAi).length
                        } partition${
                          bulkItems.filter((x) => x.needsAi).length > 1
                            ? 's'
                            : ''
                        } au format problématique`}
                  </button>
                  <p className="help">
                    L'IA ne touche que les morceaux marqués ⚠ — les autres
                    restent tels quels. Chaque morceau garde son titre, son
                    artiste et son statut (bibliothèque ou idée).
                  </p>
                </>
              )}
            {errorCard}
          </>
        )}

        <p className="help" style={{ textAlign: 'center' }}>
          <a
            href="#/song/new"
            style={{ color: 'var(--text-dim)' }}
          >
            Ou écrire un morceau à la main →
          </a>
        </p>
      </div>
    </>
  );
}
