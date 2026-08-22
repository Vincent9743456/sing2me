-- ============================================================
-- mojosong — Plans et limites (b381, spec validée par Vincent).
-- À exécuter dans SQL Editor du projet Supabase (ré-exécutable).
--
-- Trois plans : 'free' (défaut), 'pro', 'admin'. Le plan vit CÔTÉ
-- SERVEUR et n'est jamais modifiable par le client (aucune politique
-- d'écriture) : l'app le LIT, c'est tout. Un compte sans ligne est
-- 'free' — pas de ligne à créer à l'inscription.
--
-- Verrous serveur (la seule autorité — le client ne fait qu'annoncer) :
--  • LIMIT_SONGS  : un compte gratuit ne dépasse pas 30 morceaux perso
--    (les PROPOSITIONS en attente — idea = true — ne comptent pas :
--    un répertoire de groupe reçu sur invitation ne consomme rien).
--    RÈGLE « un compte gratuit ne croît pas » : un compte déjà au-delà
--    de 30 (bêta) garde tout, continue de modifier, supprimer et
--    synchroniser — seule une poussée qui AUGMENTE le compte est
--    refusée. Rejoindre un groupe n'écrit pas dans user_library au
--    moment de l'adhésion : jamais bloqué, par construction.
--  • LIMIT_GROUPS : un compte gratuit ne PUBLIE pas plus de 2 groupes
--    créés (cloud_bands dont il est owner). join_band écrit dans
--    cloud_band_members, jamais dans cloud_bands : rejoindre un groupe
--    n'est jamais bloqué, par construction.
-- ============================================================

create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'admin')),
  updated_at timestamptz not null default now()
);

alter table public.user_plans enable row level security;

-- Chacun LIT son propre plan ; personne n'écrit (pas de politique
-- insert/update/delete → refus par défaut ; seuls le SQL Editor et le
-- service_role changent un plan).
drop policy if exists user_plans_select on public.user_plans;
create policy user_plans_select on public.user_plans
  for select using (auth.uid() = user_id);

-- Le plan d'un compte, 'free' si aucune ligne.
create or replace function public.plan_du_compte(p_user uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select plan from public.user_plans where user_id = p_user),
    'free'
  );
$$;

-- Morceaux comptés dans le blob de bibliothèque : tout sauf les
-- propositions en attente (idea = true). Comparaison en jsonb (pas de
-- cast ::boolean) : une valeur inattendue ne fait jamais échouer la
-- synchro entière.
create or replace function public.compte_morceaux(p_data jsonb)
returns integer
language sql immutable
as $$
  select count(*)::int
  from jsonb_array_elements(coalesce(p_data->'songs', '[]'::jsonb)) as m(s)
  where coalesce(m.s->'idea', 'false'::jsonb) <> 'true'::jsonb;
$$;

-- ------------------------------------------------------------
-- Verrou 1 — la bibliothèque perso (user_library).
-- ------------------------------------------------------------
create or replace function public.verifie_limite_morceaux()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_avant integer := 0;
  v_apres integer;
  v_max constant integer := 30; -- limites du plan free : voir src/lib/limites.ts
begin
  if public.plan_du_compte(new.id) <> 'free' then
    return new;
  end if;
  v_apres := public.compte_morceaux(new.data);
  if tg_op = 'UPDATE' then
    v_avant := public.compte_morceaux(old.data);
  end if;
  -- « Un compte gratuit ne croît pas » : refus seulement si la poussée
  -- AUGMENTE le nombre de morceaux au-delà du max(déjà en base, 30).
  if v_apres > greatest(v_avant, v_max) then
    raise exception 'LIMIT_SONGS';
  end if;
  return new;
end;
$$;

drop trigger if exists limite_morceaux on public.user_library;
create trigger limite_morceaux
  before insert or update on public.user_library
  for each row execute function public.verifie_limite_morceaux();

-- ------------------------------------------------------------
-- Verrou 2 — les groupes CRÉÉS (cloud_bands ; l'adhésion passe par
-- cloud_band_members et n'est jamais touchée).
-- ------------------------------------------------------------
create or replace function public.verifie_limite_groupes()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_max constant integer := 2; -- limites du plan free : voir src/lib/limites.ts
begin
  if public.plan_du_compte(new.owner) <> 'free' then
    return new;
  end if;
  if (select count(*) from public.cloud_bands where owner = new.owner) >= v_max then
    raise exception 'LIMIT_GROUPS';
  end if;
  return new;
end;
$$;

drop trigger if exists limite_groupes on public.cloud_bands;
create trigger limite_groupes
  before insert on public.cloud_bands
  for each row execute function public.verifie_limite_groupes();

-- ------------------------------------------------------------
-- Mesure : chaque limite ATTEINTE se note (tableau de bord fondateur).
-- Écriture par RPC seulement (l'appelant EST son compte — b192) ;
-- aucune lecture client (le tableau de bord passe par service_role).
-- ------------------------------------------------------------
create table if not exists public.limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  plan text not null default '',
  at timestamptz not null default now()
);

alter table public.limit_events enable row level security;

create or replace function public.note_limite(p_kind text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_kind not in ('LIMIT_SONGS', 'LIMIT_GROUPS') then
    return;
  end if;
  insert into public.limit_events (user_id, kind, plan)
  values (auth.uid(), p_kind, public.plan_du_compte(auth.uid()));
end;
$$;

grant execute on function public.note_limite(text) to authenticated;

-- ------------------------------------------------------------
-- Comptes fondateurs (demande explicite de Vincent) : admin.
-- Idempotent — rejouable sans effet de bord.
-- ------------------------------------------------------------
insert into public.user_plans (user_id, plan)
select id, 'admin'
from auth.users
where email in ('vtessier6@gmail.com', 'marco@mojosong.com')
on conflict (user_id) do update set plan = 'admin', updated_at = now();

-- Recette pour passer un compte en 'pro' (à la main, plus tard) :
-- insert into public.user_plans (user_id, plan)
-- select id, 'pro' from auth.users where email = 'adresse@exemple.com'
-- on conflict (user_id) do update set plan = 'pro', updated_at = now();
