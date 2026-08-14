/**
 * RECHERCHE & CRÉATION D'UNE PARTITION (b319) — adaptation WEB de la spec.
 *
 * Un champ de recherche unique → création d'une fiche BROUILLON (invisible
 * de tout : répertoire, setlists, compteurs, synchro) → ouverture de la
 * recherche Ultimate Guitar dans un NOUVEL ONGLET (le seul contact avec UG
 * est la navigation de l'utilisateur — aucune requête ne part de l'app ni du
 * serveur) → l'utilisateur copie la partition À LA MAIN → revient → colle →
 * mise en forme 100 % LOCALE (importText : accords détectés et fusionnés,
 * sections reconnues — AUCUN appel IA, AUCUN serveur) → aperçu avec titre /
 * artiste / tonalité éditables (accords en bleu via SongBody) → validation.
 *
 * Décision Vincent (b319) : le libellé NOMME « Ultimate Guitar » — usage
 * référentiel, texte seul, jamais de logo ni de « powered by ». C'est une
 * levée ASSUMÉE de la règle §A.5 pour CE flux (l'utilisateur navigue
 * lui-même, rien n'est récupéré par nos serveurs : portabilité, pas
 * captation).
 *
 * Cycle de vie du brouillon :
 *  · nouvelle recherche → l'ancien brouillon meurt ;
 *  · abandon explicite (Annuler) → suppression immédiate ;
 *  · TTL 6 h au chargement de l'app (store.tsx) ;
 *  · le brouillon SURVIT au passage en arrière-plan (un appel reçu pendant
 *    la navigation UG ne détruit pas le travail).
 *
 * Déduplication À LA VALIDATION (et à la reprise) : jamais de fusion ni de
 * suppression silencieuse — l'utilisateur arbitre (ouvrir l'existante /
 * remplacer par la nouvelle mise en forme / garder les deux).
 */
import React, { useMemo, useState } from 'react';

import { useToast } from '../components/Feedback';
import { SongBody } from '../components/SongBody';
import { t } from '../i18n';
import { findSameSong, importText } from '../lib/importer';
import { addSongAsVersion } from '../lib/model';
import { navigate } from '../router';
import { useStore } from '../store';
import { estBrouillon, Song } from '../types';

/**
 * Adresse de recherche UG — ouverte dans un nouvel onglet, jamais requêtée.
 *
 * Via la page RELAIS de notre domaine (b320, constat de Vincent) : une
 * navigation directe vers ultimate-guitar.com déclenche le LIEN UNIVERSEL du
 * téléphone, qui ouvre l'application UG installée — où la sélection/copie est
 * impossible. La redirection par script depuis notre page garde l'utilisateur
 * dans le NAVIGATEUR, où le copier-coller fonctionne.
 */
function urlRechercheUg(query: string): string {
  return `/aller-ug.html?q=${encodeURIComponent(query)}`;
}

export function Compose({ draftId }: { draftId: string | null }) {
  const { songs, saveSong, purgeBrouillon } = useStore();
  const toast = useToast();

  const draft = useMemo(
    () => songs.find((s) => s.id === draftId && estBrouillon(s)) ?? null,
    [songs, draftId],
  );

  const [query, setQuery] = useState('');
  const [colle, setColle] = useState('');
  // Champs éditables de l'aperçu (pré-remplis par le parsing ; la
  // validation vaut confirmation — pas de dialogue intermédiaire).
  const [titre, setTitre] = useState<string | null>(null);
  const [artiste, setArtiste] = useState<string | null>(null);
  const [tonalite, setTonalite] = useState<string | null>(null);
  // Doublon détecté à la validation : l'utilisateur arbitre.
  const [double, setDouble] = useState<Song | null>(null);

  const validees = useMemo(() => songs.filter((s) => !estBrouillon(s)), [songs]);

  /* ── Étape 1 : recherche = création ─────────────────────────────── */
  function lancerRecherche() {
    const q = query.trim();
    if (q === '') return;
    // Une seule création en cours : la nouvelle recherche remplace
    // l'ancien brouillon (pas de cimetière).
    for (const s of songs) if (estBrouillon(s)) purgeBrouillon(s.id);
    const brouillon: Song = {
      ...importText('', q).song,
      title: q, // la requête brute sert de titre provisoire
      status: 'draft',
    };
    saveSong(brouillon);
    // Nouvel onglet : le seul contact avec UG est la navigation de
    // l'utilisateur (aucun fetch, aucune WebView possible sur le web —
    // UG interdit l'encadrement).
    window.open(urlRechercheUg(q), '_blank', 'noopener');
    navigate(`/creer/${brouillon.id}`);
  }

  /* ── Étape 2 : collage → mise en forme locale ───────────────────── */
  function appliquerTexte(texte: string) {
    if (!draft || texte.trim() === '') return;
    // 100 % local : importText détecte accords, sections, métadonnées.
    // Les valeurs parsées ÉCRASENT la requête initiale (elle n'était
    // qu'une requête, potentiellement fautive).
    const res = importText(texte, draft.title);
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
      appliquerTexte(texte);
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

  // Étape courante, déduite de l'état du brouillon (reprise au bon endroit).
  const etape: 'recherche' | 'colle' | 'apercu' =
    draft === null ? 'recherche' : draft.lyrics.trim() === '' ? 'colle' : 'apercu';

  return (
    <div className="page">
      <h1 className="pagetitle">{t('Créer une partition')}</h1>

      {etape === 'recherche' && (
        <>
          <p className="help">
            {t(
              'Cherche le morceau, copie la partition sur la page ouverte, puis reviens ici la coller.',
            )}
          </p>
          <input
            type="text"
            value={query}
            autoFocus
            placeholder={t('Titre, artiste… (ex. hallelujah cohen)')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') lancerRecherche();
            }}
          />
          <div className="spacer" />
          <button
            className="btn block"
            disabled={query.trim() === ''}
            onClick={lancerRecherche}
          >
            🔎 {t('Chercher sur Ultimate Guitar')}
          </button>
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
          <p className="help">
            {t(
              'Sur la page ouverte, sélectionne la partition (accords + paroles), copie-la, puis reviens ici.',
            )}
          </p>
          <button className="btn block" onClick={() => void collerDepuisPressePapiers()}>
            📋 {t('Coller la partition copiée')}
          </button>
          <div className="spacer" />
          <textarea
            rows={8}
            value={colle}
            placeholder={t('…ou colle-la ici à la main.')}
            onChange={(e) => setColle(e.target.value)}
          />
          {colle.trim() !== '' && (
            <button className="btn block" onClick={() => appliquerTexte(colle)}>
              {t('Mettre en forme')}
            </button>
          )}
          <div className="spacer" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn ghost"
              onClick={() =>
                window.open(urlRechercheUg(draft.title), '_blank', 'noopener')
              }
            >
              ↗ {t('Rouvrir la recherche')}
            </button>
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
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Retour vers le collage : le brouillon est CONSERVÉ
                    (l'utilisateur veut peut-être copier une autre version). */}
                <button
                  className="btn ghost"
                  onClick={() => {
                    saveSong({ ...draft, lyrics: '', status: 'draft' });
                    setColle('');
                  }}
                >
                  ↩ {t('Recoller un autre texte')}
                </button>
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
  );
}
