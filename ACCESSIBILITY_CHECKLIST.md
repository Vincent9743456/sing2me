# DodoSongs — Checklist accessibilité

À vérifier après chaque lot (items critiques *) :

## Contraste
- [ ] * Texte courant ≥ 4.5:1 sur son fond (`--text`, `--text-dim`)
- [ ] * Boutons et chips : texte ≥ 4.5:1, bordures d'état ≥ 3:1
- [ ] Placeholders ≥ 3:1 (`--text-faint`)
- [ ] Accords `--chord` ≥ 4.5:1 sur `--bg` et `--stage-bg`
- [ ] Aucune information portée uniquement par la couleur
      (accords hérités : opacité + infobulle ✓)

## Clavier
- [ ] * Tab parcourt tous les éléments interactifs, ordre logique
- [ ] * `:focus-visible` visible partout (anneau accent)
- [ ] Modales : Échap ferme, focus entre dans la modale
- [ ] Mode scène : ← → espace Échap fonctionnels

## Tactile
- [ ] * Cibles ≥ 44px (48px en mode scène) sur `pointer: coarse`
- [ ] Espacement ≥ 8px entre cibles adjacentes critiques
- [ ] Pas d'action destructive au milieu de gestes courants

## Lecteur d'écran
- [ ] Boutons icône : `aria-label` explicite en français
- [ ] Icônes décoratives : `aria-hidden="true"`
- [ ] Toasts : `aria-live="polite"` ; erreurs : `role="alert"`
- [ ] Champs : label lié (composant Field)
- [ ] Images (photos, QR) : `alt` renseigné

## Mouvement & confort
- [ ] * `prefers-reduced-motion: reduce` : pulse/float/slide désactivés
- [ ] Aucune animation > 400ms, aucune boucle hors états live
- [ ] Zoom navigateur 200 % : pas de perte de contenu
- [ ] Tailles de texte réglables en scène/partition (A−/A＋) persistées

## Environnements musicaux
- [ ] Lisibilité salle sombre : pas de gris < `--text-dim` sur contenu
- [ ] Lisibilité plein jour : option contraste max en scène (phase 2)
- [ ] Une main / téléphone : commandes vitales dans la zone du pouce
