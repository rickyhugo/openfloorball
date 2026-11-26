import { neon } from "@neondatabase/serverless"

// Run ingest/search-rebuild.ts after changing VIEW_SQL. ensure creates the view only when it is missing.
const VIEW_SQL = `
create materialized view if not exists search_document as
with comp as (
  select c.id, c.external_id, c.name, c.category_name
  from competition c
),
team as (
  select distinct on (cl.id, c.id)
    cl.id::text || ':' || c.id::text as id, cl.name as title, c.name as subtitle, c.external_id
  from team_season ts
  join club cl on cl.id = ts.club_id
  join season s on s.id = ts.season_id
  join competition c on c.id = s.competition_id
  order by cl.id, c.id, ts.name
),
gm as (
  select g.id, g.external_id, g.starts_at, g.status, g.home_score, g.away_score,
         hc.name as home, ac.name as away, c.name as comp, c.external_id as comp_ext
  from game g
  join team_season ht on ht.id = g.home_team_season_id
  join club hc on hc.id = ht.club_id
  join team_season at on at.id = g.away_team_season_id
  join club ac on ac.id = at.club_id
  join season s on s.id = g.season_id
  join competition c on c.id = s.competition_id
),
pl as (
  select distinct on (p.id) p.id, p.name, cl.name as club, c.name as comp, c.external_id as comp_ext
  from player p
  join player_competition_stat pcs on pcs.player_id = p.id
  join team_season ts on ts.id = pcs.team_season_id
  join club cl on cl.id = ts.club_id
  join season s on s.id = pcs.season_id
  join competition c on c.id = s.competition_id
  order by p.id, pcs.matches desc
)
select 'competition'::text as kind, comp.id::text as id, comp.name as title,
       comp.category_name as subtitle, '/serie/' || comp.external_id as url,
       lower(unaccent(concat_ws(' ', comp.name, comp.category_name, 'serie tabell'))) as search_text,
       10 as weight
from comp
union all
select 'team', team.id, team.title, team.subtitle, '/serie/' || team.external_id,
       lower(unaccent(concat_ws(' ', team.title, team.subtitle, 'lag'))), 9
from team
union all
select 'game', gm.id::text,
       gm.home || ' - ' || gm.away,
       gm.comp || ' · ' || to_char(gm.starts_at at time zone 'Europe/Stockholm', 'YYYY-MM-DD') ||
         case when gm.status = 'finished' then ' · ' || coalesce(gm.home_score::text, '') || '-' || coalesce(gm.away_score::text, '') else '' end,
       '/serie/' || gm.comp_ext || '#match-' || gm.external_id,
       lower(unaccent(concat_ws(' ', gm.home, gm.away, gm.comp, to_char(gm.starts_at at time zone 'Europe/Stockholm', 'YYYY-MM-DD')))), 6
from gm
union all
select 'player', pl.id::text, pl.name, pl.club || ' · ' || pl.comp, '/serie/' || pl.comp_ext,
       lower(unaccent(concat_ws(' ', pl.name, pl.club, pl.comp))), 4
from pl
`

const STATEMENTS = [
  "create extension if not exists unaccent",
  "create extension if not exists pg_trgm",
  VIEW_SQL,
  "create unique index if not exists search_document_key on search_document (kind, id)",
  "create index if not exists search_document_text_trgm on search_document using gin (search_text gin_trgm_ops)",
  "analyze search_document",
]

export function searchClient() {
  return neon(process.env.DATABASE_URL ?? "")
}

export async function ensureSearch() {
  const sql = searchClient()
  for (const statement of STATEMENTS) {
    await sql.query(statement)
  }
}

export async function refreshSearch() {
  const sql = searchClient()
  await sql.query("refresh materialized view concurrently search_document")
}

export async function rebuildSearch() {
  const sql = searchClient()
  await sql.query("drop materialized view if exists search_document")
  for (const statement of STATEMENTS) {
    await sql.query(statement)
  }
}
