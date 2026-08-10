-- ============================================================
-- Sing2Me — Pages publiques d'artiste par NOM dictable (chantier 4)
-- Multi-locataire : chaque compte publie sa fiche sous un nom unique,
-- ouvrable via livemyband.fr/lenom (domaine actuel pour l'instant).
-- À exécuter dans SQL Editor de ton projet Supabase (idempotent).
-- ============================================================

create table if not exists public_pages (
  user_id uuid primary key,
  name text unique not null,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public_pages enable row level security;

-- Lecture PUBLIQUE (les fiches d'artiste sont publiques par nature).
drop policy if exists public_pages_read on public_pages;
create policy public_pages_read on public_pages
  for select using (true);

-- Écriture réservée au propriétaire (auth.uid() = user_id).
drop policy if exists public_pages_write on public_pages;
create policy public_pages_write on public_pages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Format du nom : minuscules + chiffres, 3 à 30 caractères (dictable).
alter table public_pages drop constraint if exists public_pages_name_format;
alter table public_pages
  add constraint public_pages_name_format check (name ~ '^[a-z0-9]{3,30}$');

-- Noms réservés : routes techniques de l'application.
alter table public_pages drop constraint if exists public_pages_name_reserved;
alter table public_pages
  add constraint public_pages_name_reserved check (
    name not in (
      'admin','api','app','artist','assets','auth','band','bands','cgu',
      'concert','concerts','favicon','follow','import','live','login',
      'logout','manifest','me','p','public','remote','report','robots','s',
      'setlist','setlists','signalement','site','song','stage','static','www'
    )
  );

-- ============================================================
-- b227 — L'ADRESSE MIROIR D'UN GROUPE (décision de Vincent).
--
-- Un groupe n'a PAS de QR code à lui : le QR est celui de l'artiste, et
-- c'est lui qui décide, au lancement, si le public voit son nom ou celui du
-- groupe. On ne revient pas là-dessus.
--
-- En revanche le groupe a une ADRESSE UNIQUE, qui agit en lien MIROIR :
-- livemyband/zakoustiks montre la page de son DÉTENTEUR. Et comme le
-- détenteur est lu à la volée sur `cloud_bands.owner` — la colonne que
-- `transfer_band` met à jour —, transmettre le groupe déplace le miroir tout
-- seul : il n'y a rien à resynchroniser, donc rien qui puisse se désynchroniser.
--
-- L'adresse EST la clé primaire : deux groupes ne peuvent pas prendre la même,
-- et un groupe n'en a qu'une (`band_id` unique).
-- ============================================================
create table if not exists public.band_pages (
  name text primary key,
  band_id uuid not null unique references public.cloud_bands (id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- LA FICHE DU GROUPE (b232). Jusqu'ici l'adresse d'un groupe n'était qu'un
-- renvoi vers la page de son détenteur : « ça devrait renvoyer vers la page
-- Zakoustiks, pas la mienne » (Vincent). Le groupe a donc sa PAGE — photo,
-- présentation, liens, pourboire, composition — écrite par son détenteur,
-- au même format qu'une fiche d'artiste. Le renvoi ne sert plus qu'au
-- DIRECT : le QR reste unique, c'est celui du lanceur.
-- Vide (`{}`) tant que le détenteur n'a rien publié : la résolution retombe
-- alors sur la fiche du détenteur, comme avant.
alter table public.band_pages
  add column if not exists profile jsonb not null default '{}'::jsonb;

alter table public.band_pages enable row level security;

alter table public.band_pages drop constraint if exists band_pages_name_format;
alter table public.band_pages
  add constraint band_pages_name_format check (name ~ '^[a-z0-9]{3,30}$');

alter table public.band_pages drop constraint if exists band_pages_name_reserved;
alter table public.band_pages
  add constraint band_pages_name_reserved check (
    name not in (
      'admin','api','app','artist','assets','auth','band','bands','cgu',
      'concert','concerts','favicon','follow','import','live','login',
      'logout','manifest','me','p','public','remote','report','robots','s',
      'setlist','setlists','signalement','site','song','stage','static','www'
    )
  );

-- Lecture publique (c'est une adresse publique, par nature).
drop policy if exists band_pages_read on public.band_pages;
create policy band_pages_read on public.band_pages for select using (true);

-- Écriture réservée au DÉTENTEUR du groupe — pas à ses membres. Le jour du
-- transfert, la main passe avec le groupe, sans qu'on touche à cette table.
drop policy if exists band_pages_write on public.band_pages;
create policy band_pages_write on public.band_pages
  for all
  using (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_pages.band_id and b.owner = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cloud_bands b
      where b.id = band_pages.band_id and b.owner = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- UN SEUL ESPACE DE NOMS. `/zakoustiks` et `/vincent` sont la même sorte
-- d'adresse : un nom pris par un artiste ne doit pas pouvoir être repris par
-- un groupe, et réciproquement. Deux tables ne peuvent pas partager un index
-- unique — d'où ce garde-fou, en base et non dans l'application, pour qu'il
-- soit incontournable.
-- ------------------------------------------------------------
create or replace function public.refuse_nom_public_pris()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'public_pages' then
    if exists (select 1 from public.band_pages bp where bp.name = new.name) then
      raise exception 'Ce nom est déjà pris' using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.public_pages pp where pp.name = new.name) then
      raise exception 'Ce nom est déjà pris' using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists public_pages_nom_libre on public.public_pages;
create trigger public_pages_nom_libre
  before insert or update of name on public.public_pages
  for each row execute function public.refuse_nom_public_pris();

drop trigger if exists band_pages_nom_libre on public.band_pages;
create trigger band_pages_nom_libre
  before insert or update of name on public.band_pages
  for each row execute function public.refuse_nom_public_pris();

-- ------------------------------------------------------------
-- RÉSOUDRE UNE ADRESSE PUBLIQUE, quelle que soit sa sorte.
--
-- `security definer` : un spectateur anonyme n'a aucun droit sur
-- `cloud_bands` (et n'en aura pas — c'est la table des groupes). Cette
-- fonction est la SEULE porte, et elle ne rend que ce qui est public : le
-- nom, la fiche, et l'adresse vers laquelle le miroir pointe.
-- ------------------------------------------------------------
-- Les colonnes de sortie portent des noms DISTINCTS de ceux des tables
-- (`nom`, `profil`) : dans une fonction SQL `returns table`, un nom de sortie
-- qui reprend un nom de colonne rend le corps ambigu.
-- `sorte` (b232) dit au lecteur ce qu'il a sous les yeux : une fiche
-- d'artiste ou une fiche de GROUPE. `miroir_de` reste l'adresse du détenteur
-- — elle ne décide plus de ce qui s'affiche, seulement de QUI porte le
-- direct. Jointure EXTERNE sur `public_pages` : un groupe dont le détenteur
-- n'a pas (encore) d'adresse a quand même sa page.
drop function if exists public.resolve_public_name(text);
create function public.resolve_public_name(p_name text)
returns table (nom text, profil jsonb, miroir_de text, sorte text)
language sql stable security definer set search_path = public as $$
  select p.name, p.profile, null::text, 'artiste'::text
    from public.public_pages p
   where p.name = p_name
  union all
  select bp.name,
         case when bp.profile = '{}'::jsonb then p.profile else bp.profile end,
         p.name,
         'groupe'::text
    from public.band_pages bp
    join public.cloud_bands b on b.id = bp.band_id
    left join public.public_pages p on p.user_id = b.owner
   where bp.name = p_name
  limit 1
$$;
grant execute on function public.resolve_public_name(text) to anon, authenticated;

-- Ce nom est-il libre, toutes sortes confondues ? (vérification au fil de la
-- frappe, avant de proposer une adresse à quelqu'un.)
drop function if exists public.public_name_taken(text);
create function public.public_name_taken(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.public_pages where name = p_name)
      or exists (select 1 from public.band_pages where name = p_name)
$$;
grant execute on function public.public_name_taken(text) to anon, authenticated;
