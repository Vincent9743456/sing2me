/**
 * Réglages & paramètres (#/reglages) — accessible depuis la fiche artiste.
 * Une mission : les actions « de maintenance » du compte, hors du chemin
 * musical quotidien.
 *
 * - Export PDF : ouvre le carnet imprimable de la bibliothèque
 *   (#/export-pdf) — « Enregistrer en PDF » du navigateur.
 * - Réinitialisation : l'utilisateur choisit QUOI effacer (profil,
 *   groupes, morceaux, setlists, concerts). Chaque élément effacé est
 *   enterré par id (pierres tombales) pour que la suppression se propage
 *   aux autres appareils sans bloquer un futur ré-import.
 */
import React, { useState } from 'react';

import { ConfirmSheet, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { AccordionNav, TopBar } from '../components/ui';
import { getValidSession } from '../lib/auth';
import { leaveBand } from '../lib/bands';
import { LiveStatus, pushLive, pushSetlist } from '../lib/live';
import { navigate } from '../router';
import { ResetParts, useStore } from '../store';

const RESET_CHOICES: {
  key: keyof ResetParts;
  label: string;
  detail: string;
}[] = [
  {
    key: 'songs',
    label: 'Morceaux',
    detail:
      'Bibliothèque, idées et propositions. Les morceaux des répertoires de groupe reviendront en propositions 📥.',
  },
  {
    key: 'setlists',
    label: 'Setlists',
    detail: 'Toutes les setlists (solo et groupes), avec leur sono & scène.',
  },
  { key: 'concerts', label: 'Concerts', detail: 'Dates passées et à venir.' },
  {
    key: 'bands',
    label: 'Groupes',
    detail:
      'Tu quittes tous tes groupes sur CE compte — les groupes continuent d’exister pour les autres membres.',
  },
  {
    key: 'artist',
    label: 'Profil artiste',
    detail: 'Nom, photo, bio, liens, pourboires, matériel, écran public.',
  },
];

export function Settings() {
  const { songs, setlists, concerts, bands, resetData, prefs } = useStore();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<keyof ResetParts>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const counts: Record<keyof ResetParts, number> = {
    songs: songs.length,
    setlists: setlists.length,
    concerts: concerts.length,
    bands: bands.length,
    artist: 1,
  };

  function toggle(key: keyof ResetParts) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const pickedLabels = RESET_CHOICES.filter((c) => picked.has(c.key)).map(
    (c) => c.label,
  );

  return (
    <>
      <TopBar
        live={false}
        title="Réglages"
        onBack={() => navigate('/artist')}
      />
      <div className="page">
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          Exporter
        </h2>
        <AccordionNav
          title="📄 Exporter la bibliothèque en PDF"
          sub={`${songs.filter((s) => s.idea !== true).length} morceau${
            songs.filter((s) => s.idea !== true).length > 1 ? 'x' : ''
          } — carnet imprimable, « Enregistrer en PDF »`}
          onClick={() => navigate('/export-pdf')}
        />

        <div className="spacer" />
        <h2 className="pagetitle">Réinitialiser</h2>
        <p className="help">
          Choisis ce que tu veux effacer sur ce compte. C'est définitif —
          la suppression vaut aussi sur tes autres appareils.
        </p>
        {RESET_CHOICES.map((c) => (
          <label
            key={c.key}
            className="row"
            style={{ alignItems: 'flex-start', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={picked.has(c.key)}
              style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
              onChange={() => toggle(c.key)}
            />
            <div className="grow">
              <div className="title">
                {c.label}
                {c.key !== 'artist' && (
                  <span className="stauthor"> — {counts[c.key]}</span>
                )}
              </div>
              <div className="sub" style={{ whiteSpace: 'normal' }}>
                {c.detail}
              </div>
            </div>
          </label>
        ))}
        <div className="spacer" />
        <button
          className="btn danger block"
          disabled={picked.size === 0}
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" size={15} /> Réinitialiser
          {picked.size > 0 ? ` (${pickedLabels.join(', ')})` : '…'}
        </button>
      </div>

      {confirming && (
        <ConfirmSheet
          title={`Effacer ${pickedLabels.join(', ')} ?`}
          message="C'est définitif, il n'y a pas de retour en arrière — et la suppression se propagera à tes autres appareils."
          confirmLabel="Effacer définitivement"
          danger
          onConfirm={() => {
            const parts: ResetParts = {};
            for (const k of picked) parts[k] = true;
            // Quitter ses groupes vaut AUSSI côté serveur (b140) : sinon
            // le créateur garde un membre fantôme et ne peut plus le
            // réinviter. Lancé avant l'effacement local, tant qu'on
            // connaît encore les cloudId.
            if (parts.bands === true) {
              const cloudIds = bands
                .map((b) => b.cloudId)
                .filter((id): id is string => !!id && id !== '');
              if (cloudIds.length > 0) {
                void (async () => {
                  const s = await getValidSession();
                  if (!s) return;
                  for (const id of cloudIds) await leaveBand(s, id);
                })();
              }
            }
            resetData(parts);
            // Ce que le PUBLIC voit doit suivre (bug signalé par Marco,
            // b137) : la setlist et le morceau diffusés vivent sur le
            // serveur — sans cet effacement, « Voir la setlist » montrait
            // encore des morceaux supprimés. Best-effort, non bloquant.
            if (parts.setlists === true || parts.songs === true) {
              void pushSetlist(prefs.liveKey, null);
              // Un direct en cours (ou en pause) garde son statut : on ne
              // vide QUE ce qui est diffusé.
              const onair = (localStorage.getItem('sing2me/onair') ??
                'off') as LiveStatus;
              if (onair !== 'off') {
                void pushLive(prefs.liveKey, {
                  status: onair,
                  song: null,
                  setlist: null,
                }).catch(() => {});
              }
            }
            setPicked(new Set());
            toast.show('Réinitialisation faite ✓');
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
