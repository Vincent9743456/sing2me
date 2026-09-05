-- ============================================================
-- REQUÊTES D'ANALYSE DU PILOTE (b498) — à COLLER dans le SQL Editor.
-- Lecture seule : rien à exécuter au déploiement, rien d'idempotent à
-- maintenir. Les colonnes pic / morceaux / plein_at / refuses n'existent
-- que pour les lives postérieurs à b498 — les 97 lives d'avant ne sont
-- pas rattrapables (sièges et sentinelle purgés à chaque clôture) ; seuls
-- leurs uniques et leurs durées (quand la clôture a eu lieu) existent.
-- ============================================================

-- 1. Par artiste : nombre de lives, pic le plus élevé, durée moyenne,
--    date du dernier live. (email via auth.users ; les sessions sans
--    owner_id — antérieures à b192 — sont regroupées sous « (inconnu) »)
select
  coalesce(u.email, '(inconnu)')                             as artiste,
  count(*)                                                   as lives,
  max(s.pic)                                                 as pic_max,
  max(s.uniques)                                             as uniques_max,
  round(avg(extract(epoch from (s.ended_at - s.started_at)) / 60))
    filter (where s.ended_at is not null)                    as duree_moyenne_min,
  max(s.started_at)                                          as dernier_live
from live_sessions s
left join auth.users u on u.id = s.owner_id
group by 1
order by lives desc;

-- 2. Taux de deuxième session : part des artistes ayant lancé au moins
--    deux lives, parmi ceux qui en ont lancé au moins un.
with par_artiste as (
  select owner_id, count(*) as lives
  from live_sessions
  where owner_id is not null
  group by owner_id
)
select
  count(*)                                   as artistes_avec_live,
  count(*) filter (where lives >= 2)         as avec_deuxieme,
  round(100.0 * count(*) filter (where lives >= 2) / count(*), 1)
                                             as taux_deuxieme_pct
from par_artiste;

-- 3. Les lives ayant touché le plafond : artiste, date, minute à laquelle
--    il a été atteint, spectateurs refusés.
select
  coalesce(u.email, s.artist_name, '(inconnu)')                  as artiste,
  s.started_at                                                   as date_live,
  round(extract(epoch from (s.plein_at - s.started_at)) / 60)    as plein_a_la_minute,
  s.refuses                                                      as refusés,
  s.pic, s.uniques
from live_sessions s
left join auth.users u on u.id = s.owner_id
where s.plein_at is not null
order by s.started_at desc;
