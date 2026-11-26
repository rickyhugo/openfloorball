import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")

const counts = await sql`
  select
    (select count(*) from competition)::int as competitions,
    (select count(*) from season)::int as seasons,
    (select count(*) from team_season)::int as teams,
    (select count(*) from game)::int as games,
    (select count(*) from player)::int as players,
    (select count(*) from player_competition_stat)::int as player_stats,
    (select count(*) from team_season_stat)::int as standings
`
console.log(counts[0])

const status = await sql`
  select status, count(*)::int as n from game group by status order by n desc
`
console.log(status)

const table = await sql`
  select tss.position, cl.name, tss.played, tss.wins, tss.overtime_wins,
         tss.overtime_losses, tss.losses, tss.goals_for, tss.goals_against, tss.points
  from team_season_stat tss
  join season s on s.id = tss.season_id
  join competition c on c.id = s.competition_id
  join team_season ts on ts.id = tss.team_season_id
  join club cl on cl.id = ts.club_id
  where c.external_id = '44033'
  order by tss.position
`
console.table(table)

const leaders = await sql`
  select p.name, cl.name as club, pcs.goals, pcs.assists, pcs.points
  from player_competition_stat pcs
  join player p on p.id = pcs.player_id
  join season s on s.id = pcs.season_id
  join competition c on c.id = s.competition_id
  join team_season ts on ts.id = pcs.team_season_id
  join club cl on cl.id = ts.club_id
  where c.external_id = '44033'
  order by pcs.points desc, pcs.goals desc
  limit 5
`
console.table(leaders)
