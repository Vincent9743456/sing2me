-- ============================================================
-- Sing2Me — Étape 2 des comptes : groupes réels entre comptes.
-- À exécuter dans SQL Editor du projet Supabase (ré-exécutable).
--
-- Un groupe créé dans l'app peut être « publié » dans le cloud :
-- l'invitation contient alors un jeton ; le musicien invité qui a
-- un compte rejoint le groupe en un clic (fonction join_band), et
-- le créateur voit la liste des membres réels (comptes vérifiés).
-- ============================================================

create table if not exists public.cloud_bands (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  -- id du groupe dans l'app du créateur (pour retrouver le lien)
  local_id text not null default '',
  name text not null default '',
  invite_token text not null default '',
  created_at timestamptz not null default now()
);
alter table public.cloud_bands enable row level security;

create table if not exists public.cloud_band_members (
  band_id uuid not null references public.cloud_bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  instrument text not null default '',
  joined_at timestamptz not null default now(),
  primary key (band_id, user_id)
);
alter table public.cloud_band_members enable row level security;

-- Le créateur gère ses groupes
drop policy if exists bands_owner_all on public.cloud_bands;
create policy bands_owner_all on public.cloud_bands
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Un membre voit sa propre ligne ; le créateur voit tous ses membres
drop policy if exists members_select on public.cloud_band_members;
create policy members_select on public.cloud_band_members
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  );

-- Le créateur retire un membre ; un membre peut quitter le groupe
drop policy if exists members_delete on public.cloud_band_members;
create policy members_delete on public.cloud_band_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  );

-- Rejoindre via le jeton d'invitation (validé côté serveur)
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.join_band(uuid, text, text, text);
create or replace function public.join_band(
  p_band uuid,
  p_token text,
  p_name text,
  p_instrument text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_band public.cloud_bands;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  select * into v_band from public.cloud_bands
    where id = p_band and invite_token = p_token and invite_token <> '';
  if not found then
    return json_build_object('error', 'Invitation invalide ou révoquée');
  end if;
  insert into public.cloud_band_members (band_id, user_id, name, instrument)
  values (p_band, auth.uid(), coalesce(p_name, ''), coalesce(p_instrument, ''))
  on conflict (band_id, user_id) do update
    set name = excluded.name, instrument = excluded.instrument;
  return json_build_object('ok', true, 'band', v_band.name);
end $$;
grant execute on function public.join_band to authenticated;

-- ------------------------------------------------------------
-- Étape 2b : bibliothèque partagée du groupe (répertoire commun).
-- Une ligne par groupe : versions du groupe, notes de répét
-- partagées, setlists du groupe. Lue/écrite par le créateur et
-- les membres (RLS ci-dessous), fusion côté application.
-- ------------------------------------------------------------
create table if not exists public.band_library (
  band_id uuid primary key references public.cloud_bands (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.band_library enable row level security;

drop policy if exists band_library_rw on public.band_library;
create policy band_library_rw on public.band_library
  for all using (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
    or exists (
      select 1 from public.cloud_band_members m
      where m.band_id = band_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
    or exists (
      select 1 from public.cloud_band_members m
      where m.band_id = band_id and m.user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Espace du groupe : fil de discussion entre membres.
-- Messages typés : discussion, proposition de chanson, répét,
-- concert. Lus par créateur + membres ; chacun écrit sous son
-- compte ; suppression par l'auteur ou le créateur du groupe.
-- ------------------------------------------------------------
create table if not exists public.band_messages (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.cloud_bands (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null default '',
  kind text not null default 'message'
    check (kind in ('message', 'chanson', 'repet', 'concert')),
  text text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists band_messages_band_idx
  on public.band_messages (band_id, created_at desc);
alter table public.band_messages enable row level security;

drop policy if exists band_messages_select on public.band_messages;
create policy band_messages_select on public.band_messages
  for select using (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
    or exists (
      select 1 from public.cloud_band_members m
      where m.band_id = band_id and m.user_id = auth.uid()
    )
  );

drop policy if exists band_messages_insert on public.band_messages;
create policy band_messages_insert on public.band_messages
  for insert with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.cloud_bands b
        where b.id = band_id and b.owner = auth.uid()
      )
      or exists (
        select 1 from public.cloud_band_members m
        where m.band_id = band_id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists band_messages_delete on public.band_messages;
create policy band_messages_delete on public.band_messages
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  );

-- Liste des membres (créateur ou membre du groupe)
-- ATTENTION (b144) : `directory.sql` installe une version ENRICHIE de
-- band_members (avec la photo du musicien). Une redéfinition aveugle ici
-- échouerait (« cannot change return type », erreur 42P13) ou, pire,
-- écraserait la version enrichie selon l'ordre d'exécution des fichiers.
-- On ne crée donc la version simple que si la fonction n'existe pas
-- encore : les deux fichiers deviennent ré-exécutables dans n'importe
-- quel ordre.
do $do$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'band_members'
  ) then
    execute $fn$
      create function public.band_members(p_band uuid)
      returns table (user_id uuid, name text, instrument text, joined_at timestamptz)
      language sql security definer set search_path = public as $body$
        select m.user_id, m.name, m.instrument, m.joined_at
        from public.cloud_band_members m
        where m.band_id = p_band
          and (
            exists (
              select 1 from public.cloud_bands b
              where b.id = p_band and b.owner = auth.uid()
            )
            or exists (
              select 1 from public.cloud_band_members me
              where me.band_id = p_band and me.user_id = auth.uid()
            )
          );
      $body$;
    $fn$;
    execute 'grant execute on function public.band_members to authenticated';
  end if;
end $do$;

-- ------------------------------------------------------------
-- b140 : quitter un groupe POUR DE BON.
-- Réinitialiser son application retirait le groupe localement, mais
-- l'inscription restait côté serveur : le créateur continuait de voir
-- un membre fantôme, et ne pouvait pas le réinviter. Le départ est
-- désormais effectif des deux côtés (le créateur, lui, ne peut pas
-- quitter son propre groupe : il le supprime ou le transmet).
-- ------------------------------------------------------------
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.leave_band(uuid);
create or replace function public.leave_band(p_band uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  delete from public.cloud_band_members
    where band_id = p_band and user_id = auth.uid();
  -- Trace du départ (b142) : le créateur en est informé dans son onglet
  -- Groupes et peut réinviter d'un geste. `invited_by` reprend le
  -- propriétaire du groupe (la colonne est obligatoire).
  insert into public.band_invites
    (band_id, invited_user, invited_by, band_name, from_name, status)
  select p_band, auth.uid(), b.owner, b.name, '', 'left'
  from public.cloud_bands b
  where b.id = p_band
  on conflict (band_id, invited_user) do update set
    status = 'left', created_at = now();
  return json_build_object('ok', true);
end $$;
grant execute on function public.leave_band to authenticated;
