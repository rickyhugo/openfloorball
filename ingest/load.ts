import { readdir, readFile } from "node:fs/promises"
import { ensureSearch, refreshSearch } from "./search-schema"
import { sql } from "drizzle-orm"
import { getDb } from "../src/lib/db/client"
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
} from "../src/lib/db/schema"

const SEASON_LABEL = process.env.IBIS_SEASON_LABEL ?? "2026-27"
const RAW = `data/raw/ibis/${SEASON_LABEL}`
const SOURCE = "ibis"

const db = getDb()

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function genderOf(value: string): "men" | "women" | "mixed" {
  if (/\bdam|\bflick/i.test(value)) return "women"
  if (/\bherr|\bpojk/i.test(value)) return "men"
  return "mixed"
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  if (year < 1900 || year > 2100) return null
  return date
}

function isSenior(row: CompetitionRow) {
  const name = `${row.CategoryName} ${row.Name}`
  const senior =
    /(Herrar|\bHerr\b|Damer|\bDam\b|SSL|Allsvenskan|Division|Norrlandsserien|Klubbhuset|SSB-Ligan)/i
  const youth =
    /(\bU\d|\bP\d|\bF\d|Pojk|Flick|Junior|\bHJ\b|\bDJ\b|Veteran|Oldboy|Motion|\bMix\b|Para|Poolspel|Sammandrag|Pantamera|Nivå|Ljusröd|\bRöd\b|\bBlå\b|\bGrön\b|Skol|Distriktslag|Utveckling|Ungdom)/i
  const notLeague = /(Cup|Träning|Invitational|Pre-Season|Mästerskap|\bDM\b)/i
  return senior.test(name) && !youth.test(name) && !notLeague.test(name)
}

function dedupe<T>(rows: T[], key: (row: T) => string): T[] {
  const map = new Map<string, T>()
  for (const row of rows) map.set(key(row), row)
  return [...map.values()]
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T
  } catch {
    return null
  }
}

type CompetitionRow = {
  CompetitionID: number
  CategoryID: number
  CategoryName: string
  Name: string
  LogotypeUrl: string | null
  FederationID: number
}

type TeamStatRow = {
  TeamID: number
  TeamName: string
  TeamShortName: string | null
  AssociationID: number
  AssociationName: string
  MatchesPlayedHome: number
  MatchesPlayedAway: number
  WinsHome: number
  WinsAway: number
  SdWinsHome: number
  SdWinsAway: number
  DrawsHome: number
  DrawsAway: number
  LossesHome: number
  LossesAway: number
  GoalsScoredHome: number
  GoalsScoredAway: number
  GoalsAgainstHome: number
  GoalsAgainstAway: number
  Points: number
  Pp1GoalsScored: number
  Pp2GoalsScored: number
  Bp1GoalsScored: number
  Bp2GoalsScored: number
  PenaltyMinutes: number
  TotalSpectators: number | null
  AverageSpectators: number | null
}

type MatchRow = {
  MatchID: number
  MatchDateTime: string
  MatchStatus: number
  HomeTeamID: number
  AwayTeamID: number
  GoalsHomeTeam: number
  GoalsAwayTeam: number
  HasFinalResult: boolean
  MatchResultTypeID: number | null
  Cancelled: boolean
  Postponed: boolean
  Abandoned: boolean
  RoundName: string | null
  Venue: string | null
}

type PlayerRow = {
  PlayerID: number
  PlayerName: string
  TeamID: number
  ImageUrl: string | null
  MatchesPlayed: number
  GoalsScored: number
  Assists: number
  Points: number
  PenaltyMinutes: number
  GoalsScoredPp: number
  AssistsPp: number
  GoalsScoredBp: number
  AssistsBp: number
}

type GoalieRow = {
  PlayerID: number
  PlayerName: string
  TeamID: number
  ImageUrl: string | null
  MatchesPlayed: number
  ShotsAgainst: number
  GoalsAgainst: number
  SavePercentage: number
}

const mismatches: string[] = []
let gamesWritten = 0

await db
  .insert(country)
  .values({ id: "SE", name: "Sverige" })
  .onConflictDoUpdate({ target: country.id, set: { name: "Sverige" } })

const competitionRows = JSON.parse(
  await readFile(`${RAW}/competitions.json`, "utf8")
) as CompetitionRow[]

const seen = new Map<number, CompetitionRow>()
for (const row of competitionRows) seen.set(row.CompetitionID, row)

const federationNames = new Map<number, string>()
const federationLists = new Map<number, Set<number>>()
const federationDir = `${RAW}/federations`
for (const file of await readdir(federationDir)) {
  const federationId = Number(file.replace(".json", ""))
  const rows = await readJson<CompetitionRow[]>(`${federationDir}/${file}`)
  for (const row of rows ?? []) {
    const set = federationLists.get(row.CompetitionID) ?? new Set<number>()
    set.add(federationId)
    federationLists.set(row.CompetitionID, set)
  }
}

const rawDirs = await readdir(RAW)
const firstCollected = rawDirs.find((name) => /^\d+$/.test(name))
const federationRows = await readJson<
  Array<{ FederationID: number; Name: string }>
>(`${RAW}/${firstCollected}/federations_.json`)
for (const federation of federationRows ?? []) {
  federationNames.set(federation.FederationID, federation.Name)
}

function regionFor(row: CompetitionRow): string | null {
  if (row.Name.includes("(SIBF)")) return "Svenska IBF"
  const federations = federationLists.get(row.CompetitionID)
  if (!federations || federations.size !== 1) return null
  return federationNames.get([...federations][0]) ?? null
}

for (const row of [...seen.values()].filter(isSenior)) {
  const dir = `${RAW}/${row.CompetitionID}`
  const metadata = await readJson<{ SeasonName?: string }>(
    `${dir}/competitions_${row.CompetitionID}.json`
  )
  const teamStats =
    (await readJson<TeamStatRow[]>(
      `${dir}/competitions_${row.CompetitionID}_teamstatistics.json`
    )) ?? []
  const matches =
    (await readJson<MatchRow[]>(
      `${dir}/competitions_${row.CompetitionID}_matches.json`
    )) ?? []
  const players =
    (await readJson<PlayerRow[]>(
      `${dir}/competitions_${row.CompetitionID}_playerstatistics.json`
    )) ?? []
  const goalies =
    (await readJson<GoalieRow[]>(
      `${dir}/competitions_${row.CompetitionID}_goaliestatistics.json`
    )) ?? []
  if (!metadata) continue

  const [competitionRecord] = await db
    .insert(competition)
    .values({
      countryId: "SE",
      slug: `${slugify(row.Name)}-${row.CompetitionID}`,
      name: row.Name,
      categoryId: row.CategoryID,
      categoryName: row.CategoryName,
      regionName: regionFor(row),
      logoUrl: row.LogotypeUrl,
      gender: genderOf(`${row.CategoryName} ${row.Name}`),
      kind: "league",
      source: SOURCE,
      externalId: String(row.CompetitionID),
    })
    .onConflictDoUpdate({
      target: [competition.source, competition.externalId],
      set: {
        slug: sql`excluded.slug`,
        name: sql`excluded.name`,
        categoryId: sql`excluded.category_id`,
        categoryName: sql`excluded.category_name`,
        regionName: sql`excluded.region_name`,
        logoUrl: sql`excluded.logo_url`,
        gender: sql`excluded.gender`,
        kind: sql`excluded.kind`,
      },
    })
    .returning({ id: competition.id })

  const dates = matches
    .map((m) => toDate(m.MatchDateTime))
    .filter((d): d is Date => d !== null)
  const startsAt = dates.length
    ? new Date(Math.min(...dates.map((d) => d.getTime())))
    : null
  const endsAt = dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null

  const [seasonRecord] = await db
    .insert(season)
    .values({
      competitionId: competitionRecord.id,
      label: metadata.SeasonName ?? "2026/27",
      phase: "regular_season",
      startsAt,
      endsAt,
    })
    .onConflictDoUpdate({
      target: [season.competitionId, season.label, season.phase],
      set: { startsAt: sql`excluded.starts_at`, endsAt: sql`excluded.ends_at` },
    })
    .returning({ id: season.id })

  const clubStats = new Map<number, TeamStatRow>()
  for (const stat of teamStats) clubStats.set(stat.AssociationID, stat)

  const clubIds = new Map<number, string>()
  for (const batch of chunk([...clubStats.values()], 200)) {
    const inserted = await db
      .insert(club)
      .values(
        batch.map((stat) => ({
          countryId: "SE",
          slug: `${slugify(stat.AssociationName)}-${stat.AssociationID}`,
          name: stat.AssociationName,
          source: SOURCE,
          externalId: String(stat.AssociationID),
        }))
      )
      .onConflictDoUpdate({
        target: [club.source, club.externalId],
        set: { slug: sql`excluded.slug`, name: sql`excluded.name` },
      })
      .returning({ id: club.id, externalId: club.externalId })
    for (const record of inserted)
      clubIds.set(Number(record.externalId), record.id)
  }

  const teamIds = new Map<number, string>()
  for (const batch of chunk(teamStats, 200)) {
    const inserted = await db
      .insert(teamSeason)
      .values(
        batch.map((stat) => ({
          seasonId: seasonRecord.id,
          clubId: clubIds.get(stat.AssociationID)!,
          name: stat.TeamName,
          shortName: stat.TeamShortName,
          source: SOURCE,
          externalId: String(stat.TeamID),
        }))
      )
      .onConflictDoUpdate({
        target: [teamSeason.source, teamSeason.externalId],
        set: {
          seasonId: sql`excluded.season_id`,
          clubId: sql`excluded.club_id`,
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
        },
      })
      .returning({ id: teamSeason.id, externalId: teamSeason.externalId })
    for (const record of inserted)
      teamIds.set(Number(record.externalId), record.id)
  }

  const standingRows = [...teamStats]
    .map((stat) => {
      const playedHome = stat.MatchesPlayedHome
      const playedAway = stat.MatchesPlayedAway
      const wins = stat.WinsHome + stat.WinsAway
      const overtimeWins = stat.SdWinsHome + stat.SdWinsAway
      const overtimeLosses = stat.DrawsHome + stat.DrawsAway - overtimeWins
      const losses = stat.LossesHome + stat.LossesAway
      const played = playedHome + playedAway
      const points = stat.Points
      if (played !== wins + overtimeWins + overtimeLosses + losses) {
        mismatches.push(
          `${row.Name} ${stat.TeamName}: played ${played} != ${wins}+${overtimeWins}+${overtimeLosses}+${losses}`
        )
      }
      const expected = wins * 3 + overtimeWins * 2 + overtimeLosses
      if (points !== expected) {
        mismatches.push(
          `${row.Name} ${stat.TeamName}: points ${points} != ${expected}`
        )
      }
      return {
        stat,
        played,
        wins,
        overtimeWins,
        overtimeLosses,
        losses,
        goalsFor: stat.GoalsScoredHome + stat.GoalsScoredAway,
        goalsAgainst: stat.GoalsAgainstHome + stat.GoalsAgainstAway,
        points,
      }
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        a.stat.TeamName.localeCompare(b.stat.TeamName)
    )

  for (const batch of chunk(
    standingRows.map((entry, index) => ({ ...entry, position: index + 1 })),
    200
  )) {
    await db
      .insert(teamSeasonStat)
      .values(
        batch.map((entry) => ({
          seasonId: seasonRecord.id,
          teamSeasonId: teamIds.get(entry.stat.TeamID)!,
          position: entry.position,
          played: entry.played,
          wins: entry.wins,
          overtimeWins: entry.overtimeWins,
          overtimeLosses: entry.overtimeLosses,
          losses: entry.losses,
          goalsFor: entry.goalsFor,
          goalsAgainst: entry.goalsAgainst,
          points: entry.points,
          powerPlayGoals: entry.stat.Pp1GoalsScored + entry.stat.Pp2GoalsScored,
          boxPlayGoals: entry.stat.Bp1GoalsScored + entry.stat.Bp2GoalsScored,
          penaltyMinutes: entry.stat.PenaltyMinutes,
          attendanceTotal: entry.stat.TotalSpectators,
          attendanceAverage: entry.stat.AverageSpectators,
        }))
      )
      .onConflictDoUpdate({
        target: [teamSeasonStat.seasonId, teamSeasonStat.teamSeasonId],
        set: {
          position: sql`excluded.position`,
          played: sql`excluded.played`,
          wins: sql`excluded.wins`,
          overtimeWins: sql`excluded.overtime_wins`,
          overtimeLosses: sql`excluded.overtime_losses`,
          losses: sql`excluded.losses`,
          goalsFor: sql`excluded.goals_for`,
          goalsAgainst: sql`excluded.goals_against`,
          points: sql`excluded.points`,
          powerPlayGoals: sql`excluded.power_play_goals`,
          boxPlayGoals: sql`excluded.box_play_goals`,
          penaltyMinutes: sql`excluded.penalty_minutes`,
          attendanceTotal: sql`excluded.attendance_total`,
          attendanceAverage: sql`excluded.attendance_average`,
        },
      })
  }

  const gameRows = []
  for (const match of matches) {
    const homeId = teamIds.get(match.HomeTeamID)
    const awayId = teamIds.get(match.AwayTeamID)
    if (!homeId || !awayId) continue
    const status = match.Cancelled
      ? "cancelled"
      : match.Postponed
        ? "postponed"
        : match.Abandoned
          ? "awarded"
          : match.HasFinalResult
            ? "finished"
            : "scheduled"
    const decidedBy =
      match.MatchResultTypeID === 1
        ? "regulation"
        : match.MatchResultTypeID === 4
          ? "overtime"
          : match.MatchResultTypeID === 5
            ? "shootout"
            : null
    gameRows.push({
      seasonId: seasonRecord.id,
      round: match.RoundName,
      startsAt: toDate(match.MatchDateTime),
      status: status as
        "scheduled" | "finished" | "cancelled" | "postponed" | "awarded",
      homeTeamSeasonId: homeId,
      awayTeamSeasonId: awayId,
      homeScore: match.HasFinalResult ? match.GoalsHomeTeam : null,
      awayScore: match.HasFinalResult ? match.GoalsAwayTeam : null,
      decidedBy: decidedBy as "regulation" | "overtime" | "shootout" | null,
      venue: match.Venue,
      source: SOURCE,
      externalId: String(match.MatchID),
    })
  }
  for (const batch of chunk(
    dedupe(gameRows, (row) => String(row.externalId)),
    200
  )) {
    await db
      .insert(game)
      .values(batch)
      .onConflictDoUpdate({
        target: [game.source, game.externalId],
        set: {
          seasonId: sql`excluded.season_id`,
          round: sql`excluded.round`,
          startsAt: sql`excluded.starts_at`,
          status: sql`excluded.status`,
          homeTeamSeasonId: sql`excluded.home_team_season_id`,
          awayTeamSeasonId: sql`excluded.away_team_season_id`,
          homeScore: sql`excluded.home_score`,
          awayScore: sql`excluded.away_score`,
          decidedBy: sql`excluded.decided_by`,
          venue: sql`excluded.venue`,
          fetchedAt: sql`now()`,
        },
      })
  }
  gamesWritten += gameRows.length

  const playerRows = new Map<
    number,
    { id: number; name: string; imageUrl: string | null }
  >()
  for (const entry of [...players, ...goalies]) {
    playerRows.set(entry.PlayerID, {
      id: entry.PlayerID,
      name: entry.PlayerName,
      imageUrl: entry.ImageUrl,
    })
  }

  const playerIds = new Map<number, string>()
  for (const batch of chunk([...playerRows.values()], 200)) {
    const inserted = await db
      .insert(player)
      .values(
        batch.map((entry) => ({
          source: SOURCE,
          externalId: String(entry.id),
          name: entry.name,
          imageUrl: entry.imageUrl,
        }))
      )
      .onConflictDoUpdate({
        target: [player.source, player.externalId],
        set: {
          name: sql`excluded.name`,
          imageUrl: sql`excluded.image_url`,
        },
      })
      .returning({ id: player.id, externalId: player.externalId })
    for (const record of inserted)
      playerIds.set(Number(record.externalId), record.id)
  }

  const rosterRows = dedupe(
    [...playerRows.values()]
      .map((entry) => {
        const stat =
          players.find((p) => p.PlayerID === entry.id) ??
          goalies.find((g) => g.PlayerID === entry.id)
        const teamSeasonId = stat ? teamIds.get(stat.TeamID) : undefined
        const playerId = playerIds.get(entry.id)
        if (!teamSeasonId || !playerId) return null
        return { seasonId: seasonRecord.id, teamSeasonId, playerId }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (row) => `${row.teamSeasonId}:${row.playerId}`
  )

  for (const batch of chunk(rosterRows, 200)) {
    await db.insert(rosterEntry).values(batch).onConflictDoNothing()
  }

  const playerStatRows = dedupe(
    players
      .map((entry) => {
        const teamSeasonId = teamIds.get(entry.TeamID)
        const playerId = playerIds.get(entry.PlayerID)
        if (!teamSeasonId || !playerId) return null
        return {
          seasonId: seasonRecord.id,
          teamSeasonId,
          playerId,
          matches: entry.MatchesPlayed,
          goals: entry.GoalsScored,
          assists: entry.Assists,
          points: entry.Points,
          penaltyMinutes: entry.PenaltyMinutes,
          powerPlayGoals: entry.GoalsScoredPp,
          powerPlayAssists: entry.AssistsPp,
          boxPlayGoals: entry.GoalsScoredBp,
          boxPlayAssists: entry.AssistsBp,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (row) => `${row.teamSeasonId}:${row.playerId}`
  )

  for (const batch of chunk(playerStatRows, 200)) {
    await db
      .insert(playerCompetitionStat)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          playerCompetitionStat.seasonId,
          playerCompetitionStat.teamSeasonId,
          playerCompetitionStat.playerId,
        ],
        set: {
          matches: sql`excluded.matches`,
          goals: sql`excluded.goals`,
          assists: sql`excluded.assists`,
          points: sql`excluded.points`,
          penaltyMinutes: sql`excluded.penalty_minutes`,
          powerPlayGoals: sql`excluded.power_play_goals`,
          powerPlayAssists: sql`excluded.power_play_assists`,
          boxPlayGoals: sql`excluded.box_play_goals`,
          boxPlayAssists: sql`excluded.box_play_assists`,
          fetchedAt: sql`now()`,
        },
      })
  }

  const goalieStatRows = dedupe(
    goalies
      .map((entry) => {
        const teamSeasonId = teamIds.get(entry.TeamID)
        const playerId = playerIds.get(entry.PlayerID)
        if (!teamSeasonId || !playerId) return null
        return {
          seasonId: seasonRecord.id,
          teamSeasonId,
          playerId,
          matches: entry.MatchesPlayed,
          shotsAgainst: entry.ShotsAgainst,
          goalsAgainst: entry.GoalsAgainst,
          savePercentage: entry.SavePercentage,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (row) => `${row.teamSeasonId}:${row.playerId}`
  )

  for (const batch of chunk(goalieStatRows, 200)) {
    await db
      .insert(goalieCompetitionStat)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          goalieCompetitionStat.seasonId,
          goalieCompetitionStat.teamSeasonId,
          goalieCompetitionStat.playerId,
        ],
        set: {
          matches: sql`excluded.matches`,
          shotsAgainst: sql`excluded.shots_against`,
          goalsAgainst: sql`excluded.goals_against`,
          savePercentage: sql`excluded.save_percentage`,
          fetchedAt: sql`now()`,
        },
      })
  }

  console.log(
    `${row.CompetitionID} ${row.Name}: ${teamStats.length} teams, ${gameRows.length} games, ${playerStatRows.length} players`
  )
}

await ensureSearch()
await refreshSearch()

console.log(`games ${gamesWritten}`)
if (mismatches.length) {
  console.log(`reconciliation warnings ${mismatches.length}`)
  for (const line of mismatches.slice(0, 20)) console.log(`  ${line}`)
}
