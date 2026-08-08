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
