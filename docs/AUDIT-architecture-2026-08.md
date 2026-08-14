# Audit d'architecture — mojosong (août 2026)

> Backlog conservé à la demande de Vincent (« garde en mémoire, on le fera
> plus tard »). Rien n'est livré ici : c'est la liste priorisée des chantiers.
> Chaque `*.sql` reste idempotent et exécuté à la main par Vincent ; aucun
> `drop` destructif.

## Verdict global

L'app est **d'équerre**. La complexité est presque partout de la cicatrice
justifiée (chaque bug passé a laissé un invariant/test/garde-fou). Les
propriétés dures tiennent : aucune perte de morceau, deux comptes ne
fusionnent pas, résolution par compte, RLS correcte partout.

**La « fonctionnalité secondaire complexe et gourmande » = le sous-système
DIRECT (live)** : 7 fichiers serveur, 2 libs client, un moteur de
reconstruction de 285 lignes (`pastlives.ts`), et **deux architectures
d'auth + d'écriture en parallèle**. b313/b314 ont retiré son pire coût ; il
n'est plus emballé, juste lourd — il porte **trois générations de modèle**.

Le coût dominant du direct est désormais la **lecture** (sondage ×
résolution multi-sauts), pas l'écriture.

---

## 🔒 Sécurité — à VÉRIFIER en prod d'abord

`schema.sql` définit sur `shares` une policy `select using (true)` : si ce
fichier a été exécuté en prod, la **clé anon** (publique, dans le JS) peut
**énumérer tous les partages** (`GET /rest/v1/shares?select=*`) — snapshots
de pages et de setlists. Vérifier :

```sql
select polname from pg_policies where tablename = 'shares';
```

Si des policies apparaissent → `drop policy if exists …` (idempotent, non
destructif). Si vide, rien à faire.

---

## Lot A — sûr, fort gain, livrable en 1–2 commits

1. **Retirer l'endpoint IA mort `fn=setlist`** — client supprimé en b294,
   endpoint payant toujours importé et appelable.
   `api/ai.js:14,19` (import+handler), `server/setlist-ai.js`,
   clé `setlist` dans `server/ratelimit.js:26`.
2. **Vignetter la photo artiste avant publication** — `artist.photo` (JPEG
   192 px, ~10–25 Ko base64) part en pleine taille dans les **8**
   déclencheurs de republication. `profilAPublier` fait `{ ...artist }` sans
   `miniature`. `src/lib/publicPages.ts:871` ; réutiliser `miniature`
   (`src/lib/photo.ts:51`). C'est ce qui avait fait gonfler les lives (b314).
3. **Ne plus tirer le nettoyage IA (`clean`) à chaque frappe d'import** —
   déclenché sur tout changement de `text` (`src/pages/Import.tsx:388,434`),
   `max_tokens:8000`, même si le morceau n'est jamais importé. Ne lancer
   qu'au clic « Importer ». **1er poste de coût IA.**
4. **Stopper le double sondage `/sonnom`** — `PublicArtist.tsx:100`
   (8 s) + le `<Live>` qu'il rend sonde `fetchLive` (4 s, `Live.tsx:42,247`)
   en parallèle tout le concert. Couper la boucle externe quand `<Live>` est
   monté.
5. **Index + autovacuum (SQL, Vincent exécute)** :
   `create index if not exists live_messages_live_idx on live_messages(live_id);`
   et étendre l'autovacuum agressif (pattern `usage-rollup.sql`) à
   `user_library`/`band_library` (UPDATE de gros blobs → bloat non couvert).
6. **Marquer `schema.sql` LEGACY** (bandeau en tête, cesser de l'exécuter) —
   design relationnel v2 **jamais branché** (`songs`/`setlists`/`concerts`/
   `annotations`/`artist_profiles`/`song_versions`/`band_members`/`bands` =
   0 référence dans `api/`, `server/`, `src/`). Supprime la non-idempotence
   (14 `create policy` sans `drop`), la 2ᵉ définition contradictoire de
   `public.shares`, et les policies fuyantes ci-dessus. **Ne rien droper**
   (données possibles en prod).

## Lot B — structurel (à planifier, effort M)

- **Piloter par une SEULE source les listes de champs de synchro** — la
  classe de bug la plus récidivante (b202 × 4). Trois listes à tenir
  d'accord : objet poussé (`src/components/Account.tsx:359-369`), `fromCloud`
  (`Account.tsx:152-199`), `mergeStates` (`src/lib/sync.ts`). + 4 pour
  `BandData` (`exportBandData`/`mergeBandData`/`bandDataEqual`/`sanitizeBand`,
  `src/lib/bandSync.ts`) + 2 pour les versions (`versionContentDiffers`
  `src/lib/model.ts:319` / `versionEqual` `src/lib/bandSync.ts:218`).
- **Coalescer les deux boucles de sondage** — Notifications 60 s
  (`src/components/Notifications.tsx:397`) + Account `syncBands` 90 s
  (`Account.tsx:922`), qui parcourent chacune tous les groupes, non
  coordonnées et partiellement redondantes.
- **Une seule fonction « publier mon identité »** — le profil est republié
  depuis **8 sites** sans propriétaire (`Artist.tsx:1098`, `OnAir.tsx:454`,
  `PublicNameCard.tsx:107`, `Settings.tsx:97,743`, `Account.tsx:464,646`,
  `masquagegroupe.ts:118`). Même piège b202.
- **Réduire les prédicats d'identité de 4 à 2** — garder `memeMusicien`
  (identité) + `memePersonne` (repli) ; retirer `sameMusician`
  (`model.ts:769`, sous-chaîne) et `memeMusicienOuNomProche`
  (`model.ts:1097`) du chemin d'identité. Deux règles floues qui divergent =
  source des doublons de musiciens.
- **Gâcher moins de sérialisation** : `bandDataEqual` `JSON.stringify` tout
  le répertoire à chaque cycle 90 s pour décider s'il faut pousser
  (`bandSync.ts:391`) → drapeau « sale » par groupe. Idem mémoïser
  `stateJson` (`Account.tsx:359-370`, `JSON.stringify` biblio entière à
  chaque frappe).

## Lot C — legacy daté (chantier séparé, risque moyen)

- **Retrait de `live_state`** (ligne unique pré-b121, encore lue en repli
  dans ~13 chemins : `api/live.js`, `server/{message,heart,attend}.js`) +
  **branche POST morte** `api/live.js:731-857` (le client envoie toujours
  `multi:1`) + **heuristiques `pastlives` pré-b186** (`pastlives.ts:260-355`,
  regroupement au temps écoulé). ~350 lignes des 2 fichiers les plus
  fragiles. À faire une fois les vieux bundles éteints (comme
  `LIVE_KEY_LEGACY=0`).
- **Activer le LOT 2 du rollup** (`supabase/usage-rollup.sql:231-240`, purge
  60 j) **après** avoir livré l'Étape 5 (écrans lisant `usage_stats`), sinon
  les compteurs baissent.
- **Collapser `proprietaireDeLAdresse`** (3 sauts DB : public_pages →
  band_pages → cloud_bands, `api/live.js:213-251`) en une vue/RPC.

## À réévaluer avec Vincent

- **L'appel IA à chaque note ÉCRITE (b317, sa demande)** : une note tapée est
  déjà propre ; la fusion IA à chaque enregistrement est un coût par
  fréquence. Option : ne fusionner que s'il existe déjà une note vivante qui
  diffère (`NoteModal.tsx:597-635`). Garde le besoin b317 sans payer sur la
  première note.

---

## Notes de méthode

- Les 6 audits (données/synchro, direct, groupes, IA/import, base Supabase,
  pages publiques) convergent : **cœur sain, dette concentrée dans la
  plomberie de synchro** (listes de champs à la main, boucles de sondage,
  push de blob entier) **et le legacy trois-générations du direct**.
- Ne PAS « simplifier » à la légère les zones de perte de données —
  `dedupeSongsByContent`, changement de compte, réparations de version : leur
  simplification a déjà coûté des données (b290). Toute refonte y va avec les
  cas b245/b246/b247/b248/b290 épinglés comme tests de non-régression.

## Backlog produit — noté au fil de l'eau

- **Flux « Recherche & création » : retour intelligent selon le presse-papiers**
  (idéal exprimé par Vincent, b329) : au retour depuis UG, si un LIEN est dans
  le presse-papiers → atterrir sur l'écran de collage ; sinon → rester sur les
  résultats (l'utilisateur veut voir une autre version). IMPOSSIBLE en PWA
  iOS : le volet navigateur restauré par iOS ne peut pas être fermé par notre
  code, et la lecture du presse-papiers sans geste est interdite. À reprendre
  avec l'app NATIVE Capacitor (v3) : contrôle du navigateur intégré
  (fermeture au retour), détection presse-papiers Android, UIPasteControl
  iOS — la spec d'origine du flux redevient applicable telle quelle.

- **Flux « Recherche & création » : mojosong dans la FEUILLE DE PARTAGE**
  (idée de Vincent, b333) : depuis l'app UG, « Partager » produit un fichier
  texte (`lyrics_tmp`) — mojosong devrait apparaître dans la feuille de
  partage et ouvrir directement la création de partition avec ce contenu
  (pour l'utilisateur qui préfère naviguer seul dans UG et exporter).
  IMPOSSIBLE en PWA iOS (Apple n'ouvre pas les cibles de partage aux apps
  web). Deux voies :
  · Android DÈS MAINTENANT si souhaité : Web Share Target (manifest +
    route de réception) — mojosong apparaît dans la feuille Android ;
  · iOS avec l'app NATIVE Capacitor (v3) : Share Extension recevant le
    fichier et ouvrant #/creer pré-rempli. 3ᵉ argument fort pour le
    chantier natif (avec le presse-papiers intelligent et la fermeture du
    navigateur intégré).
  En attendant sur iPhone : Partager → Enregistrer dans Fichiers → mojosong
  → Autres façons d'importer → Document.
