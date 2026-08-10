# DodoSongs — Principes UX

1. **La partition d'abord.** Sur tout écran musical, le contenu (paroles,
   accords, structure) est l'élément dominant ; les outils s'effacent.
2. **Rien ne bloque, jamais.** Pas de compte obligatoire, pas de réseau
   obligatoire, pas de dialogue bloquant. Toute fonction cloud dégrade
   proprement vers le local.
3. **La scène est sacrée.** En concert : lire → naviguer → défiler →
   réagir. Aucune action secondaire visible, cibles ≥ 48px, sortie
   protégée, écran toujours allumé.
4. **Zéro friction pour le public.** Un fan qui scanne le QR lit les
   paroles sans aucun choix préalable. Les sollicitations (compte,
   téléchargement) n'apparaissent qu'aux pauses.
5. **Un geste = un retour.** Chaque action utilisateur produit une
   confirmation discrète (toast, état) — jamais un silence, jamais une
   alerte système.
6. **Révélation progressive.** Réglages et actions rares sont repliés ;
   les compteurs (« 3 notes ») remplacent les listes dépliées.
7. **Un composant par fonction.** Avant de créer, réutiliser ; avant de
   dupliquer, généraliser (voir COMPONENT_INVENTORY.md).
8. **Le contexte musicien prime.** Chaque vue instrument montre d'abord
   ce dont ce musicien a besoin (tempo pour le batteur, tonalité réelle
   pour le bassiste, départs pour le chanteur).
9. **Cohérence des destructions.** Supprimer = action rare, éloignée des
   gestes courants, confirmée dans le style de l'app, toujours depuis la
   fiche de l'objet.
10. **L'esthétique suit la lisibilité.** Aucun effet ne doit coûter du
    contraste ou de la hauteur d'écran au contenu musical.
