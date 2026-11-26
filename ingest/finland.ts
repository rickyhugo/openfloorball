import { load as loadHtml } from "cheerio"
import { chromium } from "playwright-core"
import {
  loadExternalLeague,
  type ExternalGame,
  type ExternalStanding,
  type ExternalTeam,
} from "./external/load"

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
const COOKIE = process.env.FLIIGA_COOKIE ?? ""

async function fetchHtml(url: string) {
  if (!COOKIE) throw new Error("FLIIGA_COOKIE is required")
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://fliiga.com/",
      Cookie: COOKIE,
    },
  })
  if (!response.ok) throw new Error(`${url} -> ${response.status}`)
  return response.text()
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

function number(value: string) {
  const parsed = Number(value.replace(/[^0-9-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

function parseCookieHeader(header: string) {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, ...rest] = part.split("=")
      return { name, value: rest.join("="), domain: ".fliiga.com", path: "/" }
    })
}

function parseSchedule(html: string) {
  const $ = loadHtml(html)
  const teams = new Map<string, ExternalTeam>()
  const teamsByName = new Map<string, string>()
  const games: ExternalGame[] = []

  $(".match-card").each((_, element) => {
    const card = $(element)
    const homeId = card.attr("data-match-home-team")
    const awayId = card.attr("data-match-away-team")
    const names = card
      .find(".match-team .team-name")
      .map((_, node) => $(node).text().trim())
      .get()
    const href = card.find("a.match-link").attr("href") ?? ""
    const id =
      card.attr("data-match-id") ??
      href.match(/\/matches\/[^/]+\/([^/?#]+)/)?.[1]
    if (!id || !homeId || !awayId || names.length < 2) return

    const homeName = names[0]
    const awayName = names[1]
    for (const [teamId, name] of [
      [homeId, homeName],
      [awayId, awayName],
    ] as const) {
      teams.set(teamId, { externalId: teamId, name })
      teamsByName.set(normalize(name), teamId)
    }

    const played = card.hasClass("match-Played")
    const gameday = Number(card.attr("data-match-gameday") ?? 0)
    const startsAt = gameday
      ? new Date(gameday * 1000).toISOString()
      : new Date().toISOString()
    const homeScore = played ? number(card.find(".home-goals").text()) : null
    const awayScore = played ? number(card.find(".away-goals").text()) : null

    games.push({
      externalId: id,
      startsAt,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homeScore,
      awayScore,
      status: played ? "finished" : "scheduled",
      decidedBy: played ? "regulation" : null,
    })
  })

  return { teams, teamsByName, games }
}

async function fetchStandings(gender: "men" | "women") {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome-stable",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  })
  try {
    const context = await browser.newContext({ userAgent: UA })
    await context.addCookies(parseCookieHeader(COOKIE))
    const page = await context.newPage()
    await page.goto(`https://fliiga.com/en/statistics/${gender}/`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    })
    await page.waitForSelector("#standings table tbody tr", { timeout: 20000 })
    return await page.evaluate(() =>
      [...document.querySelectorAll("#standings table tbody tr")].map((row) =>
        [...row.querySelectorAll("td")].map((cell) =>
          (cell.textContent ?? "").trim()
        )
      )
    )
  } finally {
    await browser.close()
  }
}

function parseStandings(
  rows: string[][],
  teamsByName: Map<string, string>,
  teams: Map<string, ExternalTeam>
) {
  const standings: ExternalStanding[] = []
  for (const cells of rows) {
    if (cells.length < 11) continue
    const position = number(cells[0])
    const teamName = cells[1].replace(/\s+/g, " ").trim()
    if (!teamName) continue
    let teamId = teamsByName.get(normalize(teamName))
    if (!teamId) {
      teamId = `name-${normalize(teamName)}`
      teams.set(teamId, { externalId: teamId, name: teamName })
      teamsByName.set(normalize(teamName), teamId)
    }
    const played = number(cells[2])
    const wins = number(cells[3])
    const overtimeWins = number(cells[4])
    const overtimeLosses = number(cells[5])
    const losses = number(cells[6])
    const goalsFor = number(cells[7])
    const goalsAgainst = number(cells[8])
    const points = number(cells[10])
    if (played && played !== wins + overtimeWins + overtimeLosses + losses) {
      console.warn(`${teamName}: played ${played} != results sum`)
    }
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
  return standings
}

const leagues = [
  { gender: "men" as const, externalId: "fliiga-men", name: "F-Liiga Herrar" },
  {
    gender: "women" as const,
    externalId: "fliiga-women",
    name: "F-Liiga Damer",
  },
]

for (const league of leagues) {
  const schedule = await fetchHtml(
    `https://fliiga.com/en/matches/${league.gender}/`
  )
  const { teams, teamsByName, games } = parseSchedule(schedule)
  const standingsRows = await fetchStandings(league.gender)
  const standings = parseStandings(standingsRows, teamsByName, teams)
  const result = await loadExternalLeague({
    source: "fliiga",
    country: { id: "FI", name: "Finland" },
    competition: {
      externalId: league.externalId,
      name: league.name,
      categoryName: "F-Liiga",
      gender: league.gender,
    },
    seasonLabel: "2026/27",
    teams: [...teams.values()],
    games,
    standings,
  })
  console.log(league.name, result)
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
