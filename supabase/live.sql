-- ============================================================
-- mojosong — Table du mode ON AIR (direct)
-- À exécuter dans SQL Editor de ton projet Supabase.
-- Une seule ligne (id = 'live') porte l'état du direct.
-- Seule la clé "service role" (côté serveur Vercel) y accède :
-- RLS activé sans policy = personne d'autre ne peut lire/écrire.
-- ============================================================

create table if not exists live_state (
  id text primary key,
  status text not null default 'off',   -- 'on' | 'pause' | 'off'
  song jsonb,                            -- {title, artist, lyrics}
  artist jsonb,                          -- profil artiste (photo, bio, liens)
  updated_at timestamptz not null default now()
);

alter table live_state enable row level security;

insert into live_state (id, status)
values ('live', 'off')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Cœurs du public pendant le direct + statistiques par chanson
-- (ré-exécutable sans risque)
-- ------------------------------------------------------------
alter table live_state add column if not exists hearts int not null default 0;

create table if not exists live_stats (
  id uuid primary key default gen_random_uuid(),
  song_title text not null,
  song_artist text not null default '',
  hearts int not null default 0,
  played_at timestamptz not null default now()
);

alter table live_stats enable row level security;

-- ------------------------------------------------------------
-- Livre d'or du public (messages de remerciement / encouragement)
-- ------------------------------------------------------------
create table if not exists live_messages (
  id uuid primary key default gen_random_uuid(),
  author text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

alter table live_messages enable row level security;

-- ------------------------------------------------------------
-- Suivi de groupe : le morceau en cours côté musiciens
-- ------------------------------------------------------------
alter table live_state add column if not exists band_song jsonb;

-- ------------------------------------------------------------
-- Contexte des messages du public : pendant quel morceau / quel artiste
-- ------------------------------------------------------------
alter table live_messages add column if not exists song_title text not null default '';
alter table live_messages add column if not exists performer text not null default '';

-- ------------------------------------------------------------
-- Affectation des interactions au concert en cours
-- ------------------------------------------------------------
alter table live_state add column if not exists concert jsonb;
alter table live_stats add column if not exists concert_id text not null default '';
alter table live_stats add column if not exists concert_title text not null default '';
alter table live_messages add column if not exists concert_id text not null default '';
alter table live_messages add column if not exists concert_title text not null default '';

-- ------------------------------------------------------------
-- Type de session : 'concert' (public + musiciens) ou 'repet'
-- (musiciens seulement — le public ne voit rien).
-- Le morceau publié (song jsonb) porte aussi, pour la vue musicien :
-- chords (paroles avec accords), chordKey, playedKey.
-- ------------------------------------------------------------
alter table live_state add column if not exists mode text not null default 'concert';

-- ------------------------------------------------------------
-- Setlist diffusée au public (concert) : le public peut la parcourir
-- lui-même (paroles de chaque morceau) et en garder un souvenir
-- (liens Spotify/Apple/Deezer). setlist = [{title, artist, lyrics}].
-- setlist_count (léger) est renvoyé dans l'état à chaque sondage ;
-- la setlist complète se récupère à la demande (GET /api/live?setlist=1).
-- ------------------------------------------------------------
alter table live_state add column if not exists setlist jsonb;
alter table live_state add column if not exists setlist_count int not null default 0;

-- ============================================================
-- Chantier 2 — MESURE D'AUDIENCE (mesure seulement, aucune limite)
-- Enregistre chaque session ON AIR (artiste, début/fin), le nombre de
-- spectateurs uniques (identifiant d'appareil ANONYME) et permet de relier
-- les cœurs par chanson à la session. AUCUN seuil, aucun blocage : ces
-- données servent uniquement aux statistiques de l'artiste et aux métriques
-- fondateurs (taux de 2ᵉ session). Ré-exécutable sans risque.
-- ============================================================

-- Une session ON AIR = un passage « en direct » (GO LIVE → arrêt).
create table if not exists live_sessions (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  uniques int not null default 0
);
alter table live_sessions enable row level security;

-- La ligne d'état pointe vers la session en cours (renseignée au GO LIVE).
alter table live_state add column if not exists session_id uuid;

-- Présence des spectateurs : 1 ligne par (session, appareil anonyme).
-- Le nombre d'uniques d'une session = nombre de lignes correspondantes.
create table if not exists live_attendance (
  session_id uuid not null,
  device_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (session_id, device_id)
);
alter table live_attendance enable row level security;

-- Relier les cœurs archivés à la session (analyse par concert).
alter table live_stats add column if not exists session_id uuid;

-- Identité du live (portée « mon groupe » côté membres).
--  band_id    : cloudId du groupe qui joue ('' = solo / non rattaché à un
--               groupe partagé → n'apparaît chez aucun autre membre).
--  started_by : nom de la personne qui a lancé le direct (affiché dans la
--               bannière « Concert en cours » chez les membres du groupe).
alter table live_state add column if not exists band_id text not null default '';
alter table live_state add column if not exists started_by text not null default '';

-- Garde-fous d'un direct oublié (auto-arrêt côté serveur, à la lecture) :
--  started_at   : heure de passage en direct (off → on/pause) ;
--  last_song_at : dernière fois qu'une partition a été poussée dans le live.
-- Un direct est coupé s'il dépasse 4 h depuis started_at, ou 1 h sans
-- nouvelle partition (last_song_at). Voir api/live.js.
alter table live_state add column if not exists started_at timestamptz;
alter table live_state add column if not exists last_song_at timestamptz;

-- ────────────────────────────────────────────────────────────────────────
-- MULTI-LIVE (chantier prioritaire, b121) : une ligne par direct — fini la
-- scène globale unique. Chaque GO LIVE crée sa ligne, avec :
--  join_code    : code de salon à 6 chiffres (rejoindre sans QR) ;
--  write_token  : jeton d'écriture du lanceur (seul lui pilote SON live).
-- L'ancienne ligne live_state reste lue en repli (vieux bundles/QR).
create table if not exists lives (
  id uuid primary key default gen_random_uuid(),
  join_code text not null default '',
  write_token text not null default '',
  status text not null default 'off',
  mode text not null default 'concert',
  song jsonb,
  artist jsonb,
  band_song jsonb,
  concert jsonb,
  setlist jsonb,
  setlist_count int not null default 0,
  hearts int not null default 0,
  band_id text not null default '',
  started_by text not null default '',
  started_at timestamptz,
  last_song_at timestamptz,
  session_id uuid,
  updated_at timestamptz not null default now()
);
alter table lives enable row level security;
create index if not exists lives_active_code
  on lives (join_code) where status <> 'off';
create index if not exists lives_active_band
  on lives (band_id) where status <> 'off';

-- Messages du public rattachés à leur direct (purge ciblée à la clôture).
alter table live_messages add column if not exists live_id uuid;

-- ------------------------------------------------------------
-- b138 : à QUI appartiennent ces ❤ ? La clé ON AIR est commune à
-- l'installation ; sans ce champ, les statistiques d'un artiste se
-- mélangeaient à celles des autres (et sa chanson pouvait sortir des
-- 200 dernières lignes). Les lignes antérieures restent lisibles :
-- la lecture accepte aussi performer = ''.
-- ------------------------------------------------------------
alter table live_stats add column if not exists performer text not null default '';
create index if not exists live_stats_performer on live_stats (performer);

-- ------------------------------------------------------------
-- b139 : les mots du public appartiennent au CONCERT (à la setlist
-- jouée), pas seulement au morceau écouté à cet instant. Le direct
-- publie le nom de sa setlist ; chaque message le recopie.
-- ------------------------------------------------------------
alter table lives add column if not exists setlist_name text not null default '';
alter table live_messages add column if not exists setlist_name text not null default '';

-- ------------------------------------------------------------
-- b168 : un mot du public appartient à l'artiste OU au groupe qui joue.
-- `performer` portait déjà l'artiste ; `band_id` permet à chaque membre du
-- groupe de retrouver les mots reçus pendant un concert du groupe. Les deux
-- restent facultatifs : un mot laissé hors direct s'attache au compte de
-- l'artiste dont le spectateur regardait la page.
-- ------------------------------------------------------------
alter table live_messages add column if not exists band_id text not null default '';
create index if not exists live_messages_performer on live_messages (performer);

-- ------------------------------------------------------------
-- b180 : l'historique des lives annonce la setlist jouée. Les ❤ archivés
-- portaient déjà `performer` (qui jouait) ; il leur manquait la setlist.
-- Colonne facultative : sans elle, l'historique s'affiche simplement sans
-- le nom du set.
-- ------------------------------------------------------------
alter table live_stats add column if not exists setlist_name text not null default '';

-- ------------------------------------------------------------
-- b192 : à qui appartient un live — l'identifiant du COMPTE, plus un nom.
--
-- La clé ON AIR était commune à l'installation : le serveur ne savait pas
-- qui l'appelait, et devait trier sur `performer` / `started_by`, c'est-à-
-- dire sur des NOMS AFFICHÉS. Un nom change (majuscule, nom de famille
-- ajouté, profil rempli après coup) et les statistiques d'un musicien
-- devenaient celles d'un autre — ou disparaissaient.
--
-- `owner_id` est l'identifiant du compte qui a lancé le direct. Il ne
-- change jamais. Les lignes antérieures restent lisibles : la lecture
-- accepte encore le rattachement par nom en repli.
-- ------------------------------------------------------------
alter table lives add column if not exists owner_id uuid;
create index if not exists lives_owner on lives (owner_id);

-- Les morceaux archivés et les mots du public héritent du propriétaire de
-- leur live : c'est ce qui permet de les rendre à leur artiste sans jamais
-- comparer deux chaînes de caractères.
alter table live_stats add column if not exists owner_id uuid;
create index if not exists live_stats_owner on live_stats (owner_id);
alter table live_messages add column if not exists owner_id uuid;
create index if not exists live_messages_owner on live_messages (owner_id);

-- Séances de mesure : même rattachement (compteur de spectateurs).
alter table live_sessions add column if not exists owner_id uuid;

-- b284 : `live_sessions` a été créée AVANT que ces colonnes n'entrent dans
-- son `create table` plus haut. Or `create table if not exists` est un no-op
-- sur une table déjà présente (cicatrice b195/b202) : sur la base de prod,
-- `artist_name` n'a jamais été ajoutée, et la lecture des statistiques
-- (`server/live-stats.js`, `server/souvenir.js`) échouait en 400
-- « column live_sessions.artist_name does not exist » (constaté 12/08/26).
-- On garantit CHAQUE colonne, jamais un bloc partiel : une seule oubliée
-- fait retomber la fonction sur un repli silencieux.
alter table live_sessions add column if not exists artist_name text not null default '';
alter table live_sessions add column if not exists started_at timestamptz not null default now();
alter table live_sessions add column if not exists ended_at timestamptz;
alter table live_sessions add column if not exists uniques int not null default 0;

-- NETTOYAGE DES VESTIGES D'UNE ANCIENNE ARCHITECTURE (avant la table `lives`,
-- b121). `live_sessions` doublait alors l'ÉTAT du direct : elle portait
-- `current_song`/`setlist` jsonb (paroles de tous les morceaux d'un concert —
-- jusqu'à ~1,3 Mo par ligne oubliée, constat de Vincent), plus `is_active`,
-- `show_chords`, `artist_id`, et deux policies d'accès CLIENT (« Artiste gère »,
-- « Sessions publiques » — cette dernière exposait la table en lecture au
-- public). Depuis b121, l'état vit dans `lives` ; `live_sessions` n'est plus
-- qu'une MESURE d'audience, écrite/lue UNIQUEMENT par le serveur (service_role,
-- qui ignore RLS). Ces colonnes/policies ne sont donc plus ni écrites ni lues.
-- On les retire : le modèle voulu est « RLS activée + AUCUNE policy » (seul le
-- serveur accède). Idempotent — `if exists` partout. La purge des lignes
-- reliques (celles qui portaient le gros `setlist`) a été faite à la main sur
-- la prod (TRUNCATE) ; on ne la met PAS ici, un fichier de schéma ne détruit
-- jamais de données.
drop policy if exists "Artiste gère" on live_sessions;
drop policy if exists "Sessions publiques" on live_sessions;
alter table live_sessions drop column if exists current_song;
alter table live_sessions drop column if exists setlist;
alter table live_sessions drop column if exists is_active;
alter table live_sessions drop column if exists show_chords;
alter table live_sessions drop column if exists artist_id;

-- ------------------------------------------------------------
-- b195 : les colonnes de BASE du livre d'or.
--
-- `create table if not exists live_messages (…)` ne corrige jamais une
-- table qui existe DÉJÀ : la nôtre avait été créée avant ce fichier, sans
-- `author`. Toutes les lectures le demandaient — elles échouaient donc
-- toutes en 400, pendant que l'écriture (qui interroge le schéma réel)
-- continuait d'enregistrer les mots du public. Quatre messages en base,
-- zéro à l'écran, et rien pour le dire.
-- ------------------------------------------------------------
alter table live_messages add column if not exists author text not null default '';
alter table live_messages add column if not exists body text not null default '';
alter table live_messages add column if not exists created_at timestamptz not null default now();

-- ------------------------------------------------------------
-- b196 : la table portait les noms d'une version ANTÉRIEURE du projet —
-- `content` pour le texte, `sender_name` pour l'auteur. `create table if
-- not exists` ne l'a jamais alignée ; les colonnes `body` et `author`
-- ajoutées après coup sont arrivées VIDES à côté, et les mots du public
-- remontaient sans une lettre. On RECOPIE, on n'efface rien : `content` et
-- `sender_name` restent en place.
-- ------------------------------------------------------------
update live_messages set body = content
 where coalesce(body, '') = '' and coalesce(content, '') <> '';
update live_messages set author = sender_name
 where coalesce(author, '') = '' and coalesce(sender_name, '') <> '';

-- `created_at` était un `timestamp WITHOUT time zone` : les mots
-- s'affichaient avec l'écart du fuseau (4 h à La Réunion), et tombaient donc
-- à côté de la fenêtre de leur propre live. Les valeurs stockées sont en
-- UTC : la conversion ne les déplace pas, elle leur rend leur fuseau.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'live_messages' and column_name = 'created_at'
      and data_type = 'timestamp without time zone'
  ) then
    alter table live_messages
      alter column created_at type timestamptz using created_at at time zone 'UTC';
  end if;
end $$;

-- ------------------------------------------------------------
-- b225 — UN CŒUR PAR SPECTATEUR ET PAR MORCEAU (demande de Vincent).
--
-- Le public peut taper autant qu'il veut — le ❤ s'envole à chaque fois,
-- c'est le retour immédiat qui fait le geste. Mais UN SEUL cœur par
-- spectateur et par morceau est COMPTABILISÉ : sinon le chiffre ne dit plus
-- « combien de gens ont aimé », il dit « qui a le doigt le plus rapide », et
-- les statistiques de l'artiste ne veulent plus rien dire.
--
-- Le spectateur n'a pas de compte : on l'identifie par l'identifiant anonyme
-- et stable de son navigateur (`sing2me/deviceId`), le même que pour le
-- comptage des spectateurs uniques. Rien d'autre n'est enregistré — ni IP,
-- ni nom, ni la moindre donnée personnelle.
--
-- Le morceau est identifié par son TITRE tel que le serveur le connaît au
-- moment du clic : c'est le serveur qui le lit sur la ligne du live, jamais
-- le client qui l'annonce.
-- ------------------------------------------------------------
create table if not exists live_hearts (
  live_id text not null,
  song_key text not null,
  device text not null,
  created_at timestamptz not null default now(),
  primary key (live_id, song_key, device)
);

alter table live_hearts enable row level security;

-- Aucune politique : la table n'est écrite que par les fonctions serveur
-- (service_role), qui contournent RLS. Le public n'y accède jamais
-- directement — il passe par /api/heart.

create index if not exists live_hearts_live_idx on live_hearts (live_id);

-- ------------------------------------------------------------
-- MESURE DES LIVES CÔTÉ PUBLIC (b498, demande de Vincent — phase pilote).
-- Cinq compteurs AGRÉGÉS portés par la session elle-même : des nombres,
-- jamais une liste. `uniques`, `started_at` et `ended_at` existaient déjà.
--   pic       : maximum de spectateurs connectés SIMULTANÉMENT, tenu à
--               jour PENDANT la session (à chaque arrivée — le seul
--               moment où il peut monter), jamais recalculé à la fin ;
--   morceaux  : morceaux passés en mode scène (finalisé à la clôture,
--               compté depuis live_stats) ;
--   plein_at  : l'instant où la salle a été pleine pour la première fois
--               (la « minute depuis le début » se dérive de started_at) ;
--   refuses   : spectateurs supplémentaires refusés après le plein —
--               dédupliqués par appareil, mais stockés en agrégat.
-- ------------------------------------------------------------
alter table live_sessions add column if not exists pic int not null default 0;
alter table live_sessions add column if not exists morceaux int not null default 0;
alter table live_sessions add column if not exists plein_at timestamptz;
alter table live_sessions add column if not exists refuses int not null default 0;

-- Salle pleine : incrément ATOMIQUE (deux refus simultanés ne se perdent
-- pas) + premier instant. Service role seulement, comme tout le reste.
create or replace function public.bump_salle_pleine(p_session uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update live_sessions
     set refuses = refuses + 1,
         plein_at = coalesce(plein_at, now())
   where id = p_session;
$$;
revoke all on function public.bump_salle_pleine(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- CLÔTURE DE SECOURS (b498) : l'auto-arrêt de api/live.js est PARESSEUX —
-- il ne s'exécute que si quelqu'un LIT le live. Un live abandonné (artiste
-- parti, plus aucun sondage) restait « on » pour toujours, sans ended_at :
-- durées fausses. Ce balayage, appelé par le cron quotidien, clôt les
-- lives expirés (mêmes seuils que liveExpired : 4 h après le début, ou
-- 1 h sans partition) et date la fin AU MOMENT DE L'EXPIRATION, jamais au
-- passage du cron. Il ne fait NI l'archive du morceau affiché au moment
-- de l'abandon, NI l'e-mail « salle pleine » (pas d'e-mail depuis SQL) —
-- deux pertes assumées sur un cas rare, dites dans la PR.
-- ------------------------------------------------------------
create or replace function public.balayer_lives_abandonnes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id, session_id, started_at, last_song_at
      from lives
     where status <> 'off'
       and (
         started_at < now() - interval '4 hours'
         or coalesce(last_song_at, started_at) < now() - interval '1 hour'
       )
  loop
    update lives
       set status = 'off',
           song = null,
           band_song = null,
           setlist = null,
           setlist_count = 0,
           join_code = '',
           last_song_at = null,
           hearts = 0,
           -- b314 : un live clos ne garde du profil que le nom.
           artist = case
             when artist->>'name' is not null
               then jsonb_build_object('name', artist->>'name')
             else null
           end,
           updated_at = now()
     where id = r.id and status <> 'off';
    if found then
      n := n + 1;
      if r.session_id is not null then
        update live_sessions s
           set ended_at = coalesce(
                 s.ended_at,
                 least(
                   r.started_at + interval '4 hours',
                   coalesce(r.last_song_at, r.started_at) + interval '1 hour'
                 )
               ),
               uniques = greatest(s.uniques, coalesce((
                 select count(*) from live_attendance a
                  where a.session_id = r.session_id), 0)),
               morceaux = greatest(s.morceaux, coalesce((
                 select count(*) from live_stats st
                  where st.session_id = r.session_id), 0))
         where s.id = r.session_id;
      end if;
      delete from live_seats where live_id = r.id::text;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.balayer_lives_abandonnes() from public, anon, authenticated;
