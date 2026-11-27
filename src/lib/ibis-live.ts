import { createHash, createHmac, randomUUID } from "node:crypto"
import type {
  LiveEvent,
  LiveEventKind,
  LiveMatch,
  LiveMatches,
  LiveMatchSummary,
  LiveStatus,
} from "./live-types"

const API = "https://api.innebandy.se"
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
const BASE_HEADERS = {
  "user-agent": USER_AGENT,
  referer: "https://stats.innebandy.se/",
  accept: "application/json, text/plain, */*",
}

type IbisMatchEvent = {
  MatchEventID: number
  MatchEventType: string
  MatchTeamID: number
  Period: number
  PeriodName: string
  Minute: number
  Second: number
  PlayerName: string
  PlayerAssistName: string
  PenaltyName: string
  GoalsHomeTeam: number | null
  GoalsAwayTeam: number | null
  CreatedTS: string
}

type IbisMatch = {
  MatchID: number
  CompetitionID: number
  CompetitionName: string
  MatchDateTime: string
  MatchStatus: number
  HasFinalResult: boolean
  Cancelled: boolean
  Postponed: boolean
  Abandoned: boolean
  HomeTeam: string
  HomeTeamShortName: string
  HomeTeamLogotypeUrl: string | null
  AwayTeam: string
  AwayTeamShortName: string
  AwayTeamLogotypeUrl: string | null
  GoalsHomeTeam: number | null
  GoalsAwayTeam: number | null
  HomeMatchTeamID: number
  AwayMatchTeamID: number
  RoundName: string | null
  Venue: string | null
  Events?: IbisMatchEvent[]
  ShotsOnGoal?: Array<{
    Period: number
    ShotsHomeTeam: number
    ShotsAwayTeam: number
  }>
}

type IbisMatchGroup = {
  Matches?: IbisMatch[]
}

type Session = {
  token: string
  secret: string
  cookie: string
  offset: number
  expiresAt: number
}

let session: Session | null = null
let sessionPromise: Promise<Session> | null = null

async function createSession(): Promise<Session> {
  const startResponse = await fetch(`${API}/v2/api/auth/startkit`, {
    headers: BASE_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!startResponse.ok) {
    throw new Error(`iBIS startkit failed: ${startResponse.status}`)
  }
  const start = (await startResponse.json()) as {
    accessToken: string
    accessTokenExpiration?: string
  }

  const handshakeResponse = await fetch(`${API}/v2/api/auth/handshake`, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      authorization: `Bearer ${start.accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!handshakeResponse.ok) {
    throw new Error(`iBIS handshake failed: ${handshakeResponse.status}`)
  }
  const handshake = (await handshakeResponse.json()) as {
    ss: string
    st: number
  }

  const cookies = handshakeResponse.headers.getSetCookie?.() ?? []
  const cookie = cookies.map((value) => value.split(";")[0]).join("; ")
  const expiresAt = start.accessTokenExpiration
    ? Date.parse(start.accessTokenExpiration) - 60_000
    : Date.now() + 25 * 60_000

  return {
    token: start.accessToken,
    secret: handshake.ss,
    cookie,
    offset: handshake.st - Date.now(),
    expiresAt,
  }
}

async function getSession(force = false): Promise<Session> {
  if (force) {
    session = null
    sessionPromise = null
  }
  if (session && session.expiresAt > Date.now()) return session
  if (!sessionPromise) {
    sessionPromise = createSession()
      .then((created) => {
        session = created
        return created
      })
      .finally(() => {
        sessionPromise = null
      })
  }
  return sessionPromise
}

async function signedGet<T>(path: string, retry = true): Promise<T> {
  const current = await getSession()
  const timestamp = String(Date.now() + current.offset)
  const nonce = randomUUID()
  const bodyHash = createHash("sha256").update("").digest("hex")
  const signature = createHmac("sha256", current.secret)
    .update(["GET", path, timestamp, nonce, bodyHash].join("\n"))
    .digest("hex")

  const response = await fetch(API + path, {
    headers: {
      ...BASE_HEADERS,
      cookie: current.cookie,
      authorization: `Bearer ${current.token}`,
      "x-nonce": nonce,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })

  if (response.status === 401 && retry) {
    await getSession(true)
    return signedGet<T>(path, false)
  }
  if (!response.ok) {
    throw new Error(`iBIS ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

export async function ibisGet<T>(path: string): Promise<T> {
  return signedGet<T>(path)
}

function statusOf(match: IbisMatch): LiveStatus {
  if (match.Cancelled || match.Abandoned) return "cancelled"
  if (match.HasFinalResult || match.MatchStatus === 4) return "finished"
  if (
    match.MatchStatus === 2 ||
    match.MatchStatus === 3 ||
    match.GoalsHomeTeam !== null
  ) {
    return "live"
  }
  return "upcoming"
}

function eventKind(type: string): LiveEventKind {
  if (type === "Mål" || type.startsWith("Straffmål")) return "goal"
  if (type === "Utvisning") return "penalty"
  if (type.startsWith("Time Out")) return "timeout"
  if (type.startsWith("Målvakt")) return "goalie"
  if (type === "Periodstart" || type === "Periodslut") return "period"
  return "other"
}

function eventTeam(match: IbisMatch, event: IbisMatchEvent) {
  if (event.MatchEventType.includes("Hemma")) return "home" as const
  if (event.MatchEventType.includes("Borta")) return "away" as const
  if (event.MatchTeamID === match.HomeMatchTeamID) return "home" as const
  if (event.MatchTeamID === match.AwayMatchTeamID) return "away" as const
  return "neutral" as const
}

function clockOf(event: IbisMatchEvent) {
  return `${event.Minute}:${String(event.Second).padStart(2, "0")}`
}

function normalizeEvents(match: IbisMatch): LiveEvent[] {
  return [...(match.Events ?? [])]
    .sort(
      (a, b) =>
        a.Period - b.Period ||
        a.Minute - b.Minute ||
        a.Second - b.Second ||
        a.MatchEventID - b.MatchEventID
    )
    .map((event) => {
      const kind = eventKind(event.MatchEventType)
      const detail =
        kind === "penalty"
          ? event.PenaltyName || null
          : kind === "goal"
            ? [
                event.PlayerName,
                event.PlayerAssistName && `Assist: ${event.PlayerAssistName}`,
              ]
                .filter(Boolean)
                .join(" · ") || null
            : event.PlayerName || event.PenaltyName || null
      return {
        id: event.MatchEventID,
        kind,
        label: event.MatchEventType,
        detail,
        team: eventTeam(match, event),
        period: event.Period,
        periodName: event.PeriodName,
        time: clockOf(event),
        score:
          kind === "goal" &&
          event.GoalsHomeTeam !== null &&
          event.GoalsAwayTeam !== null
            ? { home: event.GoalsHomeTeam, away: event.GoalsAwayTeam }
            : null,
      }
    })
}

function periodState(events: LiveEvent[]) {
  let period = 0
  let periodName = ""
  let inBreak = false
  let clock = "0:00"
  for (const event of events) {
    if (event.period > period) {
      period = event.period
      periodName = event.periodName
    }
    if (event.label === "Periodstart") {
      period = event.period
      periodName = event.periodName
      inBreak = false
    }
    if (event.label === "Periodslut") {
      period = event.period
      periodName = event.periodName
      inBreak = true
    }
    clock = event.time
  }
  return { period, periodName, inBreak, clock }
}

function toSummary(match: IbisMatch): LiveMatchSummary {
  const status = statusOf(match)
  return {
    id: String(match.MatchID),
    source: "se",
    competition: match.CompetitionName,
    competitionHref: `/serie/${match.CompetitionID}`,
    round: match.RoundName ?? null,
    home: {
      name: match.HomeTeam,
      shortName: match.HomeTeamShortName,
      logoUrl: match.HomeTeamLogotypeUrl,
    },
    away: {
      name: match.AwayTeam,
      shortName: match.AwayTeamShortName,
      logoUrl: match.AwayTeamLogotypeUrl,
    },
    homeScore: status === "upcoming" ? null : match.GoalsHomeTeam,
    awayScore: status === "upcoming" ? null : match.GoalsAwayTeam,
    startsAt: match.MatchDateTime,
    timeLabel: match.MatchDateTime.slice(11, 16),
    status,
  }
}

function toLiveMatch(match: IbisMatch): LiveMatch {
  const summary = toSummary(match)
  const events = normalizeEvents(match)
  const state = periodState(events)
  return {
    ...summary,
    venue: match.Venue?.trim() || null,
    period: state.period,
    periodName: state.periodName,
    inBreak: state.inBreak,
    clock: state.clock,
    lastEventAt: events.length
      ? ([...(match.Events ?? [])]
          .map((event) => event.CreatedTS)
          .sort()
          .at(-1) ?? null)
      : null,
    events,
    eventsNote: null,
  }
}

const YOUTH =
  /(\bU\d|\bP\d|\bF\d|Pojk|Flick|Junior|\bHJ\b|\bDJ\b|Veteran|Oldboy|Motion|\bMix\b|Para|Poolspel|Sammandrag|Pantamera|Nivå|Ljusröd|\bRöd\b|\bBlå\b|\bGrön\b|Skol|Distriktslag|Utveckling|Ungdom)/i
const NOT_LEAGUE = /(Cup|Träning|Invitational|Pre-Season|Mästerskap|\bDM\b)/i

const matchCache = new Map<number, { at: number; value: LiveMatch }>()
const matchInflight = new Map<number, Promise<LiveMatch>>()
const MATCH_TTL = 2_000

export async function getLiveMatch(id: number): Promise<LiveMatch> {
  const cached = matchCache.get(id)
  if (cached && Date.now() - cached.at < MATCH_TTL) return cached.value
  const inflight = matchInflight.get(id)
  if (inflight) return inflight

  const request = signedGet<IbisMatch>(`/v2/api/public/matches/${id}`)
    .then((match) => {
      const value = toLiveMatch(match)
      matchCache.set(id, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      matchInflight.delete(id)
    })
  matchInflight.set(id, request)
  return request
}

let todayCache: { at: number; value: LiveMatches } | null = null

export async function getTodayLiveMatches(): Promise<LiveMatches> {
  if (todayCache && Date.now() - todayCache.at < 5_000) {
    return todayCache.value
  }
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const groups = await signedGet<IbisMatchGroup[]>(
    `/v2/api/public/federations/1/${date}/matches`
  )
  const matches = groups
    .flatMap((group) => group.Matches ?? [])
    .filter(
      (match) =>
        !YOUTH.test(match.CompetitionName) &&
        !NOT_LEAGUE.test(match.CompetitionName)
    )
    .map(toSummary)
    .sort((a, b) => {
      const rank: Record<LiveStatus, number> = {
        live: 0,
        upcoming: 1,
        finished: 2,
        cancelled: 3,
      }
      if (rank[a.status] !== rank[b.status]) {
        return rank[a.status] - rank[b.status]
      }
      if (a.status === "finished") {
        return b.startsAt.localeCompare(a.startsAt)
      }
      return a.startsAt.localeCompare(b.startsAt)
    })
  const value = { date, matches }
  todayCache = { at: Date.now(), value }
  return value
}
