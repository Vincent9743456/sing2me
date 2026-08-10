# Sing2Me — Périmètre fonctionnel et plan de recette

*Établi à partir du code, pas de mémoire — version b209, 9 août 2026.*

## Comment s'en servir

Chaque ligne est **un cas testable**, avec ce qu'on fait et ce qu'on doit
voir. Réponds `OK` ou `KO` par numéro ; sur un `KO`, la référence (par
exemple `M-12`) me suffit pour retrouver le code.

Trois niveaux de priorité :

- 🔴 **Vital** — si ça casse, l'app ne sert plus à rien ce soir-là.
- 🟠 **Important** — dégrade l'usage sans l'empêcher.
- ⚪ **Confort** — agrément, finitions.

Les cas marqués **⚠️ cicatrice** ont déjà cassé une fois : ils portent le
numéro du lot qui les a corrigés. Ce sont les premiers à re-tester après
n'importe quelle livraison.

**Deux appareils sont nécessaires** pour les cas marqués 📱📱 (synchro,
groupe, direct). Marco est le second appareil.

---

## A. Arrivée et compte

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| A-1 | Ouvrir l'app sans être connecté | Portail de connexion épuré, rien d'autre | 🔴 |
| A-2 | Se connecter par lien magique (e-mail) | Retour dans l'app, bibliothèque visible | 🔴 |
| A-3 | Se connecter par Google / Apple / Facebook | Idem (si les fournisseurs sont activés) | 🟠 |
| A-4 | Rouvrir l'app en mode avion, déjà connecté | L'app s'ouvre normalement, tout est lisible | 🔴 |
| A-5 | Première ouverture d'un compte neuf | Deux morceaux d'exemple, carte de bienvenue, checklist | 🟠 |
| A-6 | Supprimer un morceau d'exemple, recharger | Il **ne revient pas** — ⚠️ cicatrice b200 | 🟠 |
| A-7 | 📱📱 Modifier un morceau sur l'appareil A | Il apparaît modifié sur B en moins de 2 min | 🔴 |
| A-8 | 📱📱 Créer un morceau hors ligne, puis retrouver le réseau | Il monte tout seul, rien n'est perdu | 🔴 |
| A-9 | Se déconnecter puis se reconnecter | La bibliothèque revient complète | 🔴 |
| A-10 | Changer la langue en anglais (Réglages) | Toute l'interface bascule ; **les partitions, titres, noms de groupes restent en français** | 🟠 |
| A-11 | Recharger après avoir choisi l'anglais | La langue reste — ⚠️ cicatrice b158/b202 | 🟠 |

---

## B. Morceaux — bibliothèque

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| M-1 | Ouvrir l'onglet Morceaux | Recherche + liste, rien d'autre à l'écran | 🔴 |
| M-2 | Chercher par titre, par artiste, par tag | La liste se réduit ; la croix efface | 🔴 |
| M-3 | Ouvrir « Filtrer » | Tri, vues, répertoires, tags | 🟠 |
| M-4 | Trier par titre / artiste / récents | L'ordre change ; le choix survit au rechargement | ⚪ |
| M-5 | Filtrer sur un répertoire de groupe | Seuls les morceaux de ce groupe ; « Filtre actif » l'annonce | 🔴 |
| M-6 | Filtrer sur « Solo » | Tous sauf ceux déqualifiés du solo | 🟠 |
| M-7 | Avec 6 groupes, regarder la rangée des répertoires | **Une seule ligne** qui défile latéralement — ⚠️ cicatrice b203 | 🟠 |
| M-8 | Chip « ✨ Nouveautés » | Les partitions ajoutées dans la semaine | ⚪ |
| M-9 | Chip « 💡 Idées » | La réserve à travailler | 🟠 |
| M-10 | Chip « 🔎 À vérifier » (après un import douteux) | Les morceaux à relire, avec la raison sur la ligne | 🟠 |
| M-11 | Ouvrir un morceau | La partition, accords alignés sur les paroles | 🔴 |
| M-12 | Menu « ⋯ » d'une ligne | Jouer / Modifier / Ajouter à… / Supprimer | 🟠 |
| M-13 | Supprimer un morceau | Confirmation **non native** ; il quitte aussi les setlists | 🔴 |
| M-14 | 📱📱 Supprimer un morceau sur A | Il ne réapparaît pas depuis B — ⚠️ cicatrice b132/b137 | 🔴 |
| M-10bis | Lever le « 🔎 À vérifier » | Il disparaît quand on remplace la partition (version trouvée), quand on supprime l'originale ou qu'on promeut une autre version en référence — et « ✓ Partition vérifiée » (menu ⋯) le lève à la main — ⚠️ cicatrice b218 | 🟠 |
| M-15 | Groupe d'un morceau sur sa ligne | Le **nom du groupe** en toutes lettres dans le sous-titre (« 👥 Zakoustiks »), lisible sur un écran de 360 px ; pas répété quand on filtre déjà sur ce groupe | ⚪ |
| M-16 | Écran large (≥ 1100 px, souris) | Vue maître-détail : liste à gauche, partition à droite | ⚪ |

---

## C. Morceaux — partition, versions, transposition

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| P-1 | Transposer (+/−) | **Les accords écrits changent** et la tonalité suit ; c'est enregistré | 🔴 |
| P-2 | Re-transposer en sens inverse | On retombe exactement sur l'original | 🔴 |
| P-3 | Poser un capo | Ce qui sonne change, les accords affichés non ; l'aide le dit | 🟠 |
| P-4 | Basculer « tonalité réelle » | Les accords s'affichent capo compris | ⚪ |
| P-5 | Changer de version (originale / groupe) | Le contenu change ; la version active du morceau **n'est pas détournée** | 🔴 |
| P-5b | Chercher une « version Solo » | Elle n'existe plus (b211) : ni bouton, ni entrée de menu. Une version Solo créée AVANT est toujours là, sous son nom, en version perso | 🟠 |
| P-6 | Créer une version de groupe | Elle apparaît ; l'originale reste intacte | 🟠 |
| P-7 | « ⭐ En faire la référence » | Le contenu passe dans l'originale | 🟠 |
| P-8 | Supprimer l'originale | La suivante monte en référence ; **jamais de morceau sans version perso en tête** — ⚠️ cicatrice b135 | 🔴 |
| P-9 | Renommer une version | Le nom change partout | ⚪ |
| P-10 | Modifier la partition | Choix « cette version / toutes » ; retour en haut de la partition | 🔴 |
| P-10bis | Lire une partition importée | Les sections sont **écrites** : INTRO, COUPLET 1, REFRAIN, séparés par de l'air ; les accords ne coupent aucun mot (jamais « commen[C]t ») | 🔴 |
| P-10ter | Vieux morceau importé AVANT b219 | Les sections reviennent aussi, à l'ouverture — et si l'appariement est incertain, **rien ne bouge** (jamais un « Refrain » posé sur un couplet) | 🟠 |
| P-11 | Modifier un morceau marqué « à vérifier » | Le badge disparaît | 🟠 |
| P-12 | Ajouter une note de répétition | Personnelle ou visible du groupe, signée et datée | 🟠 |
| P-13 | Dicter une note | Texte en direct (navigateur) ou enregistrement + transcription (iPhone installé) | 🟠 |
| P-14 | Supprimer une note partagée | Elle disparaît **chez tous les membres** | 🟠 |
| P-15 | Mes réglages perso (ampli, effets) | Enregistrés, **jamais partagés** | ⚪ |

---

## D. Import et reprise de répertoire

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| I-1 | Rechercher un morceau et l'importer | Aperçu, puis ajout à la bibliothèque | 🔴 |
| I-2 | Coller le lien d'une page de partition | Idem | 🔴 |
| I-3 | Coller du texte brut | Accords détectés et alignés **sur le début des mots** ; les en-têtes de sections du fichier sont gardés | 🔴 |
| I-4 | Déposer un fichier .txt / ChordPro / .onsong | Contenu lu, titre repris du nom de fichier | 🔴 |
| I-5 | Déposer un .docx | Contenu lu | 🟠 |
| I-6 | Déposer un PDF **texte** | Accords et paroles alignés | 🔴 |
| I-7 | Déposer un PDF **scanné (image)** | Message précis nommant la cause — **jamais un message générique** | 🔴 |
| I-8 | Déposer un fichier illisible | La cause exacte s'affiche | 🟠 |
| I-9 | Importer un morceau déjà présent | Ajouté **comme nouvelle version**, jamais en doublon | 🔴 |
| I-10 | Import en masse : déposer 10 fichiers d'un coup | Liste des fichiers prêts, puis progression | 🟠 |
| I-11 | Import en masse : page de liste enregistrée (.html) | Les liens sont extraits, sans doublons | 🟠 |
| I-12 | Résumé après import en masse | « N importés · N déjà présents · N échecs · N à vérifier » | 🟠 |
| I-13 | Réimporter un morceau supprimé volontairement | **Non réimporté** ; la ligne le dit — ⚠️ cicatrice b132 | 🟠 |
| I-14 | Déposer un PDF **contenant plusieurs partitions** | Proposition « ce fichier contient sans doute N partitions », avec le choix de découper ou non | 🟠 |
| I-15 | Refuser le découpage | Un seul morceau, marqué « à vérifier » avec la raison | 🟠 |
| I-16 | Nettoyage IA sur un import mal formaté | Proposé **seulement** si l'analyse a vu un vrai défaut | ⚪ |
| I-18 | Import d'un fichier plein de sections | Aucun « ⚠ » ni badge « à vérifier » à cause des seules sections — ⚠️ cicatrice b219 | 🟠 |
| I-17 | Pied de tous les écrans d'import | Mention « tes morceaux restent à toi, tu peux tout réexporter » | ⚪ |

---

## E. Setlists

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| S-1 | Créer une setlist | Créée dans le contexte affiché ; sur « Toutes », l'app demande lequel | 🔴 |
| S-1b | Sélecteur de contexte en haut | Une rangée qui défile (Toutes · mon nom · mes groupes · mes contextes) AU-DESSUS d'une seule liste — plus de capsules à déplier ; le choix est retrouvé au retour | 🟠 |
| S-1c | Sur « Toutes » | Chaque ligne dit d'où elle vient (🎤 Solo, 👥 groupe, 🎉 contexte) | ⚪ |
| S-2 | Ajouter des morceaux | Sélecteur plein écran, recherche + multi-sélection | 🔴 |
| S-3 | Réordonner par glissement | L'ordre tient après rechargement | 🔴 |
| S-4 | Retirer un morceau de la setlist | Il reste dans la bibliothèque | 🔴 |
| S-5 | Mettre un morceau « en réserve » | Compté à part, durée à part | 🟠 |
| S-6 | Durée totale estimée | Cohérente avec les durées des morceaux | ⚪ |
| S-7 | Régler la tonalité d'un morceau **dans la setlist** | Ne change que ce concert, pas la version — le repli le dit | 🔴 |
| S-8 | Setlist de groupe | Elle utilise les versions du groupe | 🟠 |
| S-9 | Commentaire sur un morceau de la setlist | Visible en scène | ⚪ |
| S-10 | Imprimer / aperçu | Vue synthétique lisible sur papier | ⚪ |
| S-11 | Sono & scène | Plan de scène, matériel, branchements ; positions enregistrées | ⚪ |
| S-12 | Régie (chanteur sans partition) | Écran dédié, morceau en cours et suivant | ⚪ |
| S-13 | Programmer une **idée** dans une setlist | Elle entre définitivement en bibliothèque — ⚠️ cicatrice b174 | 🟠 |
| S-14 | Supprimer une setlist | Confirmation ; les morceaux restent | 🟠 |
| S-15 | 📱📱 Setlist de groupe modifiée par Marco | Elle arrive chez moi | 🟠 |

---

## F. Mode scène

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| SC-1 | Lancer le mode scène depuis une setlist | Premier morceau plein écran, texte lisible de loin | 🔴 |
| SC-2 | Morceau suivant / précédent | Cibles ≥ 48 px, réactives | 🔴 |
| SC-3 | Défilement automatique | Démarre, s'arrête, vitesse réglable | 🟠 |
| SC-4 | Ouvrir la liste et sauter à un morceau | Le panneau défile ; **le fond est opaque** — ⚠️ cicatrice b184 | 🟠 |
| SC-5 | Quitter le mode scène | Sortie protégée (pas de sortie accidentelle) | 🔴 |
| SC-6 | Défiler pendant le mode scène | La barre du bas ne remonte pas, rien ne saute — ⚠️ cicatrice b183/b184 | 🟠 |
| SC-7 | Ajouter une note de répétition en scène | Possible sans quitter | ⚪ |
| SC-8 | Mode scène sur un morceau seul (hors setlist) | Fonctionne aussi | 🟠 |
| SC-9 | Sections en mode scène | Les repères (INTRO, REFRAIN…) grossissent avec le texte et restent discrets — ils ne prennent rien aux paroles | 🟠 |

---

## G. Groupes

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| G-1 | Créer un groupe | Bouton de validation visible ; le groupe apparaît | 🔴 |
| G-2 | Inviter par lien / e-mail | Lien copiable, envoyable | 🔴 |
| G-3 | 📱📱 Marco accepte l'invitation | Il arrive **directement dans le groupe**, répertoire visible | 🔴 |
| G-4 | Ajouter un morceau au répertoire du groupe | Il part chez les autres membres | 🔴 |
| G-5 | 📱📱 Chez Marco, le morceau proposé | Arrive **dans ses Idées**, marqué de sa provenance — ⚠️ cicatrice b174 | 🔴 |
| G-6 | Filtrer sur ce groupe chez Marco | La proposition y figure, marquée « 📥 À valider » — ⚠️ cicatrice b203 | 🟠 |
| G-7 | Accepter la proposition | Elle entre en bibliothèque **et reste dans le répertoire du groupe** — ⚠️ cicatrice b205 | 🔴 |
| G-8 | Retirer un morceau du répertoire du groupe | Retiré **chez tous** ; chacun garde sa copie perso | 🟠 |
| G-9 | Discussion de groupe | Messages envoyés et reçus | 🟠 |
| G-10 | Proposer un morceau depuis la discussion | Annonce + arrivée dans les Idées | 🟠 |
| G-11 | Retirer un membre | Il quitte le groupe ; rien n'est détruit chez lui | 🟠 |
| G-12 | 📱📱 Marco quitte le groupe puis y revient | Ses setlists de groupe sont **rattachées et regarnies** — ⚠️ cicatrice b185 | 🟠 |
| G-13 | Ouvrir la fiche d'un membre | Elle s'affiche **dans l'app**, avec un retour — ⚠️ cicatrice b187 | 🟠 |
| G-14 | Supprimer un groupe | Il disparaît aussi chez les membres | 🟠 |
| G-15 | Matériel d'un musicien | Saisi, visible sur le plan de scène | ⚪ |
| G-16 | Réinitialiser son app quand on a créé un groupe | **Aucune** bannière « à réinviter » ne me désigne MOI au retour, ni pastille sur l'onglet Groupes — ⚠️ cicatrice b212 | 🔴 |
| G-21 | Fiche du groupe → « Setlists du groupe » | L'onglet Setlists s'ouvre **déjà filtré** sur ce groupe, comme « Répertoire du groupe » — ⚠️ cicatrice b214 | 🟠 |
| G-18 | Réglages du groupe : qui l'a créé | « Créateur : Toi » chez le créateur, son nom chez les autres | 🟠 |
| G-19 | Transmettre le groupe à un membre | Confirmation qui dit ce qu'on perd ; ensuite c'est LUI qui invite, retire et supprime — et je reste membre avec toutes mes partitions | 🔴 |
| G-20 | 📱📱 Chez le nouveau créateur | En ouvrant la fiche du groupe, il se voit créateur (le serveur fait autorité) | 🟠 |
| G-17 | Bannière « à réinviter » d'un vrai départ | Elle s'affiche, propose de renvoyer la demande **et** de « Ne plus afficher » ; écartée, elle ne revient pas et la pastille s'éteint | 🟠 |

---

## H. Concerts et direct (ON AIR)

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| L-1 | Planifier un concert | Date, heure, lieu, groupe, setlist, visibilité | 🔴 |
| L-2 | Concert public | Il apparaît sur la page artiste publique | 🟠 |
| L-3 | Appuyer sur GO LIVE | Panneau : type de session, qui joue, concert du jour | 🔴 |
| L-4 | Concert prévu aujourd'hui | Il est **proposé**, jamais imposé ; « Aucun » possible — ⚠️ cicatrice b207 | 🟠 |
| L-5 | Passer en groupe dans le panneau | Seuls les concerts **de ce groupe** sont proposés | 🟠 |
| L-6 | Lancer avec un concert qui a une setlist | Le mode scène s'ouvre dessus — ⚠️ cicatrice b208 | 🟠 |
| L-7 | Quitter la setlist pendant le direct | On sort librement, **le direct continue** | 🔴 |
| L-8 | Montrer le QR | Adresse permanente `.../tonnom`, jamais un code de session | 🔴 |
| L-9 | 📱 Spectateur : scanner le QR hors direct | La fiche artiste | 🔴 |
| L-10 | 📱 Spectateur : pendant un direct sans partition | « Le concert commence dans un instant… » | 🔴 |
| L-11 | 📱 Spectateur : partition diffusée | Les paroles, dans **sa** langue à lui | 🔴 |
| L-12 | 📱 Spectateur : envoyer un cœur | Compté ; l'artiste le voit | 🔴 |
| L-13 | 📱 Spectateur : envoyer un mot | **Le texte arrive vraiment**, pas une coquille — ⚠️ cicatrice b197 | 🔴 |
| L-14 | 📱 Spectateur : voir la setlist | Il peut la parcourir | ⚪ |
| L-15 | 📱 Musicien invité : suivre avec les accords | Vue musicien, sans compte | 🟠 |
| L-16 | Couper puis relancer le direct | L'adresse du spectateur **reste valable** — ⚠️ cicatrice b170 | 🔴 |
| L-17 | Direct au nom d'un groupe | Le public voit le groupe ; **ma fiche perso n'est pas remplacée** — ⚠️ cicatrice b183 | 🟠 |
| L-18 | Arrêter le direct | La ligne est conservée : c'est la trace du concert | 🔴 |
| L-19 | Mode répétition | Les musiciens voient, le public ne voit rien | 🟠 |
| L-20 | Pause | Le public voit un écran d'attente | ⚪ |

---

## I. Historique, chiffres et retours

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| H-1 | Onglet Live après un direct | La séance est dans « Tes derniers lives » | 🔴 |
| H-2 | Trois lives affichés au plus | Bouton « Afficher plus » en dessous — ⚠️ cicatrice b204 | ⚪ |
| H-3 | Un live rattaché à un concert | Il porte **le nom du concert** — ⚠️ cicatrice b207 | 🟠 |
| H-4 | Ouvrir le détail d'un live | Morceaux joués **de ce direct seulement** — ⚠️ cicatrice b186 | 🔴 |
| H-5 | Mots du public dans le détail | Ceux de ce direct, avec leur texte | 🔴 |
| H-6 | Renommer un live | Le nom tient **après synchro et rechargement** — ⚠️ cicatrice b202 | 🟠 |
| H-7 | Supprimer un live | Local ; **les autres membres gardent le leur** — ⚠️ cicatrice b183 | 🟠 |
| H-8 | Le live supprimé après rechargement | Il ne revient pas — ⚠️ cicatrice b202 | 🟠 |
| H-9 | Un direct de Marco en solo | **N'apparaît pas** chez moi — ⚠️ cicatrice b183 | 🔴 |
| H-10 | Un direct du groupe lancé par Marco | Apparaît chez moi, « lancé par Marco » | 🟠 |
| H-9ter | Relancer un direct après un arrêt qui n'a pas abouti | Le direct part et RESTE actif — le bouton ne repasse pas au vert une seconde après ; un nouveau live est ouvert, l'ancien reste clos — ⚠️ cicatrice b217 | 🔴 |
| H-9bis | Arrêter le direct quand le réseau lâche | Le bouton ne reste JAMAIS sur « ⏳ Arrêt… » : au bout de 12 s il dit pourquoi et propose « ⏹ Arrêter quand même » ; l'app reprévient le serveur toute seule — ⚠️ cicatrice b216 | 🔴 |
| H-10bis | 📱📱 Page du spectateur pendant un direct | Elle affiche le concert — **jamais un écran noir** ; avec ou sans partition, en pause, sans réseau — ⚠️ cicatrice b215 | 🔴 |
| H-10ter | 📱📱 Paroles côté public | Un vers par ligne, centré, **sans grille d'accords ni ligne vide en trop** ; les sections sont rappelées en petit ; une section sans paroles (l'intro) ne s'affiche pas | 🟠 |
| H-11 | Fiche Artiste : les quatre chiffres | Cohérents avec l'historique, **jamais 0 spectateur avec des cœurs** — ⚠️ cicatrice b201/b203 | 🔴 |
| H-12 | Concert passé rattaché à un live | Il affiche ses cœurs, mots et spectateurs — ⚠️ cicatrice b207 | 🟠 |
| H-13 | Concert jamais joué | Aucun chiffre inventé | 🟠 |
| H-14 | Cœurs reportés sur les morceaux | Le morceau affiche ses ❤ dans la bibliothèque | ⚪ |
| H-15 | Réinitialiser les concerts (Réglages) | Les anciens lives cessent de s'afficher, **et ça tient** — ⚠️ cicatrice b200/b202 | 🟠 |

---

## J. Profil artiste et page publique

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| A-12 | Créer le profil artiste | Nom, photo, bio, liens | 🔴 |
| A-13 | Aperçu « ce que voit le public » | Conforme à la vraie page | 🟠 |
| A-14 | Ouvrir sa page publique | Elle s'ouvre **dans l'app**, avec un retour — ⚠️ cicatrice b187 | 🟠 |
| A-15 | Lien de pourboire | Visible du public | 🟠 |
| A-16 | Réglages de visibilité de la fiche | Respectés sur la page publique | ⚪ |
| A-17 | Suiveurs | Compte cohérent | ⚪ |
| A-18 | Signaler un contenu (page publique) | Formulaire, envoi confirmé | 🟠 |
| A-19 | CGU | Accessibles ; en anglais, l'avertissement dit que le français fait foi | ⚪ |

---

## J bis. Réglages, export, données

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| R-1 | Exporter la bibliothèque en PDF | Carnet complet, lisible | 🟠 |
| R-2 | Réinitialiser une partie des données | Confirmation explicite ; seule la partie choisie part | 🟠 |
| R-3 | 📱📱 Réinitialiser sur A | Le cloud de B ne ressuscite pas ce qui a été effacé — ⚠️ cicatrice b137/b202 | 🔴 |
| R-4 | Tableau de bord fondateur | Réservé aux e-mails autorisés ; chiffres et coûts IA | ⚪ |

---

## K. Sauvegarde et récupération

*Nouveau en b209. C'est le filet : ce qui protège l'utilisateur si nos
serveurs disparaissent, ou s'il change de téléphone.*

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| B-1 | Réglages → Exporter → **💾 Enregistrer une sauvegarde** | Un fichier `sing2me-AAAA-MM-JJ.json` est proposé au téléchargement | 🔴 |
| B-2 | Ouvrir ce fichier dans un éditeur de texte | On y **lit ses titres, ses paroles et ses accords** — c'est la promesse : il se relit sans Sing2Me | 🟠 |
| B-3 | Supprimer un morceau, puis **↩︎ Restaurer** cette sauvegarde | Le morceau revient | 🔴 |
| B-4 | Modifier un morceau, puis restaurer une sauvegarde **plus ancienne** | La modification récente **n'est pas écrasée** — la restauration ajoute, elle ne remplace pas | 🔴 |
| B-5 | Restaurer un fichier qui n'est pas une sauvegarde (un PDF, un texte) | Message clair nommant la raison, **et rien ne change** dans la bibliothèque | 🟠 |
| B-6 | En tête de l'onglet Morceaux, avec ≥ 12 morceaux et aucune sauvegarde | Un encart discret propose d'en garder une — **aucune alarme, aucun rouge** | ⚪ |
| B-7 | Toucher **Plus tard** sur cet encart | Il disparaît, et **ne revient pas** au rechargement | 🟠 |
| B-8 | Enregistrer une sauvegarde | L'encart disparaît définitivement | ⚪ |
| B-9 | Bibliothèque de moins de 12 morceaux | **Aucun encart** — on ne dérange pas qui n'a rien à protéger | ⚪ |

*Non testable à la main : la ceinture qui empêche une synchronisation de
vider une bibliothèque remplie. Elle demande de simuler une panne serveur —
c'est couvert par les tests automatiques (suite `backup`).*

---

## L. Transversal — à vérifier après **chaque** livraison

| N° | Cas | Ce qu'on doit voir | Prio |
|---|---|---|---|
| T-1 | 360 px (petit téléphone) | Rien ne déborde, rien n'est coupé | 🔴 |
| T-2 | Tablette | Mise en page cohérente | 🟠 |
| T-3 | ≥ 900 px | Sidebar, pas de ligne à rallonge | 🟠 |
| T-4 | Aucune boîte native `alert/confirm/prompt` | Toujours les feuilles du design system | 🟠 |
| T-5 | Barre du bas pendant le défilement | Elle reste collée en bas — ⚠️ cicatrice b183/b184 | 🟠 |
| T-6 | Coupure réseau en pleine utilisation | Aucun écran mort ; message sans jargon | 🔴 |
| T-7 | Version affichée en bas de l'onglet Artiste | Correspond à la dernière livraison | ⚪ |
| T-8 | `/version.txt` en ligne | Même numéro | ⚪ |

---

## Ce qui n'est **pas** encore là (ne pas tester)

Pour éviter de signaler comme KO ce qui n'existe pas :

- reconnaissance des PDF scannés / photos (OCR) ;
- import des sauvegardes complètes d'autres applications (archives) ;
- écran de reprise de répertoire, écran de preuve après le premier import,
  bande de reprise (chantier en cours, en pause) ;
- glisser-déposer de fichiers (le dépôt passe par le bouton) ;
- rattacher un live à un concert **après coup** ;
- e-mails d'accueil ;
- Licence Scène et tout ce qui touche au paiement ;
- application native (Capacitor).

---

## Compte des cas

| Domaine | Cas | 🔴 Vitaux |
|---|---|---|
| A. Arrivée et compte | 11 | 6 |
| B. Bibliothèque | 16 | 6 |
| C. Partition et versions | 17 | 6 |
| D. Import | 18 | 6 |
| E. Setlists | 15 | 5 |
| F. Mode scène | 9 | 3 |
| G. Groupes | 15 | 5 |
| H. Concerts et direct | 21 | 10 |
| I. Historique et chiffres | 15 | 5 |
| J. Profil et page publique | 8 | 1 |
| J bis. Réglages et données | 4 | 1 |
| K. Sauvegarde et récupération | 9 | 3 |
| L. Transversal | 8 | 2 |
| **Total** | **166** | **59** |

**Suggestion d'ordre** : commence par les 🔴 de H (concerts et direct) et
de G (groupes) — c'est là que sont la plupart des cicatrices récentes et
c'est ce qui sert en vrai un soir de concert. Les ⚪ peuvent attendre.
