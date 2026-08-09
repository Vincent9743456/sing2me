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
import React, { useEffect, useRef, useState } from 'react';

import { ConfirmSheet, useToast } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { AccordionNav, TopBar } from '../components/ui';
import { rememberLang, storedLang, t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { leaveBand } from '../lib/bands';
import { LiveStatus, pushLive, pushSetlist } from '../lib/live';
import { navigate } from '../router';
import { AppState, ResetParts, useStore } from '../store';
import {
  backupFileName,
  decrireRestauration,
  makeBackup,
  readBackup,
} from '../lib/backup';
import { mergeStates, SyncState } from '../lib/sync';
import { APP_BUILD } from '../version';

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
  {
    key: 'concerts',
    label: 'Concerts et lives',
    detail: 'Dates passées et à venir, et l’historique de tes directs.',
  },
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
  const store = useStore();
  const { songs, setlists, concerts, bands, resetData, prefs, savePrefs } =
    store;
  const toast = useToast();
  const fichierRef = useRef<HTMLInputElement | null>(null);

  /** Compose l'état complet, dans la forme attendue par la restauration. */
  function etatComplet(): AppState {
    return {
      songs: store.songs,
      setlists: store.setlists,
      concerts: store.concerts,
      bands: store.bands,
      artist: store.artist,
      prefs: store.prefs,
      deleted: store.deleted,
      bandRemovals: store.bandRemovals,
      resetAt: store.resetAt,
    };
  }

  /**
   * Écrit le fichier de sauvegarde. Passe par un lien de téléchargement :
   * c'est le seul chemin qui marche partout, y compris dans l'app installée
   * sur iPhone, où le fichier atterrit dans « Fichiers ».
   */
  function sauvegarder() {
    try {
      const backup = makeBackup(etatComplet(), APP_BUILD);
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      // On note la date : c'est ce qui fait TAIRE le rappel discret.
      savePrefs({
        ...store.prefs,
        lastBackupAt: new Date().toISOString(),
        lastBackupSongs: store.songs.filter((x) => x.idea !== true).length,
        backupSnoozeUntil: undefined,
      });
      toast.show(
        t('Sauvegarde enregistrée — {n} morceaux.', { n: store.songs.length }),
      );
    } catch {
      toast.show(t('La sauvegarde n’a pas pu être écrite.'));
    }
  }

  /**
   * Relit un fichier et FUSIONNE. On ne remplace jamais : ce qui manque
   * revient, ce qui existe des deux côtés garde sa version la plus récente.
   * Restaurer une vieille sauvegarde ne peut donc pas effacer le travail
   * d'hier — un filet, pas un piège.
   */
  async function restaurer(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fichierRef.current) fichierRef.current.value = '';
    if (!f) return;
    const lu = readBackup(await f.text());
    if (lu.ok !== true) {
      toast.show(lu.raison);
      return;
    }
    const avant = etatComplet();
    const { nouveaux } = decrireRestauration(avant, lu.backup);
    const fusionne = mergeStates(
      avant as unknown as SyncState,
      lu.backup.state as unknown as SyncState,
    );
    store.hydrate(fusionne as unknown as AppState);
    toast.show(
      nouveaux > 1
        ? t('{n} morceaux retrouvés.', { n: nouveaux })
        : nouveaux === 1
          ? t('1 morceau retrouvé.')
          : t('Rien à ajouter — tout y était déjà.'),
    );
  }
  const [picked, setPicked] = useState<Set<keyof ResetParts>>(new Set());
  const [confirming, setConfirming] = useState(false);
  // Tableau de bord fondateur (b160) : l'entrée n'apparaît que pour les
  // comptes autorisés — c'est le SERVEUR qui tranche (ADMIN_EMAILS), le
  // téléphone ne fait que demander. Résultat gardé pour la session.
  const [isAdmin, setIsAdmin] = useState(
    () => sessionStorage.getItem('sing2me/isAdmin') === '1',
  );
  useEffect(() => {
    void (async () => {
      try {
        const s = await getValidSession();
        if (!s) return;
        const r = await fetch('/api/admin-stats', {
          headers: { authorization: `Bearer ${s.accessToken}` },
        });
        const okAdmin = r.ok;
        setIsAdmin(okAdmin);
        sessionStorage.setItem('sing2me/isAdmin', okAdmin ? '1' : '0');
      } catch {
        // hors ligne : on garde ce qu'on savait
      }
    })();
  }, []);

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
    (c) => t(c.label),
  );
  // Le choix affiché doit refléter la langue RÉELLEMENT appliquée : si la
  // synchro a effacé le champ, on retombe sur le choix mémorisé à part.
  const langPref = (prefs.lang ?? '') !== '' ? (prefs.lang ?? '') : storedLang();

  return (
    <>
      <TopBar
        live={false}
        title={t('Réglages')}
        onBack={() => navigate('/artist')}
      />
      <div className="page">
        {/* Langue de l'interface (b156) : automatique = langue du
            téléphone. Les contenus musicaux ne sont JAMAIS traduits. */}
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          {t('Langue de l’application')}
        </h2>
        <div className="chips">
          <button
            className={`chip ${langPref === '' ? '' : 'off'}`}
            onClick={() => {
              rememberLang('');
              savePrefs({ ...prefs, lang: '' });
            }}
          >
            {t('🌐 Automatique (langue du téléphone)')}
          </button>
          <button
            className={`chip ${langPref === 'fr' ? '' : 'off'}`}
            onClick={() => {
              rememberLang('fr');
              savePrefs({ ...prefs, lang: 'fr' });
            }}
          >
            Français
          </button>
          <button
            className={`chip ${langPref === 'en' ? '' : 'off'}`}
            onClick={() => {
              rememberLang('en');
              savePrefs({ ...prefs, lang: 'en' });
            }}
          >
            English
          </button>
        </div>
        <p className="help">
          {t(
            'Tes partitions, paroles, notes et messages ne sont jamais traduits — seule l’interface change de langue.',
          )}
        </p>

        {isAdmin && (
          <>
            <div className="spacer" />
            <h2 className="pagetitle">{t('Pilotage')}</h2>
            <AccordionNav
              title={t('📊 Tableau de bord')}
              sub={t('Comptes, usage, coût des IA, crédit restant')}
              onClick={() => navigate('/tableau-de-bord')}
            />
          </>
        )}

        <div className="spacer" />
        <h2 className="pagetitle">{t('Exporter')}</h2>
        <AccordionNav
          title={t('📄 Exporter la bibliothèque en PDF')}
          sub={
            (songs.filter((s) => s.idea !== true).length > 1
              ? t('{n} morceaux', {
                  n: songs.filter((s) => s.idea !== true).length,
                })
              : t('{n} morceau', {
                  n: songs.filter((s) => s.idea !== true).length,
                })) + t(' — carnet imprimable, « Enregistrer en PDF »')
          }
          onClick={() => navigate('/export-pdf')}
        />
        <AccordionNav
          title={t('💾 Enregistrer une sauvegarde')}
          sub={t(
            'Un fichier que tu gardes chez toi — il se relit même sans nous',
          )}
          onClick={sauvegarder}
        />
        <AccordionNav
          title={t('↩︎ Restaurer une sauvegarde')}
          sub={t('Ajoute ce qui manque, n’écrase jamais ce qui est plus récent')}
          onClick={() => fichierRef.current?.click()}
        />
        <input
          ref={fichierRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(e) => void restaurer(e)}
        />
        <p className="help">
          {t(
            'Ta bibliothèque vit sur ce téléphone ; la copie en ligne sert à la retrouver sur un autre appareil. Une sauvegarde te met à l’abri des deux à la fois.',
          )}
        </p>

        <div className="spacer" />
        <h2 className="pagetitle">{t('Réinitialiser')}</h2>
        <p className="help">
          {t(
            'Choisis ce que tu veux effacer sur ce compte. C’est définitif — la suppression vaut aussi sur tes autres appareils.',
          )}
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
                {t(c.label)}
                {c.key !== 'artist' && (
                  <span className="stauthor"> — {counts[c.key]}</span>
                )}
              </div>
              <div className="sub" style={{ whiteSpace: 'normal' }}>
                {t(c.detail)}
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
          <Icon name="trash" size={15} /> {t('Réinitialiser')}
          {picked.size > 0 ? ` (${pickedLabels.join(', ')})` : '…'}
        </button>
      </div>

      {confirming && (
        <ConfirmSheet
          title={t('Effacer {liste} ?', { liste: pickedLabels.join(', ') })}
          message={t(
            'C’est définitif, il n’y a pas de retour en arrière — et la suppression se propagera à tes autres appareils.',
          )}
          confirmLabel={t('Effacer définitivement')}
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
                // …mais on ne QUITTE pas un groupe qu'on a créé (b212) :
                // on n'en part pas, on le supprime ou on le transmet.
                // Sans ce filtre, la réinitialisation inscrivait mon
                // propre départ de mon propre groupe, et l'onglet Groupes
                // me demandait ensuite de me réinviter moi-même
                // (signalement de Marco).
                .filter((b) => b.owned !== true)
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
            toast.show(t('Réinitialisation faite ✓'));
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
