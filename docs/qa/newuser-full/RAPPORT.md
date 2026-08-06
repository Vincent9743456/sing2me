# Compte rendu — nouvel utilisateur : tour complet des fonctionnalités

Un nouveau venu (contexte vierge) parcourt et essaie **toutes** les grandes
fonctions de l'app : import, transposition, notes, mode scène, setlist,
groupe, messages, concert, ON AIR, profil, partage. Rejoué en local
(`vite preview` + Playwright, mobile 390×844). Captures dans
`docs/qa/newuser-full/` (`01…19`).

> **Limite d'environnement :** le proxy bloque Supabase et le backend « live ».
> Les fonctions **cloud** (envoi réel des messages de groupe, diffusion ON AIR,
> synchro multi-appareils, compte/annuaire) ne s'exécutent pas ici — leur
> **interface** est vérifiée, et le reste par lecture du code. Tout le reste
> (local-first) est testé de bout en bout.
>
> **Aucune erreur console** sur l'ensemble du parcours.

| # | Fonction | Verdict | Constat | Capture |
|---|---|---|---|---|
| 1 | **Arrivée** | ✅ | Carte d'accueil + 2 morceaux d'exemple. | `01` |
| 2 | **Importer un morceau** (coller du texte) | ✅ | Accords au-dessus des paroles reconnus, **aperçu de la partition** avant l'ajout, puis ouverture directe sur la fiche. | `02`,`03` |
| 3 | **Transposition + « Accords sans capo »** | ✅ | +2 demi-tons appliqués aux accords ; bascule « sans capo » OK. | `04` |
| 4 | **Note de répétition** | ✅ | Note saisie et affichée sur la fiche du morceau. | `05` |
| 5 | **Mode scène** | ✅ | Plein écran, gros texte, accessible en un geste. | `06` |
| 6 | **Créer une setlist + morceaux** | ✅ | Création « Solo », ajout de 2 morceaux via le sélecteur unique, pli « ⋯ » (tonalité/version/note) et bascule **Réserve** OK. | `07`,`08` |
| 7 | **Aperçu imprimable de la setlist** | ✅ | Vue synthétique/imprimable. | `09` |
| 8 | **Créer un groupe** | ✅ | 3 portes (Discussion / Répertoire / Setlists), créateur = 1ᵉʳ musicien. | `10`,`11` |
| 9 | **Messages de groupe** | ✅ (UI) | Zone de saisie + bouton « Envoyer » présents. *Synchro réelle = backend cloud, non joignable ici.* | `12`,`13` |
| 10 | **Concert** | ✅ | Concert créé et listé (« Concert au Café du Coin · 20 sept. 2026 »). | `14`,`15` |
| 11 | **ON AIR** | ✅ (UI) | Panneau complet : type de session (Concert/Répét), qui joue, « Démarrer le direct », « Mon QR unique ». *Diffusion réelle = backend live, non joignable ici ; en prod la clé est automatique via `VITE_LIVE_KEY`.* | `16` |
| 12 | **Profil artiste** | ✅ | Nom + bio saisis et enregistrés. | `17`,`18` |
| 13 | **Partager un morceau** | ✅ | Modale de partage : **QR code**, « Copier le lien », **Email**, **WhatsApp**, lien autonome (« le destinataire n'a besoin d'aucune application »). | `19` |

## Ce qui reste à valider en production (hors de portée du proxy)
- Envoi/réception réels des **messages de groupe** (table `band_messages`).
- **Diffusion ON AIR** vers la page publique (backend live + `LIVE_KEY`).
- **Synchro multi-appareils** et **création de compte** (lien magique Supabase).
- Recherche **annuaire** (invitation par nom).

## Verdict global
Le nouvel utilisateur peut **tout essayer sans blocage** : importer, jouer en
scène, transposer, annoter, bâtir une setlist, créer un groupe, préparer un
concert, ouvrir le panneau ON AIR, remplir son profil et partager par
QR/lien. Le socle local-first est **fonctionnel de bout en bout et sans
erreur** ; seules les briques cloud restent à confirmer en production.
