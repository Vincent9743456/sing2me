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
- Backlog connu : remplacer les `alert/confirm/prompt` natifs restants
  par les composants Feedback (règle 10 — dette existante) ; OAuth
  Google/Facebook à configurer ; OCR des PDF scannés ; app native
  Capacitor (v3) ; parseurs OnSong Archive / SongbookPro .SBPBackup ;
  MusicXML.

## Techniques (rappels du projet)

- Local-first : localStorage est la source ; le cloud est une copie.
  Jamais de fonctionnalité qui exige le réseau pour jouer.
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
