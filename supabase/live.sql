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
