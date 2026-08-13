/**
 * Conditions d'utilisation (version simple, lisible par un musicien).
 * Point clé juridique : les partitions importées restent la responsabilité
 * de l'utilisateur ; mojosong héberge des sauvegardes privées et fournit un
 * canal de signalement/retrait aux ayants droit.
 */
import React from 'react';

import { TopBar } from '../components/ui';
import { getLang, t } from '../i18n';
import { navigate } from '../router';

const CONTACT = 'vtessier6@gmail.com';

export function Terms() {
  return (
    <>
      <TopBar
        title={t("Conditions d'utilisation")}
        onBack={() => history.back()}
      />
      <div className="page" style={{ maxWidth: 760 }}>
        {/* Décision Vincent : les CGU restent EN FRANÇAIS (texte
            juridique). En anglais, on le dit clairement plutôt que de
            laisser croire à un oubli de traduction. */}
        {getLang() === 'en' && (
          <p className="help" style={{ marginTop: 0 }}>
            {t(
              'Ces conditions ne sont disponibles qu’en français pour le moment — la version française fait foi.',
            )}
          </p>
        )}
        <p className="help">
          Version simple et de bonne foi — elle sera précisée avec le
          développement de l'application.
        </p>

        <h2 className="pagetitle">Ce qu'est mojosong</h2>
        <p>
          mojosong est le compagnon des musiciens, des groupes et de leurs
          concerts : bibliothèque de partitions, setlists, mode scène,
          partage avec le groupe et avec le public. L'application est
          gratuite et fournie « telle quelle », sans garantie de
          disponibilité.
        </p>

        <h2 className="pagetitle">Tes partitions, ta responsabilité</h2>
        <p>
          Les paroles et accords que tu importes restent stockés sur ton
          appareil ; si tu crées un compte, une copie de sauvegarde privée
          est conservée pour toi (elle n'est ni consultée, ni partagée, ni
          utilisée à d'autres fins). En important un contenu, tu confirmes
          disposer du droit de l'utiliser dans ce cadre : répertoire
          personnel et travail avec ton groupe. La diffusion publique de
          paroles (QR de concert, pages de partage public) se fait sous la
          responsabilité de l'artiste qui la déclenche.
        </p>

        <h2 className="pagetitle">Ayants droit — signalement</h2>
        <p>
          Titulaire de droits sur un contenu diffusé publiquement via
          mojosong ? Écris à <a href={`mailto:${CONTACT}`}>{CONTACT}</a> en
          indiquant le lien concerné : le contenu signalé sera retiré
          rapidement.
        </p>

        <h2 className="pagetitle">Ton compte et tes données</h2>
        <p>
          Le compte (facultatif — l'application fonctionne sans) ne demande
          qu'un email, utilisé uniquement pour la connexion. Les données
          synchronisées sont ta bibliothèque et ton profil, hébergées chez
          Supabase. Tu peux demander la suppression de ton compte et de ses
          données à l'adresse ci-dessus. Les interactions du public
          (cœurs, messages) sont rattachées à l'artiste destinataire.
        </p>

        <h2 className="pagetitle">Esprit du service</h2>
        <p>
          mojosong est fait pour aider les musiciens à jouer, répéter et
          partager la musique avec leur public — pas pour diffuser des
          catalogues de partitions. Tout usage manifestement contraire à
          cet esprit (revente, diffusion massive de contenus protégés…)
          peut entraîner la fermeture du compte.
        </p>

        <h2 className="pagetitle">Signaler un contenu</h2>
        <p>
          Un contenu ne devrait pas être là (droits d'auteur, contenu
          inapproprié…) ? Signale-le : nous nous engageons à examiner chaque
          demande et à retirer rapidement ce qui doit l'être.
        </p>
        <button
          className="btn ghost block"
          onClick={() => navigate('/report')}
        >
          Signaler un contenu
        </button>

        <div className="spacer" />
        <button className="btn ghost block" onClick={() => navigate('/')}>
          ← Retour à l'application
        </button>
      </div>
    </>
  );
}
