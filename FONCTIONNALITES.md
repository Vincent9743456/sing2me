# Sing2Me — Référentiel fonctionnel

*Ce que l'application fait, domaine par domaine. Établi en lisant le code —
routes, écrans, actions réellement présentes. Version b208, 9 août 2026.*

Ce document dit **ce qui existe**. Le plan de test associé (`RECETTE.md`)
dit **comment le vérifier**. Les deux se tiennent à jour ensemble : une
fonctionnalité ajoutée ici doit avoir ses cas là-bas.

---

## 0. Ce qu'est Sing2Me

Un songbook de scène pour musiciens : ta bibliothèque de partitions, tes
groupes, tes setlists, ton mode scène, et un mode direct qui affiche les
paroles au public par QR code.

**Quatre principes qui gouvernent tout le reste :**

- **Local-first.** Le téléphone est la source ; le cloud est une copie.
  Aucune fonctionnalité n'exige le réseau pour jouer.
- **Compte obligatoire pour l'app musicien**, jamais pour le public. Le
  test est local : un compte déjà connecté ouvre l'app en mode avion.
- **Chaque objet a une seule maison.** Les morceaux vivent dans l'onglet
  Morceaux ; setlists et groupes y *font référence*. Toute liste de
  morceaux ailleurs est une vue filtrée.
- **Bilingue.** Français et anglais pour l'interface ; le contenu de
  l'utilisateur — partitions, titres, noms — n'est jamais traduit. Chacun
  voit l'app dans sa langue, y compris le spectateur du QR.

**Cinq onglets :** Morceaux · Setlists · Live · Groupes · Artiste.

---

## 1. Compte et synchronisation

| Fonction | Détail |
|---|---|
| Connexion par lien magique | E-mail, sans mot de passe |
| Connexion sociale | Google, Apple, Facebook (activables par fournisseur) |
| Consentement aux communications | Case jamais pré-cochée, stockée sur le compte ; les messages de service n'en dépendent pas |
| Portail d'accueil | Sans session, l'app musicien n'affiche qu'un écran de connexion |
| Synchronisation | Fusion locale ↔ cloud à la connexion, puis envoi à chaque modification (différé de 3 s) |
| Pierres tombales | Une suppression sur un appareil vaut partout ; plafonnées à 500 |
| Points zéro de réinitialisation | Ce qui est plus vieux qu'un reset ne revient pas du cloud, même au-delà de 500 suppressions |
| Annuaire | Publication de sa fiche (nom, photo) pour être trouvable par les groupes |
| Langue | Automatique (langue du téléphone) ou choisie ; le choix survit à la synchro |

---

## 2. Morceaux — la bibliothèque

### 2.1 Liste et recherche

Recherche par titre, artiste ou tag. Tri par titre, artiste ou date
(mémorisé). Panneau « Filtrer » replié par défaut, contenant :

- **Vues** : Tous les morceaux · ✨ Nouveautés (ajoutés dans la semaine) ·
  💡 Idées · 🔎 À vérifier.
- **Répertoires** : Solo, puis un par groupe — rangée qui défile
  latéralement.
- **Tags** de l'utilisateur.

Sur écran large avec souris, vue maître-détail : liste à gauche, partition
à droite. Mémoire de défilement : on revient là où on était.

### 2.2 États d'un morceau

| État | Sens |
|---|---|
| Normal | Un morceau qu'on joue |
| **Idée** | Importé mais pas encore validé — réserve à travailler. Jouable partout |
| **Proposition de groupe** | Arrivé d'un groupe, marqué de sa provenance ; vit dans les Idées |
| **À vérifier** | L'import a douté ; la raison est affichée. Le badge s'efface dès qu'on modifie le morceau |
| **Exemple** | Contenu témoin de la première ouverture ; supprimable définitivement |
| **Non jouable en solo** | Déqualifié manuellement du répertoire solo |

**Règle d'adoption** : accepter une proposition, ou programmer une idée
dans une setlist, l'inscrit définitivement en bibliothèque. Une proposition
acceptée entre aussi dans le répertoire du groupe qui l'a proposée.

### 2.3 Actions sur une ligne

Ouvrir · Mode scène · Modifier · Ajouter à (groupe ou setlist) ·
Supprimer. Suppression confirmée par une feuille de l'app, jamais par une
boîte native ; le morceau quitte aussi les setlists.

---

## 3. Partition, versions, transposition

### 3.1 La partition

Paroles et accords en un bloc continu, accords entre crochets alignés sur
les syllabes. Champ « Structure » en notes libres. Titre, artiste,
tonalité, tempo, capo, durée, tags.

### 3.2 Modèle de versions

Un morceau = **l'originale** (toujours personnelle, toujours en tête) +
**au plus une version par groupe** qui l'a au répertoire + une version
**Solo** optionnelle. Rien d'autre.

- « ⭐ En faire la référence » promeut le contenu d'une version dans
  l'originale.
- Supprimer l'originale fait monter la suivante ; il n'y a jamais de
  morceau sans version personnelle en tête.
- Modifier une partition ne détourne jamais la version active par défaut.
- L'éditeur demande : cette version seulement, ou toutes.

### 3.3 Transposition et capo

**Transposer modifie la version** : les accords écrits sont réécrits, la
tonalité suit, c'est enregistré. Transposer est sa propre annulation.
Poser un capo modifie la version aussi.

**Exception** : dans une setlist, les boutons règlent la tonalité de *ce
concert* (`keyOverride` de l'item), jamais la version.

Affichage « tonalité réelle » : montre ce qui sonne, capo compris.

### 3.4 Notes de répétition

Personnelles ou visibles du groupe, signées et datées. Dictée possible —
reconnaissance du navigateur quand elle marche, sinon enregistrement puis
transcription serveur (l'audio n'est jamais conservé). Supprimer une note
partagée la supprime chez tous.

### 3.5 Réglages perso

Instrument joué, ampli, effets, retours — par morceau, locaux, **jamais
partagés**.

---

## 4. Import

### 4.1 Trois chemins

1. **Recherche** d'un morceau en ligne, ou collage du lien d'une page de
   partition.
2. **Document ou texte** : fichier déposé ou texte collé.
3. **Import en masse** : plusieurs fichiers, ou plusieurs liens à la suite
   (plafonné à 200 par fournée).

### 4.2 Formats lus localement, sans IA

`.txt` `.cho` `.crd` `.pro` `.chopro` `.chordpro` `.onsong` ·
`.docx` (dézippage et lecture XML) · `.pdf` (lignes reconstruites à partir
des positions, pour préserver l'alignement accords/paroles) ·
`.html` (page de partition enregistrée, ou page de liste dont on extrait
les liens).

### 4.3 Analyse et filet de sécurité

L'import diagnostique : encodage abîmé, tablatures non converties, accords
non reconnus, accords non alignés, structure absente, artiste absent.

- Un défaut sérieux marque le morceau **« à vérifier »**, avec la raison.
- Un fichier illisible affiche **la cause exacte**, jamais un message
  générique.
- Un résumé après import en masse : importés · déjà présents · échecs ·
  à vérifier.
- Un morceau supprimé volontairement n'est jamais réimporté en masse.
- Un doublon devient une **nouvelle version**, jamais un doublon.
- Nettoyage IA proposé uniquement quand l'analyse a vu un vrai défaut.

### 4.4 Plusieurs partitions dans un fichier

Détection par directives ChordPro répétées, en-têtes « Title: » répétés,
pagination du PDF, ou séparateurs. Le découpage est **proposé**, jamais
imposé ; refusé, le morceau part marqué « à vérifier ».

---

## 5. Setlists

| Fonction | Détail |
|---|---|
| Contexte | Solo ou groupe ; une setlist de groupe utilise les versions du groupe |
| Composition | Sélecteur plein écran, recherche et multi-sélection |
| Ordre | Glissement au doigt ou à la souris |
| Réserve | Morceaux « à jouer selon l'ambiance », comptés à part |
| Durée | Estimée, réserve séparée |
| Tonalité du concert | Par item, sans toucher la version |
| Commentaire | Par item, visible en scène |
| Impression | Vue synthétique |
| Sono & scène | Plan de scène (placement au doigt), matériel des musiciens, branchements, effets |
| Régie | Écran chanteur sans partition : morceau en cours et suivant |
| Génération assistée | Proposition de setlist par l'IA, à partir du répertoire jouable |

---

## 6. Mode scène

Interface dédiée : pas de navigation générale, cibles ≥ 48 px, sortie
protégée. Priorité **lire → naviguer → défiler → réagir**.

Morceau précédent / suivant · liste des morceaux accessible en plein écran
(fond opaque, défilement propre) · défilement automatique réglable ·
ajout d'une note de répétition sans quitter · indication « EN COURS ».

Accessible depuis une setlist, ou sur un morceau seul.

---

## 7. Groupes

| Fonction | Détail |
|---|---|
| Création | Nom, photo, bio, liens, lien de pourboire |
| Invitation | Par lien ou e-mail ; l'adhésion se termine seule au retour du lien |
| Membres | Comptes Sing2Me réconciliés + musiciens saisis à la main ; instrument, matériel |
| Répertoire | Vue filtrée de la bibliothèque sur ce groupe |
| Propagation | Un morceau ajouté arrive chez les autres **dans leurs Idées**, marqué de sa provenance |
| Retrait | Retirer du répertoire est un acte de groupe, propagé ; chacun garde sa copie perso |
| Setlists de groupe | Partagées, détachables du groupe |
| Notes partagées | Visibles de tous, suppression propagée |
| Discussion | Espace de groupe ; proposition d'un morceau depuis la discussion |
| Fiche musicien | Page publique d'un membre, affichée **dans l'app** |
| Départ | Quitter ne détruit rien : les versions du groupe redeviennent personnelles, les setlists sont détachées. Au retour, elles sont rattachées et regarnies |
| Dissolution | Supprimer un groupe le fait disparaître chez tous |

---

## 8. Concerts

Planification : titre, date, heure, lieu (avec lien de page), événement,
description, groupe ou solo, setlist, visibilité publique ou privée.

Les concerts publics apparaissent sur la page artiste. Un concert passé
affiche **ce qu'il a produit** — cœurs, mots du public, spectateurs — dès
qu'un direct lui a été rattaché.

---

## 9. Direct — le mode ON AIR

### 9.1 Lancement

Bouton GO LIVE présent au même endroit sur toutes les pages où lancer un
direct a du sens. Le panneau demande :

- **Type de session** : concert (public + musiciens) ou répétition
  (musiciens seuls) ;
- **Qui joue** : soi en solo, ou l'un de ses groupes ;
- **Pour quel concert** : les concerts du jour correspondant à cette
  identité sont proposés — jamais imposés, « Aucun » est toujours possible.

Si le concert confirmé porte une setlist, le mode scène s'ouvre dessus —
sauf si on regardait déjà une setlist ou un morceau, qui l'emportent.

### 9.2 Ce que voit le public

Le QR mène à une **adresse permanente** (`/tonnom`), jamais à un code de
session. Le spectateur y reste : la page résout le direct par le nom de
l'artiste, en boucle. Trois états sur la même adresse :

1. pas de direct → la fiche de l'artiste ;
2. direct sans partition → « le concert commence dans un instant » ;
3. partition diffusée → les paroles.

Un concert coupé puis relancé est retrouvé sans rescanner.

Le public peut : envoyer un **cœur**, écrire un **mot**, parcourir la
**setlist**, voir les **prochaines dates**, ouvrir le **lien de
pourboire**, et signaler un contenu. Un musicien présent peut basculer sur
la **vue accords** sans compte, et garder une **copie personnelle** d'un
morceau (elle arrive dans ses Idées, jamais partagée).

### 9.3 Règles d'appartenance

- **Un live = un appui sur GO LIVE.** L'arrêt le clôt et conserve sa trace.
- Un live est **solo** (à celui qui l'a lancé) ou **de groupe** (à tous les
  membres). Jamais de « oui » par défaut : une ligne sans identité
  n'appartient à personne.
- Un morceau joué appartient à **sa séance**, un mot du public à **son
  direct** — jamais à l'heure qu'il est.
- Le QR est unique : un concert de groupe ne remplace pas définitivement la
  fiche personnelle.

### 9.4 Suivi du groupe

Les autres musiciens peuvent suivre le morceau en cours, avec les accords
et leur propre transposition.

---

## 10. Historique et chiffres

**Onglet Live** : les concerts à venir, puis « Tes derniers lives » — trois
affichés, le reste derrière un bouton. Chaque ligne : date ou nom du
concert, solo ou groupe, qui a lancé, setlist, cœurs, mots, spectateurs.

Le détail d'un live donne les morceaux joués, les mots reçus, et permet de
le **nommer** ou de le **retirer de son historique** (retrait local : les
autres membres gardent le leur).

**Fiche Artiste** : lives joués, cœurs reçus, spectateurs, suiveurs — tous
issus du même calcul que l'historique. Les cœurs et les mots du public sont
recopiés automatiquement sur les morceaux de la bibliothèque.

---

## 11. Profil artiste et pages publiques

Profil : nom, photo, bio, liens (streaming, réseaux), lien de pourboire,
matériel, réglages de ce que voit le public.

Pages publiques : **page artiste** (`/tonnom`), **fiche d'un musicien**,
**page d'un concert**, **carte de musicien** à envoyer à un groupe,
**page de réception d'un partage** (`/s/…`, héritée), CGU, signalement.

Une page publique se recopie dans l'écran courant plutôt que de faire
quitter l'app.

Le public peut **suivre** un artiste, et recevoir un **souvenir** de
concert.

---

## 12. Réglages et données

Langue · export de la bibliothèque en **carnet PDF** · réinitialisation
partielle (profil, groupes, morceaux, setlists, concerts) avec confirmation
explicite · clé ON AIR (en voie de disparition, remplacée par le compte).

**Tableau de bord fondateur** (`#/tableau-de-bord`, réservé à des adresses
autorisées) : comptes créés, actifs, connectés, groupes, directs lancés,
morceaux partagés, coût des IA mesuré appel par appel, crédit restant.

**Diagnostic ON AIR** (`#/concerts?diag=1`) : tables, nombre de lignes,
tri serveur. Réservé au dépannage, jamais affiché dans l'app.

---

## 13. Ce qui n'existe pas encore

Pour éviter toute confusion :

- reconnaissance des PDF scannés ou des photos (OCR) ;
- import des sauvegardes complètes d'autres applications ;
- écran de reprise de répertoire, écran de preuve après le premier import,
  bande de reprise (chantier commencé, en pause) ;
- glisser-déposer de fichiers (le dépôt passe par le bouton) ;
- rattacher un live à un concert **après coup** ;
- bouton ▶ de mode scène directement dans la liste des morceaux ;
- e-mails d'accueil ;
- Licence Scène et tout ce qui touche au paiement ;
- application native.

---

## 14. Où vivent les règles, dans le code

| Règle | Fichier |
|---|---|
| Ce qu'est un live | `src/lib/pastlives.ts` |
| Récupération et calcul des chiffres | `src/components/usePastLives.ts` |
| Versions, contextes, invariants | `src/lib/model.ts` |
| Analyse d'import et doute | `src/lib/importer.ts` |
| Découpage d'un recueil | `src/lib/songsplit.ts` |
| Fusion locale ↔ cloud | `src/lib/sync.ts` + `src/components/Account.tsx` |
| Adoption d'un morceau | `src/store.tsx` (`acceptSong`, `saveSetlist`) |
| Qui appelle le serveur | `server/identity.js` |
