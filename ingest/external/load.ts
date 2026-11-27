import { getDb } from "../../src/lib/db/client"
import {
  club,
  competition,
  country,
  game,
  player,
  playerCompetitionStat,
  rosterEntry,
  season,
  teamSeason,
  teamSeasonStat,
} from "../../src/lib/db/schema"
import { ensureSearch, refreshSearch } from "../search-schema"

export type ExternalTeam = {
  externalId: string
  name: string
  shortName?: string | null
}

export type ExternalGame = {
  externalId: string
  startsAt: string
  homeTeamId: string
  awayTeamId: string
  homeScore: number | null
  awayScore: number | null
  status: "finished" | "scheduled"
  decidedBy?: "regulation" | "overtime" | "shootout" | null
  round?: string | null
  venue?: string | null
}

export type ExternalPlayer = {
  externalId: string
  name: string
  teamExternalId: string
  imageUrl?: string | null
  matches: number
  goals: number
  assists: number
  points: number
  penaltyMinutes: number
}

export type ExternalStanding = {
  teamId: string
  position: number
  played: number
  wins: number
  overtimeWins: number
  overtimeLosses: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export type ExternalLeague = {
  source: string
  country: { id: string; name: string }
  competition: {
    externalId: string
    name: string
    categoryName?: string | null
    gender: "men" | "women"
  }
  seasonLabel: string
  teams: ExternalTeam[]
  games: ExternalGame[]
  standings: ExternalStanding[]
  players?: ExternalPlayer[]
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function loadExternalLeague(league: ExternalLeague) {
  const db = getDb()

  await db
    .insert(country)
    .values({ id: league.country.id, name: league.country.name })
    .onConflictDoUpdate({
      target: country.id,
      set: { name: league.country.name },
    })

  const [competitionRow] = await db
    .insert(competition)
    .values({
      countryId: league.country.id,
      slug: `${slugify(league.competition.name)}-${league.competition.externalId}`,
      name: league.competition.name,
      categoryName: league.competition.categoryName ?? league.competition.name,
      gender: league.competition.gender,
      kind: "league",
      source: league.source,
      externalId: league.competition.externalId,
    })
    .onConflictDoUpdate({
      target: [competition.source, competition.externalId],
      set: {
        countryId: league.country.id,
        slug: `${slugify(league.competition.name)}-${league.competition.externalId}`,
        name: league.competition.name,
        categoryName:
          league.competition.categoryName ?? league.competition.name,
        gender: league.competition.gender,
        kind: "league",
      },
    })
    .returning({ id: competition.id })

  const [seasonRow] = await db
    .insert(season)
    .values({
      competitionId: competitionRow.id,
      label: league.seasonLabel,
      phase: "regular_season",
    })
    .onConflictDoUpdate({
      target: [season.competitionId, season.label, season.phase],
      set: { label: league.seasonLabel },
    })
    .returning({ id: season.id })

  const clubIds = new Map<string, string>()
  for (const team of league.teams) {
    const [clubRow] = await db
      .insert(club)
      .values({
        countryId: league.country.id,
        slug: `${slugify(team.name)}-${team.externalId}`,
        name: team.name,
        source: league.source,
        externalId: team.externalId,
      })
      .onConflictDoUpdate({
        target: [club.source, club.externalId],
        set: {
          name: team.name,
          slug: `${slugify(team.name)}-${team.externalId}`,
        },
      })
      .returning({ id: club.id })
    clubIds.set(team.externalId, clubRow.id)
  }

  const teamSeasonIds = new Map<string, string>()
  for (const team of league.teams) {
    const [teamRow] = await db
      .insert(teamSeason)
      .values({
        seasonId: seasonRow.id,
        clubId: clubIds.get(team.externalId)!,
        name: team.name,
        shortName: team.shortName ?? null,
        source: league.source,
        externalId: team.externalId,
      })
      .onConflictDoUpdate({
        target: [teamSeason.seasonId, teamSeason.source, teamSeason.externalId],
        set: {
          clubId: clubIds.get(team.externalId)!,
          name: team.name,
          shortName: team.shortName ?? null,
        },
      })
      .returning({ id: teamSeason.id })
    teamSeasonIds.set(team.externalId, teamRow.id)
  }

  for (const standing of league.standings) {
    const teamId = teamSeasonIds.get(standing.teamId)
    if (!teamId) continue
    await db
      .insert(teamSeasonStat)
      .values({
        seasonId: seasonRow.id,
        teamSeasonId: teamId,
        position: standing.position,
        played: standing.played,
        wins: standing.wins,
        overtimeWins: standing.overtimeWins,
        overtimeLosses: standing.overtimeLosses,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        points: standing.points,
      })
      .onConflictDoUpdate({
        target: [teamSeasonStat.seasonId, teamSeasonStat.teamSeasonId],
        set: {
          position: standing.position,
          played: standing.played,
          wins: standing.wins,
          overtimeWins: standing.overtimeWins,
          overtimeLosses: standing.overtimeLosses,
          losses: standing.losses,
          goalsFor: standing.goalsFor,
          goalsAgainst: standing.goalsAgainst,
          points: standing.points,
        },
      })
  }

  for (const match of league.games) {
    const homeId = teamSeasonIds.get(match.homeTeamId)
    const awayId = teamSeasonIds.get(match.awayTeamId)
    if (!homeId || !awayId) continue
    await db
      .insert(game)
      .values({
        seasonId: seasonRow.id,
        round: match.round ?? null,
        startsAt: new Date(match.startsAt),
        status: match.status,
        homeTeamSeasonId: homeId,
        awayTeamSeasonId: awayId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        decidedBy: match.decidedBy ?? null,
        venue: match.venue ?? null,
        source: league.source,
        externalId: match.externalId,
      })
      .onConflictDoUpdate({
        target: [game.source, game.externalId],
        set: {
          round: match.round ?? null,
          startsAt: new Date(match.startsAt),
          status: match.status,
          homeTeamSeasonId: homeId,
          awayTeamSeasonId: awayId,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          decidedBy: match.decidedBy ?? null,
          venue: match.venue ?? null,
          fetchedAt: new Date(),
        },
      })
  }

  for (const entry of league.players ?? []) {
    const teamSeasonId = teamSeasonIds.get(entry.teamExternalId)
    if (!teamSeasonId) continue
    const [playerRow] = await db
      .insert(player)
      .values({
        source: league.source,
        externalId: entry.externalId,
        name: entry.name,
        imageUrl: entry.imageUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [player.source, player.externalId],
        set: { name: entry.name, imageUrl: entry.imageUrl ?? null },
      })
      .returning({ id: player.id })

    await db
      .insert(rosterEntry)
      .values({
        seasonId: seasonRow.id,
        teamSeasonId,
        playerId: playerRow.id,
      })
      .onConflictDoNothing()

    await db
      .insert(playerCompetitionStat)
      .values({
        seasonId: seasonRow.id,
        teamSeasonId,
        playerId: playerRow.id,
        matches: entry.matches,
        goals: entry.goals,
        assists: entry.assists,
        points: entry.points,
        penaltyMinutes: entry.penaltyMinutes,
      })
      .onConflictDoUpdate({
        target: [
          playerCompetitionStat.seasonId,
          playerCompetitionStat.teamSeasonId,
          playerCompetitionStat.playerId,
        ],
        set: {
          matches: entry.matches,
          goals: entry.goals,
          assists: entry.assists,
          points: entry.points,
          penaltyMinutes: entry.penaltyMinutes,
          fetchedAt: new Date(),
        },
      })
  }

  await ensureSearch()
  await refreshSearch()

  return {
    competitionId: competitionRow.id,
    teams: league.teams.length,
    games: league.games.length,
    standings: league.standings.length,
    players: league.players?.length ?? 0,
  }
}
