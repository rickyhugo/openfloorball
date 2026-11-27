import { load } from "cheerio"
import type {
  LiveEvent,
  LiveEventKind,
  LiveMatch,
  LiveMatches,
  LiveMatchSummary,
  LiveStatus,
} from "./live-types"

const API = "https://swissunihockey-api.azurewebsites.net/api"
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
  referer: "https://myapp.swissunihockey.ch/",
  origin: "https://myapp.swissunihockey.ch",
  accept: "application/json, text/plain, */*",
}

const LEAGUES = [9380, 9534]
const FBC = "https://stats.floorballconnect.com"

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}
const FBC_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
}

type SwissGame = {
  GameID: number
  GameStatusID: number
  LeagueID: number
  LeagueName: string
  LeagueDisplayName: string
  GameRound: number | null
  GameTime: string
  HomeTeamClubName: string
  HomeTeamTeamName: string
  HomeTeamScore: string
  HomeTeamClubLogoURL: string | null
  AwayTeamClubName: string
  AwayTeamTeamName: string
  AwayTeamScore: string
  AwayTeamClubLogoURL: string | null
  Cancelled: boolean
  Interrupted: boolean
  Postponed: boolean
  HideResult: boolean
}

type SwissEvent = {
  EREventID: number
  TypeID: number
  Text: string
  ShortText: string
  GameMinute: string
  Score: string | null
  IsAwayTeamAction: boolean
  IsGoal: boolean
  IsPeriodStart: boolean
  IsPeriodEnd: boolean
  IsGameEnd: boolean
  Period: number
  ClubDisplayName: string | null
  DetailsText: string
  InsertTime: string
}

type SwissTimelineItem = {
  LiveTimeItemID: number
  LiveTimelineItemTypeID: number
  InsertTime: string
  EREventInfo?: SwissEvent
}

type SwissGameHeader = {
  GameID: number
  GameStatusID: number
  LeagueID: number
  LeagueName: string
  LeagueDisplayName: string
  GameRound: number | null
  GameTime: string
  HomeTeamClubName: string
  HomeTeamTeamName: string
  HomeTeamScore: string
  HomeTeamClubLogoURL: string | null
  AwayTeamClubName: string
  AwayTeamTeamName: string
  AwayTeamScore: string
  AwayTeamClubLogoURL: string | null
  ArenaName: string | null
  Cancelled: boolean
  Interrupted: boolean
  Postponed: boolean
  HideResult: boolean
  LatestEventTime: string | null
  LatestReportedGameClockSecond: number
  Period: number | null
  ClockIsRunning: boolean
}

type SwissGameView = {
  GameHeaderInfo: SwissGameHeader
}

type SwissTimeline = {
  GameHeaderInfo: SwissGameHeader
  TimelineBlurbs?: SwissTimelineItem[]
}

async function swissGet<T>(
  path: string,
  params: Record<string, string | number> = {}
) {
  const url = new URL(API + path)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  const response = await fetch(url, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) {
    throw new Error(`swiss ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

function statusOf(game: SwissGame | SwissGameHeader): LiveStatus {
  if (game.Cancelled || game.Interrupted) return "cancelled"
  if (game.GameStatusID === 2) return "live"
  if (game.GameStatusID === 3 || game.GameStatusID === 4) return "finished"
  return "upcoming"
}

function dateKey(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value))
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
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

function fbcDateKey(value: string) {
  const match = value.match(/(\d{1,2})\s+([A-Z][a-z]{2})/)
  if (!match) return null
  const day = Number(match[1])
  const month = MONTHS_FBC[match[2]]
  if (month === undefined) return null
  const year = month >= 7 ? 2026 : 2027
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function fbcCategory(leagueId: number) {
  return `${FBC}/category/${leagueId === 9534 ? "chw" : "ch"}-26-27-regular-season.html`
}

const fbcIndexCache = new Map<
  number,
  { at: number; map: Map<string, string> }
>()

async function fbcIndex(leagueId: number) {
  const cached = fbcIndexCache.get(leagueId)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.map
  const response = await fetch(fbcCategory(leagueId), {
    headers: FBC_HEADERS,
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`FBC category failed: ${response.status}`)
  const $ = load(await response.text())
  const map = new Map<string, string>()
  $("a.fs-match").each((_, element) => {
    const href = $(element).attr("href")
    const dateText = $(element)
      .find(".fs-match__meta span")
      .first()
      .text()
      .trim()
    const teams = $(element)
      .find(".fs-team")
      .toArray()
      .map((team) => $(team).find("span").last().text().trim())
    const date = fbcDateKey(dateText)
    if (!href || !date || teams.length < 2) return
    map.set(`${normalize(teams[0])}|${normalize(teams[1])}|${date}`, href)
  })
  fbcIndexCache.set(leagueId, { at: Date.now(), map })
  return map
}

const fbcEventCache = new Map<string, { at: number; events: FbcEvent[] }>()

async function fbcEvents(header: SwissGameHeader) {
  if (![9380, 9534].includes(header.LeagueID)) return null
  const key = `${normalize(header.HomeTeamClubName)}|${normalize(header.AwayTeamClubName)}|${dateKey(header.GameTime, "Europe/Zurich")}`
  const href = (await fbcIndex(header.LeagueID)).get(key)
  if (!href) return null
  const cached = fbcEventCache.get(href)
  if (cached && Date.now() - cached.at < 5_000) return cached.events
  const response = await fetch(href, {
    headers: FBC_HEADERS,
    cache: "no-store",
  })
  if (!response.ok) return null
  const html = await response.text()
  const encoded = html.match(/data-events-b64="([^"]+)"/)?.[1]
  if (!encoded) return null
  const events = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8")
  ) as FbcEvent[]
  fbcEventCache.set(href, { at: Date.now(), events })
  return events
}

function normalizeFbcEvents(events: FbcEvent[]): LiveEvent[] {
  return events.map((event, index) => {
    const score = event.score?.match(/^(\d+):(\d+)$/)
    const kind: LiveEventKind =
      event.event_kind === "goal"
        ? "goal"
        : event.event_kind === "penalty"
          ? "penalty"
          : event.event_kind === "timeout"
            ? "timeout"
            : event.event_kind.startsWith("goalie")
              ? "goalie"
              : "period"
    const label =
      event.event_kind === "goal"
        ? event.tag === "penalty_shot"
          ? "Straffmål"
          : "Mål"
        : event.event_kind === "penalty"
          ? event.tag?.includes("5")
            ? "Utvisning 5 min"
            : event.tag?.includes("10")
              ? "Utvisning 10 min"
              : "Utvisning 2 min"
          : event.title.includes("End of regulation")
            ? "Ordinarie tid slut"
            : event.title.includes("End")
              ? "Periodslut"
              : event.title
    const detail =
      event.event_kind === "goal"
        ? [
            event.title !== "Unknown" ? event.title : null,
            event.assist && `Assist: ${event.assist}`,
          ]
            .filter(Boolean)
            .join(" · ") || null
        : event.event_kind === "penalty"
          ? event.assist || null
          : null
    return {
      id: `fbc-${index}`,
      kind,
      label,
      detail,
      team:
        event.side === "home"
          ? "home"
          : event.side === "away"
            ? "away"
            : "neutral",
      period: event.period || 1,
      periodName: swissPeriodName(event.period || 1),
      time: event.minute,
      score: score ? { home: Number(score[1]), away: Number(score[2]) } : null,
    }
  })
}

function swissPeriodName(period: number) {
  if (period === 4) return "Förlängning"
  if (period >= 5) return "Straffar"
  return `Period ${period}`
}

function eventKind(event: SwissEvent): LiveEventKind {
  if (event.IsGoal) return "goal"
  if (/penalty|utvisning/i.test(event.ShortText)) return "penalty"
  if (/timeout|time out/i.test(event.ShortText)) return "timeout"
  if (event.IsPeriodStart || event.IsPeriodEnd) return "period"
  return "other"
}

function eventLabel(event: SwissEvent) {
  if (event.IsGoal) return "Mål"
  if (/penalty/i.test(event.ShortText)) return "Utvisning"
  if (event.IsGameEnd) return "Matchens slut"
  if (event.IsPeriodStart) return "Periodstart"
  if (event.IsPeriodEnd) return "Periodslut"
  return event.ShortText || event.Text
}

function periodMinute(gameMinute: string, period: number) {
  const [minutesRaw, secondsRaw] = gameMinute.split(":")
  const minutes = Number(minutesRaw)
  const seconds = Number(secondsRaw)
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return "0:00"
  const inPeriod =
    period >= 1 && period <= 3
      ? Math.max(0, minutes - (period - 1) * 20)
      : minutes
  return `${inPeriod}:${String(seconds).padStart(2, "0")}`
}

function eventTeam(header: SwissGameHeader, event: SwissEvent) {
  if (event.IsAwayTeamAction) return "away" as const
  if (
    event.ClubDisplayName &&
    event.ClubDisplayName === header.HomeTeamClubName
  )
    return "home" as const
  if (
    event.ClubDisplayName &&
    event.ClubDisplayName === header.AwayTeamClubName
  )
    return "away" as const
  return "neutral" as const
}

function parseScore(value: string | null) {
  if (!value) return null
  const match = value.match(/(\d+)\s*-\s*(\d+)/)
  if (!match) return null
  return { home: Number(match[1]), away: Number(match[2]) }
}

function normalizeEvents(
  header: SwissGameHeader,
  items: SwissTimelineItem[]
): LiveEvent[] {
  const events = items
    .filter(
      (item) =>
        item.LiveTimelineItemTypeID === 1 &&
        item.EREventInfo &&
        !/player of the match/i.test(item.EREventInfo.ShortText)
    )
    .map((item) => {
      const event = item.EREventInfo!
      const kind = eventKind(event)
      return {
        event: {
          id: event.EREventID || item.LiveTimeItemID,
          kind,
          label: eventLabel(event),
          detail:
            event.DetailsText?.replace(/, assist /i, " · Assist: ").trim() ||
            null,
          team: eventTeam(header, event),
          period: event.Period || 1,
          periodName: swissPeriodName(event.Period || 1),
          time: periodMinute(event.GameMinute, event.Period || 1),
          score: kind === "goal" ? parseScore(event.Score) : null,
        },
        sort: `${String(event.Period || 1).padStart(2, "0")} ${event.GameMinute} ${event.InsertTime}`,
      }
    })
    .sort((a, b) => a.sort.localeCompare(b.sort))
  return events.map(({ event }) => event)
}

function toSummary(game: SwissGame): LiveMatchSummary {
  const status = statusOf(game)
  return {
    id: String(game.GameID),
    source: "ch",
    competition: game.LeagueDisplayName || game.LeagueName,
    competitionHref: `https://myapp.swissunihockey.ch/league/${game.LeagueID}`,
    round: game.GameRound ? `Omgång ${game.GameRound}` : null,
    home: {
      name: game.HomeTeamClubName,
      shortName: game.HomeTeamClubName,
      logoUrl: game.HomeTeamClubLogoURL,
    },
    away: {
      name: game.AwayTeamClubName,
      shortName: game.AwayTeamClubName,
      logoUrl: game.AwayTeamClubLogoURL,
    },
    homeScore:
      status === "upcoming" || game.HideResult
        ? null
        : Number(game.HomeTeamScore),
    awayScore:
      status === "upcoming" || game.HideResult
        ? null
        : Number(game.AwayTeamScore),
    startsAt: game.GameTime,
    timeLabel: timeLabel(game.GameTime),
    status,
  }
}

function toLiveMatch(
  header: SwissGameHeader,
  timeline: SwissTimelineItem[],
  fbc: FbcEvent[] | null
): LiveMatch {
  const summary = toSummary(header as SwissGame)
  const events = fbc?.length
    ? normalizeFbcEvents(fbc)
    : normalizeEvents(header, timeline)
  if (fbc?.length && summary.status === "finished") {
    const finalEvent = events.at(-1)
    events.push({
      id: "fbc-final",
      kind: "period",
      label: "Matchens slut",
      detail: null,
      team: "neutral",
      period: finalEvent?.period ?? 5,
      periodName: finalEvent?.periodName ?? "Straffar",
      time: "Slut",
      score: null,
    })
  }
  const last = events.at(-1)
  const period = last?.period ?? header.Period ?? 0
  const clock = last?.time ?? "0:00"
  return {
    ...summary,
    venue: header.ArenaName?.trim() || null,
    period,
    periodName: period ? swissPeriodName(period) : "",
    inBreak:
      summary.status === "live" &&
      (last?.label === "Periodslut" || last?.label === "Ordinarie tid slut"),
    clock,
    lastEventAt: header.LatestEventTime,
    events,
    eventsNote: fbc?.length ? null : "Visar de senaste händelserna.",
  }
}

let listCache: { at: number; value: LiveMatches } | null = null

export async function getSwissLiveMatches(): Promise<LiveMatches> {
  if (listCache && Date.now() - listCache.at < 5_000) return listCache.value
  const requests = await Promise.allSettled(
    LEAGUES.flatMap((league) => [
      swissGet<SwissGame[]>("/leagueapi/getcomingleaguegames", {
        LeagueID: league,
        LastGameID: 0,
      }),
      swissGet<SwissGame[]>("/leagueapi/getpreviousleaguegames", {
        LeagueID: league,
        LastGameID: 0,
      }),
    ])
  )
  const games = new Map<number, SwissGame>()
  let failures = 0
  for (const request of requests) {
    if (request.status === "fulfilled") {
      for (const game of request.value) games.set(game.GameID, game)
    } else {
      failures++
    }
  }
  if (failures === requests.length) {
    throw new Error("all Swiss live requests failed")
  }

  const today = dateKey(new Date(), "Europe/Stockholm")
  const now = Date.now()
  const matches = [...games.values()]
    .filter((game) => {
      const status = statusOf(game)
      if (status === "live") return true
      if (dateKey(game.GameTime, "Europe/Stockholm") === today) return true
      return Math.abs(new Date(game.GameTime).getTime() - now) < 6 * 60 * 60_000
    })
    .map(toSummary)
    .sort((a, b) => {
      const rank: Record<LiveStatus, number> = {
        live: 0,
        upcoming: 1,
        finished: 2,
        cancelled: 3,
      }
      if (rank[a.status] !== rank[b.status])
        return rank[a.status] - rank[b.status]
      if (a.status === "finished") return b.startsAt.localeCompare(a.startsAt)
      return a.startsAt.localeCompare(b.startsAt)
    })
  const value = { date: today, matches }
  listCache = { at: Date.now(), value }
  return value
}

const detailCache = new Map<string, { at: number; value: LiveMatch }>()

export async function getSwissLiveMatch(id: string): Promise<LiveMatch> {
  const cached = detailCache.get(id)
  if (cached && Date.now() - cached.at < 2_000) return cached.value
  const [view, timeline] = await Promise.all([
    swissGet<SwissGameView>("/followgameapi/initgameview", { GameID: id }),
    swissGet<SwissTimeline>("/followgameapi/initpubliclivetimelineblurbs", {
      GameID: id,
      SharedSecret: "THIS_IS_MAGIC_VALUE",
    }),
  ])
  const fbc = await fbcEvents(view.GameHeaderInfo).catch((error) => {
    console.error("swiss detailed events failed", id, error)
    return null
  })
  const value = toLiveMatch(
    view.GameHeaderInfo,
    timeline.TimelineBlurbs ?? [],
    fbc
  )
  detailCache.set(id, { at: Date.now(), value })
  return value
}
