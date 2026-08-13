-- ============================================================
-- mojosong — Fanbase V1 (chantier 6)
-- « Suivre cet artiste » : le public s'abonne aux actualités d'un artiste
-- (email, avec consentement explicite). L'artiste voit le NOMBRE de
-- suiveurs ; le détail des emails n'est partagé que si le suiveur a coché
-- l'option (RGPD). À exécuter dans SQL Editor de Supabase (idempotent).
-- Seule la clé "service role" (côté serveur Vercel) y accède : RLS activé
-- sans policy = personne d'autre ne peut lire/écrire.
-- ============================================================

create table if not exists followers (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null,
  email text not null default '',
  -- Le suiveur accepte de partager son email avec l'artiste (sinon l'artiste
  -- ne voit que le compteur agrégé).
  share_email boolean not null default false,
  created_at timestamptz not null default now()
);

alter table followers enable row level security;

-- Dédup : un même email ne suit un artiste qu'une fois.
create unique index if not exists followers_artist_email
  on followers (artist_name, email)
  where email <> '';
