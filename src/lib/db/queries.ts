import { and, asc, desc, eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getDb } from "./client"
import {
  club,
  competition,
  game,
  goalieCompetitionStat,
  player,
  playerCompetitionStat,
  season,
  teamSeason,
  teamSeasonStat,
} from "./schema"

export async function listCompetitions() {
  const db = getDb()
  return db
    .select({
      externalId: competition.externalId,
      name: competition.name,
      categoryName: competition.categoryName,
      gender: competition.gender,
      seasonLabel: season.label,
    })
    .from(competition)
    .innerJoin(season, eq(season.competitionId, competition.id))
    .where(eq(season.phase, "regular_season"))
    .orderBy(asc(competition.categoryName), asc(competition.name))
}

export async function getCompetition(externalId: string) {
  const db = getDb()
  const [record] = await db
    .select({
      competitionId: competition.id,
      name: competition.name,
      categoryName: competition.categoryName,
      gender: competition.gender,
      logoUrl: competition.logoUrl,
      seasonId: season.id,
      seasonLabel: season.label,
    })
    .from(competition)
    .innerJoin(season, eq(season.competitionId, competition.id))
    .where(
      and(
        eq(competition.externalId, externalId),
        eq(season.phase, "regular_season")
      )
    )
    .limit(1)

  if (!record) return null

  const standings = await db
    .select({
      position: teamSeasonStat.position,
      teamId: teamSeason.id,
      teamName: club.name,
      shortName: teamSeason.shortName,
      played: teamSeasonStat.played,
      regulationWins: teamSeasonStat.wins,
      overtimeWins: teamSeasonStat.overtimeWins,
      overtimeLosses: teamSeasonStat.overtimeLosses,
      regulationLosses: teamSeasonStat.losses,
      goalsFor: teamSeasonStat.goalsFor,
      goalsAgainst: teamSeasonStat.goalsAgainst,
      points: teamSeasonStat.points,
    })
    .from(teamSeasonStat)
    .innerJoin(teamSeason, eq(teamSeason.id, teamSeasonStat.teamSeasonId))
    .innerJoin(club, eq(club.id, teamSeason.clubId))
    .where(eq(teamSeasonStat.seasonId, record.seasonId))
    .orderBy(asc(teamSeasonStat.position))

  const homeTeam = alias(teamSeason, "home_team")
  const awayTeam = alias(teamSeason, "away_team")
  const homeClub = alias(club, "home_club")
  const awayClub = alias(club, "away_club")

  const games = await db
    .select({
      externalId: game.externalId,
      round: game.round,
      startsAt: game.startsAt,
      status: game.status,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      decidedBy: game.decidedBy,
      venue: game.venue,
      homeName: homeClub.name,
      awayName: awayClub.name,
    })
    .from(game)
    .innerJoin(homeTeam, eq(homeTeam.id, game.homeTeamSeasonId))
    .innerJoin(awayTeam, eq(awayTeam.id, game.awayTeamSeasonId))
    .innerJoin(homeClub, eq(homeClub.id, homeTeam.clubId))
    .innerJoin(awayClub, eq(awayClub.id, awayTeam.clubId))
    .where(eq(game.seasonId, record.seasonId))
    .orderBy(asc(game.startsAt))

  const leaders = await db
    .select({
      playerName: player.name,
      clubName: club.name,
      matches: playerCompetitionStat.matches,
      goals: playerCompetitionStat.goals,
      assists: playerCompetitionStat.assists,
      points: playerCompetitionStat.points,
      penaltyMinutes: playerCompetitionStat.penaltyMinutes,
    })
    .from(playerCompetitionStat)
    .innerJoin(player, eq(player.id, playerCompetitionStat.playerId))
    .innerJoin(
      teamSeason,
      eq(teamSeason.id, playerCompetitionStat.teamSeasonId)
    )
    .innerJoin(club, eq(club.id, teamSeason.clubId))
    .where(eq(playerCompetitionStat.seasonId, record.seasonId))
    .orderBy(
      desc(playerCompetitionStat.points),
      desc(playerCompetitionStat.goals),
      asc(player.name)
    )
    .limit(20)

  const goalies = await db
    .select({
      playerName: player.name,
      clubName: club.name,
      matches: goalieCompetitionStat.matches,
      shotsAgainst: goalieCompetitionStat.shotsAgainst,
      goalsAgainst: goalieCompetitionStat.goalsAgainst,
      savePercentage: goalieCompetitionStat.savePercentage,
    })
    .from(goalieCompetitionStat)
    .innerJoin(player, eq(player.id, goalieCompetitionStat.playerId))
    .innerJoin(
      teamSeason,
      eq(teamSeason.id, goalieCompetitionStat.teamSeasonId)
    )
    .innerJoin(club, eq(club.id, teamSeason.clubId))
    .where(eq(goalieCompetitionStat.seasonId, record.seasonId))
    .orderBy(
      desc(goalieCompetitionStat.savePercentage),
      desc(goalieCompetitionStat.matches)
    )
    .limit(12)

  return { ...record, standings, games, leaders, goalies }
}

export type CompetitionIndexRow = Awaited<
  ReturnType<typeof listCompetitions>
>[number]
export type CompetitionDetail = NonNullable<
  Awaited<ReturnType<typeof getCompetition>>
>
