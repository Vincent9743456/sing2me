-- ============================================================
-- Sing2Me — Annuaire des musiciens + invitations avec acceptation.
-- À exécuter dans le SQL Editor de Supabase APRÈS bands.sql
-- (ré-exécutable sans risque — idempotent).
--
-- • musician_directory : annuaire (nom + photo) des comptes qui acceptent
--                   d'être trouvés. Recherche via search_profiles().
-- • band_invites  : invitations en attente. Le créateur invite depuis
--                   l'annuaire ; l'invité DOIT accepter (respond_invite).
-- • band_members  : enrichi de la photo de profil du membre.
-- ============================================================

-- ---------- Annuaire ----------
-- ORDRE D'EXÉCUTION : ce fichier dépend des tables de bands.sql
-- (cloud_bands, cloud_band_members). Exécuter bands.sql AVANT.
-- Les deux restent ré-exécutables autant de fois que nécessaire.

create table if not exists public.musician_directory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  photo text not null default '',
  instrument text not null default '',
  -- opt-out : mettre à false pour ne plus apparaître dans les recherches
  searchable boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.musician_directory enable row level security;

-- Chacun gère uniquement sa propre fiche. La recherche passe par une
-- fonction security definer (search_profiles) : pas de select global.
drop policy if exists musician_directory_self on public.musician_directory;
create policy musician_directory_self on public.musician_directory
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Renseigne/actualise sa fiche d'annuaire (nom + photo + instrument).
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.upsert_profile(text, text, text);
create or replace function public.upsert_profile(
  p_name text,
  p_photo text,
  p_instrument text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.musician_directory (user_id, name, photo, instrument, updated_at)
  values (
    auth.uid(),
    coalesce(p_name, ''),
    coalesce(p_photo, ''),
    coalesce(p_instrument, ''),
    now()
  )
  on conflict (user_id) do update set
    name = excluded.name,
    photo = excluded.photo,
    instrument = excluded.instrument,
    updated_at = now();
end $$;
grant execute on function public.upsert_profile to authenticated;

-- Recherche par nom (≥ 2 caractères), hors soi-même, 20 résultats max.
-- Correspondance TOLÉRANTE et bidirectionnelle : « Damien » retrouve un
-- profil nommé « Dam » (le nom stocké est contenu dans la requête) ET
-- inversement « Dam » retrouve « Damien ». On garde aussi une correspondance
-- mot à mot (chaque mot de la requête cherché séparément) pour « prénom nom ».
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.search_profiles(text);
create or replace function public.search_profiles(p_query text)
returns table (user_id uuid, name text, photo text, instrument text)
language sql security definer set search_path = public as $$
  select p.user_id, p.name, p.photo, p.instrument
  from public.musician_directory p
  where p.searchable
    and p.user_id <> auth.uid()
    and coalesce(p.name, '') <> ''
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      -- le nom contient la requête (« Damien Tessier » ↔ « Damien »)
      p.name ilike '%' || trim(p_query) || '%'
      -- ou la requête contient le nom (« Damien » ↔ « Dam »)
      or trim(p_query) ilike '%' || p.name || '%'
      -- ou l'un des mots de la requête est contenu dans le nom
      or exists (
        select 1
        from unnest(string_to_array(trim(p_query), ' ')) as w(word)
        where length(word) >= 2 and p.name ilike '%' || word || '%'
      )
    )
  order by p.name
  limit 20;
$$;
grant execute on function public.search_profiles to authenticated;

-- ---------- Invitations en attente (acceptation obligatoire) ----------
create table if not exists public.band_invites (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.cloud_bands (id) on delete cascade,
  invited_user uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  band_name text not null default '',
  from_name text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'left')),
  created_at timestamptz not null default now(),
  unique (band_id, invited_user)
);
alter table public.band_invites enable row level security;

-- b142 : 'left' = ce musicien a quitté le groupe (application
-- réinitialisée, nouveau téléphone). Le créateur en est informé et peut
-- le réinviter d'un geste. Migration des bases déjà créées :
alter table public.band_invites drop constraint if exists band_invites_status_check;
alter table public.band_invites
  add constraint band_invites_status_check
  check (status in ('pending', 'accepted', 'declined', 'left'));

-- L'invité voit ses invitations ; le créateur voit celles de son groupe.
-- (insertion/réponse uniquement via les fonctions ci-dessous.)
drop policy if exists invites_select on public.band_invites;
create policy invites_select on public.band_invites
  for select using (
    invited_user = auth.uid()
    or exists (
      select 1 from public.cloud_bands b
      where b.id = band_id and b.owner = auth.uid()
    )
  );

-- Le créateur invite un musicien de l'annuaire (statut « pending »).
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.invite_to_band(uuid, uuid);
create or replace function public.invite_to_band(p_band uuid, p_user uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_band public.cloud_bands;
  v_from text;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  select * into v_band from public.cloud_bands
    where id = p_band and owner = auth.uid();
  if not found then
    return json_build_object('error', 'Groupe introuvable');
  end if;
  -- b140 : on n'oppose PLUS « déjà membre » — un musicien qui a
  -- réinitialisé son application a perdu le groupe de son côté alors
  -- qu'il reste inscrit ici. L'invitation doit pouvoir se regénérer
  -- pour qu'il retrouve le groupe (demande Vincent, cas Marco).
  select coalesce(name, '') into v_from from public.musician_directory
    where user_id = auth.uid();
  insert into public.band_invites
    (band_id, invited_user, invited_by, band_name, from_name, status)
  values (p_band, p_user, auth.uid(), v_band.name, coalesce(v_from, ''), 'pending')
  on conflict (band_id, invited_user) do update set
    status = 'pending',
    band_name = excluded.band_name,
    from_name = excluded.from_name,
    created_at = now();
  return json_build_object('ok', true);
end $$;
grant execute on function public.invite_to_band to authenticated;

-- Mes invitations en attente.
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.my_invites();
create or replace function public.my_invites()
returns table (
  id uuid,
  band_id uuid,
  band_name text,
  from_name text,
  created_at timestamptz
)
language sql security definer set search_path = public as $$
  select i.id, i.band_id, i.band_name, i.from_name, i.created_at
  from public.band_invites i
  where i.invited_user = auth.uid() and i.status = 'pending'
  order by i.created_at desc;
$$;
grant execute on function public.my_invites to authenticated;

-- Répondre à une invitation : accepter (= rejoindre) ou refuser.
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.respond_invite(uuid, boolean, text, text);
create or replace function public.respond_invite(
  p_invite uuid,
  p_accept boolean,
  p_name text,
  p_instrument text
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_inv public.band_invites;
begin
  if auth.uid() is null then
    return json_build_object('error', 'Connexion requise');
  end if;
  select * into v_inv from public.band_invites
    where id = p_invite and invited_user = auth.uid() and status = 'pending';
  if not found then
    return json_build_object('error', 'Invitation introuvable');
  end if;
  if p_accept then
    insert into public.cloud_band_members (band_id, user_id, name, instrument)
    values (v_inv.band_id, auth.uid(), coalesce(p_name, ''), coalesce(p_instrument, ''))
    on conflict (band_id, user_id) do update
      set name = excluded.name, instrument = excluded.instrument;
    update public.band_invites set status = 'accepted' where id = p_invite;
    return json_build_object('ok', true, 'band', v_inv.band_id, 'name', v_inv.band_name);
  else
    update public.band_invites set status = 'declined' where id = p_invite;
    return json_build_object('ok', true, 'declined', true);
  end if;
end $$;
grant execute on function public.respond_invite to authenticated;

-- ---------- band_members enrichi de la photo (remplace la version simple) ----------
drop function if exists public.band_members(uuid);
create function public.band_members(p_band uuid)
returns table (
  user_id uuid,
  name text,
  instrument text,
  joined_at timestamptz,
  photo text
)
language sql security definer set search_path = public as $$
  select m.user_id, m.name, m.instrument, m.joined_at, coalesce(p.photo, '') as photo
  from public.cloud_band_members m
  left join public.musician_directory p on p.user_id = m.user_id
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
$$;
grant execute on function public.band_members to authenticated;

-- ------------------------------------------------------------
-- b142 : départs à traiter dans MES groupes. Le créateur voit qui a
-- quitté (le plus souvent : application réinitialisée) et peut le
-- réinviter — `invite_to_band` remet la ligne en 'pending', ce qui la
-- fait disparaître d'ici.
-- ------------------------------------------------------------
-- `create or replace` ne peut PAS changer le type de retour d'une
-- fonction déjà installée (erreur 42P13) : on la retire d'abord.
drop function if exists public.my_band_departures();
create or replace function public.my_band_departures()
returns table (
  band_id uuid,
  band_name text,
  user_id uuid,
  name text,
  at timestamptz
)
language sql security definer set search_path = public as $$
  select i.band_id,
         i.band_name,
         i.invited_user as user_id,
         coalesce(d.name, '') as name,
         i.created_at as at
  from public.band_invites i
  join public.cloud_bands b on b.id = i.band_id
  left join public.musician_directory d on d.user_id = i.invited_user
  -- Jamais MOI-MÊME (b212) : le créateur d'un groupe n'a pas à se
  -- réinviter. Deuxième garde-fou, en plus de `leave_band` qui refuse
  -- désormais d'inscrire le départ d'un propriétaire.
  where i.status = 'left'
    and b.owner = auth.uid()
    and i.invited_user <> auth.uid()
  order by i.created_at desc;
$$;
grant execute on function public.my_band_departures to authenticated;
