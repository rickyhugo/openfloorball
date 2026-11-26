import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")

type FeaturedCompetition = {
  id: string
  externalId: string
  name: string
  categoryName: string | null
  gender: string
}

export type LandingGame = {
  externalId: string
  startsAt: Date
  homeScore: number | null
  awayScore: number | null
  decidedBy: string | null
  home: string
  away: string
  competition: string
  competitionExternalId: string
}

export type LandingStanding = {
  position: number
  teamExternalId: string
  teamName: string
  played: number
  points: number
}

export type LandingLeader = {
  playerName: string
  playerExternalId: string
  clubName: string
  goals: number
  assists: number
  points: number
}

export async function getLanding() {
  const [season] = (await sql`
    select label from season order by label desc limit 1
  `) as Array<{ label: string }>
  if (!season) return null
  const label = season.label

  const latestGames = (await sql`
    select g.external_id as "externalId", g.starts_at as "startsAt", g.home_score as "homeScore",
           g.away_score as "awayScore", g.decided_by as "decidedBy",
           hc.name as home, ac.name as away, c.name as competition,
           c.external_id as "competitionExternalId"
    from game g
    join season s on s.id = g.season_id
    join competition c on c.id = s.competition_id
    join team_season ht on ht.id = g.home_team_season_id
    join club hc on hc.id = ht.club_id
    join team_season at on at.id = g.away_team_season_id
    join club ac on ac.id = at.club_id
    where s.label = ${label} and g.status = 'finished'
    order by g.starts_at desc
    limit 8
  `) as Array<LandingGame>

  const competitions = (await sql`
    select c.id, c.external_id as "externalId", c.name, c.category_name as "categoryName", c.gender
    from competition c
    join season s on s.competition_id = c.id
    where s.label = ${label}
      and (c.name ilike '%SSL%' or c.name ilike '%Allsvenskan%')
    order by c.name
  `) as Array<FeaturedCompetition>

  const pick = (gender: string, needle: string) =>
    competitions.find(
      (competition) =>
        competition.gender === gender &&
        competition.name.toLowerCase().includes(needle.toLowerCase())
    )

  const definitions = [
    {
      key: "ssl-men",
      label: "SSL Herrar",
      competition: pick("men", "SSL") ?? pick("men", "Svenska Superligan"),
    },
    {
      key: "ssl-women",
      label: "SSL Damer",
      competition: pick("women", "SSL") ?? pick("women", "Svenska Superligan"),
    },
    {
      key: "allsvenskan-men",
      label: "Allsvenskan Herrar",
      competition: pick("men", "Allsvenskan"),
    },
    {
      key: "allsvenskan-women",
      label: "Allsvenskan Damer",
      competition: pick("women", "Allsvenskan"),
    },
  ].filter(
    (
      definition
    ): definition is {
      key: string
      label: string
      competition: FeaturedCompetition
    } => Boolean(definition.competition)
  )

  const featured: Array<{
    key: string
    label: string
    competition: FeaturedCompetition
    standings: LandingStanding[]
  }> = []
  for (const definition of definitions) {
    const standings = (await sql`
      select tss.position, ts.external_id as "teamExternalId", cl.name as "teamName", tss.played, tss.points
      from team_season_stat tss
      join season s on s.id = tss.season_id
      join competition c on c.id = s.competition_id
      join team_season ts on ts.id = tss.team_season_id
      join club cl on cl.id = ts.club_id
      where c.external_id = ${definition.competition.externalId} and s.label = ${label}
      order by tss.position
      limit 5
    `) as Array<LandingStanding>
    featured.push({ ...definition, standings })
  }

  const sslMen = featured.find((entry) => entry.key === "ssl-men")?.competition
  const leaders = sslMen
    ? ((await sql`
        select p.name as "playerName", p.external_id as "playerExternalId",
               cl.name as "clubName", pcs.goals, pcs.assists, pcs.points
        from player_competition_stat pcs
        join player p on p.id = pcs.player_id
        join team_season ts on ts.id = pcs.team_season_id
        join club cl on cl.id = ts.club_id
        join season s on s.id = pcs.season_id
        join competition c on c.id = s.competition_id
        where s.label = ${label} and c.external_id = ${sslMen.externalId}
        order by pcs.points desc, pcs.goals desc
        limit 5
      `) as Array<LandingLeader>)
    : []

  return { seasonLabel: label, latestGames, featured, leaders }
}
