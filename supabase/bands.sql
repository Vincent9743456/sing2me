-- ============================================================
-- DodoSongs — Étape 2 des comptes : groupes réels entre comptes.
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
  -- Le CRÉATEUR ne quitte pas son propre groupe (b212) : le commentaire
  -- ci-dessus l'annonçait, le code ne l'appliquait pas. Réinitialiser son
  -- application appelle `leave_band` sur TOUS ses groupes : le créateur
  -- inscrivait donc son propre départ, et son onglet Groupes lui
  -- demandait ensuite de se réinviter lui-même — sans pouvoir fermer le
  -- message (signalement de Marco). On ne fait rien, sans erreur : la
  -- réinitialisation locale ne doit jamais être bloquée.
  if exists (
    select 1 from public.cloud_bands b
    where b.id = p_band and b.owner = auth.uid()
  ) then
    return json_build_object('ok', true, 'skipped', 'owner');
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

-- Réparation des lignes déjà écrites (b212) : un créateur inscrit comme
-- « parti » de son propre groupe. Idempotent — rien à supprimer une fois
-- la fonction ci-dessus en place.
delete from public.band_invites i
using public.cloud_bands b
where i.band_id = b.id
  and i.status = 'left'
  and i.invited_user = b.owner;

-- ============================================================
-- b251 — UNE INVITATION PAR LIEN EST NOMINATIVE ET À USAGE UNIQUE
-- (demande de Vincent : « il faut que cette invitation soit nominative
--  et que personne d'autre ne puisse utiliser ce lien »).
--
-- CE QUI N'ALLAIT PAS : le lien portait `cloud_bands.invite_token` —
-- UN SEUL jeton par groupe, permanent, réutilisable à l'infini et par
-- n'importe qui. Un lien transféré, une capture d'écran dans une
-- conversation de groupe, et un inconnu entrait dans le répertoire
-- partagé. Rien ne le rattachait à la personne invitée, rien ne
-- l'expirait, rien ne le consommait.
--
-- CE QUI LE REMPLACE : une ligne PAR INVITATION. Elle porte le nom de
-- la personne visée, expire, et se referme sur le PREMIER compte qui
-- l'utilise — celui-là peut y revenir (réinstallation, second
-- appareil), personne d'autre ne le peut.
-- ============================================================
create table if not exists public.band_invite_links (
  token text primary key,
  band_id uuid not null references public.cloud_bands (id) on delete cascade,
  -- Le nom écrit par celui qui invite : c'est ce qui rend l'invitation
  -- NOMINATIVE, et ce que l'invité voit avant d'accepter.
  invited_name text not null default '',
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  -- Le compte qui l'a consommée. Une fois posé, il est le seul admis.
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists band_invite_links_band on public.band_invite_links (band_id);
alter table public.band_invite_links enable row level security;

-- Le jeton ne se LIT pas en table : il est vérifié par `join_band`
-- (security definer). Seul le créateur du groupe voit ses invitations —
-- sans quoi n'importe quel compte pourrait moissonner les jetons.
drop policy if exists band_invite_links_owner on public.band_invite_links;
create policy band_invite_links_owner on public.band_invite_links
  for all using (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  );

-- Crée une invitation nominative et rend son jeton.
-- Réinviter la MÊME personne révoque l'invitation précédente : sans quoi
-- deux liens vivraient en parallèle pour un seul musicien, et révoquer
-- l'un laisserait l'autre ouvert.
drop function if exists public.create_band_invite(uuid, text);
create or replace function public.create_band_invite(
  p_band uuid,
  p_name text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  if not exists (
    select 1 from public.cloud_bands b
    where b.id = p_band and b.owner = auth.uid()
  ) then
    return json_build_object('error', 'Seul le créateur du groupe invite');
  end if;
  if v_name = '' then
    return json_build_object('error', 'Il faut nommer la personne invitée');
  end if;
  update public.band_invite_links
    set revoked_at = now()
    where band_id = p_band
      and used_by is null
      and revoked_at is null
      and lower(invited_name) = lower(v_name);
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  insert into public.band_invite_links (token, band_id, invited_name, invited_by)
  values (v_token, p_band, v_name, auth.uid());
  return json_build_object('ok', true, 'token', v_token, 'name', v_name);
end $$;
grant execute on function public.create_band_invite to authenticated;

-- Révoque une invitation encore ouverte (le créateur change d'avis).
drop function if exists public.revoke_band_invite(text);
create or replace function public.revoke_band_invite(p_token text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  update public.band_invite_links l
    set revoked_at = now()
    from public.cloud_bands b
    where l.token = p_token
      and b.id = l.band_id
      and b.owner = auth.uid()
      and l.revoked_at is null;
  return json_build_object('ok', true);
end $$;
grant execute on function public.revoke_band_invite to authenticated;

-- `join_band` : le jeton de groupe n'est PLUS accepté.
-- Les messages d'erreur sont distincts — « expirée » et « déjà utilisée »
-- n'appellent pas la même réaction de celui qui les lit.
drop function if exists public.join_band(uuid, text, text, text);
create or replace function public.join_band(
  p_band uuid,
  p_token text,
  p_name text,
  p_instrument text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_link public.band_invite_links;
  v_band public.cloud_bands;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  select * into v_link from public.band_invite_links
    where token = p_token and band_id = p_band;
  if not found then
    return json_build_object('error', 'Invitation invalide ou révoquée');
  end if;
  if v_link.revoked_at is not null then
    return json_build_object('error', 'Invitation révoquée');
  end if;
  if v_link.expires_at < now() then
    return json_build_object('error', 'Invitation expirée');
  end if;
  -- USAGE UNIQUE. Celui qui l'a consommée peut revenir (réinstallation,
  -- deuxième appareil) ; personne d'autre ne le peut.
  if v_link.used_by is not null and v_link.used_by <> auth.uid() then
    return json_build_object('error', 'Invitation déjà utilisée');
  end if;
  select * into v_band from public.cloud_bands where id = p_band;
  if not found then
    return json_build_object('error', 'Invitation invalide ou révoquée');
  end if;
  update public.band_invite_links
    set used_by = auth.uid(), used_at = coalesce(used_at, now())
    where token = p_token;
  insert into public.cloud_band_members (band_id, user_id, name, instrument)
  values (p_band, auth.uid(), coalesce(p_name, ''), coalesce(p_instrument, ''))
  on conflict (band_id, user_id) do update
    set name = excluded.name, instrument = excluded.instrument;
  return json_build_object('ok', true, 'band', v_band.name);
end $$;
grant execute on function public.join_band to authenticated;

-- Les jetons de groupe déjà distribués sont NEUTRALISÉS : tant qu'ils
-- restent en base, ils donnent l'illusion d'un lien encore valable.
-- Conséquence assumée : un lien envoyé avant ce lot ne fonctionne plus,
-- il faut réinviter. C'est le prix de la règle demandée.
update public.cloud_bands set invite_token = '' where invite_token <> '';
