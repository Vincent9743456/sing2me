/**
 * Conditions d'utilisation (version simple, lisible par un musicien).
 *
 * Réécrites en b487 (demande de Vincent : « réanalyse les CGV au regard des
 * évolutions de l'application ») — les points corrigés :
 * - l'app n'est plus « gratuite » tout court : trois offres (b387/b454),
 *   paiement en ligne pas encore ouvert, règles de dépassement (b422) ;
 * - le compte n'est plus « facultatif » (obligatoire depuis b120) ;
 * - la suppression du compte se fait DANS l'app (b261), plus par e-mail ;
 * - le SIGNALEMENT ne promet plus de « retirer le contenu » : mojosong est
 *   un hébergeur technique qui ne consulte pas les bibliothèques privées
 *   (positionnement de Vincent — « difficile de promettre de les retirer ») ;
 *   ce qu'on peut couper, et vite, c'est la DIFFUSION PUBLIQUE (page,
 *   direct, lien de partage), et fermer un compte en cas d'abus ;
 * - ajouts : IA embarquées (mise en forme, dictée — audio jamais conservé),
 *   e-mails de service, pourboires sans commission, groupes.
 *
 * Les CGU restent EN FRANÇAIS uniquement (décision Vincent) — la version
 * française fait foi. Les TARIFS ne sont pas recopiés ici : ils vivent déjà
 * à quatre endroits à changer ensemble (limites.ts, plans.sql,
 * depassement.js, landing) — les CGU renvoient à la page « Changer de
 * plan », qui fait foi au jour le jour.
 */
import React from 'react';

import { TopBar } from '../components/ui';
import { getLang, t } from '../i18n';
import { navigate } from '../router';

const CONTACT = 'marco@mojosong.com';

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
          Version simple et de bonne foi — mise à jour au fil du
          développement de l'application. Dernière mise à jour : 31 août
          2026.
        </p>

        <h2 className="pagetitle">Ce qu'est mojosong</h2>
        <p>
          mojosong est le compagnon des musiciens, des groupes et de leurs
          concerts : bibliothèque de partitions, setlists, mode scène,
          travail en groupe et direct partagé avec le public. C'est un
          outil personnel, pas un catalogue : mojosong ne fournit aucune
          bibliothèque de partitions, ne propose aucune recherche dans les
          contenus des autres utilisateurs, et ne mutualise rien entre
          comptes. L'application est fournie « telle quelle », sans
          garantie de disponibilité.
        </p>

        <h2 className="pagetitle">Tes partitions, ta responsabilité</h2>
        <p>
          Ta bibliothèque vit d'abord sur ton appareil. Ton compte y ajoute
          une sauvegarde privée synchronisée entre tes appareils : elle
          n'est ni consultée, ni indexée, ni partagée, ni utilisée à
          d'autres fins — et jamais pour entraîner une IA. En important un
          contenu, tu confirmes disposer du droit de l'utiliser dans ce
          cadre : ton répertoire personnel et le travail avec ton groupe
          (le répertoire d'un groupe ne circule qu'entre ses membres). La
          diffusion publique de paroles (QR de concert, page publique,
          liens de partage) se fait sous la responsabilité de l'artiste qui
          la déclenche.
        </p>

        <h2 className="pagetitle">Ce que mojosong héberge — et ne fait pas</h2>
        <p>
          mojosong est un hébergeur technique : tes données transitent
          chiffrées (HTTPS) et sont stockées chez notre prestataire
          (Supabase), chiffrées au repos par son infrastructure. Nous ne
          consultons pas et ne modérons pas les bibliothèques privées — ce
          sont tes sauvegardes, pas nos contenus. C'est aussi pour cela que
          mojosong ne peut pas « retirer une partition » d'une bibliothèque
          privée : il n'y a pas accès en pratique, et ce n'est pas son
          rôle.
        </p>

        <h2 className="pagetitle">Signalement — ce qui est public</h2>
        <p>
          Un signalement porte sur ce qui est <strong>accessible
          publiquement</strong> via mojosong : une page d'artiste ou de
          groupe, un direct, une page de partage. Titulaire de droits ou
          témoin d'un contenu inapproprié ? Écris à{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> avec le lien
          concerné, ou utilise le formulaire ci-dessous : chaque demande
          est examinée, et la diffusion publique d'un contenu qui ne
          devrait pas s'y trouver peut être coupée rapidement — jusqu'à la
          suspension de la page ou du compte en cas d'abus manifeste.
        </p>
        <button
          className="btn ghost block"
          onClick={() => navigate('/report')}
        >
          Signaler un contenu
        </button>

        <h2 className="pagetitle">Offres et paiement</h2>
        <p>
          mojosong propose une offre gratuite (bibliothèque et salle de
          concert plafonnées — les plafonds en vigueur sont affichés dans
          l'application) et deux offres payantes, « musicien » et
          « scène ». Les tarifs en vigueur sont affichés dans
          l'application (page « Changer de plan ») et sur mojosong.com. Le
          paiement en ligne n'est pas encore ouvert : à son lancement, ces
          conditions seront complétées (conditions de vente, droit de
          rétractation) ; d'ici là, aucun prélèvement n'existe.
        </p>
        <p>
          Trois principes valent dès maintenant et survivront au
          paiement : <strong>jamais de coupure en plein concert</strong> ;
          un retour au plan gratuit au-dessus du plafond ouvre une période
          de 30 jours pendant laquelle tout reste consultable et
          exportable ; et <strong>rien n'est pris en otage</strong> — tu
          peux exporter toute ta bibliothèque à tout moment depuis les
          Réglages.
        </p>

        <h2 className="pagetitle">Ton compte et tes données</h2>
        <p>
          Un compte (une adresse e-mail, utilisée pour la connexion) est
          nécessaire pour utiliser l'application ; une fois connectée, elle
          fonctionne aussi hors ligne. Les données synchronisées sont ta
          bibliothèque, tes setlists, tes groupes et ton profil. mojosong
          t'envoie des e-mails de service (invitation à un groupe, résumé
          de la discussion d'un groupe, avis liés à ton offre) ; les
          communications non indispensables reposent sur un consentement
          séparé, jamais pré-coché. Les interactions du public pendant un
          concert (cœurs, messages) sont anonymes — un identifiant
          d'appareil, pas un compte — et rattachées à l'artiste
          destinataire.
        </p>
        <p>
          Tu peux supprimer ton compte et toutes ses données
          <strong> depuis l'application</strong> (Réglages, tout en bas) :
          l'inventaire de ce qui sera effacé t'est annoncé avant
          confirmation — y compris les groupes qui seraient dissous et
          l'adresse publique qui serait libérée. La même demande peut être
          faite par e-mail à l'adresse ci-dessus.
        </p>

        <h2 className="pagetitle">IA embarquées</h2>
        <p>
          Certaines fonctions passent par une IA : la mise en forme des
          partitions importées et la dictée des notes (transcription de la
          voix). Ces traitements sont ponctuels : le texte transite pour
          être mis en forme puis te revient, l'audio d'une dictée n'est
          jamais conservé, et rien de tout cela ne sert à entraîner quoi
          que ce soit.
        </p>

        <h2 className="pagetitle">Pourboires</h2>
        <p>
          Le pourboire proposé au public est un lien personnel de
          l'artiste vers le service de son choix. mojosong ne touche
          aucune commission et n'intervient pas dans la transaction.
        </p>

        <h2 className="pagetitle">Esprit du service</h2>
        <p>
          mojosong est fait pour aider les musiciens à jouer, répéter et
          partager la musique avec leur public — pas pour diffuser des
          catalogues de partitions. Tout usage manifestement contraire à
          cet esprit (revente, diffusion massive de contenus protégés…)
          peut entraîner la fermeture du compte.
        </p>

        <div className="spacer" />
        <button className="btn ghost block" onClick={() => navigate('/')}>
          ← Retour à l'application
        </button>
      </div>
    </>
  );
}
