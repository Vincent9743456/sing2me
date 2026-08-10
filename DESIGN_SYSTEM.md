# DodoSongs — Design System

> Source de vérité pour toute modification d'interface.
> **À lire avant de toucher au CSS ou aux composants.**
> Direction artistique : « studio scénique contemporain » — sombre,
> ambré, sobre, chaleureux, lisible de loin.

## 1. Direction artistique

**Conservé** : dark-first assumé (identité scène), accent unique,
accords en cyan, rayons généreux, sobriété sans froideur.
**Identité (b237)** : la charte **DodoSongs** — fond nuit `#0A0F1D`, texte
crème `#F4F0E9`, ambre `#FCA711` pour ce qui agit, cyan `#5BD0E8` pour ce
qui se joue. Le logo est le **dodo à la guitare**, un bloc complet posé sur
le fond nuit dans un carré aux angles arrondis (22,5 % du côté) : on ne
l'ouvre pas, on ne le recolore pas, on ne le met jamais dans un cercle, on
ne lui ajoute pas d'ombre portée. Source unique `public/dodosongs.png`, les
tailles dérivées par `scripts/build-icons.mjs`.
*(Remplace l'identité b53 — orange scène `#f6832a` + logo « bulle qui
chante ». Rien de b53 ne survit ; si une couleur de cette époque réapparaît
quelque part, c'est un oubli, pas une intention.)*
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
  /* Fonds & surfaces — le NUIT de la charte */
  --bg: #0a0f1d;             /* nuit   — fond de l'app */
  --surface: #121a2e;        /* nuit 2 — cartes, panneaux */
  --surface-high: #1b2540;   /* nuit 3 — champs, surfaces hautes */
  --surface-sunken: #0d1424; /* panneau « en creux » */
  --surface-hover: #24304e;
  --stage-bg: #0a0f1d;       /* mode scène : le fond nuit PUR */
  --stage-text: #f4f0e9;
  --stage-bar: #0a0f1d;
  --scrim: rgba(4, 7, 14, 0.72);      /* voile des modales */
  --scrim-soft: rgba(4, 7, 14, 0.58); /* voile des feuilles du bas */

  /* Bordures — les « lignes » : de la crème diluée, pas du gris */
  --border: rgba(244, 240, 233, 0.1);
  --border-soft: rgba(244, 240, 233, 0.06);
  --border-strong: rgba(244, 240, 233, 0.18);

  /* Textes — la CRÈME */
  --text: #f4f0e9;           /* crème   — texte principal, paroles */
  --text-dim: #a7afc2;       /* crème 2 — texte secondaire */
  --text-faint: #69728a;     /* crème 3 — légendes, décoratif (4,0:1) */
  --on-accent: #0a0f1d;      /* du nuit SUR l'ambre — jamais du blanc */

  /* Accent — l'AMBRE */
  --accent: #fca711;
  --accent-strong: #de8f00;  /* pression, survol */
  --accent-soft: rgba(252, 167, 17, 0.14);
  --accent-dark: #7a5200;    /* bordures d'encart */

  /* Fonctionnelles */
  --chord: #5bd0e8;          /* CYAN — les accords, et RIEN d'autre */
  --danger: #f4677e;         /* rouge — l'erreur, le destructif */
  --live: #fca711;           /* le direct porte l'ambre (charte) */
  --live-soft: #ffd98a;
  --ok: #5bd8a6;             /* vert — succès, synchronisé */
  --ok-soft: rgba(91, 216, 166, 0.14);
  --on-ok: #06281c;
  --warn: #f6c662;           /* ambre pâli — jamais porté par un bouton */
  --warn-soft: rgba(246, 198, 98, 0.14);
  --heart: #f79bac;          /* le rouge éclairci — les cœurs du public */

  /* Pastilles de groupe (Library, à terme partout) */
  --band-1: #fbbf24; --band-2: #60a5fa; --band-3: #5bd8a6;
  --band-4: #f4677e; --band-5: #a78bfa; --band-6: #fb923c;
  --band-7: #22d3ee;
}
```

Règles :
- **Aucune couleur hex nouvelle dans les composants.** Tout passe par un
  token ; s'il manque, on l'ajoute ici d'abord.
- **`--chord` = les accords, et RIEN d'autre.** C'est la règle qui tient
  toute l'identité : un utilisateur apprend en trois secondes que « bleu =
  accord », et une seule exception ruine l'apprentissage. Corollaire : la
  page du PUBLIC est la seule surface où le cyan n'apparaît pas — elle ne
  montre aucun accord.
- **Un seul bouton ambre par écran** : celui qui fait avancer. `--danger` =
  destructif. `--warn` = un constat, jamais un bouton.
- **Live = point clignotant + texte, jamais la couleur seule.** Le direct
  porte l'AMBRE, comme les actions (c'est la charte). Il ne peut donc PAS se
  distinguer par la teinte : un élément « en direct » (ON AIR) s'identifie
  toujours par son point clignotant **et** son libellé. Ne jamais coder un
  état sur la couleur seule.
- **Mode clair : FAIT (b233).** Le bloc ci-dessus est dupliqué sous
  `:root[data-theme='clair']` (theme.css) — et il ne contient QUE des
  tokens. Un composant qui aurait besoin d'une règle propre au clair est
  un composant qui a une couleur en dur : c'est elle qu'on corrige, jamais
  une exception qu'on ajoute. Le sombre reste le défaut et n'écrit aucun
  attribut : si le module de thème ne s'exécutait pas, l'app serait sombre.
  Le réglage vit dans la BIBLIOTHÈQUE, à côté de « Filtrer » (arbitrage de
  Vincent, b234 : pas sur la partition — cet écran est au morceau, un
  réglage global n'y a rien à faire). Sans libellé, pour ne pas voler la
  place de la recherche à 360 px : c'est l'`aria-label` qui le nomme. Il
  s'applique à toute l'app et vit dans `prefs.theme`, donc il suit le
  compte comme la langue. Les pages publiques ne le suivent pas.
- **Le mode scène est sombre, sans alternative** (b235) : y entrer bascule
  toute l'app en sombre et ne restaure rien en sortant. Les tokens
  `--stage-bg` / `--stage-text` / `--stage-bar` n'ont donc pas de valeur
  claire — un pupitre blanc en plein concert n'est pas un cas à couvrir.
- Tokens ajoutés avec lui, parce qu'ils étaient écrits en dur :
  `--stage-text`, `--stage-bar` (le mode scène a sa propre paire — c'est un
  pupitre, pas une page), `--scrim` / `--scrim-soft` (voiles des modales et
  des feuilles du bas), `--on-ok` (texte sur pastille verte).
- En clair, les teintes fonctionnelles sont ASSOMBRIES, jamais inversées :
  l'ambre, le cyan des accords, le rouge du direct restent reconnaissables,
  à des valeurs qui tiennent ≥ 4.5:1 sur `--surface`. `--on-accent` passe
  au BLANC (l'accent y est foncé — le sens s'inverse).
  Seule exception assumée : `ErrorBoundary` reste sombre en dur. C'est
  l'écran de crash : il doit s'afficher même si le CSS n'a pas chargé.

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
- **Un panneau plein écran passe par `StageList`** (jamais `.stagelist`
  écrit à la main) : fond opaque et verrou de défilement de la page. Sans
  le verrou, iOS donne le geste à la page du dessous — le panneau semble
  figé (b184).
- **Jamais de `backdrop-filter` sur un élément `position: fixed`** posé
  au-dessus d'une page qui défile (barre d'onglets, barre du public,
  contrôles du mode scène, boutons flottants). iOS repeint ces éléments
  au mauvais endroit pendant l'inertie du défilement : la barre part au
  milieu de l'écran (signalé deux fois par Vincent, b181 puis b183).
  Fond OPAQUE issu des tokens (`--surface`, `--bg`). Le flou reste
  permis sur les éléments `sticky` et les fonds de modale.
- **Ne jamais repositionner une barre fixe en JavaScript** (b184) : un
  recalage à chaque `scroll` produit exactement le symptôme qu'il vise
  (« le menu du bas remonte quand on scrolle »).

### Feedback
- `Toast` (à créer, lot 3) : 1 message, auto-dismiss 3 s,
  `aria-live="polite"`, en bas au-dessus de la tabbar.
- `ConfirmSheet` / `PromptSheet` (à créer, lot 3) : remplacent 100 % des
  `alert/confirm/prompt`. Confirm destructif = bouton `.danger` à droite.
- **Un formulaire ne disparaît JAMAIS en silence** (b190). Le livre d'or
  du public se masquait tout seul quand le serveur refusait l'écriture,
  pour « ne pas montrer d'erreur technique » : le spectateur tapait son
  mot, appuyait sur Envoyer, et le formulaire s'évanouissait — rien
  n'arrivait chez l'artiste et personne ne pouvait le savoir. Une panne
  se DIT, en une phrase humaine, et ne se mémorise pas sur l'appareil :
  une panne d'une minute ne vaut pas condamnation définitive.

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

## Rangées de puces qui défilent (`.chips.scrollrow`, b203)

Une rangée de puces dont le nombre dépend des DONNÉES de l'utilisateur
(ses groupes, ses tags) ne doit pas s'empiler sur plusieurs lignes : avec
six groupes, les répertoires de la bibliothèque occupaient quatre lignes
et repoussaient les morceaux hors de l'écran — « tout ça prend beaucoup
de place, la partition est illisible » (Vincent). Ajouter `scrollrow` à
côté de `chips` : une seule ligne, défilement latéral, accroche par puce,
barre de défilement masquée. La hauteur cesse alors de dépendre du
nombre d'éléments.

Ne PAS l'utiliser pour une rangée courte et fixe (deux ou trois puces
connues d'avance) : le défilement cacherait une option sans raison.

C'est aussi la forme retenue pour un **sélecteur de contexte en haut d'un
écran** (répertoires de la bibliothèque, contextes des setlists depuis
b211) : une rangée, une seule liste dessous. Un accordéon par contexte
paraît rangé mais coûte un geste par contexte et remplit l'écran
d'en-têtes ; ce qu'on cherche est alors caché derrière un pli.


## Un panneau plein écran se cale sur la zone VISIBLE (b210)

`position: fixed; inset: 0` se règle sur la fenêtre de mise en page, qui ne
rétrécit pas quand le clavier s'ouvre. Le panneau garde alors sa hauteur
pleine, sa moitié basse passe sous le clavier, et la zone défilante — qui
contient tout son contenu sans déborder — n'a plus rien à faire défiler.
Le sélecteur de morceaux paraissait figé, clavier ouvert.

Tout panneau plein écran doit donc :

- appeler `useScrollLock()` — sinon iOS donne le geste à la page derrière ;
- appeler `useVisualViewport()` et se caler en
  `top: var(--vv-t, 0px); height: var(--vv-h, 100%)` ;
- porter `overscroll-behavior: contain` sur sa zone défilante, et
  `min-height: 0` si elle est en `flex: 1` (sans quoi elle refuse de
  rétrécir sous son contenu).

Les valeurs de repli rendent exactement le comportement d'avant sur les
navigateurs sans `visualViewport` : rien ne casse.


## Un nom qu'on lit vaut mieux qu'un sigle qu'on décode (b211)

Les pastilles à initiales (« LZ » pour Les Zamis) tenaient dans peu de
place, mais demandaient d'apprendre une clé de lecture, et deux groupes sur
trois partagent leur première lettre. Le nom du groupe s'écrit donc en
toutes lettres, dans le sous-titre de la ligne, avec le reste de ce qu'on
lit sans réfléchir (artiste, tonalité, tempo).

Deux règles qui vont avec :

- **placer ce qui compte AVANT la technique** : le sous-titre est coupé par
  ellipse à 360 px, et ce qui est en bout de ligne est ce qui disparaît ;
- **ne pas répéter le contexte courant** : dans le répertoire d'un groupe,
  son nom sur chaque ligne n'apprend rien (même règle qu'en b203).
