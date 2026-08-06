# Rapport QA — b75 (6 août 2026)

Protocole « Simulation nouvel utilisateur + passe visuelle multi-devices »
exécuté en local (`vite preview`) avec Playwright/Chromium. Captures dans
`docs/qa/b75/p1/` (parcours) et `docs/qa/b75/p2/` (multi-devices). Données
brutes des contrôles : `docs/qa/b75/checks.json`.

> Limite d'environnement : le proxy bloque Supabase et le domaine Vercel.
> Les fonctions « en ligne » (page `/#/live`, synchro cloud, recherche
> annuaire) ne peuvent pas être testées ici — testées séparément en prod.

---

## Partie 1 — Simulation nouvel utilisateur (390×844, localStorage vide)

| Étape | Verdict | Constat |
|---|---|---|
| 1. Arrivée | ✅ | Carte d'accueil affichée + 2 morceaux d'exemple (tag « Exemple ») seedés automatiquement. La promesse est lisible d'emblée. |
| 2. « Voir un exemple en mode scène » | ✅ | Le bouton d'accueil emmène en un geste vers `#/stage/...` (plein écran). |
| 3. Importer un morceau | ✅ | Format « accords au-dessus des paroles » collé → **aperçu de la partition affiché avant l'ajout** (nouveau b73), bouton « Ajouter à ma bibliothèque » présent. |
| 3b. Après import | ✅ | Redirection directe sur la fiche du morceau (`#/song/…`). |
| 5. Créer une setlist | ✅ | Écran Setlists accessible, sélecteur unique (lot A) opérationnel. |
| 6. Onglet Groupes | ✅ | Écran dédié accessible, invitation en un bouton. |
| Erreurs console | ✅ | **Aucune** sur tout le parcours. |

**Verdict global Partie 1 :** un musicien passe de « rien » à « mon morceau
en mode scène » sans blocage ni écran ambigu. Objectif < 5 min tenu.

---

## Partie 2 — Passe visuelle multi-devices

Viewports testés : 360×800, 390×844, 768×1024 (P), 1024×768 (L), 1280×800,
1600×900. Routes : landing `/site/`, bibliothèque, SongView, mode scène,
setlist + édition, fiche groupe (3 portes), Artiste, `/#/live`.

### Débordement horizontal
- **Application : 0 débordement** sur toutes les routes et tous les
  viewports. ✅
- **Landing `/site/`** : `scrollWidth` ≈ 1,2× la largeur à *tous* les
  viewports → un élément décoratif (halo/gradient) déborde d'environ 20 %.
  **Sans impact utilisateur** : `body { overflow-x: hidden }` le rogne (aucun
  scroll horizontal, rien de coupé à l'écran). Gravité **basse**.

### Cibles tactiles
Plusieurs cibles sont sous le repère des 44 px de haut (voir tableau des
défauts). Aucune superposition ni cible chevauchante détectée ; l'espacement
entre cibles voisines est suffisant. C'est une question de **hauteur** des
composants compacts (chips, petits boutons, pastille ON AIR), pas de
disposition.

### Identité & lisibilité
- Orange `#f6832a` appliqué partout ; aucun reliquat ambre repéré. ✅
- Pastille **ON AIR** toujours distincte (point + texte, contour vert). ✅
- Une action principale évidente par écran (import, Scène, Ajouter…). ✅
- Barre d'onglets fixe : rien ne passe dessous. ✅

---

## Correctifs appliqués dans ce commit (évidents, peu risqués)

1. **Placement Transposer / Capo** (demande explicite) : chaque bloc
   « libellé + molette » est désormais **insécable**. Si les deux ne tiennent
   pas sur une ligne, **Capo passe entièrement à la ligne suivante, qui
   commence par « Capo »** (vérifié à 360 px — voir `p2/songview_360x800.png`).
2. **Croix des bulles d'aide** (coach marks) : cible portée de 18×19 à ≈ 32 px.

---

## Défauts listés — décision à Vincent (non corrigés)

| # | Gravité | Page(s) | Viewport(s) | Défaut |
|---|---|---|---|---|
| D1 | Basse | Landing `/site/` | tous | Élément décoratif déborde ~20 % (rogné par `overflow-x:hidden`, pas de scroll visible). À nettoyer pour la propreté du DOM. |
| D2 | Moyenne | Toute l'app | tous | Cibles tactiles < 44 px : chips de filtre (~27 px), boutons de la barre du haut « ← / Scène / Modifier / ⋯ » (~28-30 px), pastille ON AIR (~26 px), boutons œil/crayon des setlists (38×28). Relever la hauteur touche l'ensemble du système compact (tokens `--btn`/`.chip`) → décision de design. |
| D3 | Basse | `/#/live` | — | Affiche « nécessite la version en ligne » en local (attendu : backend indisponible derrière le proxy). Non reproductible en prod. |

**Recommandation D2 :** si on vise l'accessibilité tactile, augmenter la
hauteur minimale des `.chip` et `.btn.small` à 40-44 px et la zone tactile de
la barre du haut, en une passe design dédiée (impact visuel à valider — le
style actuel est volontairement compact).

---

## Fichiers
- Parcours : `p1/01-arrivee.png` … `p1/06-groupes.png`
- Multi-devices : `p2/<route>_<viewport>.png`
- Contrôles bruts : `checks.json`
