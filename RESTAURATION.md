# mojosong — remettre l'application en route depuis zéro

*Que faire si l'accès à GitHub, à Vercel ou à Supabase est perdu.*
Établi le 11 août 2026 (b277).

Ce document suppose qu'il ne reste **que** la copie de sauvegarde et les
identifiants des services. Il dit ce que la copie contient, ce qu'elle ne
peut pas contenir, et dans quel ordre tout redémarre.

---

## 1. Ce que contient la copie

Deux fichiers, envoyés ensemble. **Garde-les ailleurs que sur l'ordinateur
de travail** — un disque externe, une clé USB, un espace en ligne.

| Fichier | Ce que c'est |
|---|---|
| `mojosong-historique-complet.bundle` | **Tout le dépôt**, avec l'historique complet de chaque livraison. C'est la vraie sauvegarde |
| `mojosong-code-b277.zip` | Les fichiers du projet à la dernière version, sans historique. Pour ouvrir et lire sans rien installer |

### Repartir du bundle

```bash
git clone mojosong-historique-complet.bundle mojosong
cd mojosong
git log --oneline | head          # l'historique est là, entier
```

Le dépôt cloné est complet et fonctionne hors ligne. Pour le remettre sur
un GitHub neuf :

```bash
git remote set-url origin https://github.com/<compte>/<nouveau-depot>.git
git push -u origin main
```

### Le faire tourner en local

```bash
npm install
VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run dev
```

Sans les deux variables, l'application démarre quand même : elle affiche le
portail de connexion et fonctionne en local, sans cloud.

---

## 2. Ce que la copie NE contient PAS (et ne doit pas contenir)

### Les clés et mots de passe

Aucun secret n'est dans le dépôt — c'est volontaire : un dépôt qui fuite ne
doit rien donner. Il faut donc les garder **à part**. Voici la liste exacte
de ce qu'il faut noter quelque part (un gestionnaire de mots de passe, ou
un papier dans un tiroir) :

| Variable | Où la retrouver | À quoi elle sert |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | Adresse du projet (publique) |
| `VITE_SUPABASE_ANON_KEY` | idem | Clé publique du navigateur (protégée par RLS) |
| `SUPABASE_URL` | idem | La même, côté serveur |
| `SUPABASE_SERVICE_KEY` | idem, « service_role » | **Secret absolu** — accès total à la base |
| `LIVE_KEY` | inventée par nous | Ancienne clé du direct (transition) |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Mise en forme des imports |
| `TRANSCRIBE_API_KEY` | fournisseur de transcription | Dictée vocale |
| `TRANSCRIBE_URL`, `TRANSCRIBE_MODEL`, `ANTHROPIC_MODEL` | facultatives | Réglages fins |
| `ADMIN_EMAILS` | choisi par nous | Qui voit le tableau de bord fondateur |
| `VITE_OAUTH_ENABLED` | `1` pour activer | Boutons Google / Apple / Facebook |
| `LIVE_KEY_LEGACY` | `0` pour fermer | Coupe l'ancienne clé du direct |

> Si `SUPABASE_SERVICE_KEY` a fuité, il faut la **régénérer** dans Supabase
> et la remettre dans Vercel. Rien d'autre à changer.

### Les données

Le dépôt contient la **structure** de la base (`supabase/*.sql`), pas son
**contenu**. Ce qui vit uniquement dans Supabase :

- les comptes (authentification) ;
- les bibliothèques en ligne des utilisateurs (`user_library`) ;
- les groupes, leurs membres, leurs répertoires partagés ;
- les pages publiques, les directs, les cœurs, les mots du public.

**À faire régulièrement** : Supabase → Database → Backups. Sur le plan
gratuit, les sauvegardes sont limitées — un export manuel
(`Database → Backups → Download`) mis de côté chaque mois vaut mieux que
rien.

> **Ta bibliothèque à toi** ne dépend de rien de tout ça : elle vit sur ton
> téléphone. Réglages → **💾 Enregistrer une sauvegarde** produit un fichier
> qui se relit **même sans mojosong** (c'est du texte : titres, paroles,
> accords). Fais-le de temps en temps, c'est le filet le plus solide.

---

## 3. Remonter toute la chaîne, dans l'ordre

Si tout est perdu sauf la copie et les identifiants :

1. **Supabase** — créer un projet, puis exécuter les fichiers de
   `supabase/` dans le SQL Editor, dans cet ordre :
   `schema.sql`, `auth.sql`, `bands.sql`, `live.sql`, `public.sql`,
   `directory.sql`, `fanbase.sql`, `shares.sql`, `reports.sql`,
   `admin.sql`. Ils sont **idempotents** : les rejouer ne casse rien.
2. **Authentication → SMTP** — configurer un serveur d'envoi, sinon
   personne ne peut créer de compte (le service intégré de Supabase est
   réservé aux tests).
3. **GitHub** — pousser le dépôt restauré (voir §1).
4. **Vercel** — importer le dépôt, coller les variables du tableau ci-dessus
   dans Settings → Environment Variables, déployer. Le déploiement est
   automatique à chaque push sur `main` ensuite.
5. **Vérifier** — ouvrir `/version.txt` : le numéro de livraison doit
   s'afficher.

---

## 4. Ce qui rend cette reconstruction possible

Trois choix faits dès le départ, qui valent d'être connus :

- **Aucune dépendance exotique** : React, TypeScript, Vite. Rien qui puisse
  disparaître sans remplaçant.
- **Le SQL est dans le dépôt**, idempotent : la base se reconstruit à
  l'identique en dix minutes.
- **L'application est local-first** : même sans serveur, chaque utilisateur
  garde sa bibliothèque sur son téléphone, et son export de sauvegarde se
  lit sans nous.

Autrement dit : perdre l'infrastructure coûte une soirée de remontage.
Perdre le code et les données coûterait tout — d'où ce document.
