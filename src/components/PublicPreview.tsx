/**
 * « CE QUE VERRA LE PUBLIC » SUR LA FICHE D'UN MORCEAU (b223, demande de
 * Vincent : « il faut que l'app permette à l'artiste de voir ce que verra le
 * public, et éventuellement le modifier »).
 *
 * L'aperçu de l'onglet Artiste montre l'ÉCRAN (le badge EN DIRECT, les cœurs,
 * le pourboire) sur un morceau pris au hasard — il répond à « à quoi ça
 * ressemble ». Ici on répond à l'autre question, la seule qui compte une
 * minute avant de monter sur scène : « qu'est-ce que mes spectateurs vont
 * lire, sur CE morceau-là ». D'où le même composant de rendu que le public
 * (`PublicLyrics`) et rien d'autre autour : pas de simulation de concert, pas
 * de décor.
 *
 * Un pli (règle 3 : l'avancé ne coûte rien à qui ne le cherche pas), sauf
 * quand il y a quelque chose à dire — un texte retouché, ou une partition qui
 * a bougé depuis : le résumé le porte alors, pli fermé.
 */
import React, { useState } from 'react';

import { PublicLyrics } from './PublicLyrics';
import {
  garderMonTexte,
  parolesAutomatiques,
  parolesPubliques,
  parolesRetouchees,
  partitionAChange,
  rendreAutomatique,
  retoucherParoles,
} from '../lib/publiclyrics';
import { t } from '../i18n';
import { Song } from '../types';

export function PublicPreview({
  song,
  onSave,
}: {
  song: Song;
  onSave: (song: Song) => void;
}) {
  // null = lecture · sinon le texte en cours de modification
  const [brouillon, setBrouillon] = useState<string | null>(null);
  // Le pli s'ouvre de lui-même quand il y a un écart à trancher — mais son
  // ouverture reste ENSUITE entre les mains du musicien. Piloter `open` par
  // l'écart le refermait au nez de celui qui venait de le résoudre.
  const [ouvert, setOuvert] = useState(() => partitionAChange(song));

  const retouche = parolesRetouchees(song);
  const aChange = partitionAChange(song);
  const texte = parolesPubliques(song);
  const vide = texte.trim() === '';

  return (
    <details
      className="stfold"
      open={ouvert}
      onToggle={(e) => setOuvert(e.currentTarget.open)}
    >
      <summary>
        👁 {t('Ce que verra le public')}
        {aChange
          ? ` — ${t('à revoir')}`
          : retouche
            ? ` — ${t('texte retouché')}`
            : ''}
      </summary>

      {aChange && (
        <p className="help" style={{ color: 'var(--warn)', marginTop: 0 }}>
          {t(
            'Tu as modifié la partition depuis que tu as écrit ce texte : le public lit toujours ta version, elle n’a pas suivi.',
          )}
        </p>
      )}

      {brouillon === null ? (
        <>
          <div className="pubframe">
            {vide ? (
              <p className="help" style={{ textAlign: 'center', margin: 0 }}>
                {t('Aucune parole à afficher — le public verra l’écran de concert sans texte.')}
              </p>
            ) : (
              <PublicLyrics text={texte} style={{ marginTop: 0 }} />
            )}
          </div>
          <p className="help">
            {retouche
              ? t('Texte écrit par toi. Le public lit ceci, et pas ta partition.')
              : t('Préparé depuis ta partition : les accords sont retirés, les sections rappelées. Il suit tes corrections tout seul.')}
          </p>
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn ghost small"
              onClick={() => setBrouillon(texte)}
            >
              ✏️ {t('Modifier ce texte')}
            </button>
            {aChange && (
              <>
                <button
                  className="btn ghost small"
                  onClick={() => onSave(rendreAutomatique(song))}
                >
                  ↻ {t('Reprendre ma partition')}
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => onSave(garderMonTexte(song))}
                >
                  {t('Garder mon texte')}
                </button>
              </>
            )}
            {retouche && !aChange && (
              <button
                className="btn ghost small"
                onClick={() => onSave(rendreAutomatique(song))}
              >
                ↩ {t('Revenir au texte automatique')}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <textarea
            value={brouillon}
            rows={12}
            aria-label={t('Texte lu par le public')}
            onChange={(e) => setBrouillon(e.target.value)}
          />
          <p className="help">
            {t(
              'Ta partition et tes accords ne bougent pas : tu ne modifies ici que ce que lisent tes spectateurs. Écris « Refrain : » en début de ligne pour marquer une section.',
            )}
          </p>
          <div className="hstack" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn small"
              onClick={() => {
                onSave(retoucherParoles(song, brouillon));
                setBrouillon(null);
              }}
            >
              {t('Enregistrer')}
            </button>
            <button
              className="btn ghost small"
              onClick={() => setBrouillon(null)}
            >
              {t('Annuler')}
            </button>
            <button
              className="btn ghost small"
              title={t('Remet le texte préparé automatiquement depuis ta partition')}
              onClick={() => setBrouillon(parolesAutomatiques(song))}
            >
              ↻ {t('Repartir de ma partition')}
            </button>
          </div>
        </>
      )}
    </details>
  );
}
