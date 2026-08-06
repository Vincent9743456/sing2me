-- ============================================================
-- Sing2Me — Pages publiques d'artiste par NOM dictable (chantier 4)
-- Multi-locataire : chaque compte publie sa fiche sous un nom unique,
-- ouvrable via livemyband.fr/lenom (domaine actuel pour l'instant).
-- À exécuter dans SQL Editor de ton projet Supabase (idempotent).
-- ============================================================

create table if not exists public_pages (
  user_id uuid primary key,
  name text unique not null,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public_pages enable row level security;

-- Lecture PUBLIQUE (les fiches d'artiste sont publiques par nature).
drop policy if exists public_pages_read on public_pages;
create policy public_pages_read on public_pages
  for select using (true);

-- Écriture réservée au propriétaire (auth.uid() = user_id).
drop policy if exists public_pages_write on public_pages;
create policy public_pages_write on public_pages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Format du nom : minuscules + chiffres, 3 à 30 caractères (dictable).
alter table public_pages drop constraint if exists public_pages_name_format;
alter table public_pages
  add constraint public_pages_name_format check (name ~ '^[a-z0-9]{3,30}$');

-- Noms réservés : routes techniques de l'application.
alter table public_pages drop constraint if exists public_pages_name_reserved;
alter table public_pages
  add constraint public_pages_name_reserved check (
    name not in (
      'admin','api','app','artist','assets','auth','band','bands','cgu',
      'concert','concerts','favicon','follow','import','live','login',
      'logout','manifest','me','p','public','remote','report','robots','s',
      'setlist','setlists','signalement','site','song','stage','static','www'
    )
  );
