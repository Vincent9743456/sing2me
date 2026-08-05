-- ============================================================
-- Sing2Me — Étape 1 des comptes : sauvegarde cloud de la
-- bibliothèque du musicien (une ligne par utilisateur).
-- À exécuter dans SQL Editor du projet Supabase (ré-exécutable).
--
-- L'authentification (email magique, Google, Facebook) est gérée
-- par Supabase Auth — voir le README pour la configuration.
-- Chaque utilisateur ne peut lire et écrire QUE sa propre ligne
-- (politiques RLS ci-dessous, basées sur auth.uid()).
-- ============================================================

create table if not exists public.user_library (
  id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_library enable row level security;

drop policy if exists user_library_select on public.user_library;
create policy user_library_select on public.user_library
  for select using (auth.uid() = id);

drop policy if exists user_library_insert on public.user_library;
create policy user_library_insert on public.user_library
  for insert with check (auth.uid() = id);

drop policy if exists user_library_update on public.user_library;
create policy user_library_update on public.user_library
  for update using (auth.uid() = id) with check (auth.uid() = id);
