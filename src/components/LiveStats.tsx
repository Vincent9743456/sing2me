/**
 * Statistiques des directs, sur la fiche Artiste (b171).
 *
 * Pourquoi ce composant : ces chiffres étaient enfermés dans le mode
 * « Modifier » de la fiche, derrière un bouton « Voir les statistiques ».
 * Consulter ses résultats n'a rien à voir avec modifier son profil — on les
 * affiche donc en lecture, et on les charge tout seul.
 *
 * PRIVÉ par construction : ce composant vit dans l'onglet Artiste de l'app
 * (compte obligatoire) et n'est importé par aucune page publique. Rien de ce
 * qui est ici ne doit jamais apparaître sur la page du QR.
 *
 * Réduit à l'ESSENTIEL (b310, demande de Vincent) : quatre chiffres, rien
 * d'autre. Le détail replié (morceau par morceau, séances, fanbase, bouton
 * de report manuel) a été retiré — les ❤ et les mots du public descendent
 * de toute façon tout seuls dans la bibliothèque, et l'historique des lives
 * porte déjà le détail par concert. Un écran = une mission.
 *
 * INSTANTANÉ depuis b382 (« Pb de chargement des stats (très lent) »,
 * constat de Vincent) : ce composant refaisait SA propre récupération
 * réseau à chaque ouverture de l'onglet — « Chargement… » le temps du
 * réveil du serveur, alors que l'onglet Live affichait les mêmes chiffres
 * immédiatement depuis le cache b343. C'était précisément la divergence
 * que b207 avait notée (« trois écrans, les mêmes chiffres, un seul
 * calcul ») : il passe donc par `usePastLives`, le crochet commun — cache
 * affiché tout de suite, rafraîchissement silencieux derrière. Les
 * suiveurs, qui viennent d'un autre service (fanbase), gagnent le même
 * réflexe avec leur propre petit cache.
 */
import React, { useEffect, useRef } from 'react';

import { useToast } from './Feedback';
import { t } from '../i18n';
import { heartTotals, messagesBySong } from '../lib/live';
import { usePastLives } from './usePastLives';
import { useStore } from '../store';

/**
 * SUIVEURS : tuile RETIRÉE (b452, demande de Vincent). Le compteur existait
 * (service fanbase, cache `sing2me/fanCache`) mais l'interface PUBLIQUE qui
 * permet au public de suivre un artiste n'est pas développée : un chiffre
 * qui ne peut pas bouger n'informe pas, il interroge. Le module
 * `lib/fanbase.ts` et le serveur restent en place pour le jour où le suivi
 * s'ouvre au public — la tuile reviendra avec lui.
 */
export function LiveStats() {
  const { songs, saveSong } = useStore();
  const toast = useToast();
  // UNE récupération, UN calcul (b207) : exactement les lives de l'onglet
  // Live — cache instantané compris (b343). Plus de fetch parallèle ici.
  const { lives, stats, messages, loading, failed, ready } = usePastLives();

  // Report AUTOMATIQUE (instruction Vincent, b175) : les ❤ descendaient déjà
  // tout seuls dans la bibliothèque, les mots du public attendaient un clic.
  // Dès que les chiffres sont là, les deux sont recopiés — sans rien dire,
  // c'est de la tenue de livres, pas une action de l'artiste.
  const reporte = useRef(false);
  useEffect(() => {
    if (loading || stats === null || messages === null) return;
    if (reporte.current) return;
    reporte.current = true;
    reporter(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, stats, messages]);

  // Le direct n'est pas configuré : rien à montrer, et surtout rien à
  // expliquer ici — le réglage vit dans « Modifier ».
  if (!ready) return null;

  /*
   * TOUS les chiffres de cette carte viennent de MES lives — la même liste
   * que l'onglet Live, à la ligne près (b182, complété b203, unifié b382 :
   * c'est littéralement la même donnée, servie par le même crochet).
   */
  const nbLives = lives.length;
  const totalHearts = lives.reduce((n, l) => n + l.hearts, 0);
  const totalPublic = lives.reduce((n, l) => n + l.uniques, 0);
  // Même règle : les mots comptés sont ceux de MES lives.
  const nbMessages = lives.reduce((n, l) => n + l.messages.length, 0);
  const rien =
    !loading &&
    !failed &&
    nbLives === 0 &&
    totalHearts === 0 &&
    totalPublic === 0 &&
    nbMessages === 0;

  /** Recopie ❤ et mots du public sur les morceaux de la bibliothèque. */
  function reporter(silencieux = false) {
    const totals = heartTotals(stats ?? []);
    const bySong = messagesBySong(messages ?? []);
    let n = 0;
    for (const s of songs) {
      const total = totals.get(s.title);
      const known = new Set(s.fanMessages.map((m) => m.id));
      const fresh = bySong
        .get(s.title)
        .map((m) => ({
          id: `${m.created_at}|${m.author}|${m.body.slice(0, 40)}`,
          author: m.author,
          text: m.body,
          createdAt: m.created_at,
        }))
        .filter((m) => !known.has(m.id));
      const heartsChanged = total !== undefined && total !== s.hearts;
      if (heartsChanged || fresh.length > 0) {
        saveSong({
          ...s,
          hearts: heartsChanged ? (total as number) : s.hearts,
          fanMessages: [...s.fanMessages, ...fresh],
        });
        n++;
      }
    }
    if (silencieux) return; // report de fond : pas de bandeau intempestif
    toast.show(
      n === 0
        ? t('La bibliothèque est déjà à jour.')
        : n > 1
          ? t('❤ et messages reportés sur {n} morceaux.', { n })
          : t('❤ et messages reportés sur {n} morceau.', { n }),
    );
  }

  return (
    <>
      <h2 className="pagetitle">{t('Tes lives')}</h2>
      {loading && stats === null ? (
        <p className="help">{t('Chargement…')}</p>
      ) : failed && stats === null ? (
        <p className="help">
          {t('Chiffres indisponibles pour l’instant — ils reviendront.')}
        </p>
      ) : rien ? (
        <p className="help">{t('Pas encore de données — lance un live !')}</p>
      ) : (
        <>
          <div className="statgrid">
            <div className="statcard">
              <div className="statvalue">{nbLives}</div>
              <div className="statlabel">🔴 {t('lives joués')}</div>
            </div>
            <div className="statcard">
              <div className="statvalue">{totalHearts}</div>
              <div className="statlabel">❤ {t('reçus')}</div>
            </div>
            <div className="statcard">
              <div className="statvalue">{totalPublic}</div>
              <div className="statlabel">
                👥 {t('spectateurs (toutes séances)')}
              </div>
            </div>
          </div>
        </>
      )}
      <div className="spacer" />
    </>
  );
}
