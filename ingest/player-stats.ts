import { desc, eq } from "drizzle-orm"
import { getDb } from "../src/lib/db/client"
import {
  competition,
  player,
  playerCompetitionStat,
  rosterEntry,
  season,
  teamSeason,
} from "../src/lib/db/schema"
import { refreshSearch } from "./search-schema"

type PlayerStat = {
  externalId: string
  name: string
  teamName: string
  imageUrl?: string | null
  matches: number
  goals: number
  assists: number
  points: number
  penaltyMinutes: number
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function loadPlayers(
  source: string,
  competitionExternalId: string,
  players: PlayerStat[]
) {
  const db = getDb()
  const [competitionRow] = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.externalId, competitionExternalId))
    .limit(1)
  if (!competitionRow)
    throw new Error(`unknown competition ${competitionExternalId}`)

  const [seasonRow] = await db
    .select({ id: season.id, label: season.label })
    .from(season)
    .where(eq(season.competitionId, competitionRow.id))
    .orderBy(desc(season.label))
    .limit(1)
  if (!seasonRow) throw new Error(`no season for ${competitionExternalId}`)

  const teams = await db
    .select({ id: teamSeason.id, name: teamSeason.name })
    .from(teamSeason)
    .where(eq(teamSeason.seasonId, seasonRow.id))
  const teamsByName = new Map(
    teams.map((team) => [normalize(team.name), team.id])
  )

  let loaded = 0
  let skipped = 0
  for (const entry of players) {
    const teamSeasonId = teamsByName.get(normalize(entry.teamName))
    if (!teamSeasonId) {
      skipped++
      continue
    }
    const [playerRow] = await db
      .insert(player)
      .values({
        source,
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
    loaded++
  }
  console.log(
    competitionExternalId,
    `${seasonRow.label}: ${loaded} players, ${skipped} skipped`
  )
}

async function fetchReaderText(url: string) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch("https://r.jina.ai/" + url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "x-return-format": "text",
        "x-no-cache": "true",
      },
    })
    if (response.ok) return response.text()
    if (attempt === 4) throw new Error(`reader -> ${response.status}`)
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
  throw new Error("reader failed")
}

async function finlandPlayers(gender: "men" | "women"): Promise<PlayerStat[]> {
  const series = gender === "men" ? "miehet" : "naiset"
  const url =
    "https://fliiga.com/wp-admin/admin-ajax.php?action=fliiga_scoreboard_points" +
    `&season=2026-2027&phase=&series=${series}&lang=en`
  const rows = JSON.parse(await fetchReaderText(url)) as Array<{
    torneopal_id: string
    first_name: string
    last_name: string
    image_url: string | null
    games_played: number
    goals: number
    assists: number
    points: number
    penalty_minutes: number
    team_name: string
  }>
  return rows.map((row) => ({
    externalId: row.torneopal_id,
    name: `${row.first_name} ${row.last_name}`,
    teamName: row.team_name,
    imageUrl: row.image_url,
    matches: row.games_played,
    goals: row.goals,
    assists: row.assists,
    points: row.points,
    penaltyMinutes: row.penalty_minutes,
  }))
}

async function swissPlayers(leagueId: number): Promise<PlayerStat[]> {
  const response = await fetch(
    "https://swissunihockey-api.azurewebsites.net/api/statisticstableapi/getplayerstatisticsforleague" +
      `?LeagueID=${leagueId}&PageID=0&PageSize=1000&SelectedColumnType=11`,
    {
      headers: {
        "user-agent": "Mozilla/5.0",
        referer: "https://myapp.swissunihockey.ch/",
        origin: "https://myapp.swissunihockey.ch",
        accept: "application/json",
      },
    }
  )
  if (!response.ok)
    throw new Error(`swiss ${leagueId} stats -> ${response.status}`)
  const rows = (await response.json()) as Array<{
    ItemID: number
    Name: string
    Details: string
    ValueColumns: Array<{ Value: string }>
  }>
  return rows.flatMap((row) => {
    if (row.ValueColumns.length < 4) return []
    return [
      {
        externalId: String(row.ItemID),
        name: row.Name,
        teamName: row.Details,
        imageUrl: null,
        matches: Number(row.ValueColumns[0].Value),
        goals: Number(row.ValueColumns[1].Value),
        assists: Number(row.ValueColumns[2].Value),
        points: Number(row.ValueColumns[3].Value),
        penaltyMinutes: Number(row.ValueColumns[4]?.Value ?? 0),
      },
    ]
  })
}

const fiMen = await finlandPlayers("men")
const fiWomen = await finlandPlayers("women")
const chMen = await swissPlayers(9380)
const chWomen = await swissPlayers(9534)

await loadPlayers("fliiga", "fliiga-men", fiMen)
await loadPlayers("fliiga", "fliiga-women", fiWomen)
await loadPlayers("swissunihockey", "swiss-lupl-men", chMen)
await loadPlayers("swissunihockey", "swiss-lupl-women", chWomen)
await refreshSearch()
console.log("player stats loaded")
process.exit(0)
