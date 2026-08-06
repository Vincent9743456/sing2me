-- ============================================================
-- Sing2Me — Signalements de contenu (chantier 3, paquet défensif)
-- À exécuter dans SQL Editor de ton projet Supabase (idempotent).
-- Seule la clé "service role" (côté serveur Vercel) y accède :
-- RLS activé sans policy = personne d'autre ne peut lire/écrire.
-- ============================================================

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  url text not null default '',
  reason text not null,
  contact text not null default '',
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
