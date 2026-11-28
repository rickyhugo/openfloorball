import { load } from "cheerio"
import type {
  LiveEvent,
  LiveEventKind,
  LiveMatch,
  LiveMatches,
} from "./live-types"

// FloorballConnect backs the cz/sk/lv/de sources with static category
// pages (standings + every game) and game pages with a base64 event feed.

const FBC = "https://stats.floorballconnect.com"
const SEASON = "26-27"
const TIME_ZONE = "Europe/Stockholm"
const FBC_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
}

const COMPETITIONS: Record<"cz" | "sk" | "lv" | "de", string> = {
  cz: "ČEZ Extraliga",
  sk: "Extraliga mužov",
  lv: "ELVI līga",
  de: "1. FBL Herren",
}

// Germany's men league has no category prefix at all.
function fcCategoryUrl(source: "cz" | "sk" | "lv" | "de") {
  return `${FBC}/category/${source === "de" ? "" : `${source}-`}${SEASON}-regular-season.html`
}

const MONTHS_FBC: Record<string, number> = {
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

function dateKey(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

// Game dates render as "Sun 22 Nov" without a year. A European floorball
// season runs Jul-Dec (first year) and Jan-Jun (second year).
function fbcDateKey(value: string) {
  const match = value.match(/(\d{1,2})\s+([A-Z][a-z]{2})/)
  if (!match) return null
  const month = MONTHS_FBC[match[2]]
  if (month === undefined) return null
  const year = month >= 7 ? 2026 : 2027
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`
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

type FbcGame = {
  id: string
  href: string
  dateKey: string
  time: string
  finished: boolean
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
}

type FbcEvent = {
  minute: string
  period: number
  team: string | null
  side: "home" | "away" | "break"
  score: string | null
  event_kind: string
  title: string
  assist: string | null
  tag: string | null
}

async function fetchFcGames(source: "cz" | "sk" | "lv" | "de") {
  const response = await fetch(fcCategoryUrl(source), {
    headers: FBC_HEADERS,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`FBC category failed: ${response.status}`)
  const $ = load(await response.text())
  const games: FbcGame[] = []
  const seen = new Set<string>()
  $("#games a.fs-match").each((_, element) => {
    const anchor = $(element)
    const href = anchor.attr("href") ?? ""
    const id = href
      .split("/")
      .pop()
      ?.match(/^(\d+)-/)?.[1]
    if (!id || seen.has(id)) return
    const teams = anchor.find(".fs-match__teams .fs-team").toArray()
    if (teams.length < 2) return
    // The table-place span (#N) lives inside .fs-team for upcoming games.
    const nameOf = (team: ReturnType<typeof $>) =>
      team.find("span:not(.fs-match__place)").last().text().trim()
    const statusText = anchor.find(".fs-status").first().text().trim()
    const finished = /Final/.test(statusText)
    const scores = anchor
      .find(".fs-match__scores span")
      .toArray()
      .map((score) => $(score).text().trim())
    const time = statusText.match(/^(\d{1,2}:\d{2})$/)?.[1] ?? "00:00"
    const dateKey = fbcDateKey(
      anchor.find(".fs-match__meta span").first().text().trim()
    )
    if (!dateKey) return
    seen.add(id)
    games.push({
      id,
      href,
      dateKey,
      time,
      finished,
      home: nameOf($(teams[0])),
      away: nameOf($(teams[1])),
      homeScore: finished && scores[0] ? Number(scores[0]) : null,
      awayScore: finished && scores[1] ? Number(scores[1]) : null,
      venue: anchor.find(".fs-match__venue").first().text().trim() || null,
    })
  })
  return games
}

// Category pages are static and rebuilt in batches: 10 minute cache.
const gamesCache = new Map<
  "cz" | "sk" | "lv" | "de",
  { at: number; games: FbcGame[] }
>()

async function fcGames(source: "cz" | "sk" | "lv" | "de") {
  const cached = gamesCache.get(source)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.games
  const games = await fetchFcGames(source)
  gamesCache.set(source, { at: Date.now(), games })
  return games
}

function toSummary(game: FbcGame, source: "cz" | "sk" | "lv" | "de") {
  return {
    id: game.id,
    source,
    competition: COMPETITIONS[source],
    competitionHref: fcCategoryUrl(source),
    round: null,
    home: { name: game.home, shortName: game.home, logoUrl: null },
    away: { name: game.away, shortName: game.away, logoUrl: null },
    homeScore: game.finished ? game.homeScore : null,
    awayScore: game.finished ? game.awayScore : null,
    startsAt: zonedToIso(game.dateKey, game.time),
    timeLabel: game.time,
    status: game.finished ? ("finished" as const) : ("upcoming" as const),
  }
}

export async function getFcLiveMatches(
  source: "cz" | "sk" | "lv" | "de"
): Promise<LiveMatches> {
  const [games, today] = [await fcGames(source), dateKey(new Date())]
  return {
    date: today,
    matches: games
      .filter((game) => game.dateKey === today)
      .map((game) => toSummary(game, source))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }
}

function fcPeriodName(period: number) {
  if (period === 4) return "Förlängning"
  if (period >= 5) return "Straffar"
  return `Period ${period}`
}

function eventMinute(minute: string) {
  const [minutes, seconds] = minute.split(":").map(Number)
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0
  return minutes * 60 + seconds
}

function penaltyLabel(tag: string | null) {
  if (tag?.includes("10")) return "Utvisning 10 min"
  if (tag?.includes("5")) return "Utvisning 5 min"
  return "Utvisning 2 min"
}

function normalizeFcEvents(events: FbcEvent[]): LiveEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        (a.event.period || 1) - (b.event.period || 1) ||
        eventMinute(a.event.minute) - eventMinute(b.event.minute) ||
        a.index - b.index
    )
    .map(({ event, index }): LiveEvent => {
      const kind: LiveEventKind =
        event.event_kind === "goal"
          ? "goal"
          : event.event_kind === "penalty"
            ? "penalty"
            : event.event_kind === "break"
              ? "period"
              : "other"
      const period = event.period || 1
      const score = event.score?.match(/^(\d+):(\d+)$/)
      return {
        id: `fc-${index}`,
        kind,
        label:
          kind === "goal"
            ? event.tag === "penalty_shot"
              ? "Straffmål"
              : "Mål"
            : kind === "penalty"
              ? penaltyLabel(event.tag)
              : /End of regulation/i.test(event.title)
                ? "Ordinarie tid slut"
                : /End/i.test(event.title)
                  ? "Periodslut"
                  : event.title,
        detail:
          kind === "goal"
            ? [
                event.title.replace(/\s*bez asistence/i, "").trim() ||
                  (event.title !== "Unknown" ? event.title.trim() : null),
                event.assist && `Assist: ${event.assist}`,
              ]
                .filter(Boolean)
                .join(" · ") || null
            : kind === "penalty"
              ? event.assist || null
              : null,
        team:
          event.side === "home"
            ? "home"
            : event.side === "away"
              ? "away"
              : "neutral",
        period,
        periodName: fcPeriodName(period),
        time: event.minute,
        score: score
          ? { home: Number(score[1]), away: Number(score[2]) }
          : null,
      }
    })
}

// Game pages are only fetched for the detail view: short cache to smooth
// the 5 second client polling.
const eventsCache = new Map<string, { at: number; events: FbcEvent[] }>()

async function fcGameEvents(href: string) {
  const cached = eventsCache.get(href)
  if (cached && Date.now() - cached.at < 2_000) return cached.events
  const response = await fetch(href, {
    headers: FBC_HEADERS,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`FBC game failed: ${response.status}`)
  const encoded = (await response.text()).match(
    /data-events-b64="([^"]+)"/
  )?.[1]
  if (!encoded) {
    eventsCache.set(href, { at: Date.now(), events: [] })
    return []
  }
  const events = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8")
  ) as FbcEvent[]
  eventsCache.set(href, { at: Date.now(), events })
  return events
}

const detailCache = new Map<string, { at: number; value: LiveMatch }>()

export async function getFcLiveMatch(
  source: "cz" | "sk" | "lv" | "de",
  id: string
): Promise<LiveMatch> {
  const key = `${source}-${id}`
  const cached = detailCache.get(key)
  if (cached && Date.now() - cached.at < 2_000) return cached.value

  const game = (await fcGames(source)).find((match) => match.id === id)
  if (!game) throw new Error(`fc live match not available: ${key}`)

  const events = normalizeFcEvents(
    game.finished ? await fcGameEvents(game.href) : []
  )
  if (game.finished) {
    const finalEvent = events.at(-1)
    events.push({
      id: "fc-final",
      kind: "period",
      label: "Matchens slut",
      detail: null,
      team: "neutral",
      period: finalEvent?.period ?? 3,
      periodName: finalEvent?.periodName ?? fcPeriodName(3),
      time: "Slut",
      score: null,
    })
  }
  const last = events.at(-1)

  const value: LiveMatch = {
    ...toSummary(game, source),
    venue: game.venue,
    period: last?.period ?? 0,
    periodName: last?.periodName ?? "",
    inBreak: false,
    clock: last?.time ?? "0:00",
    lastEventAt: null,
    events,
    eventsNote: null,
  }
  detailCache.set(key, { at: Date.now(), value })
  return value
}
