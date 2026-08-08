# Sing2Me — Design System

> Source de vérité pour toute modification d'interface.
> **À lire avant de toucher au CSS ou aux composants.**
> Direction artistique : « studio scénique contemporain » — sombre,
> ambré, sobre, chaleureux, lisible de loin.

## 1. Direction artistique

**Conservé** : dark-first assumé (identité scène), accent unique,
accords en cyan, rayons généreux, sobriété sans froideur.
**Identité (b53)** : accent **orange scène** (`#f6832a`), logo « bulle
qui chante » (bulle de parole + note), favicon partagé app + site.
**Ajusté** : icônes SVG au lieu des emojis, échelle typographique
formalisée, micro-labels unifiés, contrastes relevés, tokens complets.
**Supprimé** : dialogues natifs du navigateur, couches CSS redondantes,
roses « cœur » multiples, tailles arbitraires.
**Remplacé** : emojis fonctionnels → icônes trait ; cartes par défaut →
hiérarchie par l'espace.

**Interdits** (rappel du brief) : grands dégradés décoratifs, néons non
fonctionnels, ombres lourdes, glassmorphism sur contenu musical,
accumulation de cartes, animations gratuites, couleurs sans signification.

## 2. Tokens — couleurs

```css
:root {
  /* Fonds & surfaces */
  --bg: #0a0a0e;             /* fond app */
  --surface: #131318;        /* listes, panneaux */
  --surface-high: #1b1b23;   /* modales, hover de surface */
  --surface-hover: #22222c;  /* hover explicite (remplace #262631/#34343f) */
  --stage-bg: #000;          /* mode scène uniquement */

  /* Bordures */
  --border: #24242e;
  --border-soft: #1d1d25;

  /* Textes */
  --text: #f5f5f7;
  --text-dim: #9a9aac;       /* relevé (ex-#8f8f9f) — AA sur bg et surface */
  --text-faint: #6b6b7e;     /* placeholders, décoratif non essentiel */
  --on-accent: #16120a;      /* texte sur fond orange scène */

  /* Accent (une seule famille) — orange scène */
  --accent: #f6832a;
  --accent-strong: #ea6c12;
  --accent-soft: rgba(246, 131, 42, 0.12);
  --accent-dark: #8a4410;

  /* Fonctionnelles */
  --chord: #62c9f2;          /* accords — jamais utilisé pour autre chose */
  --danger: #e05555;
  --live: #ff1f1f;           /* direct uniquement — rouge pur, ≠ accent */
  --heart: #ffa3c0;          /* cœurs du public (rose, ≠ accent orange) */

  /* Pastilles de groupe (Library, à terme partout) */
  --band-1: #fbbf24; --band-2: #60a5fa; --band-3: #34d399;
  --band-4: #f472b6; --band-5: #a78bfa; --band-6: #fb923c;
  --band-7: #22d3ee;
}
```

Règles :
- **Aucune couleur hex nouvelle dans les composants.** Tout passe par un
  token ; s'il manque, on l'ajoute ici d'abord.
- `--live` = exclusivement l'état « en direct ». `--danger` = destructif.
  `--accent` = action/valorisation. `--chord` = accords, rien d'autre.
- **Live = point clignotant + texte, jamais la couleur seule.** Un
  élément « en direct » (ON AIR) s'identifie toujours par son point
  clignotant **et** son libellé, jamais par sa seule teinte : `--live`
  (rouge) et `--accent` (orange scène) sont proches et ne doivent pas
  être le seul signal distinctif. Ne jamais coder un état sur la couleur
  seule.
- Mode clair : non planifié à court terme (décision actée — voir audit
  G7). Si un jour : dupliquer ce bloc sous `[data-theme='light']`,
  aucune couleur en dur ne doit l'empêcher.

## 3. Tokens — typographie

Police : pile système conservée (performance, hors-ligne, rendu natif).
Chiffres de tonalité/tempo : `font-variant-numeric: tabular-nums` sur
les compteurs (position setlist, BPM).

Échelle (7 crans — remplacer progressivement les valeurs arbitraires) :

| Token | Taille | Usage |
|---|---|---|
| `--fs-micro` | 0.7rem | micro-labels MAJUSCULES, badges |
| `--fs-small` | 0.8rem | aides, sous-titres de ligne |
| `--fs-body-s` | 0.9rem | boutons, contenus secondaires |
| `--fs-body` | 1rem | texte courant, paroles par défaut |
| `--fs-title` | 1.12rem | titres de barre, titres de ligne |
| `--fs-h1` | 1.35rem | titres de page publics |
| `--fs-display` | 1.7rem | titre du morceau en live/scène |

Micro-label unique (un seul style pour tous les labels MAJUSCULES) :
`font-size: var(--fs-micro); font-weight: 700; letter-spacing: 0.06em;
color: var(--text-dim); text-transform: uppercase;`

## 4. Tokens — espacements, rayons, ombres

```css
--sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;
--sp-4: 16px; --sp-5: 24px; --sp-6: 32px;
--radius: 14px;      /* cartes, panneaux */
--radius-s: 10px;    /* boutons, champs */
--radius-pill: 999px;/* chips, badges, fabs */
--shadow: 0 10px 30px rgba(0, 0, 0, 0.35);   /* modales, fabs uniquement */
--shadow-soft: 0 4px 14px rgba(0, 0, 0, 0.3);
```

- Tout `gap`/`margin`/`padding` nouveau prend une valeur `--sp-*`.
- Une seule ombre par famille de composant ; jamais d'ombre sur les
  éléments de liste ni sur le contenu musical.

## 5. Composants — règles

### Boutons (une seule base `.btn`)
- Variantes autorisées : (primaire), `.ghost`, `.danger`, `.small`,
  `.icon`, `.block`. `tipbtn` doit devenir `.btn .pill` (fusion).
- Cible tactile ≥ 44px sur `pointer: coarse` (48px en mode scène).
- Focus : `:focus-visible { outline: 2px solid var(--accent);
  outline-offset: 2px; }` — obligatoire sur tout élément interactif.

### Icônes
- Composant `Icon` (SVG inline, 24×24, trait 1.75, `currentColor`,
  `aria-hidden`), taille par `1em`. Emojis interdits pour les actions ;
  tolérés pour l'émotion côté public (❤, 🎸 d'accroche).

### Champs
- Toujours via `Field` (label systématique). Jamais de placeholder
  comme seul label.

### Surfaces
- Carte (`.card`) réservée aux objets manipulables ou aux blocs
  autonomes (item de setlist, membre, QR). Les sections d'une page se
  structurent par `pagetitle` + espacement, pas par des cartes.
- Modales : bottom-sheet mobile / centrée desktop (existant). Ajouter
  Échap + focus initial. Maximum une modale à la fois.
- **Jamais de `backdrop-filter` sur un élément `position: fixed`** posé
  au-dessus d'une page qui défile (barre d'onglets, barre du public,
  contrôles du mode scène, boutons flottants). iOS repeint ces éléments
  au mauvais endroit pendant l'inertie du défilement : la barre part au
  milieu de l'écran (signalé deux fois par Vincent, b181 puis b183).
  Fond OPAQUE issu des tokens (`--surface`, `--bg`). Le flou reste
  permis sur les éléments `sticky` et les fonds de modale.

### Feedback
- `Toast` (à créer, lot 3) : 1 message, auto-dismiss 3 s,
  `aria-live="polite"`, en bas au-dessus de la tabbar.
- `ConfirmSheet` / `PromptSheet` (à créer, lot 3) : remplacent 100 % des
  `alert/confirm/prompt`. Confirm destructif = bouton `.danger` à droite.

### Notes & annotations
- 🔒 personnelle / 💬 groupe (icônes SVG à terme), contexte de groupe en
  suffixe dim, date relative, tri par récence.
- Couleur : les notes utilisent `--accent` (jamais `--chord`).

## 6. Mode scène (règles spécifiques)

- Fond `--stage-bg` pur, aucun élément décoratif, aucune ombre.
- Paroles ≥ 1.25rem par défaut, réglable, persisté.
- Barre : niveau 1 = précédent / position+titre / suivant / défilement ;
  niveau 2 (menu ⚙) = vue, police, vitesse ; quitter = isolé + double
  appui. Cibles ≥ 48px, espacement ≥ `--sp-2`.
- Toujours : wake lock, swipe, flèches clavier, « Suivant : … » visible.
- Jamais : navigation générale, bannières, contenus non musicaux.

## 7. Live public (QR)

- Le fan lit en zéro action : paroles centrées, interactions (❤, mot)
  sous les paroles, jamais au-dessus.
- « 🎸 Tu es musicien ? » : discret mais premier élément.
- Invitation à télécharger : pause et fin de live uniquement.
- CGU en pied, `--text-faint`.
