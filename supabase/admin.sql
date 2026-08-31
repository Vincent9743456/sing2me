-- Tableau de bord fondateur (b160) — mesure de l'usage et des coûts.
-- Idempotent : ré-exécutable sans risque dans le SQL Editor.
--
-- Deux tables, écrites UNIQUEMENT par les fonctions serveur (service_role) :
--   ai_usage       : un enregistrement par appel IA, avec son coût estimé ;
--   billing_topups : les rechargements saisis à la main (les fournisseurs
--                    n'exposent pas le solde restant, on le reconstitue).
--
-- Aucune donnée musicale ni personnelle ici : ni texte de note, ni audio,
-- ni paroles. Seulement « quelle fonction, quel modèle, combien ça coûte ».

create table if not exists ai_usage (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  -- 'note' | 'clean' | 'setlist' | 'transcribe'
  fn           text not null,
  provider     text not null,           -- 'anthropic' | 'openai'
  model        text not null,
  tokens_in    integer not null default 0,
  tokens_out   integer not null default 0,
  audio_secs   integer not null default 0,
  cost_usd     numeric(12, 6) not null default 0,
  ok           boolean not null default true
);

create index if not exists ai_usage_at_idx on ai_usage (at desc);
create index if not exists ai_usage_provider_idx on ai_usage (provider, at desc);

create table if not exists billing_topups (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  provider   text not null,             -- 'anthropic' | 'openai'
  amount_usd numeric(12, 2) not null,
  note       text not null default ''
);

create index if not exists billing_topups_provider_idx
  on billing_topups (provider, at desc);

-- Ces tables ne sont jamais lues depuis le téléphone : RLS active et
-- AUCUNE politique = personne n'y accède avec la clé anon. Seules les
-- fonctions serveur (service_role, qui contourne RLS) écrivent et lisent.
alter table ai_usage enable row level security;
alter table billing_topups enable row level security;

-- Vue de synthèse : dépense par fournisseur et par jour (30 derniers jours).
create or replace view ai_usage_daily as
select
  date_trunc('day', at) as day,
  provider,
  fn,
  count(*)              as calls,
  sum(cost_usd)         as cost_usd
from ai_usage
where at > now() - interval '90 days'
group by 1, 2, 3;

-- ---------------------------------------------------------------------
-- GARDE-FOU D'USAGE (b220) — compteurs par appelant, par heure et par jour.
--
-- Depuis b220 l'IA remet en forme CHAQUE import : ce qui était un geste
-- délibéré devient automatique. Une boucle — un utilisateur qui s'acharne,
-- un script qui frappe l'endpoint — coûte de l'argent réel à chaque tour.
--
-- `bucket` porte « fonction | portée | empreinte de l'appelant ». L'empreinte
-- est un HACHÉ : ni identifiant de compte, ni adresse IP en clair ne sont
-- enregistrés ici.
-- ---------------------------------------------------------------------
create table if not exists ai_rate (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists ai_rate_window_idx on ai_rate (window_start);

alter table ai_rate enable row level security;

-- Incrémente et renvoie la valeur APRÈS incrément, en une seule requête
-- (deux appels simultanés ne peuvent pas se perdre l'un l'autre).
create or replace function bump_rate(p_bucket text, p_window_start timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into ai_rate (bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = ai_rate.count + 1
  returning count into n;
  -- Ménage opportuniste : les fenêtres d'avant-hier n'intéressent plus
  -- personne, et cette table n'a pas vocation à grossir.
  if random() < 0.01 then
    delete from ai_rate where window_start < now() - interval '2 days';
  end if;
  return n;
end;
$$;

revoke all on function bump_rate(text, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- COMPTEUR DE PARTITIONS DU TABLEAU DE BORD (b411, demande de Vincent).
-- Compte les morceaux des bibliothèques personnelles (user_library),
-- hors propositions en attente (idea) et hors écartées — puis le nombre
-- de partitions UNIQUES (titre + artiste repliés) : un morceau partagé
-- dans un groupe existe en copie chez chaque membre, et ces copies ne
-- doivent compter qu'une fois. Agrégat pur, rien de nominatif ; réservé
-- au service_role (le tableau de bord passe par le serveur, b160).
-- ------------------------------------------------------------
create or replace function public.admin_song_stats()
returns table (total bigint, uniques bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*) as total,
    count(distinct lower(trim(coalesce(s->>'title', ''))) || '|' ||
          lower(trim(coalesce(s->>'artist', '')))) as uniques
  from public.user_library ul,
       jsonb_array_elements(coalesce(ul.data->'songs', '[]'::jsonb)) as s
  where coalesce(s->>'idea', 'false') <> 'true'
    and coalesce(s->>'declined', 'false') <> 'true';
$$;

revoke all on function public.admin_song_stats() from public, anon, authenticated;

-- ------------------------------------------------------------
-- Vue par UTILISATEUR du tableau de bord (b485, demande de Marco :
-- « suivre la dernière connexion des users, nb de morceaux, nb de
-- lives… »). Nombre de morceaux et dernière synchro, PAR COMPTE —
-- compté EN BASE : rapatrier les blobs coûterait des mégaoctets à
-- chaque affichage. Même filtre que admin_song_stats (hors
-- propositions en attente et hors écartées). Réservé au service_role,
-- comme tout le tableau de bord (le serveur tranche, b160).
-- ------------------------------------------------------------
create or replace function public.admin_user_songs()
returns table (user_id uuid, morceaux bigint, synchro timestamptz)
language sql
security definer
set search_path = public
as $$
  select
    ul.id as user_id,
    (select count(*)
       from jsonb_array_elements(coalesce(ul.data->'songs', '[]'::jsonb)) as s
      where coalesce(s->>'idea', 'false') <> 'true'
        and coalesce(s->>'declined', 'false') <> 'true') as morceaux,
    ul.updated_at as synchro
  from public.user_library ul;
$$;

revoke all on function public.admin_user_songs() from public, anon, authenticated;
