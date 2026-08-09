/**
 * « Chercher une meilleure version » — depuis la fiche d'un morceau, propose
 * automatiquement l'équivalent le mieux noté (recherche titre + artiste sur
 * Ultimate Guitar, tri note × votes), avec aperçu, puis remplacement de la
 * partition OU ajout comme nouvelle version.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { Modal } from './ui';
import { analyzeImport, importText } from '../lib/importer';
import { duplicateVersion, propagateMainKeyCapo } from '../lib/model';
import {
  aiCleanText,
  fetchUgTab,
  searchUgTabs,
  UgSearchResult,
  UgTab,
  ugTabToImportText,
} from '../lib/ug';
import { Song } from '../types';
import { t } from '../i18n';

/**
 * Applique une partition UG au morceau : remplace le contenu de la
 * version affichée, ou l'ajoute comme nouvelle version (et bascule
 * dessus). Notes, setlists et identité du morceau sont préservées.
 */
export function applyUgTabToSong(
  song: Song,
  tab: UgTab,
  mode: 'replace' | 'version',
): Song {
  return applyUgTextToSong(song, ugTabToImportText(tab), mode);
}

/** Variante : applique un texte de partition déjà préparé (ex. nettoyé IA). */
export function applyUgTextToSong(
  song: Song,
  text: string,
  mode: 'replace' | 'version',
): Song {
  // Le doute de l'import portait sur le contenu qu'on remplace (b218) :
  // choisir une autre partition, c'est justement l'avoir vérifiée.
  // Signalement de Vincent : le badge « 🔎 À vérifier » survivait à tout —
  // nouvelle version, suppression de l'originale, il restait là.
  if (song.needsCheck) song = { ...song, needsCheck: undefined };
  const fresh = importText(text, song.title).song;
  const patch = (v: { key: string }) => ({
    key: fresh.key !== '' ? fresh.key : v.key,
    capo: fresh.capo,
    structure: fresh.structure,
    lyrics: fresh.lyrics,
  });
  if (mode === 'replace') {
    const prev = song.versions.find((v) => v.id === song.activeVersionId);
    let out: Song = {
      ...song,
      artist: song.artist !== '' ? song.artist : fresh.artist,
      ...patch(song),
      updatedAt: new Date().toISOString(),
      versions: song.versions.map((v) =>
        v.id === song.activeVersionId ? { ...v, ...patch(v) } : v,
      ),
    };
    // Remplacement de la version PRINCIPALE : tonalité/capo se
    // répercutent sur les versions qui la suivaient.
    if (
      prev &&
      song.versions.length > 0 &&
      song.activeVersionId === song.versions[0].id
    ) {
      out = propagateMainKeyCapo(out, prev.key, prev.capo);
    }
    return out;
  }
  let s2 = duplicateVersion(song, 'Version importée');
  s2 = {
    ...s2,
    ...patch(s2),
    versions: s2.versions.map((v) =>
      v.id === s2.activeVersionId ? { ...v, ...patch(v) } : v,
    ),
  };
  return s2;
}

/** Score de qualité : la note compte, pondérée par le nombre de votes. */
function qualityScore(r: UgSearchResult): number {
  const confidence = Math.min(1, Math.log10((r.votes ?? 0) + 1) / 2.5);
  return (r.rating ?? 0) * (0.4 + 0.6 * confidence);
}

export function UgUpgradeModal({
  song,
  onApply,
  onClose,
}: {
  song: Song;
  onApply: (text: string, mode: 'replace' | 'version') => void;
  onClose: () => void;
}) {
  const [results, setResults] = useState<UgSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<UgSearchResult | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDone, setAiDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = `${song.title} ${song.artist}`.trim();
    searchUgTabs(q)
      .then((r) => {
        if (alive) setResults(r);
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error ? e.message : t('La recherche a échoué.'),
          );
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  const sorted = useMemo(
    () =>
      results
        ? [...results].sort((a, b) => qualityScore(b) - qualityScore(a))
        : null,
    [results],
  );
  const best = sorted && sorted.length > 0 ? sorted[0] : null;

  async function pick(r: UgSearchResult) {
    if (busy) return;
    setError(null);
    setPicked(r);
    setText(null);
    setAiDone(false);
    setBusy(true);
    try {
      const tab = await fetchUgTab(r.url);
      setText(ugTabToImportText(tab));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('La récupération a échoué.'),
      );
      setPicked(null);
    } finally {
      setBusy(false);
    }
  }

  // Même analyse que la page d'import : l'IA n'est proposée que si utile
  const issues = useMemo(() => {
    if (text === null) return [];
    try {
      return analyzeImport(
        text,
        importText(text, song.title || t('Morceau')),
      );
    } catch {
      return [];
    }
  }, [text, song.title]);
  const needsAi = !aiDone && issues.some((i) => i.severity === 'warn');

  async function onAiClean() {
    if (text === null || aiBusy) return;
    setError(null);
    setAiBusy(true);
    try {
      const hint = [song.title, song.artist]
        .filter((x) => x.trim() !== '')
        .join(' — ');
      setText(await aiCleanText(text, hint || undefined));
      setAiDone(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('Le nettoyage IA a échoué.'),
      );
    } finally {
      setAiBusy(false);
    }
  }

  function line(r: UgSearchResult): string {
    return [
      r.type,
      r.rating > 0 ? `★ ${r.rating.toFixed(1)}` : '',
      r.votes > 0 ? `${r.votes} votes` : '',
      r.version > 1 ? `v${r.version}` : '',
    ]
      .filter((x) => x !== '')
      .join(' · ');
  }

  return (
    <Modal title={t('Chercher une meilleure version')} onClose={onClose}>
      {results === null && error === null && (
        <p className="help">{t('Recherche de la meilleure version…')}</p>
      )}
      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {sorted && sorted.length === 0 && (
        <p className="help">
          {t('Aucune version trouvée pour « {title}{artist} ».', {
            title: song.title,
            artist: song.artist !== '' ? ` — ${song.artist}` : '',
          })}
        </p>
      )}

      {best && picked === null && (
        <>
          <div className="help" style={{ marginBottom: 6 }}>
            {t('SUGGESTION SING2ME — la mieux notée')}
          </div>
          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="title">
              {best.title}
              {best.artist !== '' ? ` — ${best.artist}` : ''}
            </div>
            <div className="sub">{line(best)}</div>
            <div className="spacer" />
            <button className="btn block" onClick={() => void pick(best)}>
              {t('Voir cette version')}
            </button>
          </div>
          {(sorted?.length ?? 0) > 1 && (
            <>
              <div className="help" style={{ margin: '10px 0 6px' }}>
                {t('AUTRES VERSIONS')}
              </div>
              <div
                className="card"
                style={{ maxHeight: 220, overflowY: 'auto', padding: 6 }}
              >
                {(sorted ?? []).slice(1, 12).map((r, i) => (
                  <div className="row" key={i} onClick={() => void pick(r)}>
                    <div className="grow">
                      <div className="title">{r.title}</div>
                      <div className="sub">{line(r)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {busy && (
        <p className="help" style={{ textAlign: 'center' }}>
          {t('Récupération de la partition…')}
        </p>
      )}

      {picked && text !== null && (
        <>
          <div className="help" style={{ marginBottom: 6 }}>
            {t('APERÇU — {title} ({info})', {
              title: picked.title,
              info: line(picked),
            })}
            {aiDone ? t(' · ✨ nettoyé à l’IA') : ''}
          </div>
          <div
            className="card mono"
            style={{
              maxHeight: 240,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '0.85em',
            }}
          >
            {text.slice(0, 2500)}
          </div>
          {issues.length > 0 && (
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
          {needsAi && (
            <>
              <div className="spacer" />
              <button
                className="btn ghost block"
                onClick={() => void onAiClean()}
                disabled={aiBusy}
              >
                {aiBusy
                  ? t('✨ Nettoyage en cours…')
                  : t(
                      "✨ L'analyse suggère un nettoyage IA — corriger avant d'appliquer",
                    )}
              </button>
            </>
          )}
          <div className="spacer" />
          <button
            className="btn block"
            onClick={() => onApply(text, 'version')}
            disabled={aiBusy}
          >
            {t('Ajouter comme nouvelle version (recommandé)')}
          </button>
          <div className="spacer" />
          <button
            className="btn ghost block"
            onClick={() => onApply(text, 'replace')}
            disabled={aiBusy}
          >
            {t('Remplacer ma partition actuelle')}
          </button>
          <p className="help">
            {t(
              "« Nouvelle version » garde ta partition d'origine accessible dans le sélecteur de versions ; « Remplacer » écrase le contenu de la version affichée (notes et setlists conservées).",
            )}
          </p>
          <button
            className="btn ghost small"
            onClick={() => {
              setPicked(null);
              setText(null);
              setAiDone(false);
            }}
          >
            {t('← Autres versions')}
          </button>
        </>
      )}
    </Modal>
  );
}
