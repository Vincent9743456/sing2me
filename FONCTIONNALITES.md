# mojosong — Tout ce que fait l'application

*Visite guidée, écran par écran, puis le modèle, les décisions arrêtées et
les limites. Établi en lisant le code — chaque bouton cité existe vraiment.*

**Version b274, 11 août 2026.** Production : https://sing2me-three.vercel.app

Ce document décrit **ce qu'on peut faire et où c'est**, puis **pourquoi
c'est comme ça**. Le plan de test (`RECETTE.md`) dit **comment vérifier que
ça marche** ; les règles de développement vivent dans `CLAUDE.md`.

> **À qui ce document s'adresse.** À quelqu'un qui doit réfléchir à la suite
> — nouvelles fonctionnalités, priorités — sans avoir l'app sous les yeux.
> Les parties II à VII comptent autant que la visite guidée : elles disent ce
> qui a déjà été tranché, et ce qu'on a délibérément refusé.

---

# Ce qu'est mojosong, en trois phrases

Un **songbook pour musiciens qui jouent** : sa bibliothèque de partitions
(paroles + accords), ses setlists, ses groupes, son mode scène. Il marche
**sans réseau** — les données vivent sur le téléphone, le cloud n'est
qu'une copie.

Sa particularité : le **direct**. Pendant un concert, l'artiste diffuse les
paroles au public, qui les lit sur son propre téléphone après avoir scanné
un QR, envoie des cœurs, écrit un mot, laisse un pourboire.

C'est une **application web installable** (PWA), en français et en anglais,
gratuite aujourd'hui dans toutes ses fonctions.

---

# Le vocabulaire, d'abord

Cinq mots reviennent partout. Les confondre rend le reste incompréhensible.

| Mot | Ce que c'est |
|---|---|
| **Morceau** | Une chanson dans ta bibliothèque : un titre, un artiste, des paroles, des accords |
| **Partition** | Le contenu du morceau — paroles et accords |
| **Version** | Une variante de la partition du même morceau. Tu as **ton originale**, et éventuellement une version par groupe |
| **Setlist** | Une liste ordonnée de morceaux pour une soirée |
| **Répertoire** | Les morceaux qu'un groupe a en commun. Ce n'est pas une deuxième bibliothèque : c'est ta bibliothèque, filtrée sur ce groupe |

Et deux états qu'un morceau peut prendre :

| État | Ce que ça veut dire |
|---|---|
| **Proposition** | Il vient du **dehors** et attend ta décision : le répertoire d'un groupe, ou un morceau gardé à un bœuf. Il ne se mélange pas à tes morceaux tant que tu ne l'as pas accepté |
| **À vérifier** | L'import a douté (accords mal reconnus, texte bizarre). Le morceau est là, avec la raison du doute affichée, et la partition d'avant conservée |

> **Le mot « idée » n'existe plus** (b274). Il recouvrait deux choses sans
> rapport — une boîte de réception et une étagère personnelle « à
> travailler ». Il ne reste que la boîte, appelée **Propositions**.

---

# L'application en cinq onglets

En bas de l'écran, toujours au même endroit :

**🎵 Morceaux** · **📋 Setlists** · **⭐ Live** · **👥 Groupes** · **👤 Artiste**

Et en haut à droite, sur les écrans où ça a du sens, le bouton
**● GO LIVE** — toujours à la même place. À gauche de la barre du haut, le
**emblème** (le logo) quand il n'y a pas de bouton Retour ; sur grand écran
(≥ 900 px), une barre latérale remplace la barre d'onglets.

---

# PARTIE I — La visite guidée

# 1. Onglet Morceaux

## 1.1 Ce que tu vois en arrivant

Une barre de recherche, un bouton **Filtrer**, un bouton **☀/☾** (thème
clair/sombre), et ta liste de morceaux. Rien d'autre : c'est volontaire.

- **La recherche** cherche dans les titres, les artistes et les tags.
- Chaque ligne montre le **titre**, puis en dessous l'artiste, la tonalité,
  le tempo et la durée quand ils sont renseignés.
- Le ou les **groupes** qui ont ce morceau à leur répertoire sont écrits en
  toutes lettres (« 👥 Zakoustiks ») — sauf celui dont tu affiches justement
  le répertoire.
- À droite : le nombre de **cœurs** reçus en concert, le nombre de
  **messages** du public, et un menu **⋯**.
- En bas à droite, le bouton **+ Nouveau morceau**.
- Sur grand écran, la partition s'ouvre **à droite** de la liste.

En revenant d'une partition, tu retrouves la liste **où tu l'avais
laissée**.

## 1.2 La puce « 📥 Propositions »

Elle n'apparaît **que s'il y en a**, juste sous la barre d'outils — pas
derrière « Filtrer » : c'est le seul filtre qui *cache* des morceaux, le
ranger dans un pli reviendrait à masquer une partie du répertoire sans le
dire.

Une proposition affiche sa provenance (« 📥 Proposé par … ») et deux
gestes : **✓ Accepter** (elle entre en bibliothèque) ou, depuis sa fiche,
**Écarter cette proposition**. Une proposition écartée n'est pas supprimée :
elle reste visible dans le répertoire du groupe qui l'a proposée, marquée
**↩ Écarté**, avec **↩ Reprendre**.

## 1.3 Le panneau « Filtrer »

Replié par défaut, avec une pastille du nombre de filtres actifs.

| Réglage | Ce que ça fait |
|---|---|
| **Tri** | Titre, Artiste, ou Récents. Mémorisé |
| **Vues** | Tous les morceaux · ✨ Nouveautés · 🔎 À vérifier |
| **Répertoires** | Solo, puis un bouton par groupe (rangée défilante) |
| **Tags** | Tes propres étiquettes |

- **✨ Nouveautés** : ce que tu as ajouté dans les sept derniers jours.
- **🔎 À vérifier** : les morceaux dont l'import a douté, avec **la raison**.
- **Solo** : tes morceaux, sauf ceux que tu as déqualifiés du solo.
- **Un groupe** : les morceaux de ce groupe, propositions comprises.

Sous les filtres, une phrase rappelle ce qui est actif, avec **Tout
afficher** pour revenir en un geste.

## 1.4 Quand la bibliothèque est filtrée sur un groupe

Le bouton du bas devient **+ Ajouter des morceaux** : sélecteur plein
écran, recherche, sélection multiple. Une mention y rappelle que **ces
morceaux sont ceux de ta bibliothèque** — pour en importer de nouveaux, on
passe par l'onglet Morceaux.

---

# 2. La fiche d'un morceau

## 2.1 En haut

Titre, artiste, et une rangée : **tonalité**, **capo**, tempo, durée, tags.

Si c'est une **proposition**, un encart le dit (« 📥 Proposition à
valider ») avec **✓ Valider dans la bibliothèque**.

## 2.2 Transposer et capo

Deux boutons **−** et **+** transposent le morceau.

**Transposer modifie vraiment la partition.** Les accords écrits sont
réécrits, la tonalité suit, c'est enregistré. Ce n'est pas un réglage
d'affichage : c'est ce qui garantit que le mode scène, le direct et les
autres musiciens voient la même chose que toi. Retransposer en sens inverse
ramène exactement à l'original.

Le **capo** change ce qui *sonne*, pas les accords affichés ; un bouton
affiche la tonalité réelle si on préfère.

**Exception** : depuis une setlist, les boutons règlent la tonalité **de ce
concert-là** seulement.

## 2.3 Les accords, dessinés

Toucher un accord ouvre une **pastille ancrée sous lui** (jamais une boîte
au milieu de l'écran) avec sa position sur le manche, doigt par doigt,
barré compris. Elle se ferme au moindre toucher.

Les positions sont **relevées par des guitaristes**, jamais calculées : un
accord absent de la table n'ouvre rien. Un accord barre-oblique (`A/C#`)
descend chercher sa vraie basse.

## 2.4 Les versions

Un bandeau montre la version affichée, avec un menu pour **changer de
version**, **⭐ En faire la version de référence**, **renommer**,
**supprimer**.

Ton **originale est toujours à toi**, toujours en tête. Si tu la supprimes,
la suivante prend sa place — jamais de morceau sans version personnelle.

Un morceau n'a donc que **ton originale et, au plus, une version par
groupe** qui l'a au répertoire.

## 2.5 👁 Vue du public

Un œil dans la rangée d'actions **bascule la partition sur ce que liront
tes spectateurs** — le rendu exact, accords retirés. On peut le
**réécrire** : la retouche fait autorité partout (direct, mode scène,
setlist parcourue), sans toucher à ta partition. Elle appartient à la
**version**, donc elle voyage avec le répertoire du groupe.

Le texte retouché **vieillit et le dit** : si la partition change, l'œil
signale l'écart, avec « ↻ Reprendre ma partition » ou « Garder mon texte ».

## 2.6 Notes de répétition

**+ Note** : chaque note est soit **🔒 personnelle**, soit **👥 visible du
groupe** ; signée, datée, **dictable**. Supprimer une note partagée la
supprime chez tout le monde.

## 2.7 Mes réglages perso

Un pli : instrument joué sur ce morceau, réglages d'ampli, d'effets, de
retours. **Jamais partagé**.

## 2.8 Les autres actions

**＋ Ajouter à…** (groupe ou setlist) · **Modifier** · **Scène** ·
**★ Meilleure version ?** · **Supprimer**. Depuis une setlist : flèches
**Précédent / Suivant** et retour à la setlist.

**Supprimer** n'a pas le même sens partout, et la feuille l'annonce :
- un morceau **du répertoire d'un groupe** n'est pas effacé — il **retourne
  en proposition** de ce groupe (et la suppression est **refusée** s'il est
  programmé dans une setlist du groupe) ;
- une **proposition** s'écarte (récupérable) ;
- un morceau **personnel** est supprimé pour de bon, avec pierre tombale
  pour que la suppression se propage aux autres appareils.

---

# 3. Modifier une partition

L'éditeur sépare deux choses :

**🎵 Le morceau — commun à toutes les versions** : titre, artiste, durée,
tags.

**🎼 La partition — pour la version en cours** : tonalité, tempo, capo,
structure (notes libres), puis **Paroles + accords**.

Les accords s'écrivent entre crochets : `[Am]Angie, [E]Angie`. Les
**sections** s'écrivent en clair (`Refrain :`), jamais entre crochets — les
crochets sont des accords.

En haut, un rappel de ce que tu modifies, et le choix d'appliquer **à cette
version seulement** ou **à toutes**. Un morceau « à vérifier » perd son
badge dès que tu enregistres : relire, c'est vérifier.

---

# 4. Ajouter un morceau

## 4.1 Rechercher

Tu tapes un titre et un artiste, les résultats arrivent seuls, tu choisis.

## 4.2 Document ou lien

- **Coller un lien** vers une page de partition.
- **Choisir un fichier** : `.txt`, `.cho`, `.pro`, `.onsong`, `.docx`,
  `.pdf`, page enregistrée `.html`.
- **Coller le texte** directement.

**L'IA met en forme chaque import**, automatiquement — jamais bloquant :
l'aperçu s'affiche avec l'analyse locale, et si l'IA n'aboutit pas on garde
ce qu'on avait. Le texte collé n'est jamais remplacé.

Un **aperçu** montre le résultat avant d'ajouter, avec un diagnostic. En cas
de **gros doute de forme** (texte perdu, accords disparus), on te laisse
choisir. Un seul bouton conclut : **Ajouter à ma bibliothèque**.

Si le morceau existe déjà, il est ajouté comme **nouvelle version** plutôt
qu'en doublon. Si un fichier contient **plusieurs partitions**, l'app le
détecte et propose d'en faire autant de morceaux — elle ne découpe jamais
seule. Si un fichier n'est pas lisible, le message dit précisément pourquoi.

## 4.3 Import en masse

**Déposer plusieurs fichiers**, ou **coller plusieurs liens** (200 max par
fournée). Barre de progression morceau par morceau, arrêt possible, et un
résumé : *N importés · N déjà présents · N échecs · N à vérifier*.

Un morceau supprimé volontairement **n'est jamais réimporté**.

## 4.4 Écrire à la main

Ouvre l'éditeur sur un morceau vide.

---

# 5. Onglet Setlists

## 5.1 La liste

Un **sélecteur de contexte** défilant : « Toutes », ton nom, un bouton par
groupe et par contexte libre. Mémorisé.

Dessous, **une seule liste**, la plus récemment modifiée en tête : nombre de
morceaux, durée estimée, provenance. Un encart met en avant la setlist du
**prochain concert**.

**Créer une setlist** dans le contexte affiché. Une **génération assistée**
peut en proposer une à partir du répertoire.

## 5.2 Une setlist ouverte

Le nom, puis les morceaux dans l'ordre : titre, tonalité prévue, durée,
commentaire. En bas, **la réserve** (« selon l'ambiance »), comptée à part.

Boutons : **Mode scène** · **Imprimer** · **Régie** · **🔊 Sono & scène** ·
**💬 Mots du public** · **Modifier**.

## 5.3 Modifier

**Ajouter des morceaux** (sélecteur plein écran) · **glisser pour
réordonner** · par morceau : **tonalité de ce concert**, **commentaire**,
**☆ réserve**, **retirer** · changer **nom**, **groupe**, **infos**.
« ✓ Enregistré » confirme.

## 5.4 Régie

Pour le chanteur sans partition sous les yeux : il tape le morceau qui
démarre, **le public et les musiciens suivent**. Affiche le morceau en cours
et le suivant.

## 5.5 Sono & scène

**Plan de scène** (placement au doigt), **matériel des musiciens**,
**branchements**, **effets et réglages**. Enregistré avec la setlist.

---

# 6. Mode scène

L'écran de concert : pas de navigation générale, grosses cibles (≥ 48 px),
sortie protégée. **Toujours sombre** — y entrer bascule toute l'app en
sombre, et ça ne se défait pas en sortant.

| Élément | Ce que ça fait |
|---|---|
| Le morceau | Plein écran, texte agrandi, lisible de loin |
| **Précédent / suivant** | Grands boutons aux extrémités |
| **📋 Setlist** | Saut direct à un morceau |
| **Défilement automatique** | Démarre, s'arrête, vitesse réglable |
| **Note de répétition** | Sans quitter la scène, dictée possible |
| **Mes réglages** | Réglages perso du morceau |
| **✕ Quitter** | Sortie protégée |

Un bandeau **EN COURS** rappelle qu'un direct tourne (ou **Répétition**).

---

# 7. Onglet Groupes

## 7.1 La liste

Tes groupes, et au-dessus les **invitations reçues** (Accepter / Refuser).
Sur chaque ligne : un **œil** pour masquer le groupe au public, et un
**glisser vers la gauche** (ou appui long) qui révèle la corbeille.

**Créer un groupe** : un nom suffit.

## 7.2 La fiche d'un groupe

Photo, nom, nombre de musiciens (**dont les invités en attente**), bouton
**＋ Inviter**, puis les portes :

| Porte | Ce qu'on y trouve |
|---|---|
| **💬 Discussion** | Les messages du groupe |
| **🎵 Répertoire du groupe** | Ta bibliothèque filtrée sur ce groupe |
| **📋 Setlists du groupe** | Celles partagées avec le groupe |
| **👁 Page publique du groupe** | Ce que voit un visiteur qui tape son adresse |
| **✏️ Modifier le groupe** | Photo, nom, présentation, liens, adresse publique |
| **🗑 Supprimer / 🚪 Quitter** | Avec sa conséquence écrite |

La **photo et l'identité du groupe** sont écrites par son créateur et
**voyagent chez tous les membres**.

## 7.3 Les musiciens

Deux catégories : **membres avec compte** (leur nom vient de leur compte) et
**musiciens saisis à la main**. Le créateur porte **⭐**.

Un musicien **est son compte, pas son nom** : deux Vincent ne sont jamais
confondus, et un même compte reste la même personne même s'il change de nom
d'artiste.

## 7.4 Inviter

Pendant que tu tapes le prénom, **l'annuaire regarde si la personne a déjà
un compte** : si oui, l'invitation part **directement dans son
application**, sans lien. Les gens avec qui tu joues déjà remontent en tête
des résultats, avec la raison écrite dessous.

Sinon, un **lien d'invitation nominatif** : au nom de la personne visée,
valable 30 jours, refermé sur le **premier compte** qui l'utilise. Réinviter
révoque le lien précédent. Un seul bouton pour l'envoyer : **📤 Partager**
(la feuille du système), plus un **QR** si la personne est là.

## 7.5 Qui gère le groupe, et comment le transmettre

Le créateur invite, retire un musicien, supprime le groupe. Il peut
**⭐ Transmettre le groupe** à un membre qui a un compte : l'autre gérera le
groupe, l'ancien créateur **y reste comme musicien**. Le serveur fait foi —
le nouveau créateur l'apprend en ouvrant la fiche.

**On ne quitte pas un groupe qu'on a créé** : on le supprime ou on le
transmet.

## 7.6 Comment un morceau circule dans un groupe

C'est le mécanisme le plus important :

1. Un membre ajoute un morceau **au répertoire du groupe**.
2. Chez les autres, il arrive **dans leurs Propositions**, marqué de sa
   provenance. Il n'encombre pas leur bibliothèque.
3. **✓ Accepter** le fait entrer en bibliothèque et le garde au répertoire.
4. Le **programmer dans une setlist** vaut acceptation.
5. **Écarter** le range sans le détruire : le groupe peut le reproposer, et
   « ↩ Reprendre » le ramène.

Retirer un morceau du répertoire est un acte **de groupe** : il disparaît du
répertoire chez tout le monde, chacun gardant sa copie personnelle.

## 7.7 Quitter un groupe

Rien n'est détruit : tes morceaux restent, les versions du groupe
redeviennent personnelles, tes setlists sont **détachées**. Si tu reviens,
elles sont **rattachées et regarnies**.

## 7.8 La discussion

Messages du groupe, actualisés automatiquement. Un bouton **🎵 Proposer un
morceau de mon répertoire** ; l'app signale si le morceau est déjà au
répertoire ou déjà proposé.

---

# 8. Onglet Live

- **Planifier un concert** : titre, date, heure, lieu (avec le lien de sa
  page), lien de l'événement, description, **qui joue** (solo ou groupe),
  **setlist**, **visibilité** (public ou privé).
- **À venir** : les concerts programmés.
- **Concerts passés** : avec ce qu'ils ont produit — ❤ · 💬 · 👥.
- **Tes derniers lives** : les trois derniers, avec « Afficher plus ».

En ouvrant un live : **les morceaux joués** et **les mots du public**. Deux
actions : **✏️ Nommer ce live** et **🗑 Supprimer** — un retrait **local**,
les autres membres gardent le leur.

---

# 9. Le direct (mode Live)

## 9.1 Lancer

**● GO LIVE** ouvre un panneau qui pose trois questions :

| Question | Choix |
|---|---|
| **Type de session** | 🎤 Concert (public + musiciens) ou 🎸 Répétition (musiciens seuls) |
| **Qui joue ce soir ?** | Toi en solo, ou l'un de tes groupes |
| **C'est pour quel concert ?** | Les concerts du jour correspondants — ou « Aucun » |

Puis **🔴 Démarrer le direct**. Si le concert porte une setlist, le mode
scène s'ouvre dessus. Pendant : **⏸ Pause**, **⏹ Arrêter**, **Mon QR**.

Un groupe **masqué au public** ne peut pas servir à lancer un direct.

## 9.2 Le QR

**Ton QR ne change jamais.** Il mène à ton adresse permanente
(`.../tonnom`), dictable au micro. L'adresse est **unique** : le premier
arrivé garde `vincent`, les suivants reçoivent `vincent2`, `vincent3`…
Elle est **réservée automatiquement** d'après ton nom d'artiste, et
modifiable ensuite.

Un **groupe** a sa propre adresse, dérivée de son nom, qui ouvre **sa**
page. Pendant un direct de ce groupe, elle mène au concert.

## 9.3 Ce que voit le public

Sur cette même adresse, trois situations :

1. **Hors concert** → la fiche artiste : photo, bio, liens, prochaines
   dates, groupes, pourboire, **⭐ Suivre**.
2. **Direct lancé, pas encore de partition** → « le concert commence dans un
   instant ».
3. **Partition diffusée** → les paroles, en grand.

Le spectateur peut : **envoyer un cœur** (un seul compté par personne et par
morceau, mais le ❤ s'envole à chaque fois), **écrire un mot**, **voir la
setlist**, **laisser un pourboire** (l'argent ne passe jamais par nous),
**signaler un contenu**, basculer sur **🎸 Suis avec les accords** (vue
musicien, sans compte, avec sa propre transposition), et **garder une
copie** d'un morceau entendu — elle arrive dans ses **Propositions**.

La page du public est **dans sa langue à lui**. Si tu coupes puis relances,
**la même page** retrouve le nouveau concert : personne ne rescanne.

## 9.4 Le suivi du groupe

Les autres musiciens suivent le morceau en cours avec les accords,
transposé automatiquement dans leur tonalité.

---

# 10. Onglet Artiste

- **Ton profil** : photo, nom, **biographie**, **liens** (les lecteurs
  YouTube et Spotify s'affichent en place), **pourboires**, **ton matériel**.
- **Tes chiffres** : lives joués · ❤ reçus · 👥 spectateurs · ⭐ suiveurs,
  avec le détail par séance et par morceau. Cœurs et messages sont recopiés
  sur les morceaux de ta bibliothèque.
- **Écran public (QR)** : un **aperçu** montre la page telle que le public
  la voit, avec le QR (enregistrable en image, partageable).
- **Mes groupes** : ceux masqués au public apparaissent en transparence,
  avec la raison.
- **Prochains concerts**, **Réglages**, et la **version de l'application**.

---

# 11. Réglages

| Réglage | Ce que ça fait |
|---|---|
| **Langue** | Automatique, français ou anglais |
| **📊 Tableau de bord** | Réservé aux fondateurs : comptes, usage, coût des IA |
| **↻ Recharger l'application** | Récupère la dernière version ; les données ne bougent pas |
| **Reprendre mes partitions** | 🎯 Recaler les accords (gratuit, hors ligne) et ✨ Remettre en forme à l'IA. **N'apparaît que s'il y a quelque chose à faire**, avec le nombre exact |
| **📄 Exporter en PDF** | Un carnet complet, imprimable |
| **💾 Sauvegarde** | Un fichier que tu gardes chez toi, relisible **sans mojosong** |
| **↩︎ Restaurer** | Ajoute ce qui manque, n'écrase jamais plus récent |
| **Ma page publique** | Case « Rendre ma page publique invisible » : republie une fiche **vide**, l'adresse reste réservée |
| **Réinitialiser** | Au choix : profil, groupes, morceaux, setlists, concerts |
| **Supprimer mon compte** | Efface tout côté serveur. Annonce des **chiffres** (groupes dissous, adresse libérée), demande de **taper son adresse e-mail** |

---

# 12. Ce qui marche sans réseau

Tout, ou presque — **y compris le lancement de l'app** : la coquille est
gardée sur le téléphone. Bibliothèque, setlists et mode scène fonctionnent
en mode avion. Ce qui a besoin du réseau : l'import, le direct, la
synchronisation — qui rattrape son retard toute seule au retour du réseau
(« ↑ N modifications en attente » le dit).

---

# PARTIE II — Le modèle, en dix règles

1. **Chaque objet a une seule maison.** Les morceaux vivent dans l'onglet
   Morceaux ; setlists et groupes y *font référence*. Toute liste de
   morceaux ailleurs est une **vue filtrée**.
2. **Une action = un geste unique appris une fois.** Affecter des morceaux
   passe toujours par le même sélecteur, dans les deux sens.
3. **Un écran = une mission.** L'avancé vit derrière des plis ; jamais de
   deuxième chemin vers une action existante.
4. **Local-first.** Le téléphone est la source, le cloud une copie. Fusion :
   dernier écrit gagne, **par objet**, sur `updatedAt`.
5. **Un compte = un espace.** Deux comptes sur le même téléphone ne
   fusionnent jamais : changer de compte repart d'un état vide.
6. **Un musicien est son compte**, pas son nom.
7. **L'originale est maîtresse.** La première version d'un morceau est
   toujours personnelle ; un morceau = l'originale + au plus une version par
   groupe.
8. **Transposer modifie la version** (pas l'affichage), sauf dans une
   setlist où c'est la tonalité *de ce concert*.
9. **Un live = un appui sur GO LIVE.** Il appartient à celui qui l'a lancé,
   ou à **tous les membres** s'il est tagué d'un groupe.
10. **Toute mention a une sortie**, et une pastille compte **exactement** ce
    que l'écran montrera.

---

# PARTIE III — Ce qui est arbitré (à ne pas rouvrir)

Décisions produit prises par Vincent, appliquées dans le code :

- **Pas de vues par musicien** : tout le monde voit la partition complète ;
  la vue « paroles seules » ne sert qu'au public.
- **« Structure » = notes libres**, plus de sections avec accords par partie.
- **Pas de version « Solo »** : l'originale EST la façon de le jouer seul.
- **Une partition ne circule que par deux canaux** : le répertoire d'un
  groupe, ou la diffusion en direct (QR). **Aucun partage par lien.**
- **Le QR est celui de l'artiste** ; c'est au lancement qu'on décide si le
  public voit le nom de l'artiste ou celui du groupe.
- **Le mode scène est sombre, et c'est la seule option.**
- **Le mode clair se règle depuis la bibliothèque**, jamais depuis une
  partition.
- **Le risque juridique du direct est assumé** par Vincent (afficher les
  paroles au public). Sujet clos.
- **Pas d'`alert/confirm/prompt` natifs** : feuilles et toasts de l'app.
- **Le direct s'appelle « Live »**, plus « ON AIR ».

---

# PARTIE IV — Le modèle économique (décidé, pas implémenté)

- Tout est **gratuit, pour tout le monde, pour toujours** : bibliothèque,
  import, groupes **illimités**, partage, setlists, notes, mode scène.
- Seul **le direct** est monétisé : gratuit jusqu'à ~10 spectateurs
  connectés par session et sans la récolte (cœurs / stats / messages) ; une
  **Licence Scène** annuelle, attachée au **compte artiste** qui lance les
  sessions, débloque audience illimitée + engagement complet.
- **Jamais de coupure en plein concert.** Le lien de pourboire reste visible
  même en gratuit. La licence se vend sur l'engagement, **jamais** sur
  « plus de paroles ».
- **Pourboires** : lien de paiement personnel de l'artiste, l'argent ne
  transite **jamais** par nous, **aucune commission**.
- **Aucun chiffre n'est arrêté** (prix, seuil) : ne jamais en afficher.

---

# PARTIE V — Les lignes rouges

- **Outil, pas catalogue** : aucune recherche de morceaux côté serveur,
  aucune base mutualisée entre comptes, aucun préremplissage de
  bibliothèque. Un morceau ne circule que d'un membre vers SON groupe.
- **Ne jamais nommer la plateforme d'où viennent les partitions** dans
  l'interface, l'aide, la landing ou le README. Nommer l'outil dont
  l'utilisateur sort **ses propres** fichiers (portabilité) est autorisé.
- **Le cyan est réservé aux accords** ; **un seul bouton ambre par écran**,
  celui qui fait avancer.
- **Le contenu utilisateur n'est jamais traduit** : partitions, paroles,
  titres, noms, notes, messages.
- **Rien ne sort de l'app** : e-mails, identifiants de compte, et un
  musicien seulement invité n'apparaissent jamais sur une page publique.

---

# PARTIE VI — Contraintes techniques

- **React 19 + TypeScript + Vite**, deux entrées : l'app musicien et une
  **entrée publique légère** (budget spectateur — ne jamais l'alourdir).
- **Supabase** : clé anon + RLS côté client ; `service_role` seulement dans
  les fonctions serveur. Les fichiers SQL sont idempotents et **exécutés à
  la main** par Vincent.
- **PWA installable**, service worker : la coquille est en cache, `/api/*`
  jamais.
- **Bilingue** : le français est la langue **source** et la clé ; l'anglais
  vit dans des dictionnaires par domaine. Couverture vérifiée à chaque
  livraison.
- **Ce qui ne se renomme JAMAIS** : les clés `localStorage` (`sing2me/…`) et
  les tables Supabase — les renommer effacerait les données des installés.
- **Déploiement** : tout push sur `main` déclenche Vercel. Version à
  incrémenter dans `src/version.ts` et `public/version.txt`.
- **IA** : mise en forme des imports (Anthropic) et transcription de la
  dictée (service tiers). Chaque appel est **mesuré** et **plafonné** par
  compte ; un garde-fou ne doit jamais faire échouer une fonctionnalité.

---

# PARTIE VII — Ce qui n'existe pas encore

À ne pas chercher, ni signaler comme cassé :

- **OCR** : lire un PDF scanné ou une photo de partition ;
- importer la **sauvegarde complète** d'une autre application (parseurs
  OnSong Archive / SongbookPro / MusicXML) ;
- **glisser-déposer** de fichiers (le dépôt passe par le bouton) ;
- **rattacher un live à un concert après coup** ;
- l'écran d'accueil de **reprise de répertoire** (chantier en pause) ;
- les **e-mails d'accueil** (confirmation, bienvenue, mini-tutos) ;
- tout ce qui touche au **paiement** et à la Licence Scène ;
- une **application native** (aujourd'hui : un site qu'on installe) ;
- connexions **Google / Apple / Facebook** : codées, à activer chez les
  fournisseurs.

---

## Pour les curieux : où vivent les règles dans le code

| Règle | Fichier |
|---|---|
| Versions et invariants, identité d'un musicien | `src/lib/model.ts` |
| Ce qu'est un live | `src/lib/pastlives.ts` |
| Les chiffres des directs | `src/components/usePastLives.ts` |
| Analyse d'import | `src/lib/importer.ts` |
| Découpage d'un recueil | `src/lib/songsplit.ts` |
| Sections d'une partition | `src/lib/sections.ts` |
| Texte lu par le public | `src/lib/publiclyrics.ts` |
| Positions d'accords | `src/lib/chorddb.ts` |
| Fusion locale ↔ cloud | `src/lib/sync.ts`, `src/components/Account.tsx` |
| Répertoire partagé d'un groupe | `src/lib/bandSync.ts` |
| Supprimer un morceau / un groupe | `src/lib/deletesong.ts`, `src/lib/deleteband.ts` |
| Adresses publiques | `src/lib/publicPages.ts` |
| Le clavier | `src/lib/clavier.ts` |
| À quel compte appartient l'appareil | `src/lib/compte.ts` |
