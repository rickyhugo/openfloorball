import { chromium } from "playwright-core"
import {
  loadExternalLeague,
  type ExternalGame,
  type ExternalPlayer,
  type ExternalStanding,
  type ExternalTeam,
} from "./external/load"

const BASE = "https://myapp.swissunihockey.ch"

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
  },
  {
    id: 9534,
    gender: "women" as const,
    externalId: "swiss-lupl-women",
    name: "L-UPL Damer",
  },
]

type SwissStatRow = {
  ItemID: number
  Name: string
  Details: string
  ValueColumns: Array<{ Value: string }>
}

async function fetchPlayers(
  leagueId: number,
  teamsByName: Map<string, string>
): Promise<ExternalPlayer[]> {
  const response = await fetch(
    "https://swissunihockey-api.azurewebsites.net/api/statisticstableapi/getplayerstatisticsforleague" +
      `?LeagueID=${leagueId}&PageID=0&PageSize=1000&SelectedColumnType=11`,
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
        referer: "https://myapp.swissunihockey.ch/",
        origin: "https://myapp.swissunihockey.ch",
        accept: "application/json",
      },
    }
  )
  if (!response.ok)
    throw new Error(`player stats ${leagueId} -> ${response.status}`)
  const rows = (await response.json()) as SwissStatRow[]
  return rows.flatMap((row) => {
    const teamExternalId = teamsByName.get(normalize(row.Details))
    if (!teamExternalId || row.ValueColumns.length < 4) return []
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
        penaltyMinutes: number(row.ValueColumns[4]?.Value ?? "0"),
      },
    ]
  })
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

  const players = await fetchPlayers(leagueId, teamsByName).catch((error) => {
    console.warn(`player stats ${leagueId} failed`, String(error))
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
  })
  console.log(league.name, result)
  await page.close()
  await new Promise((resolve) => setTimeout(resolve, 1000))
}

await browser.close()
