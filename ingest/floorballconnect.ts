import { load } from "cheerio"
import {
  loadExternalLeague,
  type ExternalGame,
  type ExternalPlayer,
  type ExternalStanding,
  type ExternalTeam,
} from "./external/load"

// FloorballConnect (stats.floorballconnect.com) covers Czechia, Slovakia,
// Latvia and Germany as static category pages. One page per league-season
// carries the standings table and every game; a sibling -players.html page
// carries the player table (G/A/P/PIM).

const FBC = "https://stats.floorballconnect.com"
const SEASON = { ss: "26-27", label: "2026/27" }
const TIME_ZONE = "Europe/Stockholm"
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
}

type Category = {
  // Category prefix on FloorballConnect. Germany's men league has no
  // prefix at all ("/category/26-27-regular-season.html").
  cc: string
  country: { id: string; name: string }
  name: string
  gender: "men" | "women"
}

const CATEGORIES: Category[] = [
  {
    cc: "cz",
    country: { id: "CZ", name: "Tjeckien" },
    name: "ČEZ Extraliga",
    gender: "men",
  },
  {
    cc: "czw",
    country: { id: "CZ", name: "Tjeckien" },
    name: "ČEZ Extraliga žen",
    gender: "women",
  },
  {
    cc: "sk",
    country: { id: "SK", name: "Slovakien" },
    name: "Extraliga mužov",
    gender: "men",
  },
  {
    cc: "skw",
    country: { id: "SK", name: "Slovakien" },
    name: "Extraliga žien",
    gender: "women",
  },
  {
    cc: "lv",
    country: { id: "LV", name: "Lettland" },
    name: "ELVI līga",
    gender: "men",
  },
  {
    cc: "lvw",
    country: { id: "LV", name: "Lettland" },
    name: "ELVI līga sievietēm",
    gender: "women",
  },
  {
    cc: "de",
    country: { id: "DE", name: "Tyskland" },
    name: "1. FBL Herren",
    gender: "men",
  },
  {
    cc: "dew",
    country: { id: "DE", name: "Tyskland" },
    name: "1. FBL Damen",
    gender: "women",
  },
]

// The live module parses the same pages for the match ticker.
export function fcCategoryUrl(cc: string) {
  return `${FBC}/category/${cc === "de" ? "" : `${cc}-`}${SEASON.ss}-regular-season.html`
}

function categoryExternalId(cc: string) {
  return `${cc === "de" ? "" : `${cc}-`}${SEASON.ss}-regular-season`
}

export function normalizeFcName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function number(value: string) {
  const parsed = Number(value.replace(/[^0-9-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

// Game dates render as "Sun 22 Nov" without a year. A European floorball
// season runs Jul-Dec (first year) and Jan-Jun (second year).
function fbcDateKey(value: string) {
  const match = value.match(/(\d{1,2})\s+([A-Z][a-z]{2})/)
  if (!match) return null
  const day = Number(match[1])
  const month = MONTHS[match[2]]
  if (month === undefined) return null
  const year = month >= 7 ? 2026 : 2027
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function zonedToIso(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute)
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant))
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value)
    return (
      Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute")
      ) - instant
    )
  }
  const firstOffset = offsetAt(asUtc)
  const first = new Date(asUtc - firstOffset)
  const secondOffset = offsetAt(first.getTime())
  return (
    firstOffset === secondOffset ? first : new Date(asUtc - secondOffset)
  ).toISOString()
}

type FbcGameRow = {
  id: string
  dateKey: string
  time: string
  finished: boolean
  decidedBy: "regulation" | "overtime" | "shootout"
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
}

type FbcCategory = {
  url: string
  teams: ExternalTeam[]
  // Normalized team name -> external id, shared by standings, games and
  // the player table (which only carries plain team names).
  teamIds: Map<string, string>
  standings: ExternalStanding[]
  games: FbcGameRow[]
}

// Crest logo files are per-team stable hashes, e.g.
// /theme/team-logos/cz-24fa1dcd90118d95.png.
function teamExternalId(crestHref: string | undefined, name: string) {
  const file = crestHref?.split("/").pop() ?? ""
  if (/^[a-z]{2,3}-[0-9a-f]+\.png$/.test(file)) return file.replace(".png", "")
  return normalizeFcName(name).replace(/\s+/g, "-")
}

async function fetchCategory(category: Category): Promise<FbcCategory> {
  const url = fcCategoryUrl(category.cc)
  const response = await fetch(url, { headers: HEADERS })
  if (!response.ok) throw new Error(`category failed: ${response.status}`)
  const $ = load(await response.text())

  const teams: ExternalTeam[] = []
  const teamIds = new Map<string, string>()
  const registerTeam = (name: string, crestHref: string | undefined) => {
    if (!name) return
    const teamId = teamExternalId(crestHref, name)
    const key = normalizeFcName(name)
    if (!teamIds.has(key)) {
      teamIds.set(key, teamId)
      teams.push({ externalId: teamId, name })
    }
  }

  // Standings: read columns by header text, hidden rate columns would
  // otherwise shift every index.
  const table = $("table[data-standings]")
  const columns = new Map<string, number>()
  table.find("thead th").each((index, th) => {
    const text = $(th).text().trim()
    if (text) columns.set(text, index)
  })
  const cell = (texts: string[], label: string) => {
    const index = columns.get(label)
    return index === undefined ? "" : (texts[index] ?? "")
  }

  const standings: ExternalStanding[] = []
  table.find("tbody tr").each((_, row) => {
    const cells = $(row).find("td").toArray()
    if (cells.length === 0) return
    const texts = cells.map((c) => $(c).text().trim())
    const teamCell = $(cells[columns.get("Team") ?? 1])
    // Same extractor as the game rows: the crest initials span would
    // otherwise end up in the name.
    const name =
      teamCell
        .find(".fs-team span:not(.fs-match__place)")
        .last()
        .text()
        .trim() || texts[columns.get("Team") ?? 1]
    if (!name) return
    registerTeam(name, teamCell.find("img.fs-crest__logo").attr("src"))
    const teamId = teamIds.get(normalizeFcName(name))!
    const goals = cell(texts, "Goals").split(":")
    standings.push({
      teamId,
      position: number(cell(texts, "#")),
      played: number(cell(texts, "GP")),
      wins: number(cell(texts, "W")),
      overtimeWins: number(cell(texts, "OTW")),
      overtimeLosses: number(cell(texts, "OTL")),
      losses: number(cell(texts, "L")),
      goalsFor: number(goals[0] ?? ""),
      goalsAgainst: number(goals[1] ?? ""),
      points: number(cell(texts, "Pts")),
    })
  })

  const games: FbcGameRow[] = []
  const seen = new Set<string>()
  $("#games a.fs-match").each((_, element) => {
    const anchor = $(element)
    const id = anchor
      .attr("href")
      ?.split("/")
      .pop()
      ?.match(/^(\d+)-/)?.[1]
    if (!id || seen.has(id)) return
    const matchTeams = anchor.find(".fs-match__teams .fs-team").toArray()
    if (matchTeams.length < 2) return
    // The table-place span (#N) lives inside .fs-team for upcoming games.
    const nameOf = (team: ReturnType<typeof $>) =>
      team.find("span:not(.fs-match__place)").last().text().trim()
    const statusText = anchor.find(".fs-status").first().text().trim()
    const finished = /Final/.test(statusText)
    const time = statusText.match(/^(\d{1,2}:\d{2})$/)?.[1] ?? "00:00"
    const dateKey = fbcDateKey(
      anchor.find(".fs-match__meta span").first().text().trim()
    )
    if (!dateKey) return
    seen.add(id)
    const scores = anchor
      .find(".fs-match__scores span")
      .toArray()
      .map((score) => $(score).text().trim())
    games.push({
      id,
      dateKey,
      time,
      finished,
      decidedBy: statusText.includes("PS")
        ? "shootout"
        : statusText.includes("OT")
          ? "overtime"
          : "regulation",
      home: nameOf($(matchTeams[0])),
      away: nameOf($(matchTeams[1])),
      homeScore: finished && scores[0] ? number(scores[0]) : null,
      awayScore: finished && scores[1] ? number(scores[1]) : null,
      venue: anchor.find(".fs-match__venue").first().text().trim() || null,
    })
    registerTeam(nameOf($(matchTeams[0])), undefined)
    registerTeam(nameOf($(matchTeams[1])), undefined)
  })

  return { url, teams, teamIds, standings, games }
}

async function fetchPlayers(
  category: Category,
  teamIds: Map<string, string>
): Promise<ExternalPlayer[]> {
  const url = `${fcCategoryUrl(category.cc).replace(/\.html$/, "")}-players.html`
  const response = await fetch(url, { headers: HEADERS })
  if (!response.ok) throw new Error(`players failed: ${response.status}`)
  const $ = load(await response.text())
  const players: ExternalPlayer[] = []
  $("tr.player-search-row").each((_, row) => {
    const cells = $(row).find("td").toArray()
    if (cells.length < 7) return
    const name = $(cells[1]).text().trim()
    const externalId = ($(cells[1]).find("a").attr("href") ?? "")
      .match(/player-[0-9a-f]+\.html/)?.[0]
      ?.replace(".html", "")
    const teamId = teamIds.get(normalizeFcName($(cells[2]).text().trim()))
    if (!name || !externalId || !teamId) return
    players.push({
      externalId,
      name,
      teamExternalId: teamId,
      matches: 0,
      goals: number($(cells[3]).text()),
      assists: number($(cells[4]).text()),
      points: number($(cells[5]).text()),
      penaltyMinutes: number($(cells[6]).text()),
    })
  })
  return players
}

async function loadCategory(category: Category) {
  let parsed: FbcCategory
  try {
    parsed = await fetchCategory(category)
  } catch (error) {
    console.error(`[fc] ${category.cc}: skipped (${String(error)})`)
    return
  }
  if (parsed.standings.length === 0) {
    console.error(`[fc] ${category.cc}: skipped (no standings)`)
    return
  }

  let players: ExternalPlayer[] = []
  try {
    players = await fetchPlayers(category, parsed.teamIds)
  } catch (error) {
    console.error(`[fc] ${category.cc}: no player stats (${String(error)})`)
  }

  const games: ExternalGame[] = parsed.games
    .map((match) => ({
      externalId: match.id,
      startsAt: zonedToIso(match.dateKey, match.time),
      homeTeamId: parsed.teamIds.get(normalizeFcName(match.home)) ?? "",
      awayTeamId: parsed.teamIds.get(normalizeFcName(match.away)) ?? "",
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      status: match.finished ? ("finished" as const) : ("scheduled" as const),
      decidedBy: match.finished ? match.decidedBy : null,
      venue: match.venue,
    }))
    .filter((match) => match.homeTeamId && match.awayTeamId)

  const result = await loadExternalLeague({
    source: "fc",
    country: category.country,
    competition: {
      externalId: categoryExternalId(category.cc),
      name: category.name,
      gender: category.gender,
    },
    seasonLabel: SEASON.label,
    teams: parsed.teams,
    standings: parsed.standings,
    games,
    players,
  })
  console.log(
    `[fc] ${category.cc}: ${result.teams} teams, ${result.standings} standings, ${result.games} games, ${result.players} players`
  )
}

async function main() {
  for (const category of CATEGORIES) {
    await loadCategory(category)
  }
}

main()
