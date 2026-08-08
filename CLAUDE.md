# Sing2Me — Règles permanentes du projet

## Design & interface (obligatoire)

1. **Lire `DESIGN_SYSTEM.md` avant toute modification d'interface.**
2. Aucune nouvelle couleur hors design tokens (`:root` de theme.css) —
   si un token manque, l'ajouter au design system d'abord.
3. Aucune nouvelle valeur arbitraire d'espacement — utiliser `--sp-*`.
4. Réutiliser les composants existants (`COMPONENT_INVENTORY.md`) avant
   d'en créer ; un composant par fonction.
5. Ne pas multiplier les cartes : la hiérarchie passe par les titres,
   l'espacement et les séparations discrètes.
6. Préserver la lisibilité des paroles et accords : aucun effet ne doit
   coûter du contraste ou de la place au contenu musical.
7. Le mode scène est une interface spécifique : pas de navigation
   générale, cibles ≥ 48px, sortie protégée, priorité lire → naviguer →
   défiler → réagir.
8. Après chaque changement d'interface : contrôler responsive (360px,
   tablette, sidebar ≥ 900px) et accessibilité
   (`DESIGN_QA_CHECKLIST.md`, `ACCESSIBILITY_CHECKLIST.md`).
9. Aucune régression fonctionnelle pour une amélioration esthétique —
   en cas de doute, on n'expédie pas le lot.
10. Pas de `alert()/confirm()/prompt()` natifs : utiliser
    ConfirmSheet/PromptSheet/Toast (composants Feedback).

## Déploiement & versions (pipeline actuel)

- Source de vérité : ce dépôt GitHub (`Vincent9743456/sing2me`).
  **Tout push sur `main` déclenche un déploiement Vercel automatique**
  vers https://sing2me-three.vercel.app — pas de `vercel --prod` manuel.
- **À chaque livraison, incrémenter la version aux DEUX endroits** :
  - `src/version.ts` → `APP_BUILD = 'J mois AAAA · bN'` (affiché en bas
    de l'onglet Artiste) ;
  - `public/version.txt` → `bN` seul (permet de vérifier le déploiement
    depuis l'extérieur : GET /version.txt).
- Un seul commit par livraison, message en français :
  « bN : résumé des changements ».
- **Quota de déploiements Vercel (compte Hobby)** : chaque push de branche
  consomme un déploiement de prévisualisation EN PLUS de celui de
  production. Une soirée à sept lots l'a épuisé (« Deployment rate limited
  — retry in 24 hours »), et la production est restée quatre versions en
  arrière. Regrouper plusieurs retours en un seul lot plutôt que d'en
  livrer un par remarque. Rien ne relance un déploiement refusé : il faut
  un NOUVEAU commit sur `main` (un commit vide ne suffit pas — le merge en
  rebase l'écarte).
- Après push : vérifier https://sing2me-three.vercel.app/version.txt.
- Supabase : projet `zssnwjtfzbymtsiccvao` ; après modification d'un
  fichier `supabase/*.sql`, demander à Vincent de le ré-exécuter dans le
  SQL Editor (les fichiers sont idempotents) —
  https://supabase.com/dashboard/project/zssnwjtfzbymtsiccvao/sql/new.
  **Le contenu n'est pas une colonne parmi d'autres** (b197) : filtrer un
  payload sur les colonnes existantes est juste, MAIS jamais au point
  d'écrire une ligne amputée de ce qu'elle transporte. Le livre d'or a
  ainsi enregistré quatre mots du public SANS leur texte — le spectateur
  lisait « Message transmis », l'artiste recevait une coquille. Écrire
  dans la colonne qui existe vraiment (`body`, ou `content` sur les bases
  anciennes) et REFUSER s'il n'y en a aucune.
  **`create table if not exists` NE CORRIGE PAS une table existante**
  (b195) : `live_messages` avait été créée avant ce fichier, sans colonne
  `author` — toutes les lectures la demandaient et échouaient en 400,
  pendant que l'écriture (qui interroge le schéma réel) continuait
  d'enregistrer. Quatre messages en base, zéro à l'écran. Toute cascade de
  replis doit donc se terminer par un `select=*`, qui ne peut pas échouer
  sur une colonne inconnue.
  **État : `live.sql` rejoué INTÉGRALEMENT le 8 août 2026** — toutes les
  colonnes accumulées depuis b121 sont en place (`performer`,
  `setlist_name`, `live_id`, `band_id`, `session_id`, `owner_id`). Ne
  jamais redonner un bloc PARTIEL : une colonne oubliée ne casse rien
  bruyamment, elle fait retomber la fonction sur un repli silencieux. Variables d'environnement
  (Vercel) : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL,
  SUPABASE_SERVICE_KEY, LIVE_KEY, ANTHROPIC_API_KEY.

## Architecture — les 3 règles d'ergonomie (obligatoires)

Simplification actée (spec ergonomie) — s'appliquent à tout nouveau code :

1. **Chaque objet a une seule maison.** Les morceaux vivent dans l'onglet
   Morceaux ; setlists et groupes y *font référence*, jamais de « deuxième
   bibliothèque ». Toute liste de morceaux ailleurs est une **vue filtrée**.
2. **Une action = un geste unique appris une fois.** Affecter des morceaux
   (à une setlist ou à un groupe) passe TOUJOURS par le **même composant
   sélecteur** (`src/components/SongPicker.tsx`), dans les deux sens :
   depuis le morceau (`AssignSheet` — feuille « Ajouter à… »), depuis la
   cible (`SongCollector` — plein écran, recherche + multi-sélection).
   Ne jamais recréer un picker ad hoc.
3. **Un écran = une mission, une action principale.** L'avancé (plan de
   scène, sono, régie, stats, versions) vit derrière des plis ou « ⋯ » et
   ne coûte rien à qui ne le cherche pas. Jamais de nouvel écran si un
   existant peut accueillir la fonction ; jamais de deuxième chemin vers
   une action existante.

## État actuel & backlog (août 2026)

- Version en production : voir `src/version.ts` (b17 au 5 août 2026 :
  onglet 👥 Groupes dédié, groupe affiché sur les setlists, espace de
  discussion de groupe `band_messages`).
- Décisions produit actées (ne pas revenir dessus sans Vincent) :
  - plus de vues par musicien (tout le monde voit la partition
    complète ; la vue « paroles » ne sert qu'au public/QR) ;
  - « Structure » = notes libres (`structureNotes`), plus de sections
    avec accords par partie ;
  - modifier une partition ne change jamais la version active par
    défaut d'un morceau ; la tonalité/capo de la version principale se
    propage aux versions qui suivaient les mêmes valeurs ;
  - **transposer MODIFIE la version** (décision Vincent, b169) : les
    accords écrits sont réécrits et la tonalité suit
    (`transposeSong`) ; poser un capo modifie la version
    (`setSongCapo`). Ce n'est plus un réglage d'écran mémorisé sur
    l'appareil — c'est la seule façon pour que le mode scène, le direct
    et le suivi de groupe voient la même chose que le musicien.
    Transposer est sa propre annulation. **Exception** : dans une
    setlist, les boutons règlent la tonalité de CE concert
    (`keyOverride` de l'item), jamais la version — le repli le dit
    (« Tonalité de ce concert »). La tonalité annoncée aux autres
    musiciens vient du morceau (`playedKey`), jamais de la clé de
    rafraîchissement de la diffusion ;
  - **invariant « originale maîtresse »** (assoupli b135) : la 1ʳᵉ version
    (`versions[0]`) est TOUJOURS une version personnelle (`bandId ''`) —
    elle reste dans la bibliothèque perso, pilote les autres, n'est jamais
    absorbée par un groupe. Depuis b135 (décisions Vincent + feedback
    Marco) elle EST supprimable et remplaçable : « ⭐ En faire la version
    de référence » promeut le contenu d'une autre version dans
    l'originale, et supprimer l'originale fait monter la version suivante
    en référence (une secondaire personnelle monte telle quelle ; sinon la
    première version de contexte est clonée en personnelle). Jamais de
    morceau sans version personnelle en tête. **Modèle simplifié (b113, complété b115)** : un
    morceau = l'originale + AU PLUS une version par groupe qui l'a au
    répertoire + une version **Solo** optionnelle (« Solo » est un
    contexte à part entière, `SOLO_BAND_ID = 'solo'`, modifiable à part
    comme une version de groupe mais jamais partagée ni synchronisée) —
    rien d'autre (plus de « versions setlist » ; les ajustements d'un
    concert passent par la tonalité de l'item de setlist). Les setlists
    et lectures en contexte solo utilisent la version Solo quand elle
    existe, sinon l'originale. Garanti par `ensureOriginalVersion` +
    `dedupeBandVersions` (réparations au chargement), `duplicateVersion`
    idempotente par contexte, et la garde dans `removeVersion` ;
  - retirer un morceau du répertoire d'un groupe est un acte de niveau
    groupe propagé à tous (chacun garde sa copie personnelle) ;
  - **quitter un groupe ne détruit rien, mais ne laisse rien d'orphelin**
    (b185) : mes morceaux restent (les versions du groupe redeviennent
    personnelles ou disparaissent au profit de mon originale — jamais de
    version rattachée à un groupe qui n'existe plus), et mes setlists sont
    seulement DÉTACHÉES. En cas de RETOUR dans le groupe, l'adhésion crée un
    nouvel identifiant local : la synchro doit donc rattacher une setlist
    déjà présente mais détachée, et regarnir une setlist vide — sans quoi le
    groupe paraît n'avoir aucune setlist (constat de Marco). Le contenu
    qu'un membre a modifié lui-même n'est jamais écrasé ;
  - un morceau ajouté au répertoire d'un groupe arrive chez les autres
    membres **dans les Idées** de leur bibliothèque (décision Vincent,
    b174 — remplace les « limbes » séparées) : `idea: true` +
    `pendingBandId` qui ne dit plus que la PROVENANCE. Il ne se mélange
    donc pas aux morceaux qu'on joue, mais il a une vraie place chez soi.
    **Le programmer dans une setlist entérine son inscription définitive
    en bibliothèque** (`idea: false`, `pendingBandId` effacé) — appliqué
    dans `store.saveSetlist`, donc par TOUS les chemins d'ajout. Le
    bouton « ✓ Accepter » reste disponible sans passer par une setlist,
    et le chip « 📥 Propositions » n'est plus qu'une vue filtrée ;
  - un morceau supprimé n'est jamais réimporté par l'import en masse
    (tombstones) ;
  - navigation : les boutons ← des pages vont vers un parent explicite
    (`navigate('/xxx')`), pas `history.back()`.
  - **on ne QUITTE jamais l'app pour montrer quelque chose qu'on peut
    afficher dedans** (b187) : dans l'app installée sur iPhone, ni un lien
    ordinaire ni `window.open(_blank)` ne laissent de retour — la vue
    s'ouvre sans barre de navigation et l'utilisateur est bloqué (signalé
    deux fois par Vincent, sur la fiche d'un membre du groupe). Une page
    publique se RECOPIE dans l'écran courant, ou son adresse se copie ;
    elle ne se visite pas. La page publique porte quand même un « ← Retour »
    quand le référent est de notre origine (jamais après un QR scanné).
  - **une partition ne circule QUE par deux canaux** (décision Vincent,
    b110, amendée b121) : poussée dans le répertoire d'un groupe
    (« Ajouter à… », synchro auto) ou diffusée en mode ON AIR (QR **ou code
    de salon à 6 chiffres**) ; un musicien présent au bœuf peut en garder
    une **copie personnelle** (« Garder ce morceau » → Idée, jamais
    partagée ni synchronisée). Aucun partage de morceau ni de setlist par
    lien (les boutons « Partager au groupe / au public » ont été retirés ;
    la page de réception /s/… des anciens liens reste) ;
  - **multi-live (b121)** : plusieurs directs simultanés — table `lives`
    (une ligne par direct, `join_code` + `write_token` du lanceur), plus de
    scène globale unique ; l'ancienne ligne `live_state` n'est lue qu'en
    repli pour les vieux bundles ;
  - **le spectateur suit une IDENTITÉ, pas une session** (décision Vincent,
    b170 — annule le code de salon visible de b121) : le QR mène à
    `/sonnom`, le public y RESTE, et la page résout le direct par le NOM de
    l'artiste (`/api/live?artist=`) en boucle. Trois états sur cette même
    adresse : pas de direct → la fiche de l'artiste ; direct sans partition
    → « Le concert commence dans un instant… » ; partition diffusée → les
    paroles. Un concert coupé puis relancé crée une nouvelle session : avec
    un code, l'ancienne adresse mourait et il fallait rescanner ; avec le
    nom, la page le retrouve seule. Le `join_code` reste un identifiant
    INTERNE (jamais affiché, jamais saisi) et `?c=` n'est plus lu que pour
    honorer un lien déjà en circulation. Le direct d'un GROUPE porte le nom
    du GROUPE : `/api/live?artist=` cherche donc aussi sur `started_by`,
    sinon la page perso de celui qui a lancé restait muette (b182) ;
  - **un live = un appui sur GO LIVE** (décision Vincent, b182 — annule le
    regroupement au temps écoulé de b179) : le lancement crée la ligne
    `lives`, l'arrêt la clôt. La clôture CONSERVE `started_at`, `artist`,
    `band_id`, `setlist_name` et `concert` — cette ligne EST la trace du
    concert. Ne jamais redevenir malin en devinant les frontières au temps
    écoulé : c'est réservé aux morceaux d'avant b182, dont les bornes ont
    été effacées. La définition vit à UN seul endroit,
    `src/lib/pastlives.ts` (historique de l'onglet Live et compteur de la
    fiche Artiste : même fonction, même chiffre). **Un morceau appartient à
    SA séance** (`live_stats.session_id`) et un mot du public à SON direct
    (`live_messages.live_id`), jamais à l'heure qu'il est (b186) : la clé ON
    AIR étant commune à l'installation, un recoupement horaire faisait
    entrer chez soi le morceau d'un autre musicien. Le rattachement au temps
    n'existe QUE pour les lignes sans identifiant (archives anciennes), avec
    une tolérance de 2 minutes ;
  - **à qui appartient un live — la règle, et rien d'autre** (b188,
    question de Vincent) : un live est SOLO (il appartient à celui qui l'a
    lancé) ou DE GROUPE (il appartient à TOUS les membres du groupe). Rien
    d'autre n'entre en ligne de compte — ni le nom affiché, ni l'heure. La
    table `lives` porte déjà `band_id` et `started_by` ; c'est le SERVEUR
    qui établit la liste de mes lives (le client lui envoie ses noms et les
    cloudId de ses groupes), puis ne renvoie que les morceaux et les
    séances de CES lives. Les heuristiques par nom ou par créneau horaire
    (b138 → b186) ne survivent que pour les archives sans séance.
  - **l'appelant s'identifie par son COMPTE, plus par une clé** (b192,
    décision Vincent) : tout ce qui est réservé à l'artiste (statistiques,
    mots du public, séances, diagnostic, pilotage du direct) accepte le
    jeton Supabase, envoyé en `Authorization: Bearer`. `lives.owner_id`
    porte l'identifiant du compte qui a lancé — il ne change JAMAIS,
    contrairement à un nom d'artiste ; `live_stats` et `live_messages` en
    héritent. Plus aucun tri par nom pour les lignes récentes.
    **La clé reste acceptée en transition** (les applications installées
    ne se mettent pas à jour au même instant, et un direct ne doit jamais
    se couper) ; `LIVE_KEY_LEGACY=0` sur Vercel ferme cette porte le jour
    voulu, sans toucher au code. `VITE_LIVE_KEY` étant une variable de
    BUILD, la clé était de toute façon lisible dans le JavaScript livré au
    navigateur : elle n'a jamais rien protégé. Le PUBLIC reste ouvert —
    un spectateur n'a pas de compte, cœurs, mots et présence passent sans
    identité, par construction.
  - **à qui appartient un live** (b183) : je l'ai lancé → il est à moi ; il
    est tagué d'un groupe → il appartient aux MEMBRES de ce groupe (un
    concert de groupe est un acte collectif) ; lancé en solo par quelqu'un
    d'autre → il ne me regarde pas. JAMAIS de « oui » par défaut : une
    ligne sans identité n'appartient à personne (avant b183, elle tombait
    chez tout le monde). Même filtre sur les morceaux archivés du repli.
    **Supprimer un live est LOCAL** (`prefs.hiddenLives`) : rien n'est
    effacé côté serveur, les autres membres gardent le leur ;
  - **mon QR est unique, mon choix au lancement décide de ce que voit le
    public** (b183) : le passage en direct réserve/rafraîchit ma fiche
    publique avec MON profil, jamais celui du groupe (sinon un concert de
    groupe remplaçait définitivement ma fiche perso). L'identité du
    concert (solo ou groupe) voyage dans l'état du live (`artist`) et ne
    vaut que pendant le direct ;
  - **ligne rouge « outil, pas catalogue »** (§A.4 du mémo fondateurs) :
    aucune recherche de morceaux côté serveur, aucune base mutualisée entre
    comptes, aucun préremplissage de bibliothèque ; un morceau ne circule
    que d'un membre vers SON groupe. Import déclenché par l'utilisateur,
    page par page, vers SA bibliothèque.
  - **ne jamais nommer la plateforme source des tabs** (§A.5) dans
    l'interface, l'aide, la landing ou le README public. Formulations
    neutres : « colle le lien d'une page de partition », « reprends ta
    collection ».
- **Modèle économique — « Licence Scène »** (arbitrage fondateurs, août
  2026 ; remplace TOUT modèle antérieur, dont le Premium individuel à
  2,99 € désormais abandonné ; pas encore implémenté) :
  - Tout est **gratuit, pour tout le monde, pour toujours** : bibliothèque,
    import, groupes **illimités**, partage, setlists, notes, mode scène.
  - Seul **ON AIR** est monétisé : gratuit jusqu'à ~10 spectateurs
    connectés par session et sans la récolte (cœurs/stats/messages) ; la
    **Licence Scène** (annuelle, attachée au **compte artiste** qui lance
    les sessions — pas au groupe, pas aux membres) débloque audience
    illimitée + engagement complet.
  - Garde-fous intangibles : **JAMAIS de coupure en plein concert** ; le
    **lien de pourboire de l'artiste reste visible même en gratuit** ; la
    licence se vend sur l'engagement (audience, cœurs, stats, fanbase),
    **jamais** sur « plus de paroles ».
  - **Pourboires** : lien de paiement personnel de l'artiste, l'argent ne
    transite **jamais** par nous, **AUCUNE commission** (position
    définitive — l'ancienne commission ~7 % est abandonnée).
  - Aucun chiffre (prix, seuil de spectateurs) n'est arrêté : ne jamais en
    afficher tant que les fondateurs ne les ont pas fixés.
- **Dictée (b157)** : deux chemins, choisis automatiquement — la
  reconnaissance du navigateur (gratuite, texte en direct) quand elle
  marche, sinon l'ENREGISTREMENT + transcription serveur
  (`/api/ai?fn=transcribe`, `server/ai-transcribe.js`). L'app installée
  sur iPhone part directement au serveur (Apple y bride la
  reconnaissance) ; un échec du chemin natif bascule et se mémorise
  (`sing2me/dictationPath`). L'audio n'est jamais conservé. Variables
  Vercel : `TRANSCRIBE_API_KEY` (obligatoire), `TRANSCRIBE_URL` et
  `TRANSCRIBE_MODEL` (facultatives, dialecte OpenAI par défaut) — Claude
  ne transcrit pas l'audio, d'où un service tiers.
- **Diagnostic ON AIR** : `#/concerts?diag=1` — noms de tables, nombre de
  lignes, tri côté serveur. Réservé au dépannage : il ne s'affiche PAS
  dans l'app (décision Vincent, b198 — un musicien n'a pas à lire des
  messages d'erreur SQL). C'est lui qui a fini par livrer la cause du
  livre d'or muet ; le garder, mais hors de vue.
- **Tableau de bord fondateur (b160)** : `#/tableau-de-bord`, réservé aux
  e-mails de `ADMIN_EMAILS` (variable Vercel) — le SERVEUR tranche,
  l'app ne fait qu'afficher. Chiffres : comptes, activité, coût des IA.
  Le coût est mesuré PAR NOUS à chaque appel (`server/meter.js` →
  table `ai_usage`) : ni Anthropic ni OpenAI n'exposent le solde restant
  par API. Le restant = rechargements saisis (`billing_topups`) moins la
  dépense mesurée. Tarifs dans `server/meter.js`, à ajuster là et nulle
  part ailleurs. Après modification : ré-exécuter `supabase/admin.sql`.
- **Connexions sociales (b165)** : Google, Apple et Facebook, activées
  par `VITE_OAUTH_ENABLED=1` UNE FOIS les fournisseurs configurés dans
  Supabase (Authentication → Providers). Deux pièges Apple : le nom
  n'est transmis qu'à la PREMIÈRE autorisation (capté par
  `takeProviderName`, posé seulement si le profil est vide) et « Masquer
  mon e-mail » donne une adresse relais `@privaterelay.appleid.com`
  (elle fonctionne pour écrire, mais ce n'est pas la vraie). Le
  consentement aux communications NON transactionnelles est une case
  jamais pré-cochée, stockée sur le compte
  (`user_metadata.marketing_consent`) — les messages de service n'en
  dépendent pas.
- Backlog connu : remplacer les `alert/confirm/prompt` natifs restants
  par les composants Feedback (règle 10 — dette existante) ; OAuth
  Google/Facebook à configurer ; OCR des PDF scannés ; app native
  Capacitor (v3) ; parseurs OnSong Archive / SongbookPro .SBPBackup ;
  MusicXML.

## Techniques (rappels du projet)

- Local-first : localStorage est la source ; le cloud est une copie.
  Jamais de fonctionnalité qui exige le réseau pour jouer.
- **Compte obligatoire (décision Vincent, b120)** : sans session locale,
  l'app musicien n'affiche qu'un portail de connexion épuré (Welcome).
  Le test est LOCAL (session en localStorage) — un compte déjà connecté
  ouvre l'app même en mode avion ; les pages publiques (/live, /nom,
  /s/…, CGU, signalement) ne sont jamais bloquées ; si l'auth n'est pas
  configurée (déploiement sans cloud), pas de portail.
- Variables Vite : accès statique uniquement
  (`import.meta.env.VITE_X`) — jamais d'accès dynamique.
- Supabase côté client : clé anon + RLS uniquement ; service_role
  seulement dans `api/*.js` (Vercel).
- SQL : les fichiers `supabase/*.sql` restent idempotents
  (ré-exécutables sans risque).
- Vérification avant livraison : `npm run typecheck` (ou, dans un
  environnement sans node_modules, `npx tsc -p tsconfig.verify.json`
  qui utilise les stubs du dossier `typestubs/`) + tests node sur la
  logique pure. Si possible, `npm run build` avant de pousser.
- Textes UI en français, ton chaleureux, tutoiement.
- **Bilingue (b156) — le français reste la langue SOURCE du code.**
  Toute chaîne d'INTERFACE s'écrit en français dans le code et passe par
  `t('…')` (`src/i18n.ts`) ; la chaîne française EST la clé. L'anglais
  vit dans les dictionnaires `src/i18n/en-*.ts` (un par domaine,
  assemblés dans `i18n.en.ts`). Une clé absente s'affiche en français —
  jamais de clé abstraite, jamais d'écran vide.
  - Variables : `t('Ajouter {n} morceaux', { n })`. Pluriels : deux
    chaînes distinctes (singulier / pluriel), pas de `${n>1?'x':''}`.
  - `t()` ne s'appelle JAMAIS au niveau module (la langue est fixée au
    rendu) : garder la constante en français, traduire au point de rendu.
  - **Le contenu utilisateur n'est JAMAIS traduit** : partitions,
    paroles, accords, titres, artistes, noms de groupes et de musiciens,
    notes de répétition, commentaires, messages. Seule l'interface change
    de langue.
  - Langue = `prefs.lang` ('' = automatique, suit le téléphone), réglable
    dans Réglages. En ajoutant un écran : enrichir le dictionnaire du
    domaine concerné dans le même lot.
  - **Chacun voit l'app dans SA langue** (décision Vincent) : les pages
    publiques (spectateur du QR, musicien invité à un bœuf) suivent la
    langue du téléphone du LECTEUR, jamais celle de l'artiste —
    `publicEntry.tsx` fait `setLang(detectLang())`.
  - Dictionnaire ENFICHABLE (`registerTranslations`) : l'app musicien
    charge tous les domaines, l'entrée publique légère ne charge que
    `en-public.ts` (budget de poids : ~25 Ko, à ne pas gonfler avec des
    traductions que le spectateur ne voit jamais).
  - **CGU en français uniquement** (décision Vincent, août 2026) : texte
    juridique non traduit ; en anglais, un avertissement dit que la
    version française fait foi.
  - Vérification : `node scripts/check-i18n.mjs` doit rester à
    « Couverture complète » avant toute livraison.
