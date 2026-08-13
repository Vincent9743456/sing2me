-- ============================================================
-- mojosong — Liens de partage courts.
-- À exécuter dans SQL Editor du projet Supabase (ré-exécutable).
--
-- Le contenu partagé (page publique, setlist, morceau…) est stocké
-- ici sous un identifiant court : le lien/QR devient minuscule au
-- lieu d'embarquer tout le contenu (photos incluses) dans l'URL.
-- Accès uniquement via les fonctions serveur Vercel (service_role) :
-- RLS activé sans policy = aucun accès direct.
-- ============================================================

create table if not exists public.shares (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.shares enable row level security;
