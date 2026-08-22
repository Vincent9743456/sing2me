/**
 * Réglages & paramètres (#/reglages) — accessible depuis la fiche artiste.
 * Une mission : les actions « de maintenance » du compte, hors du chemin
 * musical quotidien.
 *
 * - Reprendre mes partitions (b220) : appliquer aux morceaux DÉJÀ importés
 *   ce que l'import fait maintenant tout seul — le recalage des accords
 *   (gratuit, hors ligne) puis, au choix, la mise en forme par l'IA.
 * - Export PDF : ouvre le carnet imprimable de la bibliothèque
 *   (#/export-pdf) — « Enregistrer en PDF » du navigateur.
 * - Réinitialisation : l'utilisateur choisit QUOI effacer (profil,
 *   groupes, morceaux, setlists, concerts). Chaque élément effacé est
 *   enterré par id (pierres tombales) pour que la suppression se propage
 *   aux autres appareils sans bloquer un futur ré-import.
 */
import React, { useEffect, useRef, useState } from 'react';

import { useAccount } from '../components/Account';
import { DeleteAccount } from '../components/DeleteAccount';
import { UpgradeSheet } from '../components/UpgradeSheet';
import { useLimits } from '../components/useLimits';
import { PedaleMidi } from '../components/PedaleMidi';
import { ConfirmSheet, useToast } from '../components/Feedback';
import { fusionMiseEnForme } from '../lib/aiFormat';
import { importText } from '../lib/importer';
import { aRemettreEnForme, bilanRecalage, recalerMorceau } from '../lib/reprise';
import {
  appliquerRecuperation,
  candidatsRecuperation,
  verdictRecuperation,
} from '../lib/recupaccords';
import {
  aiCleanText,
  fetchUgTab,
  searchUgTabs,
  ugTabToImportText,
} from '../lib/ug';
import { Icon } from '../components/Icon';
import { AccordionNav, ProgressBar, TopBar } from '../components/ui';
import { rememberLang, storedLang, t } from '../i18n';
import { getValidSession } from '../lib/auth';
import { ensurePublicPage, profilAPublier } from '../lib/publicPages';
import { emptyArtist } from '../types';
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
      'Bibliothèque et propositions. Les morceaux des répertoires de groupe reviendront en propositions 📥.',
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
  const compte = useAccount();
  const [pageBusy, setPageBusy] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  // Mon plan (b381) : compteurs au rendu, feuille « illimité » à la demande.
  const limites = useLimits();
  const [upgradeOuvert, setUpgradeOuvert] = useState(false);

  /**
   * Le réglage n'a de sens que s'il AGIT tout de suite : cocher republie une
   * fiche vide, décocher republie la vraie. Un réglage qui n'attendrait le
   * prochain enregistrement de profil laisserait les données en ligne sans
   * que personne le sache.
   */
  async function basculerPagePublique(masquee: boolean) {
    setPageBusy(true);
    setPageMsg(null);
    try {
      const s = await getValidSession();
      if (!s) throw new Error(t('Connexion requise'));
      await ensurePublicPage(
        s,
        await profilAPublier(store.artist, store.bands, masquee),
      );
      savePrefs({ ...prefs, pagePubliqueMasquee: masquee });
      setPageMsg(
        masquee
          ? t('✓ Ta page n’est plus en ligne.')
          : t('✓ Ta page publique est de nouveau visible.'),
      );
    } catch {
      // On ne coche RIEN si le serveur n'a pas suivi : une case cochée qui
      // n'aurait rien retiré serait un mensonge sur une question de vie
      // privée.
      setPageMsg(
        t('Impossible de joindre le serveur — le réglage n’a pas changé.'),
      );
    } finally {
      setPageBusy(false);
    }
  }
  const { songs, setlists, concerts, bands, resetData, prefs, savePrefs } =
    store;
  const toast = useToast();
  const fichierRef = useRef<HTMLInputElement | null>(null);

  // Sortie de secours du cache hors ligne (b221).
  const [demandeCache, setDemandeCache] = useState(false);

  /**
   * Efface le cache de l'application et recharge. C'est l'assurance-vie du
   * hors-ligne : si une version mise en cache tournait mal, ce bouton la
   * remplace sans avoir à désinstaller quoi que ce soit. Les morceaux, les
   * setlists et les réglages ne sont PAS touchés — ils vivent ailleurs.
   */
  async function viderLeCache() {
    setDemandeCache(false);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const noms = await caches.keys();
        await Promise.all(noms.map((n) => caches.delete(n)));
      }
    } catch {
      // Rien de grave : le rechargement suffit souvent.
    }
    location.reload();
  }

  // Reprise de la bibliothèque déjà importée (b220).
  const [repriseIA, setRepriseIA] = useState<{
    done: number;
    total: number;
    doutes: number;
  } | null>(null);
  const [repriseEnCours, setRepriseEnCours] = useState(false);
  const [demandeIA, setDemandeIA] = useState(false);
  const arretReprise = useRef(false);
  // Retrouver les accords d'origine (b395) : récupération à la source des
  // partitions abîmées par la mise en forme IA d'avant b394.
  const [recupAccords, setRecupAccords] = useState<{
    done: number;
    total: number;
    repares: number;
    accords: number;
  } | null>(null);
  const [recupEnCours, setRecupEnCours] = useState(false);
  const [demandeRecup, setDemandeRecup] = useState(false);
  const arretRecup = useRef(false);
  const candidatsRecup = candidatsRecuperation(songs);
  const bilan = bilanRecalage(songs);
  /**
   * Les deux compteurs se calculent AU RENDU, sur la vraie bibliothèque
   * (b265) : un bouton annonce donc exactement ce qu'il fera, et s'efface
   * quand il n'a plus rien à faire — un compte neuf ne voit pas cette
   * section du tout, elle réapparaît le jour où elle sert.
   */
  const aRemettre = aRemettreEnForme(songs);

  /**
   * Passe 1 — le recalage. Du calcul pur : instantané, hors ligne, sans un
   * centime. Un morceau sans rien à corriger n'est pas réenregistré.
   */
  function recalerTout() {
    let n = 0;
    for (const s of songs) {
      const corrige = recalerMorceau(s);
      if (corrige !== s) {
        store.saveSong(corrige);
        n++;
      }
    }
    toast.show(
      n > 1
        ? t('{n} partitions corrigées.', { n })
        : t('{n} partition corrigée.', { n }),
    );
  }

  /**
   * Passe 2 — la mise en forme par l'IA, morceau par morceau, avec les
   * mêmes garde-fous qu'à l'import : en cas de gros doute, la partition
   * d'avant est conservée et le morceau est marqué « à vérifier ».
   *
   * Interruptible : ce qui est déjà repris reste repris.
   */
  async function reprendreALIA() {
    if (repriseEnCours) return;
    setDemandeIA(false);
    arretReprise.current = false;
    setRepriseEnCours(true);
    // EXACTEMENT la liste annoncée par le bouton (b265) : avant, la passe
    // repassait toute la bibliothèque, donc elle coûtait des appels payants
    // sur des partitions saines et pouvait leur reposer un « à vérifier ».
    const liste = aRemettre;
    let done = 0;
    let doutes = 0;
    // Les ÉCHECS se comptent et se DISENT (b365, constat de Vincent : « ça
    // n'a pas fonctionné »). Avant, un appel IA en échec était avalé par le
    // catch et comptait dans « N partitions reprises » : l'écran annonçait
    // un succès total sur une passe qui n'avait rien changé.
    let echecs = 0;
    setRepriseIA({ done, total: liste.length, doutes });
    for (const vieux of liste) {
      if (arretReprise.current) break;
      try {
        const hint = [vieux.title, vieux.artist]
          .filter((x) => x.trim() !== '')
          .join(' — ');
        const local = importText(vieux.lyrics, vieux.title || t('Morceau'));
        const propre = await aiCleanText(vieux.lyrics, hint || undefined);
        const apres = importText(propre, vieux.title || t('Morceau'));
        const mef = fusionMiseEnForme(vieux.lyrics, local, propre, apres);
        if (mef.doute !== '') doutes++;
        // On ne remplace QUE la partition : titre, artiste, notes, cœurs,
        // setlists et statut restent ceux du morceau qu'on avait.
        store.saveSong({
          ...vieux,
          lyrics: mef.song.lyrics,
          structure: mef.song.structure,
          key: mef.song.key !== '' ? mef.song.key : vieux.key,
          capo: mef.song.capo,
          needsCheck: mef.song.needsCheck,
          beforeAi: mef.song.beforeAi,
          versions: vieux.versions.map((v) =>
            v.id === vieux.activeVersionId
              ? {
                  ...v,
                  lyrics: mef.song.lyrics,
                  structure: mef.song.structure,
                  key: mef.song.key !== '' ? mef.song.key : v.key,
                  capo: mef.song.capo,
                }
              : v,
          ),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Un échec ne casse rien : le morceau reste tel qu'il était —
        // mais il se COMPTE, et le bilan le dira.
        echecs++;
      }
      done++;
      setRepriseIA({ done, total: liste.length, doutes });
    }
    setRepriseEnCours(false);
    const reprises = done - echecs;
    const morceaux =
      reprises === 1
        ? t('{n} partition reprise', { n: reprises })
        : t('{n} partitions reprises', { n: reprises });
    const parts = [morceaux];
    if (doutes > 0) parts.push(t('{d} à vérifier', { d: doutes }));
    if (echecs > 0)
      parts.push(t('{e} en échec — réessaie dans un moment', { e: echecs }));
    toast.show(parts.join(' · ') + '.');
  }

  /** La source limite le débit (429) : reprises avec attente progressive. */
  async function avecReprises<T>(f: () => Promise<T>): Promise<T> {
    for (let essai = 0; ; essai++) {
      try {
        return await f();
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (!msg.includes('429') || essai >= 3 || arretRecup.current) throw e;
        const attente = [5, 15, 30][essai] ?? 30;
        await new Promise((r) => setTimeout(r, attente * 1000));
      }
    }
  }

  /**
   * RETROUVER LES ACCORDS D'ORIGINE (b395). Chaque morceau est recherché à
   * la source (titre + artiste), la partition trouvée est relue par
   * l'analyse 100 % LOCALE — aucun appel IA — et le contenu n'est remplacé
   * que sur preuve écrasante (`verdictRecuperation` : mêmes paroles, mêmes
   * accords au même endroit, chacun simplement appauvri — G pour G9).
   * Tout le reste est écarté et compté. Interruptible : ce qui est réparé
   * reste réparé.
   */
  async function retrouverAccords() {
    if (recupEnCours) return;
    setDemandeRecup(false);
    arretRecup.current = false;
    setRecupEnCours(true);
    const liste = candidatsRecup;
    let done = 0;
    let repares = 0;
    let accords = 0;
    let identiques = 0;
    let ecartes = 0;
    let echecs = 0;
    setRecupAccords({ done, total: liste.length, repares, accords });
    for (const vieux of liste) {
      if (arretRecup.current) break;
      try {
        const q = [vieux.title, vieux.artist]
          .filter((x) => x.trim() !== '')
          .join(' ');
        const resultats = await avecReprises(() => searchUgTabs(q));
        const tries = resultats
          .filter((r) => /chord/i.test(r.type))
          .sort((a, b) => b.votes - a.votes);
        if (tries.length === 0) {
          // Introuvable à la source : une composition, un titre trop rare —
          // le morceau reste tel quel, il compte parmi les écartés.
          ecartes++;
        } else {
          const tab = await avecReprises(() => fetchUgTab(tries[0].url));
          const releve = importText(ugTabToImportText(tab), vieux.title);
          const verdict = verdictRecuperation(vieux, releve);
          if (verdict.verdict === 'reparer') {
            store.saveSong(appliquerRecuperation(vieux, releve));
            repares++;
            accords += verdict.accords;
          } else if (verdict.verdict === 'identique') {
            identiques++;
          } else {
            ecartes++;
          }
        }
      } catch {
        // Un échec réseau ne casse rien : le morceau reste tel qu'il était —
        // mais il se compte, et le bilan le dira (cicatrice b365).
        echecs++;
      }
      done++;
      setRecupAccords({ done, total: liste.length, repares, accords });
      // Courtoisie envers la source entre deux morceaux (évite le 429).
      if (!arretRecup.current && done < liste.length) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setRecupEnCours(false);
    const accordsTxt =
      accords === 1
        ? t('1 accord retrouvé')
        : t('{a} accords retrouvés', { a: accords });
    const parts = [
      (repares === 1
        ? t('1 partition réparée')
        : t('{n} partitions réparées', { n: repares })) +
        (repares > 0 ? ` (${accordsTxt})` : ''),
    ];
    if (identiques > 0) parts.push(t('{n} déjà fidèles', { n: identiques }));
    if (ecartes > 0)
      parts.push(t('{n} écartées — preuve insuffisante', { n: ecartes }));
    if (echecs > 0)
      parts.push(t('{e} en échec — réessaie dans un moment', { e: echecs }));
    toast.show(parts.join(' · ') + '.');
  }

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
        {/* SOMBRE / CLAIR (b233) — déménagé ici en b354 (demande de
            Vincent, remplace la barre d'outils de Morceaux, b234). Le
            sombre reste l'identité de l'app ; le clair est la sortie pour
            le plein jour, et s'applique à TOUTE l'app. */}
        <h2 className="pagetitle" style={{ marginTop: 0 }}>
          {t('Thème de l’application')}
        </h2>
        <div className="chips">
          <button
            className={`chip ${prefs.theme !== 'clair' ? '' : 'off'}`}
            onClick={() => savePrefs({ ...prefs, theme: 'sombre' })}
          >
            {t('🌙 Sombre (scène)')}
          </button>
          <button
            className={`chip ${prefs.theme === 'clair' ? '' : 'off'}`}
            onClick={() => savePrefs({ ...prefs, theme: 'clair' })}
          >
            {t('☀️ Clair (plein jour)')}
          </button>
        </div>
        <div className="spacer" />

        {/* Langue de l'interface (b156) : automatique = langue du
            téléphone. Les contenus musicaux ne sont JAMAIS traduits. */}
        <h2 className="pagetitle">
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

        {/* REPRENDRE MES PARTITIONS (b220, demande de Vincent) —
            appliquer aux morceaux DÉJÀ importés ce que l'import fait
            maintenant tout seul. Deux passes séparées : elles n'ont ni le
            même coût, ni le même risque. */}
        <div className="spacer" />
        <h2 className="pagetitle">{t('Application')}</h2>
        <AccordionNav
          title={t('↻ Recharger l’application')}
          sub={t(
            'Récupère la dernière version. Tes morceaux, setlists et réglages ne sont pas touchés',
          )}
          onClick={() => setDemandeCache(true)}
        />
        <p className="help">
          {t(
            'Ton répertoire s’ouvre sans réseau : l’application est gardée sur ton téléphone. Si elle se comporte bizarrement après une mise à jour, ce bouton la remet à neuf.',
          )}
        </p>

        {/* Pédale MIDI (b296) — masquée d'elle-même si le navigateur ne
            connaît pas le MIDI. */}
        <PedaleMidi />

        {/* SECTION QUI SE LÈVE TOUTE SEULE (b265) : elle n'apparaît que
            s'il y a réellement quelque chose à reprendre — ou tant qu'une
            reprise est en cours / vient de finir, sinon sa barre de
            progression disparaîtrait sous les yeux au moment où le compteur
            retombe à zéro. */}
        {(bilan.accords > 0 ||
          aRemettre.length > 0 ||
          repriseIA !== null ||
          candidatsRecup.length > 0 ||
          recupAccords !== null) && (
          <>
            <div className="spacer" />
            <h2 className="pagetitle">{t('Reprendre mes partitions')}</h2>
            <p className="help" style={{ marginTop: 0 }}>
              {t(
                'Applique à ta bibliothèque ce que l’import fait désormais tout seul. Rien d’autre n’est touché : titres, artistes, notes, cœurs et setlists restent tels quels.',
              )}
            </p>
            {bilan.accords > 0 && (
              <AccordionNav
                title={t('🎯 Recaler les accords sur les mots')}
                sub={
                  bilan.accords === 1
                    ? t(
                        '1 accord tombe au milieu d’un mot — gratuit et hors ligne',
                      )
                    : bilan.morceaux === 1
                      ? t(
                          '{a} accords tombent au milieu d’un mot, dans 1 morceau — gratuit et hors ligne',
                          { a: bilan.accords },
                        )
                      : t(
                          '{a} accords tombent au milieu d’un mot, dans {m} morceaux — gratuit et hors ligne',
                          { a: bilan.accords, m: bilan.morceaux },
                        )
                }
                onClick={recalerTout}
              />
            )}
            {aRemettre.length > 0 && (
              <AccordionNav
                title={t('✨ Remettre en forme à l’IA')}
                sub={
                  aRemettre.length === 1
                    ? t(
                        '1 partition n’a aucune section repérée — l’IA retrouve couplets et refrains',
                      )
                    : t(
                        '{n} partitions n’ont aucune section repérée — l’IA retrouve couplets et refrains',
                        { n: aRemettre.length },
                      )
                }
                onClick={() => setDemandeIA(true)}
              />
            )}
            {/* Retrouver les accords d'origine (b395) : le dégât d'avant
                b394 ne se voit pas en local (un G qui devrait être G9 est
                un accord parfaitement valable) — seul un retour à la source
                peut le prouver. Le bouton reste donc visible tant qu'il y a
                des morceaux à vérifier : il ne promet pas des réparations,
                il promet une vérification. */}
            {candidatsRecup.length > 0 && (
              <AccordionNav
                title={t('🎸 Retrouver les accords d’origine')}
                sub={
                  candidatsRecup.length === 1
                    ? t(
                        '1 morceau est vérifié à la source — seuls les accords prouvés sont corrigés, avec retour en arrière possible',
                      )
                    : t(
                        '{n} morceaux sont vérifiés à la source — seuls les accords prouvés sont corrigés, avec retour en arrière possible',
                        { n: candidatsRecup.length },
                      )
                }
                onClick={() => setDemandeRecup(true)}
              />
            )}
            {recupAccords && (
              <ProgressBar
                done={recupAccords.done}
                total={recupAccords.total}
                label={
                  recupEnCours
                    ? recupAccords.repares === 0
                      ? t('Vérification à la source…')
                      : recupAccords.repares === 1
                        ? t('Vérification à la source… 1 partition réparée')
                        : t(
                            'Vérification à la source… {n} partitions réparées',
                            { n: recupAccords.repares },
                          )
                    : t('Vérification terminée')
                }
              />
            )}
            {recupEnCours && (
              <button
                className="btn ghost block"
                onClick={() => {
                  arretRecup.current = true;
                }}
              >
                {t('Arrêter la vérification')}
              </button>
            )}
            {recupAccords !== null &&
              !recupEnCours &&
              recupAccords.repares > 0 && (
                <p className="help">
                  ↩{' '}
                  {t(
                    'Chaque morceau réparé garde sa partition d’avant : « Revenir à ma partition d’origine » dans son menu ⋯.',
                  )}
                </p>
              )}
            {repriseIA && (
              <ProgressBar
                done={repriseIA.done}
                total={repriseIA.total}
                label={
                  repriseEnCours ? t('Reprise en cours') : t('Reprise terminée')
                }
              />
            )}
            {repriseEnCours && (
              <button
                className="btn ghost block"
                onClick={() => {
                  arretReprise.current = true;
                }}
              >
                {t('Arrêter la reprise')}
              </button>
            )}
            {repriseIA !== null && !repriseEnCours && repriseIA.doutes > 0 && (
              <p className="help" style={{ color: 'var(--warn)' }}>
                🔎{' '}
                {t(
                  '{n} partitions sont marquées « à vérifier » : retrouve-les dans tes morceaux, avec le choix de revenir à la version d’origine.',
                  { n: repriseIA.doutes },
                )}
              </p>
            )}
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

        {/* MON COMPTE (b381, habillé b384 d'après les maquettes de Vincent) :
            l'offre, l'usage en jauges, et la porte vers l'illimité. Jamais
            de prix : les chiffres de l'offre ne sont pas arrêtés. */}
        {compte?.email != null && (
          <>
            <div className="spacer" />
            <h2 className="pagetitle">{t('Mon compte')}</h2>
            {limites.maxMorceaux === null && limites.maxSpectateurs === null ? (
              /* Scène (ou fondateur) : tout est sans plafond. */
              <div className="card">
                <div className="usagerow">
                  <strong>{t('Ton offre')}</strong>
                  <span className="planbadge">{t('Scène')}</span>
                </div>
                <p className="help" style={{ marginBottom: 0 }}>
                  {t(
                    '✦ Morceaux et salle de live sans plafond. Merci de faire vivre mojosong !',
                  )}
                </p>
              </div>
            ) : limites.maxMorceaux === null ? (
              /* Musicien : morceaux illimités, salle de live à 15 places. */
              <div className="card">
                <div className="usagerow">
                  <strong>{t('Ton offre')}</strong>
                  <span className="planbadge">{t('Musicien')}</span>
                </div>
                <p className="help" style={{ marginBottom: 0 }}>
                  {t(
                    '✦ Morceaux sans plafond · live jusqu’à {n} spectateurs en simultané.',
                    { n: limites.maxSpectateurs ?? 15 },
                  )}
                </p>
              </div>
            ) : (
              <>
                <div className="card">
                  <div className="usagerow">
                    <strong>{t('Ton offre')}</strong>
                    <span className="planbadge">{t('Compte gratuit')}</span>
                  </div>
                  <p className="help" style={{ marginBottom: 0 }}>
                    {t('Tu profites de mojosong gratuitement.')}
                  </p>
                </div>
                <p className="eyebrow">{t('Ton usage')}</p>
                <div className="card">
                  <div className="usagerow">
                    <strong>{t('Morceaux')}</strong>
                    <span>
                      <strong>{limites.morceaux}</strong>
                      <span className="usagemax"> / {limites.maxMorceaux}</span>
                    </span>
                  </div>
                  <div
                    className="progressbar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={limites.maxMorceaux}
                    aria-valuenow={limites.morceaux}
                    aria-label={t('Morceaux')}
                  >
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (limites.morceaux / limites.maxMorceaux) * 100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="card">
                  <div className="uprow" style={{ marginBottom: 8 }}>
                    <span className="upcheck" aria-hidden="true">
                      ✓
                    </span>
                    {t('Groupes et setlists : sans limite')}
                  </div>
                  <div className="uprow">
                    <span className="upcheck" aria-hidden="true">
                      ✓
                    </span>
                    {limites.maxSpectateurs !== null
                      ? t('Live : jusqu’à {n} spectateurs en simultané', {
                          n: limites.maxSpectateurs,
                        })
                      : t('Live : salle illimitée')}
                  </div>
                </div>
                <button
                  className="btn block"
                  onClick={() => setUpgradeOuvert(true)}
                >
                  {t('Passer en illimité')}
                </button>
                <p className="help" style={{ textAlign: 'center' }}>
                  {t('Débloque les morceaux illimités.')}
                </p>
              </>
            )}
          </>
        )}

        {/* MA PAGE PUBLIQUE EN LIGNE OU NON (b262, demande de Vincent :
            « prévoir dans les réglages que la page publique puisse ne pas
            être disponible en ligne à la demande de l'utilisateur. Par
            défaut, visible, mais option avec une case à cocher pour la
            rendre invisible »).

            Cocher ne CACHE pas la fiche : elle est RETIRÉE du serveur, et
            republiée telle quelle en décochant. Photo, bio, liens et
            pourboire ne restent alors nulle part en ligne — « invisible »
            doit vouloir dire absent. L'adresse, elle, reste réservée. */}
        {compte?.email != null && (
          <>
            <div className="spacer" />
            <h2 className="pagetitle">{t('Ma page publique')}</h2>
            <label
              className="row"
              style={{ alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={prefs.pagePubliqueMasquee === true}
                style={{ width: 20, height: 20, marginTop: 2, flexShrink: 0 }}
                disabled={pageBusy}
                onChange={(e) => void basculerPagePublique(e.target.checked)}
              />
              <div className="grow">
                <div className="title">
                  {t('Rendre ma page publique invisible')}
                </div>
                <div className="sub" style={{ whiteSpace: 'normal' }}>
                  {t(
                    'Ta fiche est retirée du serveur : photo, présentation, liens et pourboire ne sont plus en ligne. Ton adresse reste réservée, et un concert en direct reste visible par le public.',
                  )}
                </div>
              </div>
            </label>
            {pageMsg !== null && <p className="help">{pageMsg}</p>}
          </>
        )}

        {/* SUPPRIMER SON COMPTE (b261, demande de Vincent : « c'est important
            pour les utilisateurs de pouvoir supprimer toutes les données »).
            Tout en bas, après la sauvegarde et la réinitialisation : on ne
            tombe pas dessus par hasard, et on a croisé la sortie de secours
            (l'export) avant d'y arriver. */}
        {compte?.email != null && (
          <>
            <div className="spacer" />
            <h2 className="pagetitle">{t('Supprimer mon compte')}</h2>
            <p className="help">
              {t(
                'Efface définitivement ce compte et tout ce qu’il contient sur nos serveurs. Réinitialiser (ci-dessus) vide les données mais garde le compte ; ceci supprime les deux.',
              )}
            </p>
            <DeleteAccount email={compte.email} />
          </>
        )}
      </div>

      {upgradeOuvert && (
        <UpgradeSheet motif={null} onClose={() => setUpgradeOuvert(false)} />
      )}

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
            /*
             * LA PAGE PUBLIÉE SUIT LE PROFIL EFFACÉ (b262, constat de
             * Vincent : après une réinitialisation du profil, sa page
             * publique contenait encore photo, liens et pourboire — c'est
             * même ce que la bannière de récupération lui proposait de
             * rendre).
             *
             * La fiche publiée est un FILET (b243) contre une perte
             * ACCIDENTELLE. Une réinitialisation, elle, est délibérée :
             * laisser en ligne ce qu'on vient d'effacer, c'est laisser
             * public ce que l'utilisateur croit supprimé. On vide donc la
             * fiche, en gardant l'adresse réservée.
             */
            if (parts.artist === true) {
              void (async () => {
                try {
                  const s = await getValidSession();
                  if (!s) return;
                  await ensurePublicPage(
                    s,
                    await profilAPublier(emptyArtist(), [], true),
                  );
                } catch {
                  // best-effort : l'effacement local a eu lieu de toute façon
                }
              })();
            }
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
      {demandeCache && (
        <ConfirmSheet
          title={t('Recharger l’application ?')}
          message={t(
            'L’application est retéléchargée dans sa dernière version. Tes morceaux, tes setlists, tes groupes et tes réglages restent exactement où ils sont. Il te faut du réseau le temps du rechargement.',
          )}
          confirmLabel={t('Recharger')}
          onConfirm={() => void viderLeCache()}
          onClose={() => setDemandeCache(false)}
        />
      )}
      {demandeIA && (
        <ConfirmSheet
          /* Le compte annoncé ici est CELUI qui sera traité (b265) : la
             feuille disait « toute la bibliothèque » et affichait le nombre
             total de morceaux, alors que la passe en filtrait déjà une
             partie. On promet ce qu'on fait, y compris dans le bouton. */
          title={
            aRemettre.length === 1
              ? t('Remettre en forme 1 partition ?')
              : t('Remettre en forme {n} partitions ?', {
                  n: aRemettre.length,
                })
          }
          message={t(
            'Seules les partitions qu’aucune section ne découpe sont reprises, une par une. Tu peux arrêter en cours de route : ce qui est repris reste repris. Quand la mise en forme laisse un doute, le morceau est marqué « à vérifier » et tu pourras revenir à sa version d’origine.',
          )}
          confirmLabel={
            aRemettre.length === 1
              ? t('Reprendre 1 morceau')
              : t('Reprendre les {n} morceaux', { n: aRemettre.length })
          }
          onConfirm={() => void reprendreALIA()}
          onClose={() => setDemandeIA(false)}
        />
      )}
      {demandeRecup && (
        <ConfirmSheet
          title={
            candidatsRecup.length === 1
              ? t('Vérifier 1 morceau à la source ?')
              : t('Vérifier {n} morceaux à la source ?', {
                  n: candidatsRecup.length,
                })
          }
          message={t(
            'Certaines mises en forme passées ont pu simplifier des accords (un G9 devenu G) ou les décaler. Chaque morceau est recherché par titre et artiste, puis relu sans IA. Ta partition n’est remplacée que si les paroles sont identiques et que chaque accord retrouvé enrichit le tien — au moindre doute, rien ne bouge. Les morceaux réparés gardent leur partition d’avant, pour revenir en arrière d’un geste. C’est long (quelques secondes par morceau) et tu peux arrêter en cours de route.',
          )}
          confirmLabel={t('Lancer la vérification')}
          onConfirm={() => void retrouverAccords()}
          onClose={() => setDemandeRecup(false)}
        />
      )}
    </>
  );
}
