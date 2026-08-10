# DodoSongs — QA design (à dérouler après chaque lot)

## Cohérence
- [ ] Aucune couleur hex hors tokens introduite
- [ ] Aucune valeur d'espacement hors `--sp-*` introduite
- [ ] Composants existants réutilisés (voir COMPONENT_INVENTORY.md)
- [ ] Pas de nouvelle carte injustifiée
- [ ] Style cohérent avec les écrans déjà corrigés

## Fonctionnel (rapide mais réel)
- [ ] Navigation : 4 onglets + retour arrière
- [ ] Recherche + filtres bibliothèque
- [ ] Ouverture morceau : 4 vues, transposition, capo auto
- [ ] Versions : changement, création, version de groupe
- [ ] Notes : ajout (dictée si dispo), contexte groupe, suppression
- [ ] Setlist : DnD, tonalité par morceau, version par morceau
- [ ] Mode scène : swipe, clavier, défilement, wake lock
- [ ] Régie : sélection morceau, publication
- [ ] ON AIR : on/pause/off, mode répét, QR
- [ ] Live public : paroles, ❤, message, vue musicien
- [ ] Partages : groupe, public, invitation, adhésion
- [ ] Hors ligne : bibliothèque + scène fonctionnelles (mode avion)
- [ ] Compte : connexion, synchro, déconnexion

## Responsive
- [ ] 360×640 (petit téléphone) — rien ne déborde
- [ ] 390×844 (téléphone) + paysage
- [ ] 768×1024 (tablette portrait + paysage)
- [ ] 1280×800 (portable) — sidebar
- [ ] ≥ 1440 (grand écran) — largeurs max respectées

## Accessibilité
- [ ] Items * de ACCESSIBILITY_CHECKLIST.md

## Visuel
- [ ] Alignements et gouttières réguliers
- [ ] Hiérarchie : 1 action principale évidente par écran
- [ ] Aucun texte tronqué imprévu, aucune orpheline bizarre
- [ ] États : hover, active, disabled, focus, vide, erreur, chargement
- [ ] Typecheck OK (`npx tsc -p tsconfig.verify.json`)
