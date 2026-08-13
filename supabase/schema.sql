-- ============================================================
-- mojosong — Schéma Supabase (version 2 : espace collaboratif)
-- À exécuter dans SQL Editor de ton projet Supabase.
--
-- Modèle : un « groupe » (band) rassemble des musiciens.
-- Morceaux, setlists et concerts appartiennent à un groupe.
-- Les annotations portent les échanges de répétition.
-- Les partages publics deviennent de courts liens en base.
-- ============================================================

create table if not exists bands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists band_members (
  band_id uuid not null references bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'musicien', -- 'leader' | 'musicien'
  display_name text not null default '',
  instrument text not null default '',   -- pour les vues par instrument (v2)
  joined_at timestamptz not null default now(),
  primary key (band_id, user_id)
);

create table if not exists songs (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references bands (id) on delete cascade,
  title text not null,
  artist text not null default '',
  key text not null default '',
  tempo int not null default 0,
  capo int not null default 0,
  duration_sec int not null default 0,
  tags jsonb not null default '[]',
  -- versions : [{id, name, key, tempo, capo, structure, lyrics}]
  versions jsonb not null default '[]',
  active_version_id text not null default '',
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historique des versions (v2) : un instantané par sauvegarde
create table if not exists song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs (id) on delete cascade,
  snapshot jsonb not null,
  author_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists setlists (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references bands (id) on delete cascade,
  name text not null,
  comment text not null default '',
  items jsonb not null default '[]',     -- [{id, songId, note, keyOverride}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists concerts (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references bands (id) on delete cascade,
  title text not null,
  date date,
  time text not null default '',
  venue text not null default '',
  description text not null default '',
  setlist_id uuid references setlists (id) on delete set null,
  visibility text not null default 'public', -- 'public' | 'prive'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Annotations / commentaires de répétition (v2)
create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null,
  -- '' = note générale ; sinon libellé de la partie visée ("Refrain"…)
  target text not null default '',
  -- visibilité : 'groupe' | 'privee' | liste d'instruments ciblés
  audience jsonb not null default '"groupe"',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Profils artistes (page publique)
create table if not exists artist_profiles (
  band_id uuid primary key references bands (id) on delete cascade,
  name text not null default '',
  bio text not null default '',
  photo_url text not null default '',    -- Supabase Storage
  links jsonb not null default '[]'      -- [{id, label, url}]
);

-- Partages publics : liens courts remplaçant l'encodage dans l'URL
create table if not exists shares (
  id text primary key,                   -- code court (ex. 8 caractères)
  band_id uuid references bands (id) on delete cascade,
  payload jsonb not null,                -- même format que SharePayload
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ============================================================
-- Sécurité (RLS)
-- ============================================================

alter table bands enable row level security;
alter table band_members enable row level security;
alter table songs enable row level security;
alter table song_versions enable row level security;
alter table setlists enable row level security;
alter table concerts enable row level security;
alter table annotations enable row level security;
alter table artist_profiles enable row level security;
alter table shares enable row level security;

create policy "membres lisent leur groupe" on bands
  for select using (
    exists (select 1 from band_members m where m.band_id = bands.id and m.user_id = auth.uid())
  );
create policy "création de groupe" on bands
  for insert with check (created_by = auth.uid());

create policy "membres lisent les membres" on band_members
  for select using (
    exists (select 1 from band_members m where m.band_id = band_members.band_id and m.user_id = auth.uid())
  );
create policy "adhésion via invitation" on band_members
  for insert with check (user_id = auth.uid());

create policy "membres gèrent les morceaux" on songs
  for all using (
    exists (select 1 from band_members m where m.band_id = songs.band_id and m.user_id = auth.uid())
  );
create policy "membres lisent l'historique" on song_versions
  for select using (
    exists (
      select 1 from songs s join band_members m on m.band_id = s.band_id
      where s.id = song_versions.song_id and m.user_id = auth.uid()
    )
  );
create policy "membres écrivent l'historique" on song_versions
  for insert with check (author_id = auth.uid());

create policy "membres gèrent les setlists" on setlists
  for all using (
    exists (select 1 from band_members m where m.band_id = setlists.band_id and m.user_id = auth.uid())
  );
create policy "membres gèrent les concerts" on concerts
  for all using (
    exists (select 1 from band_members m where m.band_id = concerts.band_id and m.user_id = auth.uid())
  );

create policy "membres lisent les annotations" on annotations
  for select using (
    exists (
      select 1 from songs s join band_members m on m.band_id = s.band_id
      where s.id = annotations.song_id and m.user_id = auth.uid()
    )
  );
create policy "auteur gère ses annotations" on annotations
  for all using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "membres gèrent le profil artiste" on artist_profiles
  for all using (
    exists (select 1 from band_members m where m.band_id = artist_profiles.band_id and m.user_id = auth.uid())
  );

-- Les partages publics sont lisibles par tous (page publique)
create policy "partages lisibles publiquement" on shares
  for select using (true);
create policy "membres créent des partages" on shares
  for insert with check (
    band_id is null or
    exists (select 1 from band_members m where m.band_id = shares.band_id and m.user_id = auth.uid())
  );

-- ============================================================
-- Temps réel : activer la réplication sur les tables partagées
-- ============================================================
-- alter publication supabase_realtime add table songs;
-- alter publication supabase_realtime add table setlists;
-- alter publication supabase_realtime add table concerts;
-- alter publication supabase_realtime add table annotations;
