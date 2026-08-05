# Sing2Me — Feuille de route design

Travail par lots courts, réversibles, sans jamais toucher à la logique
métier pour une raison esthétique. Après chaque lot :
DESIGN_QA_CHECKLIST.md.

## Phase 1 — Fondations (CSS + composants de base)

### Lot 1 · Tokens & hygiène CSS — *risque faible, fort levier*
- **Fichiers** : `src/theme.css` (+ touches ciblées dans Library.tsx,
  Live.tsx, SongView.tsx pour les couleurs inline).
- **Contenu** : tokens complets (couleurs §2, espacements, `--heart`,
  `--on-accent`, `--text-faint`, `--surface-hover`, `--band-*`) ;
  fusion des 3 définitions `.onair` ; remplacement des hex en dur ;
  `:focus-visible` global ; `@media (prefers-reduced-motion)` ;
  cibles tactiles `@media (pointer: coarse)` ; contrastes (A1) ;
  utilitaires `.hstack/.vstack/.gap-*`.
- **Risques** : décalages visuels mineurs (hovers, ON AIR) ; vérifier
  les 3 états ON AIR × mobile/desktop.
- **Tests** : bibliothèque, morceau, scène, live, modales — 360px,
  768px, 1280px ; navigation clavier Tab sur la bibliothèque.

### Lot 2 · Icônes SVG — *risque faible, gain de qualité perçue majeur*
- **Fichiers** : nouveau `src/components/Icon.tsx` ; remplacements dans
  ui.tsx (TabBar, TopBar), Library, SongView, Setlists/SetlistEdit,
  Concerts, Stage, Remote, OnAir.
- **Contenu** : ~24 icônes (plus, import, éditer, supprimer, jouer,
  scène, régie, suivi, partager, QR, note, verrou, cœur, message,
  chevron, poignée, œil, réglages, groupe, lieu, calendrier, compte,
  fermer, retour).
- **Risques** : très faible (substitution) ; conserver ❤ émotionnel
  côté public.
- **Tests** : revue visuelle de chaque écran, lecteur d'écran sur la
  TabBar.

### Lot 3 · Feedback : ConfirmSheet, PromptSheet, Toast — *risque moyen*
- **Fichiers** : nouveau `src/components/Feedback.tsx` (les 3),
  remplacement des 23 alert/confirm/prompt (8 pages).
- **Risques** : oubli d'un chemin (inventaire dans
  COMPONENT_INVENTORY.md) ; asynchronie (confirm devient promesse).
- **Tests** : chaque suppression, création de version, adhésion groupe,
  erreurs réseau simulées (mode avion).

## Phase 2 — Parcours prioritaires

### Lot 4 · Mode scène (M1, M2, M3, M6)
Barre hiérarchisée + menu ⚙ + sortie protégée + « Suivant : … » +
commande de défilement unifiée + option contraste max.
**Tests** : au doigt sur téléphone, portrait/paysage, setlist ≥ 8
morceaux, hors ligne.

### Lot 5 · SongView : la partition d'abord (E3, E6, M4)
Barre d'outils compacte (version · vue · tonalité), capo replié, notes
repliées avec compteur + dates relatives, actions de partage regroupées.
**Tests** : transposition, capo auto, changement de version, ajout de
note, partages groupe/public, ON AIR actif pendant l'édition.

### Lot 6 · Bibliothèque & Import (E4, G6, R3)
Lignes allégées (suppression retirée), hauteurs de grille, bannières
consolidées, Import segmenté par méthode.
**Tests** : recherche, filtres, tri, import des 3 méthodes, doublons.

### Lot 7 · Artiste & comptes (E2)
Regroupement en 4 blocs dépliables, états de synchro plus visuels.
**Tests** : connexion/déconnexion, stats, QR, clé ON AIR, groupes.

### Lot 8 · Vues instrument (M5) & répétition
En-têtes métier par vue (batteur : tempo+structure ; bassiste : tonalité
réelle+grille ; chanteur : tonalité+départs), notes triées/datées.
**Tests** : les 4 vues sur 3 morceaux types, suivi 📡, partages.

## Phase 3 — Finitions

- États vides avec action (Empty enrichi) ;
- micro-transitions cohérentes (150ms, désactivées en reduced-motion) ;
- états de chargement (squelettes simples sur Live/Follow/stats) ;
- messages d'erreur homogènes (ton, format) ;
- polissage responsive (R1, R4, grands écrans) ;
- accessibilité complète (A5, A6, audit final ACCESSIBILITY_CHECKLIST) ;
- revue typographique finale (chasse aux tailles arbitraires restantes).

## Règles de conduite

1. Un lot = une livraison testée + un résumé avant/après.
2. Jamais de changement de modèle de données dans un lot design.
3. Toute régression détectée → revert du lot, pas de rustine.
4. Les écrans publics (Live, SharePage) se testent aussi sur un
   téléphone non connecté au compte.
