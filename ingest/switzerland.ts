import { chromium } from "playwright-core"
import {
  loadExternalLeague,
  type ExternalGame,
  type ExternalGoalie,
  type ExternalPlayer,
  type ExternalStanding,
  type ExternalTeam,
} from "./external/load"

const BASE = "https://myapp.swissunihockey.ch"

const API_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
  referer: "https://myapp.swissunihockey.ch/",
  origin: "https://myapp.swissunihockey.ch",
  accept: "application/json",
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function teamName(value: string) {
  return value.replace(/\s*\([^)]*\)\s*$/, "").trim()
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

function parseSwissDate(value: string | null) {
  if (!value) return null
  const match = value.match(
    /([A-Z][a-z]{2}) ([A-Z][a-z]{2}) (\d{1,2}) (\d{1,2}):(\d{2}) (AM|PM) GMT([+-]\d+)/
  )
  if (!match) return null
  const [, , monthName, dayRaw, hourRaw, minuteRaw, meridiem, offsetRaw] = match
  const month = MONTHS[monthName]
  if (month === undefined) return null
  const year = month >= 7 ? 2026 : 2027
  let hour = Number(hourRaw) % 12
  if (meridiem === "PM") hour += 12
  const offset = Number(offsetRaw)
  const utc = Date.UTC(
    year,
    month,
    Number(dayRaw),
    hour - offset,
    Number(minuteRaw)
  )
  return new Date(utc).toISOString()
}

function swissDateKey(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value))
}

type SwissApiGame = {
  GameID: number
  GameTime: string
  HomeTeamClubName: string
  AwayTeamClubName: string
}

async function gameIdMap(leagueId: number) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
    referer: "https://myapp.swissunihockey.ch/",
    origin: "https://myapp.swissunihockey.ch",
    accept: "application/json",
  }
  const rows: SwissApiGame[] = []
  for (const path of ["getcomingleaguegames", "getpreviousleaguegames"]) {
    let lastGameId = 0
    for (let page = 0; page < 20; page++) {
      const response = await fetch(
        `https://swissunihockey-api.azurewebsites.net/api/leagueapi/${path}?LeagueID=${leagueId}&LastGameID=${lastGameId}`,
        { headers }
      )
      if (!response.ok) break
      const pageRows = (await response.json()) as SwissApiGame[]
      if (pageRows.length === 0) break
      rows.push(...pageRows)
      const next = pageRows[pageRows.length - 1]?.GameID ?? lastGameId
      if (next === lastGameId) break
      lastGameId = next
    }
  }
  return new Map(
    rows.map((row) => [
      `${normalize(row.HomeTeamClubName)}|${normalize(row.AwayTeamClubName)}|${swissDateKey(row.GameTime)}`,
      row.GameID,
    ])
  )
}

async function readStandings(page: import("playwright-core").Page) {
  await page.waitForSelector("table tbody tr", { timeout: 20000 })
  return await page.evaluate(() => {
    const table = document.querySelector("table")
    if (!table) return []
    return [...table.querySelectorAll("tbody tr")].map((row) =>
      [...row.querySelectorAll("td")].map((cell) =>
        (cell.textContent ?? "").trim()
      )
    )
  })
}

async function readGames(
  page: import("playwright-core").Page,
  leagueId: number,
  tab: "Previous" | "Upcoming"
) {
  await page.goto(`${BASE}/league/${leagueId}/fixtures`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  })
  await page.waitForTimeout(2500)
  const radio = page.getByLabel(tab, { exact: true }).first()
  if (await radio.count()) {
    await radio.check({ force: true })
    await page.waitForTimeout(2500)
  }
  // The schedule is an infinite list: scroll until the card count stops growing.
  let previous = -1
  for (let attempt = 0; attempt < 25; attempt++) {
    const count = await page
      .locator("li")
      .filter({ has: page.locator(".text-score-medium") })
      .count()
    if (count === previous) break
    previous = count
    await page.mouse.wheel(0, 6000)
    await page.waitForTimeout(1200)
  }
  return await page.evaluate(() =>
    [...document.querySelectorAll("li")]
      .filter((item) => item.querySelector(".text-score-medium"))
      .map((item) => {
        const names = [...item.querySelectorAll("p.text-heading-medium")].map(
          (node) => (node.textContent ?? "").trim()
        )
        const score =
          item.querySelector(".text-score-medium")?.textContent?.trim() ?? null
        const status =
          item
            .querySelector("p.text-caption-medium.text-content-default")
            ?.textContent?.trim() ?? null
        const captions = [...item.querySelectorAll("p")]
          .map((node) => (node.textContent ?? "").trim())
          .filter(Boolean)
        const date =
          captions.find((text) =>
            /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}/.test(text)
          ) ?? null
        const time =
          captions.find((text) => /^\d{1,2}:\d{2} (AM|PM)$/.test(text)) ?? null
        const offset =
          captions.find((text) => /^GMT[+-]\d+$/.test(text)) ?? null
        const venue =
          item.querySelector("[title]")?.getAttribute("title") ?? null
        return { names, score, status, date, time, offset, venue }
      })
  )
}

const leagues = [
  {
    id: 9380,
    gender: "men" as const,
    externalId: "swiss-lupl-men",
    name: "L-UPL Herrar",
    fcCategory: "ch-26-27-regular-season",
  },
  {
    id: 9534,
    gender: "women" as const,
    externalId: "swiss-lupl-women",
    name: "L-UPL Damer",
    fcCategory: "chw-26-27-regular-season",
  },
]

type SwissStatRow = {
  ItemID: number
  Name: string
  Details: string
  ValueColumns: Array<{ Value: string }>
}

// The myapp Pen column is 0 for every player, so real penalty minutes come
// from the FloorballConnect league players tables. Match by name, using the
// team only to break ties when the same name appears on two teams.
type FcPlayerRow = { name: string; team: string; pim: number }

async function fetchFloorballConnectPims(
  category: string
): Promise<Map<string, FcPlayerRow[]>> {
  const response = await fetch(
    `https://stats.floorballconnect.com/category/${category}-players.html`,
    { headers: { "user-agent": API_HEADERS["user-agent"] } }
  )
  if (!response.ok)
    throw new Error(`floorballconnect ${category} -> ${response.status}`)
  const html = await response.text()
  const pims = new Map<string, FcPlayerRow[]>()
  for (const match of html.matchAll(
    /data-player-name="([^"]*)"\s*data-team-name="([^"]*)"([\s\S]*?)<\/tr>/g
  )) {
    const cells = [...match[3].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      (cell) => cell[1].replace(/<[^>]*>/g, "").trim()
    )
    const pim = Number(cells[cells.length - 1])
    if (!Number.isFinite(pim)) continue
    const key = normalize(match[1])
    const row = { name: match[1], team: match[2], pim }
    const existing = pims.get(key)
    if (existing) existing.push(row)
    else pims.set(key, [row])
  }
  return pims
}

function fcPenaltyMinutes(
  pims: Map<string, FcPlayerRow[]>,
  name: string,
  team: string
): number | null {
  const candidates = pims.get(normalize(name))
  if (!candidates) return null
  const onTeam = candidates.filter(
    (row) => normalize(row.team) === normalize(team)
  )
  const usable = onTeam.length > 0 ? onTeam : candidates
  return usable.length === 1 ? usable[0].pim : null
}

type SwissGoalieRow = {
  ItemID: number
  Name: string
  Details: string
  ValueColumns: Array<{ Value: string }>
}

async function fetchGoalies(
  leagueId: number,
  teamsByName: Map<string, string>
): Promise<ExternalGoalie[]> {
  const response = await fetch(
    "https://swissunihockey-api.azurewebsites.net/api/statisticstableapi/initgoalkeepercleansheetstatisticsforleague" +
      `?LeagueID=${leagueId}`,
    { headers: API_HEADERS }
  )
  if (!response.ok)
    throw new Error(`goalie stats ${leagueId} -> ${response.status}`)
  const table = (await response.json()) as { Rows: SwissGoalieRow[] }
  let unknownTeams = 0
  const goalies = table.Rows.flatMap((row) => {
    const teamExternalId = teamsByName.get(normalize(row.Details))
    if (!teamExternalId) {
      unknownTeams++
      return []
    }
    return [
      {
        externalId: String(row.ItemID),
        name: row.Name,
        teamExternalId,
        imageUrl: null,
        matches: number(row.ValueColumns[0]?.Value ?? "0"),
        shotsAgainst: null,
        goalsAgainst: null,
        savePercentage: null,
        cleanSheets: number(row.ValueColumns[1]?.Value ?? "0"),
      },
    ]
  })
  if (unknownTeams) {
    console.warn(
      `goalie stats ${leagueId}: ${unknownTeams} rows without a known team`
    )
  }
  return goalies
}

async function fetchPlayers(
  leagueId: number,
  fcCategory: string,
  teamsByName: Map<string, string>
): Promise<ExternalPlayer[]> {
  const response = await fetch(
    "https://swissunihockey-api.azurewebsites.net/api/statisticstableapi/getplayerstatisticsforleague" +
      `?LeagueID=${leagueId}&PageID=0&PageSize=1000&SelectedColumnType=11`,
    { headers: API_HEADERS }
  )
  if (!response.ok)
    throw new Error(`player stats ${leagueId} -> ${response.status}`)
  const rows = (await response.json()) as SwissStatRow[]
  const pims = await fetchFloorballConnectPims(fcCategory).catch((error) => {
    console.warn(`floorballconnect ${fcCategory} failed`, String(error))
    return new Map<string, FcPlayerRow[]>()
  })
  let matched = 0
  const players = rows.flatMap((row) => {
    const teamExternalId = teamsByName.get(normalize(row.Details))
    if (!teamExternalId || row.ValueColumns.length < 4) return []
    const pim = fcPenaltyMinutes(pims, row.Name, row.Details)
    if (pim !== null) matched++
    return [
      {
        externalId: String(row.ItemID),
        name: row.Name,
        teamExternalId,
        imageUrl: null,
        matches: number(row.ValueColumns[0].Value),
        goals: number(row.ValueColumns[1].Value),
        assists: number(row.ValueColumns[2].Value),
        points: number(row.ValueColumns[3].Value),
        penaltyMinutes: pim ?? number(row.ValueColumns[4]?.Value ?? "0"),
      },
    ]
  })
  console.log(
    `PIM ${fcCategory}: ${matched}/${rows.length} myapp rows matched from ${pims.size} FloorballConnect names`
  )
  return players
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome-stable",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
})

for (const league of leagues) {
  const leagueId = league.id
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  await page.goto(`${BASE}/league/${leagueId}/table`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  })
  await page.waitForTimeout(2500)
  const tableRows = await readStandings(page)

  const teams = new Map<string, ExternalTeam>()
  const teamsByName = new Map<string, string>()
  const addTeam = (rawName: string) => {
    const name = teamName(rawName)
    if (!name) return null
    const key = normalize(name)
    const existing = teamsByName.get(key)
    if (existing) return existing
    const externalId = `ch-${key}`
    teams.set(externalId, { externalId, name })
    teamsByName.set(key, externalId)
    return externalId
  }

  const standings: ExternalStanding[] = []
  for (const cells of tableRows) {
    if (cells.length < 12) continue
    const position = number(cells[0])
    const name = cells[1]
    const teamId = addTeam(name)
    if (!teamId) continue
    const played = number(cells[2])
    const points = number(cells[5])
    const [goalsFor, goalsAgainst] = cells[6].split("-").map(number)
    const wins = number(cells[7])
    const overtimeWins = number(cells[9])
    const overtimeLosses = number(cells[10])
    const losses = number(cells[11])
    standings.push({
      teamId,
      position,
      played,
      wins,
      overtimeWins,
      overtimeLosses,
      losses,
      goalsFor,
      goalsAgainst,
      points,
    })
  }

  const apiGameIds = await gameIdMap(leagueId)
  let unmatchedGames = 0
  const games: ExternalGame[] = []
  for (const tab of ["Previous", "Upcoming"] as const) {
    const cards = await readGames(page, leagueId, tab)
    for (const card of cards) {
      if (card.names.length < 2) continue
      const homeId = addTeam(card.names[0])
      const awayId = addTeam(card.names[1])
      if (!homeId || !awayId) continue
      const startsAt = parseSwissDate(
        [card.date, card.time, card.offset].filter(Boolean).join(" ")
      )
      if (!startsAt) continue
      const score = card.score?.match(/(\d+)\s*-\s*(\d+)/)
      const played = tab === "Previous" && Boolean(score)
      const statusText = card.status ?? ""
      const decidedBy = /pen|straff/i.test(statusText)
        ? "shootout"
        : /ot|verl/i.test(statusText)
          ? "overtime"
          : played
            ? "regulation"
            : null
      const apiId = apiGameIds.get(
        `${normalize(card.names[0])}|${normalize(card.names[1])}|${swissDateKey(startsAt)}`
      )
      if (!apiId) unmatchedGames++
      const externalId = apiId
        ? String(apiId)
        : `ch-${leagueId}-${startsAt.slice(0, 10)}-${homeId}-${awayId}`
      games.push({
        externalId,
        startsAt,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: played ? Number(score![1]) : null,
        awayScore: played ? Number(score![2]) : null,
        status: played ? "finished" : "scheduled",
        decidedBy,
        venue: card.venue,
      })
    }
  }

  const players = await fetchPlayers(
    leagueId,
    league.fcCategory,
    teamsByName
  ).catch((error) => {
    console.warn(`player stats ${leagueId} failed`, String(error))
    return []
  })
  const goalies = await fetchGoalies(leagueId, teamsByName).catch((error) => {
    console.warn(`goalie stats ${leagueId} failed`, String(error))
    return []
  })

  if (unmatchedGames) {
    console.warn(`${league.name}: ${unmatchedGames} games without an API id`)
  }

  // Deduplicate games by external id, keeping a finished row over a scheduled one.
  const gameMap = new Map<string, ExternalGame>()
  for (const game of games) {
    const current = gameMap.get(game.externalId)
    if (
      !current ||
      (current.status === "scheduled" && game.status === "finished")
    ) {
      gameMap.set(game.externalId, game)
    }
  }

  const result = await loadExternalLeague({
    source: "swissunihockey",
    country: { id: "CH", name: "Schweiz" },
    competition: {
      externalId: league.externalId,
      name: league.name,
      categoryName: "Lidl Unihockey Prime League",
      gender: league.gender,
    },
    seasonLabel: "2026/27",
    teams: [...teams.values()],
    games: [...gameMap.values()],
    standings,
    players,
    goalies,
  })
  console.log(`${league.name}: ${goalies.length} goalies`, result)
  await page.close()
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

await browser.close()
