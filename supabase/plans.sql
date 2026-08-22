-- ============================================================
-- mojosong — Plans et limites (b381 → b387 : les trois offres).
-- À exécuter dans SQL Editor du projet Supabase (ré-exécutable).
--
-- Les OFFRES (arbitrage Vincent, b387) :
--   'free'     : 50 morceaux · 15 spectateurs simultanés en live ;
--   'musicien' : morceaux illimités · 15 spectateurs simultanés ;
--   'scene'    : tout illimité.
-- ('pro' reste accepté — héritage b381, équivaut à scene ; 'admin' =
-- fondateurs.) Le plan vit CÔTÉ SERVEUR et n'est jamais modifiable par
-- le client (aucune politique d'écriture) : l'app le LIT, c'est tout.
-- Un compte sans ligne est 'free' — rien à créer à l'inscription.
--
-- Verrou serveur (la seule autorité — le client ne fait qu'annoncer) :
--  • LIMIT_SONGS : un compte gratuit ne dépasse pas 50 MORCEAUX.
--    SIMPLIFIÉ b386 (arbitrage Vincent : « 50 chansons c'est tout. Pas
--    possible d'importer plus ») — plus de distinction actif/réserve :
--    tout morceau de la bibliothèque compte, SAUF les PROPOSITIONS en
--    attente (idea = true) — un morceau venu d'un groupe compte dès
--    qu'il est ACCEPTÉ par l'utilisateur, pas avant.
--    RÈGLE « un compte gratuit ne croît pas » : un compte déjà au-delà
--    de 50 (bêta) garde tout, continue de modifier, supprimer et
--    synchroniser — seule une poussée qui AUGMENTE le compte est
--    refusée.
--  • Les GROUPES ne sont PAS limités (illimités à tous les étages) —
--    le verrou LIMIT_GROUPS de b381 est retiré ci-dessous.
--  • Le CAP DE SALLE (15 spectateurs simultanés en free/musicien) est
--    APPLIQUÉ par api/live.js depuis b387 — la table live_seats plus
--    bas est son support.
-- ============================================================

create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free',
  updated_at timestamptz not null default now()
);

-- Les valeurs admises (b387) : `create table if not exists` ne modifie
-- pas une table existante — on recrée donc la contrainte explicitement.
alter table public.user_plans drop constraint if exists user_plans_plan_check;
alter table public.user_plans add constraint user_plans_plan_check
  check (plan in ('free', 'musicien', 'scene', 'pro', 'admin'));

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
-- propositions en attente (idea = true) — un morceau de groupe compte
-- dès qu'il est accepté (b386). Comparaison en jsonb (pas de cast
-- ::boolean) : une valeur inattendue ne fait jamais échouer la synchro.
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
  v_max constant integer := 50; -- limites du plan free : voir src/lib/limites.ts
begin
  if public.plan_du_compte(new.id) <> 'free' then
    return new;
  end if;
  v_apres := public.compte_morceaux(new.data);
  if tg_op = 'UPDATE' then
    v_avant := public.compte_morceaux(old.data);
  end if;
  -- « Un compte gratuit ne croît pas » : refus seulement si la poussée
  -- AUGMENTE le nombre de morceaux au-delà du max(déjà en base, 50).
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
-- RETRAIT b385 (offre v2) : les groupes sont illimités à tous les
-- étages. Le verrou LIMIT_GROUPS de b381 est supprimé — ces deux
-- lignes restent pour nettoyer une base où il aurait été posé.
-- ------------------------------------------------------------
drop trigger if exists limite_groupes on public.cloud_bands;
drop function if exists public.verifie_limite_groupes();

-- ------------------------------------------------------------
-- CAP DE SALLE (b387) — les SIÈGES d'un live : un par appareil
-- spectateur (deviceId anonyme, celui des uniques et des cœurs).
-- Écrit et lu UNIQUEMENT par le serveur (service_role) — RLS sans
-- politique = personne d'autre. `api/live.js` porte toute la logique
-- (15 places en gratuit/musicien, grâce de reconnexion, sentinelle
-- __salle_pleine__ pour l'e-mail de clôture) ; les sièges d'un live
-- sont effacés à sa clôture.
-- ------------------------------------------------------------
create table if not exists public.live_seats (
  live_id text not null,
  device_id text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (live_id, device_id)
);

alter table public.live_seats enable row level security;

-- `last_seen` est réécrit au fil du concert (toutes les ~30 s par
-- spectateur) : on resserre l'autovacuum comme pour live_attendance.
alter table public.live_seats set (autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.02);

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

-- Recettes pour passer un compte en 'musicien' ou 'scene' (à la main,
-- en attendant le paiement) :
-- insert into public.user_plans (user_id, plan)
-- select id, 'musicien' from auth.users where email = 'adresse@exemple.com'
-- on conflict (user_id) do update set plan = 'musicien', updated_at = now();
--
-- insert into public.user_plans (user_id, plan)
-- select id, 'scene' from auth.users where email = 'adresse@exemple.com'
-- on conflict (user_id) do update set plan = 'scene', updated_at = now();
