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
 * CE N'EST PAS UN PLI (correction de Vincent, b223 : « le petit œil doit être
 * visible sur la partition »). Un aperçu rangé sous les notes de répétition
 * n'existe pas : personne ne déroule une fiche entière pour vérifier quelque
 * chose dont il ignore l'existence. L'œil vit donc dans la rangée d'actions du
 * morceau, en haut, et il BASCULE la partition elle-même — un seul geste, au
 * même endroit que ce qu'il change.
 *
 * Hors mode scène et hors direct (arbitrage Vincent) : sur scène, l'écran ne
 * sert qu'à jouer.
 */
import React, { useState } from 'react';

import { PublicLyrics } from './PublicLyrics';
import { Icon } from './Icon';
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

/**
 * L'œil, dans la rangée d'actions du morceau. Il dit aussi ce qu'il y a à
 * savoir sans l'ouvrir : un texte retouché qui a pris du retard sur la
 * partition se signale ici, sinon personne ne le verrait jamais.
 */
export function PublicEye({
  song,
  actif,
  onToggle,
}: {
  song: Song;
  actif: boolean;
  onToggle: () => void;
}) {
  const aRevoir = partitionAChange(song);
  return (
    <button
      className={`chip ${actif ? '' : 'off'}`}
      style={aRevoir ? { color: 'var(--warn)' } : undefined}
      aria-pressed={actif}
      title={t('Lire le morceau comme le liront tes spectateurs')}
      onClick={onToggle}
    >
      👁 {t('Vue du public')}
      {aRevoir ? ` — ${t('à revoir')}` : parolesRetouchees(song) ? ' ✏️' : ''}
    </button>
  );
}

/**
 * Le panneau qui remplace la partition quand l'œil est actif : ce que lisent
 * les spectateurs, et de quoi le corriger.
 */
export function PublicPreview({
  song,
  onSave,
  onClose,
}: {
  song: Song;
  onSave: (song: Song) => void;
  onClose: () => void;
}) {
  // null = lecture · sinon le texte en cours de modification
  const [brouillon, setBrouillon] = useState<string | null>(null);

  const retouche = parolesRetouchees(song);
  const aChange = partitionAChange(song);
  const texte = parolesPubliques(song);
  const vide = texte.trim() === '';

  return (
    <div className="pubview">
      <div className="pubview-head">
        <span>👁 {t('Ce que verra le public')}</span>
        <button className="btn ghost small" onClick={onClose}>
          <Icon name="x" size={12} /> {t('Ma partition')}
        </button>
      </div>

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
                {t(
                  'Aucune parole à afficher — le public verra l’écran de concert sans texte.',
                )}
              </p>
            ) : (
              <PublicLyrics text={texte} style={{ marginTop: 0 }} />
            )}
          </div>
          <p className="help">
            {retouche
              ? t('Texte écrit par toi. Le public lit ceci, et pas ta partition.')
              : t(
                  'Préparé depuis ta partition : les accords sont retirés, les sections rappelées. Il suit tes corrections tout seul.',
                )}
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
              title={t(
                'Remet le texte préparé automatiquement depuis ta partition',
              )}
              onClick={() => setBrouillon(parolesAutomatiques(song))}
            >
              ↻ {t('Repartir de ma partition')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
