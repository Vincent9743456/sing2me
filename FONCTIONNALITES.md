# Sing2Me — Tout ce que fait l'application

*Visite guidée, écran par écran. Établi en lisant le code — chaque bouton
cité existe vraiment. Version b209, 9 août 2026.*

Ce document décrit **ce qu'on peut faire et où c'est**. Le plan de test
(`RECETTE.md`) dit **comment vérifier que ça marche**. Les deux se tiennent
à jour ensemble.

---

## Le vocabulaire, d'abord

Cinq mots reviennent partout. Les confondre rend le reste incompréhensible.

| Mot | Ce que c'est |
|---|---|
| **Morceau** | Une chanson dans ta bibliothèque : un titre, un artiste, des paroles, des accords |
| **Partition** | Le contenu du morceau — paroles et accords |
| **Version** | Une variante de la partition du même morceau. Tu as **ton originale**, et éventuellement une version par groupe |
| **Setlist** | Une liste ordonnée de morceaux pour une soirée |
| **Répertoire** | Les morceaux qu'un groupe a en commun. Ce n'est pas une deuxième bibliothèque : c'est ta bibliothèque, filtrée sur ce groupe |

Et trois états qu'un morceau peut prendre :

| État | Ce que ça veut dire |
|---|---|
| **Idée** | Tu l'as récupéré mais pas encore validé. Il est jouable, il est juste rangé à part |
| **Proposition** | Un membre de ton groupe l'a ajouté au répertoire. Il arrive chez toi dans tes Idées, marqué de sa provenance. Il n'entre chez toi que si tu l'acceptes |
| **À vérifier** | L'import a douté (accords mal reconnus, texte bizarre). Le morceau est là, avec la raison du doute affichée |

---

## L'application en cinq onglets

En bas de l'écran, toujours au même endroit :

**🎵 Morceaux** · **📋 Setlists** · **⭐ Live** · **👥 Groupes** · **👤 Artiste**

Et en haut à droite, sur les écrans où ça a du sens, le bouton
**● GO LIVE** — toujours à la même place.

---

# 1. Onglet Morceaux

## 1.1 Ce que tu vois en arrivant

Une barre de recherche, un bouton **Filtrer**, et ta liste de morceaux.
Rien d'autre : c'est volontaire.

- **La recherche** cherche dans les titres, les artistes et les tags. Une
  croix efface.
- Chaque ligne montre le **titre**, puis en dessous l'artiste, la tonalité,
  le tempo et la durée quand ils sont renseignés.
- Le ou les **groupes** qui ont ce morceau à leur répertoire sont écrits en
  toutes lettres dans ce sous-titre (« 👥 Zakoustiks ») — sauf celui dont tu
  affiches justement le répertoire, que répéter n'apprendrait rien.
- À droite de la ligne : le nombre de **cœurs** reçus en concert, le nombre
  de **messages** du public, et un menu **⋯**.
- En bas à droite, le bouton **+ Nouveau morceau**.
- Sur ordinateur en grand écran, la partition s'ouvre **à droite** de la
  liste au lieu de prendre tout l'écran.

En revenant d'une partition, tu retrouves la liste **à l'endroit où tu
l'avais laissée**.

## 1.2 Le panneau « Filtrer »

Replié par défaut. Le bouton porte une pastille avec le nombre de filtres
actifs. Il contient quatre choses :

| Réglage | Ce que ça fait |
|---|---|
| **Tri** | Titre, Artiste, ou Récents. Ton choix est mémorisé |
| **Vues** | Tous les morceaux · ✨ Nouveautés · 💡 Idées · 🔎 À vérifier |
| **Répertoires** | Solo, puis un bouton par groupe. La rangée **défile latéralement** |
| **Tags** | Tes propres étiquettes |

Détail des vues :

- **✨ Nouveautés** : ce que tu as ajouté dans les sept derniers jours.
- **💡 Idées** : ta réserve à travailler, propositions de groupe comprises.
- **🔎 À vérifier** : les morceaux dont l'import a douté. Chaque ligne
  affiche **la raison** — « des accords semblent présents mais n'ont pas
  été reconnus », « caractères illisibles »…
- **Solo** : tous tes morceaux, sauf ceux que tu as toi-même déqualifiés du
  répertoire solo.
- **Un groupe** : les morceaux de ce groupe. Une proposition en attente y
  apparaît aussi, marquée **📥 À valider**, avec un bouton **✓ Accepter**.

Sous les filtres, une phrase rappelle toujours ce qui est actif
(« Filtre actif : Marcus et Vince — 6 morceaux ») avec **Tout afficher**
pour revenir en un geste.

## 1.3 Le menu ⋯ d'une ligne

- **Scène** — ouvre le morceau en mode scène.
- **Modifier** — ouvre l'éditeur de partition.
- **Ajouter à…** — feuille pour l'ajouter à un groupe ou à une setlist.
- **Supprimer** — confirmation par une feuille de l'app (jamais une boîte
  du téléphone). Le morceau quitte aussi les setlists où il était.

## 1.4 Quand la bibliothèque est filtrée sur un groupe

Le bouton du bas devient **+ Ajouter des morceaux** : il ouvre le sélecteur
plein écran pour garnir le répertoire du groupe d'un coup, avec recherche
et sélection multiple.

---

# 2. La fiche d'un morceau

## 2.1 En haut

Le titre, l'artiste, et une rangée d'informations : **tonalité**, **capo**,
tempo, durée, tags.

Si c'est une **idée**, un encart orange le dit, avec le bouton
**✓ Valider dans la bibliothèque**.

## 2.2 Transposer et capo

Deux boutons **−** et **+** transposent le morceau.

**Important : transposer modifie vraiment la partition.** Les accords
écrits sont réécrits, la tonalité suit, et c'est enregistré. Ce n'est pas
un réglage d'affichage. C'est ce qui garantit que le mode scène, le direct
et les autres musiciens voient la même chose que toi. Retransposer en sens
inverse te ramène exactement à l'original.

Le **capo** se règle de la même façon. Il change ce qui *sonne*, pas les
accords affichés. Un bouton permet d'afficher la **tonalité réelle**
(accords capo compris) si tu préfères.

**Exception** : quand tu lis un morceau *depuis une setlist*, les boutons
règlent la tonalité **de ce concert-là** seulement. Le repli te le dit.

## 2.3 Les versions

Un bandeau montre la version affichée, avec un menu pour :

- **changer de version** (ton originale, ou la version d'un groupe) ;
- **⭐ En faire la version de référence** — le contenu de cette version
  remplace celui de ton originale ;
- **renommer** ;
- **supprimer** la version.

La règle à retenir : ton **originale est toujours à toi**, toujours en
tête. Si tu la supprimes, la suivante prend sa place — tu ne te retrouves
jamais sans version personnelle.

Un morceau n'a donc que **ton originale et, au plus, une version par
groupe** qui l'a au répertoire. Il n'y a pas de « version Solo » séparée :
ton originale EST ta façon de le jouer seul.

## 2.4 Notes de répétition

Bouton pour **ajouter une note**. Chaque note est :

- soit **🔒 personnelle** (toi seul), soit **👥 visible du groupe** ;
- signée de ton nom et datée automatiquement ;
- **dictable** : tu parles, ça s'écrit.

Supprimer une note partagée la supprime **chez tout le monde**.

## 2.5 Mes réglages perso

Un pli discret : l'instrument que tu joues sur ce morceau, tes réglages
d'ampli, d'effets, de retours. **Jamais partagé**, jamais inclus dans quoi
que ce soit d'envoyé.

## 2.6 Les autres actions

**Ajouter à…** (groupe ou setlist) · **Modifier la partition** ·
**Mode scène** · **Supprimer**. En lecture depuis une setlist, des flèches
**Précédent / Suivant** et un retour à la setlist.

## 2.7 Chercher une meilleure version

Quand une partition est incomplète, un bouton propose de **chercher une
meilleure version** en ligne. Tu compares, puis tu choisis :
**ajouter comme nouvelle version** (recommandé) ou **remplacer** l'actuelle.

---

# 3. Modifier une partition

L'éditeur sépare clairement deux choses :

**🎵 Le morceau — commun à toutes les versions**
Titre, artiste, durée, tags.

**🎼 La partition — pour la version en cours**
Tonalité, tempo, capo, structure (notes libres), puis le grand champ
**Paroles + accords**.

Les accords s'écrivent entre crochets, placés dans les paroles :
`[Am]Angie, [E]Angie`.

En haut, un rappel de ce que tu modifies (« Tu modifies : ta version
personnelle », « la version partagée du groupe X »), et le choix
d'appliquer **à cette version seulement** ou **à toutes**.

Un morceau marqué « à vérifier » **perd son badge** dès que tu
l'enregistres : relire, c'est vérifier.

---

# 4. Ajouter un morceau

Trois chemins, présentés dans cet ordre.

## 4.1 Rechercher

Tu tapes un titre et un artiste, tu obtiens une liste de partitions, tu en
choisis une. C'est le chemin le plus rapide.

## 4.2 Document ou lien

- **Coller un lien** vers une page de partition.
- **Choisir un fichier** : `.txt`, `.cho`, `.pro`, `.onsong`, `.docx`,
  `.pdf`, ou une page enregistrée `.html`.
- **Coller le texte** directement.
- **Écrire à la main**.

Un **aperçu** montre le résultat avant d'ajouter, avec un diagnostic :
« ✅ Analyse : rien à corriger », ou la liste de ce qui cloche. Si le
format est vraiment abîmé, un **nettoyage par IA** est proposé — jamais
sinon.

Deux boutons pour conclure : **Ajouter à ma bibliothèque**, ou
**Garder comme idée — à travailler**.

Si le morceau existe déjà, l'app te le dit et l'ajoute comme **nouvelle
version** au lieu de créer un doublon.

**Si un fichier contient plusieurs partitions** (un recueil), l'app le
détecte et te propose de **créer autant de morceaux**, ou de n'en faire
qu'un seul. Elle ne découpe jamais toute seule.

**Si un fichier n'est pas lisible**, le message dit précisément pourquoi —
par exemple qu'un PDF est un scan et ne contient pas de texte.

## 4.3 Import en masse

Pour reprendre toute une collection :

- **Déposer plusieurs fichiers** d'un coup (jusqu'à un dossier entier).
- **Coller plusieurs liens**, un par ligne (200 maximum par fournée).

Une **barre de progression** montre l'avancement, morceau par morceau, avec
la possibilité d'**arrêter après le morceau en cours**. À la fin, un
résumé : *N importés · N déjà présents · N échecs · N à vérifier*.

Deux boutons : **Tout ajouter à ma bibliothèque**, ou **Tout garder comme
idées**.

Un morceau que tu avais supprimé volontairement **n'est jamais réimporté**
par ce chemin.

---

# 5. Onglet Setlists

## 5.1 La liste

En haut, un **sélecteur de contexte** qui défile latéralement : « Toutes »,
ton nom (setlists solo), puis un bouton par groupe et par contexte libre
(« Soirée entre amis »). Ton choix est mémorisé d'une fois sur l'autre.

Dessous, **une seule liste**, la plus récemment modifiée en tête. Pour
chaque setlist : le nombre de morceaux, la durée estimée, et — quand
« Toutes » est choisi — d'où elle vient (🎤 Solo, 👥 le nom du groupe, ou
🎉 le contexte). Un encart met en avant la setlist du **prochain concert**.

Bouton **Créer une setlist** : elle est créée dans le contexte affiché. Si
tu es sur « Toutes », l'application te demande lequel.

Une **génération assistée** peut te proposer une setlist à partir de ton
répertoire, selon un type de soirée.

## 5.2 Une setlist ouverte

Le nom en tête, puis les morceaux dans l'ordre. Pour chaque ligne : le
titre, la tonalité prévue, la durée, et un éventuel commentaire.

En bas, **la réserve** : les morceaux « à jouer selon l'ambiance », comptés
et chronométrés à part.

Boutons : **Mode scène** · **Imprimer** · **Régie** · **🔊 Sono & scène** ·
**💬 Mots du public** · **Modifier**.

## 5.3 Modifier une setlist

- **Ajouter des morceaux** : sélecteur plein écran, recherche, sélection
  multiple.
- **Glisser pour réordonner**.
- Sur chaque morceau : régler **la tonalité de ce concert**, écrire un
  **commentaire**, le passer **☆ en réserve**, ou le **retirer**.
- Changer le **nom**, le **groupe**, les **infos** de la setlist.
- **Voir la partition** d'un morceau sans quitter.

« ✓ Enregistré » confirme chaque modification.

## 5.4 Régie

Un écran pour le chanteur qui n'a pas de partition sous les yeux : il tape
le morceau qui démarre, et **le public et les autres musiciens suivent**.
Affiche le morceau **en cours** et le **suivant**.

## 5.5 Sono & scène

- **Plan de scène** : tu places les musiciens au doigt.
- **Matériel des musiciens** : récupéré depuis leurs fiches, ou saisi.
- **Branchements**, **effets et réglages sono**.

Tout est enregistré avec la setlist.

---

# 6. Mode scène

L'écran de concert. Interface volontairement différente du reste : pas de
navigation générale, grosses cibles, sortie protégée.

| Élément | Ce que ça fait |
|---|---|
| Le morceau | Plein écran, texte agrandi, lisible de loin |
| **Morceau précédent / suivant** | Grands boutons aux extrémités |
| **📋 Setlist** | Ouvre la liste pour sauter directement à un morceau |
| **Défilement automatique** | Démarre, s'arrête, vitesse réglable |
| **Note de répétition** | S'ajoute sans quitter la scène, dictée possible |
| **Mes réglages** | Tes réglages perso pour ce morceau |
| **✕ Quitter** | Sortie protégée |

Un bandeau **EN COURS** rappelle qu'un direct tourne. En répétition, le
mot **Répétition** s'affiche à la place.

Le mode scène s'ouvre depuis une setlist, ou depuis un morceau seul.

---

# 7. Onglet Groupes

## 7.1 La liste

Tes groupes, et au-dessus les **invitations reçues**, avec
**Accepter** / **Refuser**.

Bouton **Créer un groupe** : un nom suffit, tu invites ensuite.

## 7.2 La fiche d'un groupe

Photo, nom, bio, liens, lien de pourboire. Puis **quatre portes** :

| Porte | Ce qu'on y trouve |
|---|---|
| **Musiciens** | Les membres, leur instrument, leur matériel |
| **Répertoire du groupe** | Ouvre ta bibliothèque filtrée sur ce groupe |
| **Setlists du groupe** | Celles partagées avec le groupe |
| **Discussion** | L'espace du groupe : messages, répéts, concerts |

## 7.3 Les musiciens

Deux catégories, distinguées à l'écran :

- **Membres avec compte Sing2Me** — leur nom vient de leur compte.
- **Autres musiciens saisis à la main** — un nom, un instrument.

Actions : **Inviter par lien / email** · **Ajouter un musicien** à la main ·
**Voir la fiche** d'un membre (elle s'ouvre **dans l'app**, avec un
retour) · **Copier le lien de sa page** · **Retirer du groupe** ·
**↻ Lui renvoyer la demande** si son invitation n'a pas abouti (avec
**Ne plus afficher** si tu ne comptes pas la renvoyer).

Dans la liste des musiciens, celui qui a créé le groupe porte la mention
**⭐ créateur**.

## 7.3 bis Qui gère le groupe — et comment le transmettre

Les réglages du groupe (**⋯ → Modifier le groupe**) nomment son
créateur : « Créateur : Toi », ou son nom. C'est lui — et lui seul — qui
invite, retire un musicien et supprime le groupe.

Le créateur peut **⭐ Transmettre le groupe…** à un membre qui a un compte.
La confirmation dit ce que ça change : l'autre gérera le groupe, tu y
restes comme musicien et tu gardes toutes tes partitions, mais **tu ne
pourras pas reprendre la main toi-même** — seul le nouveau créateur peut
te le rendre.

Le nouveau créateur l'apprend en ouvrant la fiche du groupe : c'est le
serveur qui fait foi, pas ton application.

## 7.4 Comment un morceau circule dans un groupe

C'est le mécanisme le plus important à comprendre :

1. Un membre ajoute un morceau **au répertoire du groupe**.
2. Chez les autres, il arrive **dans leurs Idées**, marqué
   « 📥 Proposé par … ». Il n'encombre pas leur bibliothèque.
3. Dans la vue du **répertoire de ce groupe**, il apparaît marqué
   « 📥 À valider », avec **✓ Accepter**.
4. Accepter le fait **entrer en bibliothèque** et le **garde dans le
   répertoire du groupe**.
5. Le programmer dans une setlist vaut acceptation.

Retirer un morceau du répertoire du groupe est un acte **de groupe** : il
disparaît du répertoire chez tout le monde, mais **chacun garde sa copie
personnelle**.

## 7.5 Quitter un groupe

Rien n'est détruit. Tes morceaux restent, les versions du groupe
redeviennent personnelles, tes setlists sont simplement **détachées**. Si
tu reviens, elles sont **rattachées et regarnies**.

## 7.6 La discussion

Messages du groupe. Depuis la discussion, on peut **proposer un morceau de
son répertoire** : recherche, puis annonce au groupe. L'app signale si le
morceau est **déjà au répertoire** ou **déjà proposé**.

---

# 8. Onglet Live

## 8.1 Ce que tu y trouves

- **Planifier un concert**.
- **À venir** : les concerts programmés.
- **Concerts passés** : avec, pour chacun, ce qu'il a produit —
  ❤ cœurs · 💬 mots · 👥 spectateurs.
- **Tes derniers lives** : les trois derniers directs joués, un bouton
  **Afficher plus** pour les précédents.

## 8.2 Planifier un concert

Titre, date, heure, lieu (avec le lien de sa page — site, carte, Facebook),
lien de l'événement, description, **qui joue** (solo ou groupe),
**setlist**, et **visibilité** : public (il apparaît sur ta page artiste)
ou privé.

Une fois joué, le concert affiche les **interactions du public** : cœurs
par chanson et messages reçus.

## 8.3 L'historique d'un direct

Chaque ligne : la date ou **le nom du concert**, Solo ou le groupe, qui l'a
lancé, la setlist, puis ❤ · 💬 · 👥.

En l'ouvrant : **les morceaux joués** ce soir-là et **les mots du public**.
Deux actions : **✏️ Nommer ce live** (« soirée chez Marco »), et
**🗑 Supprimer** — un retrait **local** : les autres membres du groupe
gardent le leur.

---

# 9. Le mode ON AIR (le direct)

## 9.1 Lancer

Le bouton **● GO LIVE** ouvre un panneau qui pose trois questions :

| Question | Choix |
|---|---|
| **Type de session** | 🎤 Concert (public + musiciens) ou 🎸 Répétition (musiciens seuls) |
| **Qui joue ce soir ?** | Toi en solo, ou l'un de tes groupes |
| **C'est pour quel concert ?** | Les concerts du jour correspondants — ou « Aucun » |

Puis **🔴 Démarrer le direct**. Si le concert choisi porte une setlist, le
**mode scène s'ouvre dessus** directement.

Pendant le direct : **⏸ Pause**, **⏹ Arrêter**, et **Mon QR unique**.

## 9.2 Le QR

**Ton QR ne change jamais.** Il mène à ton adresse permanente
(`.../tonnom`). Tu peux l'imprimer une fois pour toutes. L'adresse est
aussi **dictable au micro** — le panneau l'affiche en grand pour que tu
puisses l'annoncer.

## 9.3 Ce que voit le public

Sur cette même adresse, trois situations :

1. **Hors concert** → ta fiche artiste : photo, bio, liens, prochaines
   dates, pourboire, et un bouton **⭐ Suivre**.
2. **Direct lancé, pas encore de partition** → « 🎶 Concert en cours —
   profitez du moment ! ».
3. **Partition diffusée** → les paroles, en grand.

Le spectateur peut :

- **envoyer un cœur** ;
- **écrire un mot** aux musiciens ;
- **voir la setlist** et la parcourir ;
- **laisser un pourboire** (2 €, 5 €, 10 € ou libre — l'argent ne passe
  jamais par nous) ;
- **signaler un contenu** ;
- basculer sur **🎸 Tu es musicien ? Suis avec les accords** — la vue
  musicien, sans compte, avec sa propre transposition ;
- **garder une copie** d'un morceau entendu (elle arrive dans ses Idées).

La page du public est **dans sa langue à lui**, pas dans la tienne.

Si tu coupes puis relances le direct, **la même page** retrouve le nouveau
concert : personne n'a besoin de rescanner.

## 9.4 Le suivi du groupe

Les autres musiciens peuvent suivre le morceau en cours avec les accords,
transposé automatiquement dans leur tonalité.

---

# 10. Onglet Artiste

## 10.1 Ton profil

Photo, nom, **biographie**, **liens** (Spotify, Instagram, YouTube…),
**lien de pourboire**, **ton matériel**.

## 10.2 Tes chiffres

Quatre cases : **lives joués** · **❤ reçus** · **👥 spectateurs** ·
**⭐ suiveurs**. Un pli **Voir le détail** donne le détail par séance et par
morceau. Les cœurs et les messages du public sont **recopiés
automatiquement** sur les morceaux de ta bibliothèque.

## 10.3 Ta page publique

Un **aperçu** montre exactement ce que verra le public. Un réglage
**« Qui apparaît sur la page du QR ? »** contrôle ce qui est visible.
Boutons : **Page publique / QR**, **Mettre à jour la page publique
maintenant**.

## 10.4 Le reste

**Prochains concerts**, **Mes groupes**, **Réglages et paramètres**, et en
bas la **version de l'application** — utile pour savoir si tu es à jour.

---

# 11. Réglages

| Réglage | Ce que ça fait |
|---|---|
| **Langue** | Automatique (celle du téléphone), français ou anglais |
| **📄 Exporter la bibliothèque en PDF** | Un carnet complet de toutes tes partitions, imprimable |
| **💾 Enregistrer une sauvegarde** | Un fichier que tu gardes chez toi. Il se relit **même sans Sing2Me** : c'est du texte, tes paroles et tes accords sont dedans |
| **↩︎ Restaurer une sauvegarde** | Ajoute ce qui manque et garde la version la plus récente de ce qui existe des deux côtés. Restaurer une vieille sauvegarde **ne peut pas effacer** le travail d'hier |
| **Réinitialiser** | Efface au choix : profil, groupes, morceaux, setlists, concerts. Confirmation explicite |
| **📊 Tableau de bord** | Réservé aux fondateurs : comptes, usage, coût des IA |

---

### Où vivent tes partitions, et ce qui se passe si ça casse

Sur **ton téléphone** d'abord — c'est la source, et c'est pour ça que
l'app marche en mode avion. Une **copie complète** vit aussi sur nos
serveurs : c'est elle qui te retrouve sur un autre appareil.

Si nos serveurs perdaient tout, ta bibliothèque ne bougerait pas : la
synchronisation ne peut rien retirer, elle ne fait qu'ajouter — et elle
refuse désormais toute fusion qui viderait une bibliothèque remplie.

La sauvegarde couvre le seul cas qui reste : perdre **les deux à la fois**,
le téléphone et le serveur. C'est pour ça qu'elle existe, et c'est pour ça
que le fichier est lisible sans nous.

---

# 12. Ce qui marche sans réseau

Tout, ou presque. Ta bibliothèque, tes setlists et le mode scène
fonctionnent en mode avion, à condition d'être déjà connecté une fois. Ce
qui a besoin du réseau : l'import, le direct, et la synchronisation entre
appareils — qui rattrape son retard toute seule dès que le réseau revient.

---

# 13. Ce qui n'existe pas encore

Pour ne pas le chercher, ni le signaler comme cassé :

- **lire un PDF scanné ou une photo** de partition (pas d'OCR) ;
- **importer la sauvegarde complète** d'une autre application ;
- un **bouton ▶ dans la liste des morceaux** pour lancer le mode scène
  directement ;
- **glisser-déposer** des fichiers (le dépôt passe par le bouton) ;
- **rattacher un live à un concert après coup** ;
- l'écran d'accueil de reprise de répertoire (chantier commencé, en pause) ;
- les e-mails d'accueil ;
- tout ce qui touche au **paiement** ;
- une **application native** (aujourd'hui, c'est un site qu'on installe sur
  l'écran d'accueil).

---

## Pour les curieux : où vivent les règles dans le code

| Règle | Fichier |
|---|---|
| Ce qu'est un live | `src/lib/pastlives.ts` |
| Les chiffres des directs | `src/components/usePastLives.ts` |
| Versions et invariants | `src/lib/model.ts` |
| Analyse d'import | `src/lib/importer.ts` |
| Découpage d'un recueil | `src/lib/songsplit.ts` |
| Fusion locale ↔ cloud | `src/lib/sync.ts`, `src/components/Account.tsx` |
| Adoption d'un morceau | `src/store.tsx` |
| Qui appelle le serveur | `server/identity.js` |
