import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")
const base = process.env.BASE_URL ?? "http://localhost:4321"

const seasons = await sql`
  select s.label,
    count(distinct c.id)::int as competitions,
    count(distinct g.id)::int as games,
    count(distinct pcs.player_id)::int as players
  from season s
  join competition c on c.id = s.competition_id
  left join game g on g.season_id = s.id
  left join player_competition_stat pcs on pcs.season_id = s.id
  group by s.label
  order by s.label
`
console.table(seasons)

const empty = await sql`
  select s.label, count(*)::int as without_games
  from season s
  join competition c on c.id = s.competition_id
  where not exists (select 1 from game g where g.season_id = s.id)
  group by s.label
  order by s.label
`
console.table(empty)

const failures: string[] = []
for (const season of seasons) {
  const [competition] = await sql`
    select c.external_id, c.name
    from competition c
    join season s on s.competition_id = c.id
    where s.label = ${season.label}
      and exists (select 1 from game g where g.season_id = s.id)
    order by c.name
    limit 1
  `
  if (!competition) continue
  const response = await fetch(`${base}/serie/${competition.external_id}`)
  const html = await response.text()
  const ok = response.status === 200 && html.includes("<table")
  console.log(
    `${season.label} ${competition.name}: ${ok ? "ok" : "FAIL " + response.status}`
  )
  if (!ok) failures.push(season.label)
}
if (failures.length) process.exitCode = 1
