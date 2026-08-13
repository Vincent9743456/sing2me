-- ============================================================================
-- mojosong — RÉDUCTION DURABLE DES TABLES D'USAGE (sans perdre les stats)
-- À exécuter dans le SQL Editor du projet Supabase. IDEMPOTENT (ré-exécutable).
--
-- CONTEXTE (constat Vincent, plan Free 500 Mo) : `live_sessions` (~3 Mo pour
-- 8 lignes) et `lives` occupent une place disproportionnée. Le diagnostic :
--   • `live_sessions` : ligne minuscule (aucun JSON) → les 3 Mo sont du BLOAT
--     Postgres (tuples morts), pas de la donnée : `uniques` est mis à jour à
--     CHAQUE ping de spectateur (server/attend.js). Supprimer les lignes ne
--     rend RIEN — seul VACUUM (FULL) récupère la place.
--   • `lives` : mis à jour en boucle pendant tout le direct, et chaque version
--     morte porte les JSON lourds (`setlist` = paroles de TOUS les morceaux).
--   • `live_attendance` : `last_seen` mis à jour à chaque ping → bloat aussi.
--
-- DEUX PROBLÈMES INDÉPENDANTS, deux réponses :
--   (A) BLOAT MAINTENANT   → autovacuum agressif + VACUUM FULL ponctuel (Étape 4).
--   (B) ACCUMULATION À TERME → table d'agrégat + purge (Étapes 1-3), DORMANTE
--       pour l'instant : la purge ne s'active qu'après l'Étape 5 (les écrans
--       lisant `usage_stats`), pour ne jamais faire baisser un compteur.
--
-- SÉQUENCEMENT VALIDÉ (Vincent) : « bloat d'abord, purge plus tard », cible 60 j.
-- Ce fichier NE planifie PAS la purge et NE l'appelle PAS. Il crée seulement
-- l'infra + le réglage de bloat + le VACUUM hebdo. Voir en bas « LOT 2 ».
--
-- CE QU'ON NE TOUCHE JAMAIS : auth par code, synchro du direct, versioning.
-- ============================================================================


-- ============================================================================
-- ÉTAPE 1 — Table de statistiques PERMANENTE (agrégée, minuscule pour toujours)
-- Grain MENSUEL, par (compte artiste, groupe). Clé unique = UPSERT idempotent.
-- ============================================================================

create table if not exists usage_stats (
  period        date  not null,                         -- 1er jour du mois
  -- Sentinelle « propriétaire inconnu » (lignes anciennes sans owner_id) :
  owner_id      uuid  not null
                default '00000000-0000-0000-0000-000000000000',
  band_id       text  not null default '',              -- cloudId ('' = solo)
  live_count    integer not null default 0,             -- nb de lives (GO LIVE)
  songs_played  integer not null default 0,             -- morceaux joués
  hearts        integer not null default 0,             -- ❤ reçus
  messages      integer not null default 0,             -- mots du public (nombre)
  spectators    integer not null default 0,             -- spectateurs uniques (Σ)
  live_seconds  bigint  not null default 0,             -- durée totale de direct (s)
  shares        integer not null default 0,             -- liens de partage créés
  updated_at    timestamptz not null default now(),
  primary key (period, owner_id, band_id)
);
alter table usage_stats enable row level security;
-- Aucune policy : lecture/écriture réservées au service_role (api/*.js).

-- Journal de chaque passage du rollup (Étape 3 : « logge agrégées et purgées »).
create table if not exists usage_rollup_log (
  ran_at            timestamptz not null default now(),
  retention_days    int not null,
  lives_drained     int not null default 0,
  sessions_drained  int not null default 0,
  stats_drained     int not null default 0,
  messages_drained  int not null default 0,
  shares_drained    int not null default 0,
  hearts_purged     int not null default 0,
  attendance_purged int not null default 0,
  agg_rows          int not null default 0
);
alter table usage_rollup_log enable row level security;


-- ============================================================================
-- ÉTAPE 2 — Fonction AGRÉGER→PURGER, idempotente et atomique.
--
-- Motif « drain » : DELETE … RETURNING alimente directement l'INSERT … ON
-- CONFLICT DO UPDATE (+=), dans une seule CTE = une seule transaction.
--   • On agrège AVANT de supprimer, dans la même transaction → jamais une
--     ligne supprimée sans être comptée.
--   • Re-jouer est idempotent PAR CONSTRUCTION : les lignes drainées n'existent
--     plus, donc aucun double comptage.
--   • On ne touche QUE les lignes plus vieilles que `retention_days` (figées),
--     JAMAIS un live en cours (`lives.status='off'` requis).
--
-- ⚠️ DORMANTE tant que l'Étape 5 n'est pas livrée : l'appeler PURGE le brut, ce
-- qui ferait baisser les compteurs de l'app (qui recalculent depuis le brut).
-- Ne l'APPELER qu'une fois `usage_stats` branché sur les écrans.
-- ============================================================================

create or replace function rollup_usage(retention_days int default 60)
returns usage_rollup_log
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - make_interval(days => retention_days);
  zero   uuid := '00000000-0000-0000-0000-000000000000';
  log    usage_rollup_log;
begin
  log.retention_days := retention_days;

  -- Comptes bruts pour le journal (lignes < cutoff = immuables → exact).
  select count(*) into log.lives_drained    from lives
    where status = 'off' and started_at is not null and started_at < cutoff;
  select count(*) into log.sessions_drained from live_sessions where started_at < cutoff;
  select count(*) into log.stats_drained    from live_stats    where played_at  < cutoff;
  select count(*) into log.messages_drained from live_messages where created_at < cutoff;
  select count(*) into log.shares_drained   from shares        where created_at < cutoff;

  -- 1) LIVES → live_count + durée totale, puis purge (clos seulement).
  with drained as (
    delete from lives
     where status = 'off' and started_at is not null and started_at < cutoff
    returning owner_id, band_id, started_at, updated_at)
  insert into usage_stats (period, owner_id, band_id, live_count, live_seconds)
  select date_trunc('month', started_at)::date,
         coalesce(owner_id, zero), coalesce(band_id, ''),
         count(*),
         coalesce(sum(greatest(0, extract(epoch from (updated_at - started_at))))::bigint, 0)
  from drained group by 1, 2, 3
  on conflict (period, owner_id, band_id) do update
    set live_count   = usage_stats.live_count   + excluded.live_count,
        live_seconds = usage_stats.live_seconds + excluded.live_seconds,
        updated_at   = now();

  -- 2) LIVE_SESSIONS → spectateurs uniques (pas de band_id → bucket solo '').
  with drained as (
    delete from live_sessions where started_at < cutoff
    returning owner_id, started_at, uniques)
  insert into usage_stats (period, owner_id, band_id, spectators)
  select date_trunc('month', started_at)::date, coalesce(owner_id, zero), '',
         coalesce(sum(uniques), 0)
  from drained group by 1, 2
  on conflict (period, owner_id, band_id) do update
    set spectators = usage_stats.spectators + excluded.spectators, updated_at = now();

  -- 3) LIVE_STATS → morceaux joués + ❤ (pas de band_id → bucket '').
  with drained as (
    delete from live_stats where played_at < cutoff
    returning owner_id, played_at, hearts)
  insert into usage_stats (period, owner_id, band_id, songs_played, hearts)
  select date_trunc('month', played_at)::date, coalesce(owner_id, zero), '',
         count(*), coalesce(sum(hearts), 0)
  from drained group by 1, 2
  on conflict (period, owner_id, band_id) do update
    set songs_played = usage_stats.songs_played + excluded.songs_played,
        hearts       = usage_stats.hearts       + excluded.hearts,
        updated_at   = now();

  -- 4) LIVE_MESSAGES → nombre de mots du public (owner + band_id présents).
  with drained as (
    delete from live_messages where created_at < cutoff
    returning owner_id, band_id, created_at)
  insert into usage_stats (period, owner_id, band_id, messages)
  select date_trunc('month', created_at)::date, coalesce(owner_id, zero),
         coalesce(band_id, ''), count(*)
  from drained group by 1, 2, 3
  on conflict (period, owner_id, band_id) do update
    set messages = usage_stats.messages + excluded.messages, updated_at = now();

  -- 5) SHARES → nombre de partages (pas d'owner → bucket sentinelle).
  with drained as (
    delete from shares where created_at < cutoff
    returning created_at)
  insert into usage_stats (period, owner_id, band_id, shares)
  select date_trunc('month', created_at)::date, zero, '', count(*)
  from drained group by 1
  on conflict (period, owner_id, band_id) do update
    set shares = usage_stats.shares + excluded.shares, updated_at = now();

  -- 6) Purges SANS stat (déjà comptées ailleurs / éphémères) → récup place.
  --    live_hearts  : garde anti-doublon d'un live clos → le total est déjà
  --                   dans live_stats.hearts (comptabilisé en 3).
  --    live_attendance : les uniques sont déjà dans live_sessions.uniques (2).
  delete from live_hearts     where created_at < cutoff;
  get diagnostics log.hearts_purged = row_count;
  delete from live_attendance where last_seen  < cutoff;
  get diagnostics log.attendance_purged = row_count;

  select count(*) into log.agg_rows from usage_stats;

  insert into usage_rollup_log
    (retention_days, lives_drained, sessions_drained, stats_drained,
     messages_drained, shares_drained, hearts_purged, attendance_purged, agg_rows)
  values
    (retention_days, log.lives_drained, log.sessions_drained, log.stats_drained,
     log.messages_drained, log.shares_drained, log.hearts_purged,
     log.attendance_purged, log.agg_rows)
  returning * into log;
  return log;
end $$;


-- ============================================================================
-- ÉTAPE 4a — Empêcher le BLOAT de revenir (la vraie cause : UPDATE en boucle).
-- Autovacuum bien plus agressif sur les 3 tables chaudes. Idempotent.
-- ============================================================================

alter table lives           set (autovacuum_vacuum_scale_factor = 0.02,
                                 autovacuum_vacuum_cost_delay = 0);
alter table live_sessions   set (autovacuum_vacuum_scale_factor = 0.02,
                                 autovacuum_vacuum_cost_delay = 0);
alter table live_attendance set (autovacuum_vacuum_scale_factor = 0.02,
                                 autovacuum_vacuum_cost_delay = 0);


-- ============================================================================
-- ÉTAPE 3 — Planification (pg_cron). À ACTIVER l'extension d'abord :
--   Dashboard → Database → Extensions → activer « pg_cron ».
-- Ce bloc est GARDÉ : sans pg_cron il ne fait rien (le fichier reste
-- ré-exécutable). Ici, on ne planifie QUE le VACUUM hebdo (non destructif).
-- Le job de PURGE quotidien reste commenté (LOT 2, après l'Étape 5).
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- VACUUM ANALYZE hebdo sur les tables d'usage (dimanche 04:00 UTC).
    if exists (select 1 from cron.job where jobname = 'vacuum-usage-weekly') then
      perform cron.unschedule('vacuum-usage-weekly');
    end if;
    perform cron.schedule('vacuum-usage-weekly', '0 4 * * 0',
      $c$ vacuum (analyze) lives, live_sessions, live_attendance,
                           live_stats, live_messages, live_hearts, shares $c$);
  end if;
end $$;


-- ============================================================================
-- LOT 2 — À DÉCOMMENTER PLUS TARD, après l'Étape 5 (les écrans lisant
-- `usage_stats`). Active la purge quotidienne 60 j. NE PAS activer avant, sinon
-- les compteurs de l'app (recalculés depuis le brut) baisseraient.
--
-- do $$
-- begin
--   if exists (select 1 from pg_extension where extname = 'pg_cron') then
--     if exists (select 1 from cron.job where jobname = 'rollup-usage-daily') then
--       perform cron.unschedule('rollup-usage-daily');
--     end if;
--     perform cron.schedule('rollup-usage-daily', '30 3 * * *',
--       $c$ select rollup_usage(60) $c$);
--   end if;
-- end $$;
-- ============================================================================


-- ============================================================================
-- ÉTAPE 4b — RECLAIM INITIAL des 3 Mo. À LANCER À LA MAIN, HORS CONCERT.
--
-- ⚠️ VACUUM FULL prend un verrou ACCESS EXCLUSIVE : pendant l'opération, toute
-- lecture/écriture de la table est bloquée (un GO LIVE ou un ping spectateur
-- ÉCHOUERAIT). pg_repack (verrou léger) n'est pas dispo sur le plan Free.
-- Ces tables étant minuscules, l'opération dure quelques secondes — mais
-- uniquement dans une fenêtre calme. NE JAMAIS mettre VACUUM FULL dans le cron.
--
--   vacuum full lives;
--   vacuum full live_sessions;
--   vacuum full live_attendance;
-- ============================================================================
