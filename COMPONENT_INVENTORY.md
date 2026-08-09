# Sing2Me — Inventaire des composants

Statuts : ✅ conserver · 🔧 corriger · 🔀 fusionner · ➕ créer · ❌ supprimer

## Composants partagés (src/components)

| Composant | Fichier | Statut | Notes |
|---|---|---|---|
| TopBar | ui.tsx | 🔧 | Réserver une gouttière droite (bouton ON AIR) ; icônes SVG |
| TabBar | ui.tsx | 🔧 | Glyphes texte → icônes SVG ; états focus |
| Field | ui.tsx | ✅ | Base saine — l'imposer partout |
| Modal | ui.tsx | 🔧 | + Échap, focus initial, aria-modal |
| StageList / useScrollLock | StageList.tsx | ✅ | Panneau plein écran : fond opaque + verrou de défilement de la page. **Seule façon d'ouvrir un plein écran** — ne jamais réécrire `.stagelist` à la main (b184). Module sans dépendances : sert aussi à l'entrée publique légère |
| Empty | ui.tsx | 🔧 | + variante avec action principale (bouton) |
| DndHint | ui.tsx | ✅ | |
| SongBody / ChordLine / StructureBlock | SongBody.tsx | 🔧 | En-têtes métier par vue (phase 2) ; sinon conserver |
| OnAirButton / OnAirProvider | OnAir.tsx | 🔧 | CSS consolidé (3 couches → 1) ; panneau : sections |
| AutoScroll (hook) | AutoScroll.tsx | ✅ | |
| AutoScrollFab | AutoScroll.tsx | 🔀 | Fusionner avec les commandes ⇣ du mode scène (un composant, deux rendus) |
| AutoScrollControls (legacy) | AutoScroll.tsx | ❌ | Plus utilisé — vérifier puis retirer |
| ShareModal | ShareModal.tsx | ✅ | |
| NoteModal | NoteModal.tsx | 🔧 | Ordre des champs (contexte avant visibilité) |
| TipBox | TipBox.tsx | 🔧 | `tipbtn` → `.btn .pill` |
| Logo / LogoMark / Brand | Logo.tsx | ✅ | Identité conservée |
| Account / AccountSection | Account.tsx | 🔧 | Moins de texte, états plus visuels |
| Icon | — | ➕ | SVG inline, ~24 noms, `currentColor` (lot 2) |
| Toast | — | ➕ | File 1 message, aria-live (lot 3) |
| ConfirmSheet / PromptSheet | — | ➕ | Remplacent alert/confirm/prompt (lot 3) |

## Patterns CSS (theme.css)

| Pattern | Statut | Notes |
|---|---|---|
| `.btn` + variantes | ✅ | Ajouter :focus-visible + min-height tactile |
| `.chip` | ✅ | |
| `.row` / `.list` | 🔧 | Min-height en grille ; retirer l'action destructive |
| `.card` | 🔧 | Restreindre l'usage (voir DESIGN_SYSTEM §5) |
| `.onair` ×3 | 🔀 | Fusionner en une définition |
| `.tipbtn` | 🔀 | → `.btn .pill` |
| `.remoterow` | ✅ | Référence d'ergonomie scène |
| `.strow` (structure) | ✅ | |
| `.notesbox` | ✅ | |
| `.transpose` | 🔧 | À intégrer dans la barre d'outils compacte (E3) |
| `.stfold` | ✅ | |
| `.dndhint`, `.rowicon` | ✅ | `.bandtag` retiré en b211 : le nom du groupe s'écrit dans le sous-titre |
| `.hstack/.vstack/.gap-*` | ➕ | Utilitaires pour remplacer les styles inline |

## Dialogues natifs à remplacer (23 occurrences)

- confirm : suppressions (Library, SongView ×2, SongEdit, SetlistEdit,
  Concerts, BandEdit ×2, SharePage aucune), version (SongView).
- prompt : nom de version (SongView), nom de groupe (SetlistEdit),
  nom/instrument d'adhésion (SharePage ×4).
- alert : erreurs et confirmations (SongEdit, SetlistEdit, Concerts,
  Artist social, SharePage ajout bibliothèque, BandEdit retrait membre).
