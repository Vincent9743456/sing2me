# DodoSongs — Inventaire des composants

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
| PublicLyrics | PublicLyrics.tsx | ✅ | **Seule façon d'afficher des paroles à quelqu'un qui LIT** (b219) : direct, setlist parcourue par le spectateur, aperçus. Ne jamais réécrire un bloc `pre-wrap` centré à la main |
| PublicEye / PublicPreview | PublicPreview.tsx | ✅ | « 👁 Vue du public » (b223) : l'œil vit dans la rangée d'actions de la fiche morceau — **visible sur la partition, jamais dans un pli** — et bascule la partition sur ce que liront les spectateurs, avec de quoi le corriger. Un seul chemin — ne pas en ouvrir un deuxième depuis le panneau ON AIR ; absent du mode scène et du direct |
| SwipeRow | SwipeRow.tsx | ✅ | **Seule façon de mettre une action destructive sur une ligne** (b254) : elle se RÉVÈLE par un glissement vers la gauche ou un appui long, jamais posée en permanence — sur une ligne, elle se toucherait par erreur. Trois règles à ne pas défaire : un balayage n'est pas un défilement (on ne prend la main que si le doigt part sur le côté), un seul volet ouvert à la fois, et l'appui long n'agit pas — il ouvre, la suppression demande un second geste. La corbeille est un vrai bouton (clavier, lecteurs d'écran) |
| SongDeleteSheet | SongDeleteSheet.tsx | ✅ | **Seule façon de proposer la suppression d'un morceau** (b239). Supprimer n'a pas le même sens selon d'où vient le morceau : perso → effacé ; répertoire d'un groupe → retour dans les Idées ; programmé par le groupe → refusé. Elle interroge la même fonction que le store (`lib/deletesong.ts`), donc l'annonce et l'effet ne peuvent pas diverger |
| PublicPageView | PublicPageView.tsx | ✅ | **Seule façon de rendre une page publique** (b242) : la vraie page (`PublicArtist`) et l'aperçu dans l'app en sont le même code. Un aperçu qui redessine la page finit toujours par montrer autre chose que ce qu'on vérifie. Purement présentationnel — ni store, ni réseau |
| PublicPagePeek | PublicPagePeek.tsx | ✅ | L'aperçu depuis l'app (b242) : adresse + « Copier », QR en grand (enregistrable, partageable), puis la page RELUE depuis le serveur. Utilisé pour l'artiste (onglet Artiste) et pour un groupe (`BandPublicPeek`). Trois états d'adresse (b245) : `null` = on cherche, `''` = pas réservée, sinon la page — annoncer « pas réservée » pendant qu'on interroge le serveur, c'est dire le contraire de la vérité. Côté ARTISTE il ne publie plus rien : la fiche publiée est le filet de récupération du profil (b243), la republier pour un coup d'œil écraserait la dernière copie. Ne jamais y remettre de raccourcis e-mail/WhatsApp : « n'ont pas d'utilité » |
| ProfilRestore | ProfilRestore.tsx | ✅ | Le filet de b243 : ce que la fiche PUBLIÉE sait encore et que le profil local a perdu. Ne rend que les champs VIDES, et se lève seul (règle 11). Passe par `maFichePubliee` (b245/b246) : adresse du compte, puis à défaut une page au même NOM d'artiste — ni le cache ni le `user_id` ne prouvent l'absence. Dit « une page publique À TON NOM » quand elle vient du second chemin |
| PublicBands / PublicMembers | PublicBands.tsx | ✅ | Les deux listes réciproques des pages publiques (b232) : les groupes d'un artiste, les musiciens d'un groupe. Vignette + nom + lien vers la page de l'autre. **Seule façon de les afficher** — page publique ET fiche ouverte pendant un concert doivent montrer exactement la même chose. Module de l'entrée légère : ni store, ni réseau |
| ChordDiagram / ChordSheet | ChordDiagram.tsx | ✅ | Diagramme de manche en SVG pur (b225) — `currentColor`, aucun asset, aucune dépendance. Les positions viennent de `src/lib/chorddb.ts` (table relevée, MIT, figée dans le dépôt) via `chordshapes.ts` ; ne jamais y coder un libellé, ce module ne parle aucune langue, et ne jamais compléter la table par du calcul |
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
