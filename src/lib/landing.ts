import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL ?? "")

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
  countryName: string
  source: string
}

export type LandingStanding = {
  position: number
  teamExternalId: string
  teamName: string
  played: number
  points: number
}

export type LandingBoardCompetition = {
  name: string
  externalId: string
  standings: LandingStanding[]
}

export type LandingBoard = {
  countryId: string
  countryName: string
  men?: LandingBoardCompetition
  women?: LandingBoardCompetition
  other?: LandingBoardCompetition
}

export type LandingLeader = {
  playerName: string
  playerExternalId: string
  clubName: string
  countryName: string
  competitionName: string
  goals: number
  assists: number
  points: number
  penaltyMinutes: number
}

type BoardRow = {
  countryId: string
  countryName: string
  gender: string
  competitionName: string
  competitionExternalId: string
  position: number
  teamExternalId: string
  teamName: string
  played: number
  points: number
}

export async function getLanding() {
  const [season] = (await sql`
    select label from season order by label desc limit 1
  `) as Array<{ label: string }>
  if (!season) return null
  const label = season.label

  const latestGames = (await sql`
    with recent as (
      select g.external_id as "externalId", g.starts_at as "startsAt",
             g.home_score as "homeScore", g.away_score as "awayScore",
             g.decided_by as "decidedBy", hc.name as home, ac.name as away,
             c.name as competition, c.external_id as "competitionExternalId",
             co.name as "countryName", c.source,
             row_number() over (
               partition by co.id order by g.starts_at desc
             ) as country_rank
      from game g
      join season s on s.id = g.season_id
      join competition c on c.id = s.competition_id
      join country co on co.id = c.country_id
      join team_season ht on ht.id = g.home_team_season_id
      join club hc on hc.id = ht.club_id
      join team_season at on at.id = g.away_team_season_id
      join club ac on ac.id = at.club_id
      where s.label = ${label} and g.status = 'finished'
    )
    select "externalId", "startsAt", "homeScore", "awayScore", "decidedBy",
           home, away, competition, "competitionExternalId", "countryName", source
    from recent
    where country_rank <= 3
    order by "startsAt" desc
    limit 9
  `) as Array<LandingGame>

  const boardRows = (await sql`
    select c.country_id as "countryId", co.name as "countryName",
           c.gender, c.name as "competitionName",
           c.external_id as "competitionExternalId",
           tss.position, ts.external_id as "teamExternalId",
           cl.name as "teamName", tss.played, tss.points
    from competition c
    join country co on co.id = c.country_id
    join season s on s.competition_id = c.id
    join team_season_stat tss on tss.season_id = s.id
    join team_season ts on ts.id = tss.team_season_id
    join club cl on cl.id = ts.club_id
    where s.label = ${label}
      and tss.position <= 3
      and (
        c.name ilike '%SSL%'
        or c.name ilike '%F-Liiga%'
        or c.name ilike '%L-UPL%'
      )
    order by c.country_id, c.gender, c.name, tss.position
  `) as Array<BoardRow>

  const boards = new Map<string, LandingBoard>()
  for (const row of boardRows) {
    const board =
      boards.get(row.countryId) ??
      ({
        countryId: row.countryId,
        countryName: row.countryName,
      } satisfies LandingBoard)
    const key =
      row.gender === "men" || row.gender === "women" ? row.gender : "other"
    board[key] ??= {
      name: row.competitionName,
      externalId: row.competitionExternalId,
      standings: [],
    }
    board[key]!.standings.push({
      position: row.position,
      teamExternalId: row.teamExternalId,
      teamName: row.teamName,
      played: row.played,
      points: row.points,
    })
    boards.set(row.countryId, board)
  }

  const leaderRows = (await sql`
    select p.name as "playerName", p.external_id as "playerExternalId",
           cl.name as "clubName", co.name as "countryName",
           c.name as "competitionName",
           pcs.goals, pcs.assists, pcs.points,
           pcs.penalty_minutes as "penaltyMinutes"
    from player_competition_stat pcs
    join player p on p.id = pcs.player_id
    join team_season ts on ts.id = pcs.team_season_id
    join club cl on cl.id = ts.club_id
    join season s on s.id = pcs.season_id
    join competition c on c.id = s.competition_id
    join country co on co.id = c.country_id
    where s.label = ${label}
      and (
        c.name ilike '%SSL%'
        or c.name ilike '%F-Liiga%'
        or c.name ilike '%L-UPL%'
      )
  `) as Array<LandingLeader>

  const combined = new Map<string, LandingLeader>()
  for (const row of leaderRows) {
    const key = `${row.countryName}|${row.playerExternalId}`
    const current = combined.get(key)
    if (!current) {
      combined.set(key, { ...row })
    } else {
      current.goals += row.goals
      current.assists += row.assists
      current.points += row.points
      current.penaltyMinutes += row.penaltyMinutes
    }
  }

  const topByCountry = (
    metric: "goals" | "assists" | "points" | "penaltyMinutes"
  ) => {
    const byCountry = new Map<string, LandingLeader[]>()
    for (const row of combined.values()) {
      const list = byCountry.get(row.countryName) ?? []
      list.push(row)
      byCountry.set(row.countryName, list)
    }
    return [...byCountry.values()]
      .flatMap((rows) =>
        rows
          .sort(
            (a, b) =>
              b[metric] - a[metric] ||
              b.points - a.points ||
              a.playerName.localeCompare(b.playerName, "sv")
          )
          .slice(0, 2)
      )
      .sort(
        (a, b) =>
          b[metric] - a[metric] ||
          b.points - a.points ||
          a.playerName.localeCompare(b.playerName, "sv")
      )
  }

  return {
    seasonLabel: label,
    latestGames,
    boards: [...boards.values()].sort((a, b) =>
      a.countryName.localeCompare(b.countryName, "sv")
    ),
    leaders: {
      goals: topByCountry("goals"),
      assists: topByCountry("assists"),
      points: topByCountry("points"),
      penalties: topByCountry("penaltyMinutes"),
    },
  }
}
