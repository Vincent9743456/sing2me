-- ============================================================
-- mojosong — notifications par e-mail (b353)
--
-- Tant que l'app n'est pas native (pas de notifications push), un cron
-- serveur (api/notify, toutes les 15 min) envoie aux membres d'un groupe
-- un résumé des nouveaux messages et morceaux proposés (band_messages).
-- Cette table ne garde qu'UN repère : jusqu'où le facteur est passé.
-- Seul le serveur (service role) y accède — RLS activée, aucune politique.
--
-- Idempotent : ré-exécutable sans risque.
-- ============================================================

create table if not exists public.notif_state (
  id text primary key,
  last_at timestamptz not null default now()
);
alter table public.notif_state enable row level security;
