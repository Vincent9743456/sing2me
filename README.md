# 🎸 mojosong

**Le compagnon intelligent des musiciens, des groupes et de leurs concerts.**

Application web (React + Vite) — utilisable sur ordinateur **et** sur
téléphone via le navigateur. Local-first : toutes les données restent dans
ton navigateur ; l'architecture est prête pour Supabase (v2 collaborative).

---

## 🚀 Démarrer sur ton PC

Prérequis : Node.js LTS (https://nodejs.org), déjà installé si tu as suivi
les étapes précédentes.

Dans un terminal ouvert dans ce dossier :

```bash
npm install
npm run dev
```

Le terminal affiche deux adresses :

- `http://localhost:5173` → à ouvrir sur ton PC ;
- `http://192.168.x.x:5173` (« Network ») → à ouvrir sur ton **téléphone**
  (même Wi-Fi que le PC).

Chaque modification du code se recharge instantanément.

---

## 🌍 Mise en ligne (pipeline actuel)

Le dépôt GitHub `Vincent9743456/sing2me` est la **source de vérité** :
Vercel y est connecté, et **chaque push sur `main` déploie
automatiquement** https://sing2me-three.vercel.app. Plus besoin de
`vercel --prod`.

À chaque livraison : incrémenter `src/version.ts` (APP_BUILD) **et**
`public/version.txt`, puis vérifier après déploiement que
`https://sing2me-three.vercel.app/version.txt` renvoie la bonne version.

---

## 📱 Fonctionnalités (MVP du descriptif)

**Bibliothèque musicale** — titre, artiste, tonalité, tempo, capo, durée,
tags, structure en sections, commentaires ; recherche et filtres par tags ;
détection de doublons à l'import.

**Import intelligent** — fichier, copier-coller, ou **recherche Ultimate
Guitar intégrée** : tape le titre, choisis la version (Chords, Tab, Bass,
Ukulélé… avec note et votes) et elle se charge, prête à vérifier avant
import (version en ligne requise). Un lien direct reste possible. Formats : « accords au-dessus des
paroles » (fusion automatique position par position), ChordPro
(`{title:…}`, accords `[Am]`), OnSong (`Title:`, `Key:`…), Word (.docx).
Les en-têtes `[Couplet 1]` / `Refrain:` / `[Verse]`… deviennent le résumé
de **structure en tête de partition** (avec accords), les paroles restant
un bloc continu. PDF : texte extrait dans le navigateur (pdf.js via CDN,
lignes reconstruites d'après les positions pour préserver l'alignement
accords/paroles) — les PDF scannés (images) restent hors de portée.

**Structure** — notes libres en tête de partition (« Intro batterie
seule, pont ×2 avant le dernier refrain… ») : ce qui est stable et
descriptif sur l'arrangement. (Décision actée : plus de sections avec
accords par partie — c'est du texte libre.)

**Notes de répétition** — bouton 💬 sur chaque morceau (et en mode
scène) : notes partagées (👥 tout le groupe) ou personnelles (🔒),
datées, modifiables, supprimables (la suppression se propage). Dictée
vocale 🎤 (navigateur) et synthèse ✨ par IA (transforme la note vocale
en consigne courte). Signées avec ton nom de musicien (onglet Artiste).
Jamais partagées si personnelles.

**Versions multiples** — chaque morceau peut avoir plusieurs versions
(tonalité, structure, paroles) : « Standard », « Acoustique », par
groupe… Sélecteur en haut de la partition (＋ Nouvelle version = copie de
l'actuelle), et chaque setlist peut choisir sa version morceau par
morceau.

**Une seule vue pour tous les musiciens** (décision actée : les vues
différenciées par instrument ont été supprimées) — tout le monde voit la
partition complète ; la vue « paroles seules » n'existe que pour le
public (partage/QR/ON AIR).

**Groupes** — onglet 👥 dédié : fiches de groupe (musiciens, matériel,
invitations par lien/QR entre comptes), répertoire synchronisé, et
**espace de discussion** par groupe (💬 messages, 🎵 propositions de
chansons, 🥁 répéts, 🎤 concerts).

**Défilement automatique** — sur demande, vitesse réglable, dans la
partition comme en mode scène.

**Transposition** — instantanée, par tonalité ; dièses/bémols cohérents
selon l'armure ; **capo automatique** (suggère la position pour jouer des
formes ouvertes) ; tonalité spécifique par morceau **dans chaque setlist**.

**Setlists** — création illimitée, **drag & drop** (+ flèches sur mobile),
durée totale estimée, commentaires par morceau, tonalités spécifiques.

**Mode scène** — plein écran, très grandes polices (réglage mémorisé),
**swipe** entre morceaux, flèches clavier, **défilement automatique** à
vitesse réglable, anti-veille (Wake Lock), thème noir, zéro distraction,
**fonctionne hors connexion** (données locales).

**Partage simple & QR codes** — deux boutons distincts : **Partager au
groupe** (accords, structure, commentaires) et **Partager au public**
(paroles seules). Chaque morceau, setlist, concert et le profil artiste
génèrent un lien autonome + QR code ; le destinataire n'a besoin d'aucune
application.

**Concerts** — date, heure, lieu, description, setlist associée,
visibilité ; **QR public** : setlist + paroles, liens streaming, prochaines
dates.

**Profil artiste** — photo, bio, liens Spotify / Apple Music / Deezer /
YouTube / réseaux sociaux, page publique avec les concerts à venir.

---

## 🗂 Structure du projet

```
sing2me-web/
├── index.html
├── vite.config.ts
├── src/
│   ├── main.tsx / App.tsx        # Entrée + routage (hash)
│   ├── router.tsx                # Routeur sans dépendance
│   ├── store.tsx                 # Store local-first (localStorage)
│   ├── types.ts                  # Modèle de données
│   ├── theme.css                 # Design minimaliste sombre
│   ├── lib/
│   │   ├── chords.ts             # Transposition, capo auto, tonalités
│   │   ├── chordpro.ts           # Affichage [Accord]paroles
│   │   ├── importer.ts           # Import intelligent multi-formats
│   │   ├── docx.ts               # Extraction texte des .docx (sans lib)
│   │   ├── model.ts              # Structure, migration de données
│   │   ├── ug.ts                 # Conversion Ultimate Guitar
│   │   └── share.ts              # Liens de partage compressés
│   ├── components/               # UI partagée (SongBody, ShareModal…)
│   └── pages/                    # Bibliothèque, morceau, import,
│                                 # setlists, scène, concerts, artiste,
│                                 # page publique
├── api/fetch-tab.js              # Fonction serveur (import Ultimate Guitar)
├── api/search-tabs.js            # Fonction serveur (recherche UG)
├── api/ai-clean.js               # Fonction serveur (nettoyage IA, optionnel)
└── supabase/schema.sql           # Schéma v2 (collaboratif) prêt à exécuter
```

---

## 💛 Public : cœurs, pourboires, conversion

Pendant le direct, le public peut envoyer des **❤** (bouton flottant sur la
page live) — comptés par chanson et archivés : **statistiques** visibles
dans l'onglet Artiste. Les **pourboires** (2 € / 5 € / 10 € / libre)
utilisent ton lien de paiement (PayPal.me, Lydia, Stripe…) configuré dans
le profil — les montants pré-remplis fonctionnent avec PayPal.me.

Les **partages groupe** affichent « ➕ Ajouter à ma bibliothèque » : un
musicien qui reçoit ta setlist peut l'importer dans son propre mojosong en
un clic — la porte d'entrée vers l'application. L'app est **installable**
sur l'écran d'accueil (menu du navigateur → « Ajouter à l'écran
d'accueil » / « Installer »).

Modèle envisagé : gratuit pour tous ; à terme, commission uniquement sur
les pourboires reçus (via Stripe Connect, phase ultérieure).

### 💬 Espace du groupe (discussion entre membres)

Chaque groupe publié dans le cloud dispose d'un fil de discussion
(bouton « Espace du groupe » sur la fiche du groupe) : messages typés —
💬 discussion, 🎵 proposition de chanson (avec bouton « Chercher cette
chanson » qui pré-remplit l'import), 🥁 répétition, 🎤 concert. Stocké
dans Supabase (table `band_messages`, RLS créateur + membres, suppression
par l'auteur ou le créateur), rafraîchi toutes les 20 s quand le fil est
ouvert. **Après mise à jour : ré-exécuter `supabase/bands.sql` dans le
SQL Editor** (idempotent) pour créer la table.

### ⚖️ Note juridique — récupération Ultimate Guitar (acté)

La recherche/récupération UG intégrée (fonctions serveur `api/search-tabs`
et `api/fetch-tab`) enfreint les CGU d'UG et reproduit des œuvres sous
licence : acceptable en phase de test privée (usage individuel, à la
demande, aucun stockage serveur, passe-plat), mais **à réévaluer avec un
avocat avant tout lancement public/commercial**. Le chemin pérenne est la
modalité « Document / texte » (l'utilisateur colle le contenu, l'analyse +
IA le reformatent : l'acte de copie est le sien). Alternatives à terme :
licences éditeurs, ou restriction aux contenus libres / compositions
originales. Risque opérationnel à garder en tête : UG peut bloquer ou
changer son format à tout moment — la fonction peut casser sans prévenir.

**Import en masse — service de migration.** Faciliter l'arrivée depuis
d'autres sites/applications est un argument d'adoption clé (« ne pas
tout refaire »). La modalité « 4 · Plusieurs liens » couvre :
- **Ultimate Guitar** : déposer la page « My tabs »/favoris enregistrée
  (Ctrl+S → fichier .html) → tous les liens de partitions détectés d'un
  coup ; ou coller des liens en vrac.
- **Autres applications** : dépôt multiple de fichiers exportés (txt,
  ChordPro .cho/.pro, OnSong, Word, PDF texte) — un fichier = un morceau.
- **Nettoyage IA ciblé** : après l'import, seuls les morceaux dont
  l'analyse signale un format problématique (⚠) se voient proposer un
  passage IA, en un clic pour toute la fournée.

Garde-fous anti-aspiration (acté) : l'outil sert à migrer **sa**
collection, pas à copier le site — seules les pages de partition
individuelle sont retenues (les pages de listing/recherche/explore sont
rejetées), plafond de 200 liens par fournée, une requête à la fois avec
temporisation. On ne peut pas prouver côté URL qu'une tab publique vient
du profil de l'utilisateur, mais ces limites rendent la collecte de
masse impraticable.

Procédures vérifiées par source (doc officielle, août 2026) :
- **Ultimate Guitar** : My tabs/favoris → afficher toutes les partitions
  sur la page, Ctrl+S, déposer le(s) .html. ✔ opérationnel.
- **OnSong** : Share/Export, portée « toutes les chansons », format
  « OnSong Text » ou « Plain Text » (.txt) → dépôt multiple. ✔ nos
  formats. L'« OnSong Archive/Backup » (conteneur propriétaire) n'est
  pas lu — piste : accepter ces archives (zip de textes).
- **SongbookPro** : export global uniquement en .SBPBackup propriétaire
  (non lisible) ; le partage par chanson produit du ChordPro. ✔ partiel
  — piste : parser le .SBPBackup.
- **Sites web de paroles/accords** (e-chords, Boîte à chansons…) : pas
  d'export ; copier-coller de la page via « Document / texte » (l'IA
  reformate si besoin). ✔ opérationnel morceau par morceau.
- **Songsterr / Guitar Pro / MuseScore** : formats binaires ou MusicXML
  — hors périmètre v1 (piste v3 : convertisseur MusicXML).

**« Lien permanent » UG.** La modalité est **ré-exécutable** : elle
ignore les morceaux déjà présents (rapprochement titre + paroles), donc
redéposer régulièrement sa page « My tabs » suffit à rattraper les
nouveautés.
Elle respecte aussi les **suppressions volontaires** : un morceau supprimé
de mojosong (tombstone par titre normalisé, comme pour la synchro de
groupe) n'est pas réimporté par l'import en masse, même si sa tab existe
toujours sur UG — seul un import explicite via « 2 · Coller un lien »
peut le faire revenir.
Une vraie synchronisation automatique et permanente avec un compte UG
n'est pas possible proprement aujourd'hui : UG n'a pas d'API publique et
la liste « My tabs » est derrière le login (il faudrait stocker les
identifiants UG de l'utilisateur — fragile et juridiquement exclu, cf.
ci-dessus). Piste v3 (app native / extension navigateur) : détecter
depuis le navigateur de l'utilisateur, connecté à UG, les nouvelles
partitions de « My tabs » et proposer leur import — l'acte de copie
reste alors celui de l'utilisateur.

---

## 🔴 Mode ON AIR (direct pour le public)

Le bouton **ON AIR** (présent sur toutes les pages) partage en direct la
partition en cours : les spectateurs qui ouvrent le lien `…/#/live` voient
les **paroles du morceau joué**, mises à jour automatiquement. Pause = écran
d'attente ; direct arrêté = ils ne voient que la page artiste. Le lien (et
son QR, dans le panneau ON AIR) ne change jamais — imprime-le une fois pour
tous tes concerts.

Configuration (une seule fois) :

1. Dans ton projet **Supabase** (https://supabase.com) : SQL Editor →
   exécute le contenu de `supabase/live.sql`.
2. Dans **Vercel** → Settings → Environment Variables, ajoute :
   - `SUPABASE_URL` : l'URL du projet (Settings → API → Project URL)
   - `SUPABASE_SERVICE_KEY` : la clé `service_role` (Settings → API —
     secrète, jamais dans le code)
   - `LIVE_KEY` : un secret de ton choix (ex. une phrase)
3. Redéploie (`vercel --prod`), puis saisis la même `LIVE_KEY` dans
   l'application → onglet Artiste → « Mode ON AIR ».

---

## ✨ Nettoyage IA (optionnel)

Le bouton « Corriger le format avec l'IA » de l'écran d'import reformate
les partitions mal fichues (accords mal placés, tablatures) sans toucher
aux paroles. Pour l'activer :

1. Crée une clé API sur https://console.anthropic.com (payant à l'usage,
   quelques centimes par partition).
2. Dans Vercel : ton projet → **Settings → Environment Variables** →
   ajoute `ANTHROPIC_API_KEY` avec ta clé.
3. Redéploie (`vercel --prod`).

Sans clé, tout le reste fonctionne normalement (le nettoyage heuristique
intégré fait déjà l'essentiel).

---

## ☁ Comptes musiciens & synchronisation (étape 1 — en place)

Le bloc « Mon compte » (onglet Artiste) permet de créer un compte gratuit
(**lien magique par email**, sans mot de passe, ou **Google / Facebook**) et
de sauvegarder la bibliothèque dans le cloud : elle suit le musicien sur
tous ses appareils. Local-first inchangé : sans compte ou sans réseau, tout
fonctionne comme avant ; à la connexion, local et cloud sont **fusionnés**
(le plus récent gagne, rien n'est perdu).

### Mise en service (une fois)

1. **Supabase → SQL Editor** : exécute `supabase/auth.sql` (crée la table
   `user_library` avec sa sécurité RLS ; ré-exécutable sans risque).
2. **Supabase → Authentication → URL Configuration** : renseigne
   **Site URL** = `https://sing2me-three.vercel.app` (ton domaine).
3. **Vercel → Settings → Environment Variables** (Production) :
   - `VITE_SUPABASE_URL` = `https://zssnwjtfzbymtsiccvao.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la clé **anon public** (Supabase →
     Settings → API Keys). Elle est faite pour être publique — la sécurité
     repose sur RLS, jamais sur cette clé.
4. Redéploie : `vercel --prod`.

Le **lien magique** fonctionne aussitôt (email envoyé par Supabase ;
limite de quelques emails/heure sur le plan gratuit — largement assez pour
commencer ; un SMTP personnalisé lèvera la limite plus tard).

### Étape 2b — Répertoire de groupe synchronisé (en place)

Ré-exécute `supabase/bands.sql` (il ajoute la table `band_library`).
Ensuite, pour chaque groupe publié dans le cloud, les comptes du créateur
et des membres partagent automatiquement : les **versions du groupe** des
morceaux, les **notes de répétition partagées** (jamais les 🔒
personnelles), et les **setlists du groupe** (avec Sono & scène). La
synchro tourne à la connexion, après chaque modification, puis toutes les
90 s. Les identifiants locaux de chacun sont traduits (les morceaux se
retrouvent par titre) ; les versions solo, réglages perso et idées ne
quittent jamais l'application de leur propriétaire. Un musicien qui
rejoint un groupe via l'invitation reçoit le répertoire complet en
quelques secondes — et ses modifications reviennent vers les autres.

### Étape 2 — Groupes réels entre comptes (en place)

Exécute aussi `supabase/bands.sql` (SQL Editor, ré-exécutable). Ensuite :
un créateur de groupe **connecté** qui touche « 📨 Inviter un musicien »
publie le groupe dans le cloud ; l'invitation contient alors un jeton
d'adhésion. Le musicien invité **connecté** voit un bouton
« 🤝 Rejoindre le groupe » : un clic, et il apparaît dans la fiche du
groupe avec ✓ (nom d'artiste + instrument), sans échange de carte. Le
créateur peut retirer un membre ; un membre peut quitter. Sans compte,
l'ancien parcours (répertoire + carte de musicien) reste entier.

### Google / Facebook (optionnel, quand tu veux)

Supabase → Authentication → Sign In / Up → Providers :
- **Google** : créer un « OAuth Client ID » sur console.cloud.google.com,
  copier Client ID + Secret dans Supabase, ajouter l'URL de callback
  affichée par Supabase dans la console Google.
- **Facebook** : créer une app sur developers.facebook.com (produit
  « Facebook Login »), copier App ID + Secret dans Supabase, ajouter
  l'URL de callback Supabase dans la config Facebook.

Sans cette config, les boutons Google/Facebook affichent une erreur
explicite — le lien magique, lui, marche toujours.

---

## 🔮 Version 2 : espace collaboratif (Supabase)

`supabase/schema.sql` contient le schéma complet : groupes et membres
(avec instrument pour les vues personnalisées), morceaux/setlists/concerts
partagés, annotations de répétition avec audience (générale, privée, par
instrument), **historique des versions**, profils artistes, liens de
partage courts, sécurité RLS et temps réel.

Quand tu seras prêt : crée un projet gratuit sur https://supabase.com,
exécute `schema.sql` dans SQL Editor, et on branchera l'authentification et
la synchronisation (la couche `store.tsx` est conçue pour ça).

---

## 📱 Version 3 : application native iOS / Android (mémo)

**Décision d'architecture (acté)** : l'app native COEXISTE avec l'accès
web — le web reste l'outil confortable d'édition (clavier, grand
écran), l'app l'outil de scène. La cohabitation est garantie par
construction : toute la synchro passe par le serveur (user_library,
band_library, live_state), avec des règles de fusion côté données (LWW,
tombstones) identiques quel que soit le client. **Voie recommandée :
Capacitor** — la même base de code web, emballée pour les stores : zéro
divergence web/natif, les correctifs profitent aux deux d'un coup, et
les capacités natives ci-dessous s'ajoutent par plugins. (React
Native/Expo = refonte complète, à ne considérer que si Capacitor
montrait ses limites.)

À prévoir pour l'app native, impossible en web :

- **Mode concert renforcé** : proposer d'activer automatiquement
  **Ne pas déranger** (blocage des appels et notifications) à l'entrée en
  mode scène / régie / suivi, et le désactiver en sortant. Android le
  permet (permission « accès Ne pas déranger ») ; iOS est plus restrictif
  (au minimum : guider vers le mode Concentration, ou l'activer via un
  raccourci). En web, seule l'astuce 🔕 affichée dans les vues de concert
  est possible — l'anti-veille, lui, est déjà géré (Wake Lock).
- Notifications push pour les fans (concerts à proximité, suivi d'artiste).
- Import des PDF scannés (images) par OCR — l'import des PDF texte est
  fait (web, pdf.js).
- **Sauvegarde sur le cloud de l'utilisateur** (Dropbox d'abord — clé app
  déjà créée en mars —, puis OneDrive/iCloud) en option de la sauvegarde
  Supabase : « ta bibliothèque, ton cloud ». Décision actée : stockage
  Supabase privé + CGU (page #/cgu, contact de retrait) ; chiffrement côté
  client en réserve si l'app grossit.

---

## 📊 Métriques fondateurs (chantier 5)

> Requêtes SQL à lancer dans **Supabase → SQL Editor**. Pas d'interface :
> ces chiffres sont pour Vincent + Marco. Les données viennent des sessions
> ON AIR enregistrées par le chantier 2 (`supabase/live.sql` doit être
> exécuté). **Mesure seulement — aucun seuil, aucune limite.**

### Taux de « deuxième session » ON AIR

Combien d'artistes ont lancé ≥ 1 puis ≥ 2 concerts, et en combien de temps
(clé = nom d'artiste enregistré sur la session) :

```sql
-- Récapitulatif : artistes avec ≥1 et ≥2 sessions
with s as (
  select artist_name,
         count(*)                              as sessions,
         min(started_at)                       as first_at,
         (array_agg(started_at order by started_at))[2] as second_at
  from live_sessions
  where coalesce(artist_name, '') <> ''
  group by artist_name
)
select
  count(*)                                   as artistes_1_session,
  count(*) filter (where sessions >= 2)      as artistes_2_sessions,
  round(100.0 * count(*) filter (where sessions >= 2) / nullif(count(*),0), 1)
                                             as taux_2e_session_pct,
  -- délai médian entre la 1ʳᵉ et la 2ᵉ session
  percentile_cont(0.5) within group (
    order by extract(epoch from (second_at - first_at)) / 86400.0
  ) filter (where second_at is not null)     as delai_median_jours
from s;
```

Détail par artiste (audience cumulée, nb de sessions) :

```sql
select artist_name,
       count(*)          as sessions,
       min(started_at)   as premiere,
       max(started_at)   as derniere,
       sum(uniques)      as uniques_cumules
from live_sessions
group by artist_name
order by sessions desc, derniere desc;
```

### Entonnoir d'onboarding — état actuel

⚠️ **À ce jour, l'entonnoir d'onboarding N'EST PAS alimenté en production.**
Les horodatages de la checklist de démarrage (`sing2me/onb/steps`) sont
écrits **uniquement en localStorage** (côté navigateur) — ils ne sont jamais
envoyés au cloud, donc **non interrogeables** côté Supabase. Il n'y a donc
pas encore de requête possible pour le taux de complétion des étapes.

Pour rendre l'entonnoir mesurable, il faudrait synchroniser ces horodatages
vers le cloud (table dédiée, ou champ du profil synchronisé). **Décision
produit à cadrer** avant implémentation (RGPD : ce sont des données de
comportement rattachées à un compte).

## 🛠 Commandes utiles

| Commande            | Effet                                |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Serveur de développement             |
| `npm run build`     | Version optimisée (dossier `dist/`)  |
| `npm run preview`   | Tester la version optimisée          |
| `npm run typecheck` | Vérification TypeScript              |
| `git push` (main)   | Publier en ligne (déploiement Vercel automatique) |
