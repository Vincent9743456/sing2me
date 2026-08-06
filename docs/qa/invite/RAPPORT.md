# Compte rendu — parcours « nouvel utilisateur invité sur un groupe »

**Persona simulé :** Marc, 40 ans, guitariste, **impatient** et **peu à
l'aise avec la technologie**. Il reçoit par SMS/WhatsApp un lien
d'invitation envoyé par Vincent, qui a créé le groupe « Les Amplifiés ».

Test rejoué en local (`vite preview` + Playwright, mobile 390×844).
Captures dans `docs/qa/invite/`.

> **Limite d'environnement :** le proxy bloque Supabase. La **création de
> compte réelle** (email + lien magique) et l'**adhésion cloud** (RPC
> `join_band`) ne s'exécutent pas ici. Les étapes concernées sont vérifiées
> par lecture du code et en rejouant exactement l'état que ce code produit.

---

## Le parcours de Marc, étape par étape

### 1. Il clique sur le lien reçu — page d'invitation ✅
`01-landing.png`
- Il voit immédiatement : **« Vincent t'invite à rejoindre "Les
  Amplifiés" »**, trois repères de réassurance (**✓ Gratuit · ✓ Le
  répertoire du groupe arrive tout seul · ✓ Tes morceaux restent à toi**) et
  **un seul bouton** orange : « Créer mon compte gratuit pour rejoindre ».
- **Ce qu'il comprend en 3 secondes :** qui l'invite, à quoi, que c'est
  gratuit et sans risque pour ses morceaux. Une seule action possible.
- **Impatient / non-tech :** rien à lire, rien à choisir, aucun jargon. ✅

### 2. Il touche le bouton — écran de compte ✅ (prod) / ⚠️ non testable en local
`02-compte.png`
- L'invitation est **mémorisée** (vérifié : `pendingInvite` enregistré avec
  le bon groupe/jeton) et Marc est amené à l'écran « compte ».
- En **production**, cet écran = **un champ email + « Recevoir mon lien »**
  (lien magique, **sans mot de passe**), pas de Google/Facebook, pas de mot
  de passe (vérifié dans le code `Account.tsx`). Idéal pour un non-tech.
- **En local**, Supabase n'étant pas configuré, l'écran affiche « Synchro
  cloud non configurée » à la place du champ email — **artefact
  d'environnement**, pas un défaut produit.

### 3. Lien magique → compte créé → adhésion automatique → Morceaux ✅
`03-arrivee.png`
- Marc reçoit le mail, clique le lien : compte créé **et** adhésion au
  groupe terminée **toute seule** (aucune saisie de plus).
- Il atterrit sur **Morceaux** avec la bannière **« 🎉 Tu as rejoint Les
  Amplifiés ! »** (« Son répertoire arrive dans ta bibliothèque. Tes propres
  morceaux restent à toi. » + bouton **Voir le groupe**).
- La **checklist « Prise en main » version invité** s'affiche : *Découvre le
  répertoire de Les Amplifiés · Joue un morceau en mode scène · Dis bonjour
  dans la discussion du groupe · Ajoute tes propres morceaux*.
- Le morceau du groupe arrive en **📥 Proposition (1)** à valider
  (anti-pollution : il n'entre pas d'office dans sa bibliothèque).
- **Aucun exemple parasite** (voir correctif ci-dessous). ✅

### 4. Il ouvre la fiche du groupe — 3 portes ✅
`04-groupe.png`
- **💬 Discussion**, **🎵 Répertoire du groupe** (« 1 morceau · 1 proposition
  à valider »), **📋 Setlists du groupe**. En-tête : **2 musiciens**.

### 5. La discussion du groupe ✅
`05-chat.png` — accessible en un geste (« 💬 Les Amplifiés »).

---

## Défaut trouvé **et corrigé** dans ce commit (b77)

**Exemples seedés derrière la page d'invitation.** Le garde-fou
« un invité ne reçoit pas les morceaux d'exemple » s'appuyait sur le drapeau
`pendingInvite` — or celui-ci n'est posé qu'**après** le clic « rejoindre »,
donc **trop tard** : à l'ouverture du lien, l'appli seedait quand même les 2
exemples. Marc se serait retrouvé, après création de compte, avec 2 morceaux
d'exemple en plus du répertoire du groupe.

**Correctif :** sur un lien de partage/invitation (`#/s/…` ou `#/p/…`), on ne
seede pas et on ne pose pas le drapeau. Résultat vérifié :
- ouverture d'un lien d'invitation → **0 exemple** ;
- ouverture normale d'un nouvel utilisateur → **2 exemples** (inchangé).

---

## Points de vigilance (non bloquants, à revérifier en prod)

| Gravité | Point |
|---|---|
| Info | Écran de compte non testable en local (Supabase). À confirmer en prod : champ email + « Recevoir mon lien », pas d'OAuth, pas de mot de passe. |
| Basse | Adhésion réelle (`join_band`) et lien magique non exécutables ici — flux vérifié par lecture ; l'état produit (`justJoined` + groupe local + navigation) est correct. |
| Basse | La checklist « Ajoute tes propres morceaux » peut apparaître déjà cochée si une proposition de groupe compte comme « morceau présent ». Cosmétique. |

---

## Verdict global

Pour un guitariste de 40 ans, **impatient et peu technophile**, le parcours
est **fluide et rassurant** : **1 lien → 1 bouton → email sans mot de passe →
il est dans le groupe**, accueilli par une bannière et une courte checklist.
Aucun mot de passe, aucun jargon, aucune décision superflue. Le seul point
restant à valider est l'écran de compte **en production** (non testable
derrière le proxy).
