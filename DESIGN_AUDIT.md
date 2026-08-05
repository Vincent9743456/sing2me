# Sing2Me — Audit UX/UI (v1)

> Audit de l'interface existante, réalisé sur la base du code réel
> (`src/theme.css` ~1380 lignes, 15 pages, 10 composants partagés).
> Aucune modification de code n'accompagne cet audit — voir
> `DESIGN_ROADMAP.md` pour la mise en œuvre par lots.

## 0. Synthèse

L'application repose sur une base saine : palette sombre à accent unique
(ambre), design tokens partiels (`:root`), composants partagés (TopBar,
TabBar, Modal, Field, chips, SongBody), responsive à trois paliers
(mobile / grille tablette / barre latérale ordinateur), et une vraie
attention à la scène (wake lock, mode scène plein écran, gros boutons de
régie). **Rien ne justifie une refonte.**

Les trois signaux qui tirent la qualité perçue vers le bas :

1. **Le système d'icônes est fait d'emojis** (📥 🎛 📡 ✎ 🗑 ⠿ 👁…) —
   rendu incohérent selon l'OS, couleurs criardes dans une interface
   sobre, ambiguïtés (🎛 ? 📡 ?), bruit pour les lecteurs d'écran.
2. **23 dialogues natifs `alert()/confirm()/prompt()`** sur 8 pages —
   esthétique système brutale au milieu d'une interface soignée,
   comportements bloquants, incohérents avec le composant Modal existant.
3. **La dette de tokens** : ~20 couleurs codées en dur hors variables,
   ~15 tailles de police arbitraires, 3 définitions successives de
   `.onair` qui s'écrasent, ~174 `style={{…}}` inline dans les pages.

## 1. Inventaire des écrans

| Écran | Fichier | Rôle |
|---|---|---|
| Bibliothèque | pages/Library.tsx | Liste, recherche, filtres, bannières |
| Morceau | pages/SongView.tsx | Partition, versions, transposition, notes, partage |
| Édition morceau | pages/SongEdit.tsx | Métadonnées, structure, paroles |
| Import | pages/Import.tsx | Fichier / Ultimate Guitar / collage + analyse |
| Setlists | pages/Setlists.tsx | Liste des setlists |
| Setlist | pages/SetlistEdit.tsx | DnD, tonalités, versions, groupe, partage |
| Mode scène | pages/Stage.tsx | Plein écran concert |
| Régie | pages/Remote.tsx | Setlist tactile du chanteur |
| Suivi groupe | pages/Follow.tsx | Partition qui suit le leader |
| Concerts | pages/Concerts.tsx | Planification, lieu, interactions public |
| Artiste | pages/Artist.tsx | Compte, profil, groupes, ON AIR, stats… (10 sections) |
| Groupe | pages/BandEdit.tsx | Profil groupe, membres, invitations |
| Page publique | pages/SharePage.tsx | Rendu des liens de partage |
| Live spectateur | pages/Live.tsx | QR unique : public / musicien |
| CGU | pages/Terms.tsx | Conditions |

Composants : ui.tsx (TopBar, TabBar, Field, Modal, Empty, DndHint),
SongBody (+ChordLine, StructureBlock), OnAir (bouton + panneau + hook),
AutoScroll (hook + fab), ShareModal, NoteModal, TipBox, Logo, Account.

## 2. Problèmes — Identité visuelle & design system

### G1. Icônes = emojis système — **critique** (qualité perçue)
- **Où** : toutes les pages (📥 ＋ ✎ 🗑 ▶ 🎛 📡 ⠿ 👁 ✕ 📍 📅 📇 🤝 ☁ ❤ 💬 🔒 ⚑…), TabBar (♪ ≡ ★ ◉ en glyphes texte).
- **Impact** : rendu différent Windows/Android/iOS, couleurs hors palette, impression « prototype », ambiguïté (🎛, 📡, ◉), lecture d'écran polluée.
- **Correction** : jeu d'icônes SVG inline maison (~24 icônes, trait 1.75px, `currentColor`), composant `<Icon name=… />`, remplacement écran par écran. **Conserver** les emojis à valeur émotionnelle côté public (❤ du live, 🎸 accroche musicien).
- **Risque** : faible (substitution visuelle) · **Effort** : moyen (2 lots) · **Dépendances** : aucune.

### G2. Couleurs codées en dur hors tokens — **important** (cohérence)
- **Où** : `#ff8f8f`/`#ff6b6b`/`#ffb4b4` (cœurs, 4 fichiers), `#16120a` (texte sur accent, 4 occurrences), `#55556a`/`#5c5c6b` (footer/placeholders), `#4a4a58` (chevrons), `#262631`/`#34343f` (hovers), `#14141a`/`#1c1c1c` (scène), `BAND_COLORS` (7 hex dans Library.tsx), `style={{ color:'#ff8f8f' }}` inline.
- **Impact** : impossible de faire évoluer la palette sûrement ; incohérences déjà visibles (3 roses différents pour « cœur »).
- **Correction** : compléter les tokens (`--heart`, `--on-accent`, `--text-faint`, `--surface-hover`, `--band-1…7`) et remplacer. Voir DESIGN_SYSTEM.md.
- **Risque** : très faible · **Effort** : faible · **Dépendances** : aucune.

### G3. `.onair` défini 3 fois, couches CSS contradictoires — **important**
- **Où** : theme.css l.693, l.1189 (« visibilité renforcée »), l.1249 (« compact haut droite ») — la 2ᵉ couche (glow, padding 12/18) est presque entièrement annulée par la 3ᵉ.
- **Impact** : dette illisible, risque de régression à chaque retouche.
- **Correction** : fusionner en une seule définition + variantes `.on/.pause`.
- **Risque** : faible (vérifier visuel sur 3 états × 2 breakpoints) · **Effort** : faible.

### G4. Échelle typographique arbitraire — **important**
- **Où** : ~15 tailles distinctes (0.6, 0.66, 0.68, 0.7, 0.72, 0.75, 0.76, 0.78, 0.8, 0.82, 0.85, 0.88, 0.92, 0.93, 0.95, 0.97, 0.98, 1.02, 1.05, 1.08, 1.12, 1.18, 1.2, 1.6 rem…), letter-spacings épars (0.5→1.6px).
- **Impact** : micro-incohérences perceptibles (deux libellés voisins de tailles différentes), maintenance hasardeuse.
- **Correction** : échelle à 7 crans (voir DESIGN_SYSTEM.md) + 1 style unique de « micro-label majuscule ».
- **Risque** : faible · **Effort** : moyen (mécanique).

### G5. ~174 styles inline `style={{…}}` — **amélioration**
- **Où** : toutes les pages (SharePage 28, Live 21, Artist 20, Import 18…). Motif dominant : `display:flex; gap:8` et couleurs ponctuelles.
- **Impact** : valeurs d'espacement non tokenisées, duplication, incohérences (gap 6/8/10/12/14 selon l'écran).
- **Correction** : 4 utilitaires CSS (`.hstack`, `.vstack`, `.gap-s/-m`, `.text-danger/.text-accent`) et migration opportuniste (quand on touche un écran, pas de sweep global).
- **Risque** : faible · **Effort** : étalé.

### G6. La carte comme réponse par défaut — **amélioration**
- **Où** : SongView (transpose + notesbox + messages + structure en cartes), Artist (cartes empilées), Account, bannières Library (2 cartes possibles + chips + recherche avant le contenu).
- **Impact** : « succession de cartes identiques » que le brief veut éviter ; la hiérarchie repose sur les bordures plutôt que sur l'espace.
- **Correction** : réserver la carte aux objets manipulables (setlist item, membre, structure) ; pour le reste : titres de section + séparations discrètes + espacement. Traité écran par écran en phase 2.
- **Risque** : moyen (visuel) · **Effort** : moyen.

### G7. Pas de mode clair — **décision à acter** (pas un défaut)
- L'app est sombre par identité (scène, salles). **Proposition DA : assumer le dark-first comme signature**, structurer les tokens pour permettre un thème clair plus tard, et traiter la lisibilité plein jour par le contraste (voir A1) plutôt que par un thème clair précipité.

## 3. Problèmes — Ergonomie générale

### E1. 23 dialogues natifs alert/confirm/prompt — **critique**
- **Où** : suppressions (Library, SongView, SongEdit, SetlistEdit, Concerts, BandEdit), nommage de version (SongView `prompt`), carte musicien / adhésion groupe (SharePage, 2 `prompt` enchaînés), erreurs (`alert` social import, Import).
- **Impact** : rupture esthétique totale, wording anglais du navigateur (« sing2me-three.vercel.app says: »), bloquant pendant un direct, 2 prompts enchaînés pour rejoindre un groupe = friction maximale au pire moment (conversion d'un invité).
- **Correction** : composants `ConfirmSheet` et `PromptSheet` sur la base du Modal existant + formulaire inline pour nom/instrument à l'adhésion. Remplacement systématique.
- **Risque** : faible-moyen (23 points de passage à tester) · **Effort** : moyen · **Dépendances** : G1 souhaitable avant (icônes des boutons).

### E2. Page Artiste = 10 sections empilées — **important**
- **Où** : Artist.tsx (compte, photo, nom artiste, nom musicien, pré-remplissage social, groupes, pourboires, ON AIR, statistiques, vue par défaut, streaming, page publique/QR).
- **Impact** : l'écran le plus long de l'app, actions clés noyées (clé ON AIR, QR), scroll pénible sur téléphone.
- **Correction** : regrouper en 4 blocs dépliables (« Mon compte », « Mon profil public », « Mes groupes », « Scène & statistiques ») — sans changer les fonctionnalités ni les routes.
- **Risque** : moyen (page très fréquentée) · **Effort** : moyen.

### E3. SongView surchargé au-dessus de la partition — **important**
- **Où** : version bar + view switcher (4 chips à 2 lignes) + panneau transposition + notes + messages + aide capo → la partition commence souvent sous la ligne de flottaison.
- **Impact** : l'objet principal (la partition) n'est pas l'élément principal à l'écran.
- **Correction** : une seule barre d'outils compacte (version · vue · tonalité) avec panneau repliable pour capo/détails ; notes et messages déjà repliés par défaut sous un compteur (« 💬 3 notes »).
- **Risque** : moyen · **Effort** : moyen · **Dépendances** : G1, E1.

### E4. Suppression visible sur chaque ligne de la bibliothèque — **important**
- **Où** : Library.tsx (🗑 rouge sur chaque row).
- **Impact** : bruit visuel permanent + risque de fausse manœuvre (le confirm natif protège mal sur tactile) ; la suppression existe déjà dans la page du morceau.
- **Correction** : retirer 🗑 des lignes ; suppression depuis la fiche morceau (existante) — à la rigueur menu ⋯ sur appui long plus tard.
- **Risque** : faible (fonction conservée ailleurs) · **Effort** : très faible.

### E5. Aucun retour visuel transversal (toasts) — **important**
- **Où** : enregistrements silencieux (note ajoutée, setlist sauvée → navigation sèche), erreurs live en `alert`, statut de synchro visible uniquement dans Artiste.
- **Correction** : mini système de toast (1 composant, file d'attente 1 message, auto-dismiss 3 s, `aria-live=polite`) ; brancher : sauvegardes, synchro cloud, erreurs réseau ON AIR.
- **Risque** : faible · **Effort** : faible-moyen.

### E6. Créations cachées dans des `<select>` — **détail**
- **Où** : SongView (options `＋ Nouvelle version…`, `＋ Version pour X` dans le sélecteur), SetlistEdit (`＋ Créer un groupe…`).
- **Impact** : pattern inhabituel ; fonctionne mais invisible pour qui n'ouvre pas le menu.
- **Correction** : conserver (économie d'espace réelle) mais ajouter l'action équivalente dans la page d'édition ; à réévaluer après refonte de la barre d'outils (E3).

### E7. Retour arrière incohérent — **détail**
- **Où** : mélange `history.back()` (SongEdit, SetlistEdit, Import…) et `navigate('/')` (SongView, Follow).
- **Correction** : règle unique — back = historique ; fallback route parent si pile vide.

## 4. Problèmes — Ergonomie musicale & mode scène

### M1. Barre de contrôle scène : 10 commandes, sortie accidentelle — **critique** (interface critique)
- **Où** : Stage.tsx (✕ ‹ 2/9 › | 👁 ⇣ − ＋ A− A＋) ; ✕ collé à ‹.
- **Impact** : sur un téléphone en concert, cibles étroites, risque de quitter la scène en voulant reculer d'un morceau ; réglages (vue/police) au même niveau que la navigation vitale.
- **Correction** : hiérarchiser — niveau 1 permanent : ‹ [titre + position] › + ⇣ ; niveau 2 (bouton ⚙ unique) : vue, police, vitesse ; ✕ isolé à l'opposé avec confirmation légère (« appuyer encore pour quitter ») ; cibles ≥ 48px.
- **Risque** : moyen (cœur du produit — tester au doigt) · **Effort** : moyen.

### M2. Pas de visibilité du morceau suivant en scène — **important**
- **Où** : Stage affiche « 2/9 » sans le titre suivant (la Régie le fait déjà).
- **Correction** : ligne discrète « Suivant : Angie (G) » en bas du corps ou dans la barre.
- **Risque** : faible · **Effort** : faible.

### M3. Deux systèmes de défilement différents — **amélioration**
- **Où** : Stage (bouton ⇣ + −/＋ dans la barre) vs SongView/Share (AutoScrollFab flottant à droite).
- **Correction** : un seul composant de commande de défilement, décliné (barre en scène, fab ailleurs) — même icônes, mêmes pas de vitesse.

### M4. Notes de répétition sans date ni hiérarchie de fraîcheur — **amélioration**
- **Où** : SongView/Stage — `createdAt` existe mais n'est jamais affiché ; pas de distinction « récent ».
- **Correction** : date relative discrète (« il y a 3 j ») + tri par récence ; badge « nouveau » si < 7 jours. (Décisions validées / propositions = évolution de modèle, hors périmètre de cet audit.)

### M5. Vues instrument = filtres, pas encore des vues métier — **amélioration (phase 2)**
- **Où** : SongBody (complete/accords/structure/paroles).
- **Impact** : le batteur voit structure+commentaires (bien) mais pas le tempo en grand ; le bassiste n'a pas la tonalité réelle mise en avant ; le chanteur n'a pas les départs.
- **Correction** : enrichir chaque vue avec son en-tête métier (batteur : tempo + structure en grand ; bassiste : tonalité réelle + grille ; chanteur : tonalité + première ligne de chaque section) — sans changer le modèle de données (tout existe déjà).

### M6. Lisibilité plein jour / extérieur — **amélioration**
- **Où** : thème sombre unique.
- **Correction** : en mode scène, option « contraste maximal » (fond #000, texte #fff pur, accents désaturés) — pas un thème clair complet.

## 5. Problèmes — Accessibilité

### A1. Contrastes sous le seuil — **important**
- `#55556a` (footer public) sur `#0a0a0e` ≈ 2.6:1 — **échec** ;
- placeholders `#5c5c6b` ≈ 2.9:1 — **échec** ;
- `--text-dim #8f8f9f` ≈ 4.9:1 — passe en AA texte normal, limite sur `--surface-high`.
- **Correction** : `--text-faint` ≥ #7c7c90, placeholders #6b6b7e, garder les décoratifs (chevrons) hors exigence.

### A2. Focus clavier invisible sur les boutons — **important**
- `.btn`, `.chip`, `.tabbar button`, `.stepper button` : aucun style `:focus-visible` (les inputs en ont un).
- **Correction** : anneau focus commun `outline: 2px solid var(--accent); outline-offset: 2px`.

### A3. `prefers-reduced-motion` ignoré — **important**
- Animations pulse (ON AIR, badge live), heartfloat, slideup modal, transitions transform.
- **Correction** : bloc `@media (prefers-reduced-motion: reduce)` global.

### A4. Cibles tactiles < 44px — **important**
- `.btn.ghost.small` ≈ 30px, stepper 32px, scrollfab 38px, bandtag 22px, boutons ✕ des listes.
- **Correction** : min-height 44px sur pointer coarse (`@media (pointer: coarse)`) pour les commandes de scène/répétition en priorité ; bandtag = cible étendue par padding invisible.

### A5. Boutons icône sans nom accessible — **amélioration**
- La plupart ont `title`, pas tous `aria-label` (🗑, ✕, ⠿, œil).
- **Correction** : systématiser `aria-label` (règle QA), `aria-hidden` sur les glyphes décoratifs.

### A6. Modal sans gestion clavier — **amélioration**
- Pas de fermeture Échap, pas de focus initial ni de piège de focus.
- **Correction** : compléter le composant Modal (Échap + focus au montage) — un seul fichier.

## 6. Problèmes — Responsive

### R1. SongEdit : 4 champs en ligne non fluide — **amélioration**
- Tonalité/Tempo/Capo/Durée dans un flex sans wrap → étroit sur ≤ 360px.
- **Correction** : `flex-wrap: wrap` + min-width par champ.

### R2. Barre scène en débordement < 360px — **important** (fusionné avec M1)

### R3. Grille tablette : cartes de bibliothèque à hauteur inégale — **détail**
- Rows avec 0–3 pastilles → hauteurs différentes dans la grille ≥ 720px.
- **Correction** : min-height commune + alignement des métadonnées.

### R4. `.onair` peut chevaucher le bouton ✎ du TopBar sur mobile étroit — **détail**
- top: 58px le place sous la barre, mais sur les pages sans TopBar (bibliothèque avec Brand) il flotte sur le contenu.
- **Correction** : à revalider après consolidation G3 ; réserver une gouttière droite de 44px dans `.topbar .side.right`.

## 7. Les 10 problèmes prioritaires

1. **E1** — 23 dialogues natifs → ConfirmSheet/PromptSheet/toasts.
2. **G1** — Emojis → jeu d'icônes SVG cohérent.
3. **M1** — Barre du mode scène : hiérarchie, cibles, anti-sortie.
4. **G2+G3** — Tokens complets + fusion des couches `.onair` (fondation de tout le reste).
5. **A1+A2+A3+A4** — Contrastes, focus, reduced-motion, cibles tactiles (un seul lot CSS).
6. **E3** — SongView : la partition d'abord (barre d'outils compacte).
7. **E2** — Page Artiste en 4 blocs dépliables.
8. **E5** — Toasts de confirmation/erreur transversaux.
9. **E4** — Bibliothèque : retirer la suppression des lignes.
10. **M2+M4** — Scène : morceau suivant visible ; notes datées et triées.

## 8. Ce qui doit être explicitement conservé

- Palette sombre ambre + accord cyan (`--chord`) : identitaire et lisible.
- Local-first, hors-ligne, wake lock, QR unique : intouchables.
- Radii généreux, modal en bottom-sheet mobile, sidebar ordinateur.
- Régie 🎛 (gros boutons) : déjà le meilleur écran de l'app en ergonomie scène — s'en inspirer pour Stage.
- Logo (tuile ambre + notes liées en cœur) : conservé tel quel.
