import { and, asc, desc, eq, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { getDb } from "./client"
import {
  club,
  competition,
  country,
  game,
  goalieCompetitionStat,
  player,
  playerCompetitionStat,
  rosterEntry,
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
      regionName: competition.regionName,
      gender: competition.gender,
      countryId: competition.countryId,
      countryName: country.name,
      seasonLabel: season.label,
    })
    .from(competition)
    .innerJoin(country, eq(country.id, competition.countryId))
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
      teamExternalId: teamSeason.externalId,
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
      playerExternalId: player.externalId,
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
      playerExternalId: player.externalId,
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

export async function getTeam(
  competitionExternalId: string,
  teamExternalId: string
) {
  const db = getDb()
  const [record] = await db
    .select({
      teamSeasonId: teamSeason.id,
      teamName: teamSeason.name,
      teamExternalId: teamSeason.externalId,
      clubName: club.name,
      competitionExternalId: competition.externalId,
      competitionName: competition.name,
      categoryName: competition.categoryName,
      seasonId: season.id,
      seasonLabel: season.label,
    })
    .from(teamSeason)
    .innerJoin(club, eq(club.id, teamSeason.clubId))
    .innerJoin(season, eq(season.id, teamSeason.seasonId))
    .innerJoin(competition, eq(competition.id, season.competitionId))
    .where(
      and(
        eq(competition.externalId, competitionExternalId),
        eq(teamSeason.externalId, teamExternalId)
      )
    )
    .limit(1)

  if (!record) return null

  const [standing] = await db
    .select({
      position: teamSeasonStat.position,
      played: teamSeasonStat.played,
      wins: teamSeasonStat.wins,
      overtimeWins: teamSeasonStat.overtimeWins,
      overtimeLosses: teamSeasonStat.overtimeLosses,
      losses: teamSeasonStat.losses,
      goalsFor: teamSeasonStat.goalsFor,
      goalsAgainst: teamSeasonStat.goalsAgainst,
      points: teamSeasonStat.points,
      powerPlayGoals: teamSeasonStat.powerPlayGoals,
      boxPlayGoals: teamSeasonStat.boxPlayGoals,
      penaltyMinutes: teamSeasonStat.penaltyMinutes,
      attendanceAverage: teamSeasonStat.attendanceAverage,
    })
    .from(teamSeasonStat)
    .where(
      and(
        eq(teamSeasonStat.seasonId, record.seasonId),
        eq(teamSeasonStat.teamSeasonId, record.teamSeasonId)
      )
    )
    .limit(1)

  const roster = await db
    .select({
      playerName: player.name,
      playerExternalId: player.externalId,
      imageUrl: player.imageUrl,
      matches: playerCompetitionStat.matches,
      goals: playerCompetitionStat.goals,
      assists: playerCompetitionStat.assists,
      points: playerCompetitionStat.points,
      penaltyMinutes: playerCompetitionStat.penaltyMinutes,
      goalieMatches: goalieCompetitionStat.matches,
      shotsAgainst: goalieCompetitionStat.shotsAgainst,
      goalsAgainst: goalieCompetitionStat.goalsAgainst,
      savePercentage: goalieCompetitionStat.savePercentage,
    })
    .from(rosterEntry)
    .innerJoin(player, eq(player.id, rosterEntry.playerId))
    .leftJoin(
      playerCompetitionStat,
      and(
        eq(playerCompetitionStat.seasonId, rosterEntry.seasonId),
        eq(playerCompetitionStat.teamSeasonId, rosterEntry.teamSeasonId),
        eq(playerCompetitionStat.playerId, rosterEntry.playerId)
      )
    )
    .leftJoin(
      goalieCompetitionStat,
      and(
        eq(goalieCompetitionStat.seasonId, rosterEntry.seasonId),
        eq(goalieCompetitionStat.teamSeasonId, rosterEntry.teamSeasonId),
        eq(goalieCompetitionStat.playerId, rosterEntry.playerId)
      )
    )
    .where(
      and(
        eq(rosterEntry.seasonId, record.seasonId),
        eq(rosterEntry.teamSeasonId, record.teamSeasonId)
      )
    )
    .orderBy(desc(playerCompetitionStat.points), asc(player.name))

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
      homeTeamSeasonId: game.homeTeamSeasonId,
    })
    .from(game)
    .innerJoin(homeTeam, eq(homeTeam.id, game.homeTeamSeasonId))
    .innerJoin(awayTeam, eq(awayTeam.id, game.awayTeamSeasonId))
    .innerJoin(homeClub, eq(homeClub.id, homeTeam.clubId))
    .innerJoin(awayClub, eq(awayClub.id, awayTeam.clubId))
    .where(
      and(
        eq(game.seasonId, record.seasonId),
        or(
          eq(game.homeTeamSeasonId, record.teamSeasonId),
          eq(game.awayTeamSeasonId, record.teamSeasonId)
        )
      )
    )
    .orderBy(asc(game.startsAt))

  return { ...record, standing: standing ?? null, roster, games }
}

export async function getPlayer(externalId: string) {
  const db = getDb()
  const [person] = await db
    .select({
      id: player.id,
      externalId: player.externalId,
      name: player.name,
      imageUrl: player.imageUrl,
    })
    .from(player)
    .where(eq(player.externalId, externalId))
    .limit(1)

  if (!person) return null

  const rows = await db
    .select({
      competitionName: competition.name,
      competitionExternalId: competition.externalId,
      seasonLabel: season.label,
      clubName: club.name,
      teamExternalId: teamSeason.externalId,
      teamName: teamSeason.name,
      matches: playerCompetitionStat.matches,
      goals: playerCompetitionStat.goals,
      assists: playerCompetitionStat.assists,
      points: playerCompetitionStat.points,
      penaltyMinutes: playerCompetitionStat.penaltyMinutes,
      goalieMatches: goalieCompetitionStat.matches,
      shotsAgainst: goalieCompetitionStat.shotsAgainst,
      goalsAgainst: goalieCompetitionStat.goalsAgainst,
      savePercentage: goalieCompetitionStat.savePercentage,
    })
    .from(player)
    .innerJoin(rosterEntry, eq(rosterEntry.playerId, player.id))
    .innerJoin(teamSeason, eq(teamSeason.id, rosterEntry.teamSeasonId))
    .innerJoin(club, eq(club.id, teamSeason.clubId))
    .innerJoin(season, eq(season.id, rosterEntry.seasonId))
    .innerJoin(competition, eq(competition.id, season.competitionId))
    .leftJoin(
      playerCompetitionStat,
      and(
        eq(playerCompetitionStat.playerId, player.id),
        eq(playerCompetitionStat.seasonId, rosterEntry.seasonId),
        eq(playerCompetitionStat.teamSeasonId, rosterEntry.teamSeasonId)
      )
    )
    .leftJoin(
      goalieCompetitionStat,
      and(
        eq(goalieCompetitionStat.playerId, player.id),
        eq(goalieCompetitionStat.seasonId, rosterEntry.seasonId),
        eq(goalieCompetitionStat.teamSeasonId, rosterEntry.teamSeasonId)
      )
    )
    .where(eq(player.id, person.id))
    .orderBy(desc(season.label), asc(competition.name))

  const skaterRows = rows.filter((row) => row.matches !== null)
  const goalieRows = rows.filter((row) => row.goalieMatches !== null)
  const skaterTotals = skaterRows.reduce(
    (totals, row) => ({
      matches: totals.matches + (row.matches ?? 0),
      goals: totals.goals + (row.goals ?? 0),
      assists: totals.assists + (row.assists ?? 0),
      points: totals.points + (row.points ?? 0),
      penaltyMinutes: totals.penaltyMinutes + (row.penaltyMinutes ?? 0),
    }),
    { matches: 0, goals: 0, assists: 0, points: 0, penaltyMinutes: 0 }
  )
  const goalieTotals = goalieRows.reduce(
    (totals, row) => ({
      matches: totals.matches + (row.goalieMatches ?? 0),
      shotsAgainst: totals.shotsAgainst + (row.shotsAgainst ?? 0),
      goalsAgainst: totals.goalsAgainst + (row.goalsAgainst ?? 0),
    }),
    { matches: 0, shotsAgainst: 0, goalsAgainst: 0 }
  )
  const savePercentage = goalieTotals.shotsAgainst
    ? ((goalieTotals.shotsAgainst - goalieTotals.goalsAgainst) /
        goalieTotals.shotsAgainst) *
      100
    : null

  return {
    person,
    rows,
    skaterRows,
    goalieRows,
    skaterTotals,
    goalieTotals,
    savePercentage,
  }
}

export async function listCountries(label: string) {
  const db = getDb()
  return db
    .select({
      id: country.id,
      name: country.name,
      competitions: sql<number>`count(distinct ${competition.id})`.mapWith(
        Number
      ),
    })
    .from(country)
    .innerJoin(competition, eq(competition.countryId, country.id))
    .innerJoin(season, eq(season.competitionId, competition.id))
    .where(eq(season.label, label))
    .groupBy(country.id, country.name)
    .orderBy(asc(country.name))
}

export type CompetitionIndexRow = Awaited<
  ReturnType<typeof listCompetitions>
>[number]
export type CompetitionDetail = NonNullable<
  Awaited<ReturnType<typeof getCompetition>>
>
export type TeamDetail = NonNullable<Awaited<ReturnType<typeof getTeam>>>
export type PlayerDetail = NonNullable<Awaited<ReturnType<typeof getPlayer>>>
