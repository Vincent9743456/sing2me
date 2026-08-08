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
- Après push : vérifier https://sing2me-three.vercel.app/version.txt.
- Supabase : projet `zssnwjtfzbymtsiccvao` ; après modification d'un
  fichier `supabase/*.sql`, demander à Vincent de le ré-exécuter dans le
  SQL Editor (les fichiers sont idempotents). Variables d'environnement
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
  - un morceau ajouté au répertoire d'un groupe arrive chez les autres
    membres comme **proposition en attente** (`pendingBandId`) : il
    n'entre pas d'office dans leur bibliothèque personnelle (anti-
    pollution), reste dispo pour les setlists du groupe (non bloquant),
    et s'accepte d'un clic (chip « 📥 Propositions » dans la
    bibliothèque) ;
  - un morceau supprimé n'est jamais réimporté par l'import en masse
    (tombstones) ;
  - navigation : les boutons ← des pages vont vers un parent explicite
    (`navigate('/xxx')`), pas `history.back()`.
  - **une partition ne circule QUE par deux canaux** (décision Vincent,
    b110, amendée b121) : poussée dans le répertoire d'un groupe
    (« Ajouter à… », synchro auto) ou diffusée en mode ON AIR (QR **ou code
    de salon à 6 chiffres**) ; un musicien présent au bœuf peut en garder
    une **copie personnelle** (« Garder ce morceau » → Idée, jamais
    partagée ni synchronisée). Aucun partage de morceau ni de setlist par
    lien (les boutons « Partager au groupe / au public » ont été retirés ;
    la page de réception /s/… des anciens liens reste) ;
  - **multi-live (b121)** : plusieurs directs simultanés — table `lives`
    (une ligne par direct, `join_code` à 6 chiffres + `write_token` du
    lanceur), plus de scène globale unique ; l'ancienne ligne `live_state`
    n'est lue qu'en repli pour les vieux bundles. Le code de salon est un
    SÉLECTEUR de session (fluidité), pas une protection ;
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
