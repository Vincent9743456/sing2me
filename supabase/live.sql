-- ============================================================
-- Sing2Me — Table du mode ON AIR (direct)
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
