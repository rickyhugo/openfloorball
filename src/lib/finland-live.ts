import { load } from "cheerio"
import type {
  LiveEvent,
  LiveEventKind,
  LiveMatch,
  LiveMatches,
  LiveMatchSummary,
  LiveStatus,
} from "./live-types"

// F-Liiga serves live data behind a WPSplash cookie. Use it when set, and otherwise read the public pages through Jina.
const BASE = "https://fliiga.com"
const JINA = "https://r.jina.ai/"
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"

const htmlCache = new Map<string, { at: number; html: string }>()
const detailCache = new Map<string, { at: number; value: LiveMatch }>()
const detailInflight = new Map<string, Promise<LiveMatch>>()

type Gender = "men" | "women"

type FinlandCard = {
  id: string
  href: string
  gender: Gender
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  startsAt: string
  timeLabel: string
  status: LiveStatus
  competition: string
  competitionHref: string
}

function cookie() {
  const value = process.env.FLIIGA_COOKIE
  if (!value) throw new Error("FLIIGA_COOKIE is required for Finnish live data")
  return value
}

async function fetchDirect(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://fliiga.com/",
      cookie: cookie(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`fliiga ${url} failed: ${response.status}`)
  return response.text()
}

async function fetchViaReader(url: string, format: "html" | "text" = "html") {
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept:
      format === "html" ? "text/html,application/xhtml+xml" : "text/plain",
    "x-return-format": format,
    "x-no-cache": "true",
  }
  if (process.env.JINA_API_KEY) {
    headers.authorization = `Bearer ${process.env.JINA_API_KEY}`
  }
  const response = await fetch(JINA + url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`fliiga reader failed: ${response.status}`)
  return response.text()
}

async function fetchHtml(url: string) {
  const cached = htmlCache.get(url)
  if (cached && Date.now() - cached.at < 15_000) return cached.html

  let html = ""
  try {
    if (process.env.FLIIGA_COOKIE) html = await fetchDirect(url)
  } catch {
    html = ""
  }
  if (!html || /One moment, please|wssplash/i.test(html)) {
    html = await fetchViaReader(url, "html")
  }
  htmlCache.set(url, { at: Date.now(), html })
  return html
}

function number(value: string) {
  const parsed = Number(value.replace(/[^0-9-]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function dateKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

function timeLabel(value: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Helsinki",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function parseCard(
  $: ReturnType<typeof load>,
  card: ReturnType<ReturnType<typeof load>>,
  gender: Gender
): FinlandCard | null {
  const href = card.find("a.match-link").attr("href") ?? ""
  const id =
    card.attr("data-match-id") ?? href.match(/\/matches\/[^/]+\/([^/?#]+)/)?.[1]
  const names = card
    .find(".match-team .team-name")
    .map((_, node) => $(node).text().trim())
    .get()
  if (!id || names.length < 2) return null
  const classes = card.attr("class") ?? ""
  const gameday = Number(card.attr("data-match-gameday") ?? 0)
  const startsAt = gameday ? new Date(gameday * 1000) : null
  const played = classes.includes("match-Played")
  const live = /match-(Live|Break|Penalties)/.test(classes)
  const status: LiveStatus = played ? "finished" : live ? "live" : "upcoming"
  const homeScore =
    played || live ? number(card.find(".home-goals").text()) : null
  const awayScore =
    played || live ? number(card.find(".away-goals").text()) : null
  return {
    id,
    href: href
      ? href.startsWith("http")
        ? href
        : BASE + href
      : `${BASE}/en/matches/${gender}/`,
    gender,
    home: names[0],
    away: names[1],
    homeScore,
    awayScore,
    startsAt: startsAt?.toISOString() ?? "",
    timeLabel: startsAt ? timeLabel(startsAt) : "",
    status,
    competition: gender === "men" ? "F-Liiga Herrar" : "F-Liiga Damer",
    competitionHref: `${BASE}/en/matches/${gender}/`,
  }
}

const scheduleCache = new Map<Gender, { at: number; html: string }>()
const cardCache = new Map<string, FinlandCard>()

async function loadSchedule(gender: Gender) {
  const cached = scheduleCache.get(gender)
  if (cached && Date.now() - cached.at < 5_000) return cached.html
  const html = await fetchHtml(`${BASE}/en/matches/${gender}/`)
  scheduleCache.set(gender, { at: Date.now(), html })
  const $ = load(html)
  $(".match-card").each((_, element) => {
    const parsed = parseCard($, $(element), gender)
    if (parsed) cardCache.set(parsed.id, parsed)
  })
  return html
}

function cardsFrom(html: string, gender: Gender) {
  const $ = load(html)
  const cards: FinlandCard[] = []
  $(".match-card").each((_, element) => {
    const parsed = parseCard($, $(element), gender)
    if (parsed) cards.push(parsed)
  })
  return cards
}

function toSummary(card: FinlandCard): LiveMatchSummary {
  return {
    id: card.id,
    source: "fi",
    competition: card.competition,
    competitionHref: card.competitionHref,
    round: null,
    home: { name: card.home, shortName: card.home, logoUrl: null },
    away: { name: card.away, shortName: card.away, logoUrl: null },
    homeScore: card.status === "upcoming" ? null : card.homeScore,
    awayScore: card.status === "upcoming" ? null : card.awayScore,
    startsAt: card.startsAt,
    timeLabel: card.timeLabel,
    status: card.status,
  }
}

type FinlandLiveData = {
  torneopal_id: string
  status: string
  match_datetime: string
  venue_name: string
  home_goals: number
  away_goals: number
  wp_link: string
}

const liveDataCache = new Map<
  string,
  { at: number; value: FinlandLiveData | null }
>()

function statusFromLive(value: string): LiveStatus {
  const status = value.toLowerCase()
  if (status === "live" || status === "break" || status === "penalties")
    return "live"
  if (status === "played") return "finished"
  return "upcoming"
}

async function fetchLiveData(id: string): Promise<FinlandLiveData | null> {
  if (!/^\d+$/.test(id)) return null
  const cached = liveDataCache.get(id)
  if (cached && Date.now() - cached.at < 15_000) return cached.value
  const url = `${BASE}/wp-admin/admin-ajax.php?action=match_live_data&match_id=${id}`
  let text = ""
  try {
    if (process.env.FLIIGA_COOKIE) {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json, text/plain, */*",
          referer: "https://fliiga.com/en/matches/men/",
          cookie: cookie(),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
      if (response.ok) text = await response.text()
    }
  } catch {
    text = ""
  }
  if (!text || text.trimStart().startsWith("<")) {
    try {
      text = await fetchViaReader(url, "text")
    } catch {
      text = ""
    }
  }
  let value: FinlandLiveData | null = null
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (json) {
    try {
      value = JSON.parse(json) as FinlandLiveData
    } catch {
      value = null
    }
  }
  liveDataCache.set(id, { at: Date.now(), value })
  return value
}

function applyLiveData(
  card: FinlandCard,
  data: FinlandLiveData | null
): FinlandCard {
  if (!data) return card
  const status = statusFromLive(data.status)
  const startsAt = data.match_datetime
    ? new Date(data.match_datetime).toISOString()
    : card.startsAt
  return {
    ...card,
    status,
    homeScore: status === "upcoming" ? null : Number(data.home_goals),
    awayScore: status === "upcoming" ? null : Number(data.away_goals),
    startsAt,
    timeLabel: startsAt ? timeLabel(new Date(startsAt)) : card.timeLabel,
  }
}

async function listGender(gender: Gender) {
  const html = await loadSchedule(gender)
  return cardsFrom(html, gender)
}

let listCache: { at: number; value: LiveMatches } | null = null

export async function getFinlandLiveMatches(): Promise<LiveMatches> {
  if (listCache && Date.now() - listCache.at < 30_000) return listCache.value
  const cards = (
    await Promise.all([listGender("men"), listGender("women")])
  ).flat()
  const today = dateKey(new Date(), "Europe/Helsinki")
  const now = Date.now()
  const candidates = cards.filter((match) => {
    if (match.status === "live") return true
    if (!match.startsAt) return false
    if (dateKey(new Date(match.startsAt), "Europe/Helsinki") === today)
      return true
    return Math.abs(new Date(match.startsAt).getTime() - now) < 6 * 60 * 60_000
  })
  const matches = (
    await Promise.all(
      candidates.map(async (card) => {
        const started =
          card.startsAt &&
          new Date(card.startsAt).getTime() <= now &&
          now - new Date(card.startsAt).getTime() < 5 * 60 * 60_000
        const data =
          card.status === "live" || started
            ? await fetchLiveData(card.id)
            : null
        return toSummary(applyLiveData(card, data))
      })
    )
  ).sort((a, b) => {
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

function penaltyLabel(classes: string, text: string) {
  if (/10/.test(text) || classes.includes("event-10min"))
    return "Utvisning 10 min"
  if (/5/.test(text) || classes.includes("event-5min")) return "Utvisning 5 min"
  return "Utvisning 2 min"
}

function normalizeEvents(html: string): LiveEvent[] {
  const $ = load(html)
  const events: Array<{ event: LiveEvent; sort: number }> = []
  $(".match-event").each((index, element) => {
    const node = $(element)
    const classes = node.attr("class") ?? ""
    const goal = classes.includes("event-maali")
    const penalty = /event-\d+min/.test(classes)
    const timeText = node.find(".event-time .time").text().trim()
    const match = timeText.match(/(\d+):(\d+)/)
    const descText = node.find(".event-time .desc").text().trim()
    const periodStart = classes.includes("event-jaksoalkoi")
    const periodEnd = classes.includes("event-jaksoloppui")
    const matchEnd = classes.includes("event-otteluloppui")
    if (periodStart || periodEnd || matchEnd) {
      const parsed = descText.match(/^(\d+)\./)
      const period = parsed ? Number(parsed[1]) : 3
      events.push({
        event: {
          id: `${index}-period`,
          kind: "period",
          label: periodStart
            ? "Periodstart"
            : periodEnd
              ? "Periodslut"
              : "Matchens slut",
          detail: null,
          team: "neutral",
          period,
          periodName: `Period ${period}`,
          time: periodStart ? "0:00" : "20:00",
          score: null,
        },
        sort: (period - 1) * 1200 + (periodStart ? 0 : periodEnd ? 1200 : 3600),
      })
      return
    }
    if (!goal && !penalty) {
      const title = node
        .find(".event-home .title, .event-away .title")
        .first()
        .text()
        .trim()
      if (!/goalkeeper|maalivahti/i.test(title) || !match) return
      const totalMinutes = Number(match[1])
      const seconds = Number(match[2])
      const period = Math.floor(totalMinutes / 20) + 1
      const minuteInPeriod = totalMinutes - (period - 1) * 20
      const side = node.find(".event-home .title").length > 0 ? "home" : "away"
      const detail = node
        .find(".event-home .desc, .event-away .desc")
        .first()
        .text()
        .trim()
      events.push({
        event: {
          id: `${index}-goalie`,
          kind: "goalie",
          label: title,
          detail: detail || null,
          team: side,
          period,
          periodName: `Period ${period}`,
          time: `${minuteInPeriod}:${String(seconds).padStart(2, "0")}`,
          score: null,
        },
        sort: totalMinutes * 60 + seconds,
      })
      return
    }
    if (!match) return
    const totalMinutes = Number(match[1])
    const seconds = Number(match[2])
    const period = Math.floor(totalMinutes / 20) + 1
    const minuteInPeriod = totalMinutes - (period - 1) * 20
    const homeScorer = node.find(".event-home .scorer").length > 0
    const awayScorer = node.find(".event-away .scorer").length > 0
    const homeInfo =
      node.find(".event-home .event-info").text().trim().length > 0
    const awayInfo =
      node.find(".event-away .event-info").text().trim().length > 0
    const team = goal
      ? homeScorer
        ? "home"
        : awayScorer
          ? "away"
          : "neutral"
      : homeInfo
        ? "home"
        : awayInfo
          ? "away"
          : "neutral"
    const scorer = node
      .find(".event-home .scorer, .event-away .scorer")
      .first()
      .text()
      .trim()
    const assistRaw = node
      .find(
        ".event-home .has-assists, .event-away .has-assists, .event-home .assist, .event-away .assist"
      )
      .first()
      .text()
      .trim()
    const assist = assistRaw
      .replace(/^(assist|syöttäjä)\s*[:-]?\s*/i, "")
      .trim()
    const info = node
      .find(".event-home .event-info, .event-away .event-info")
      .first()
    const penaltyPlayer = info
      .contents()
      .filter((_, content) => content.type === "text")
      .text()
      .trim()
      .replace(/^\d+\s*min\s*/i, "")
      .replace(/^[\s-]+/, "")
    const desc = node.find(".event-time .desc").text().trim()
    const scoreMatch = desc.match(/(\d+)\s*-\s*(\d+)/)
    const score = scoreMatch
      ? { home: Number(scoreMatch[1]), away: Number(scoreMatch[2]) }
      : null
    const kind: LiveEventKind = goal ? "goal" : "penalty"
    events.push({
      event: {
        id: `${index}-${totalMinutes}-${seconds}`,
        kind,
        label: goal ? "Mål" : penaltyLabel(classes, node.text()),
        detail: goal
          ? [scorer, assist && `Assist: ${assist}`]
              .filter(Boolean)
              .join(" · ") || null
          : penaltyPlayer || null,
        team,
        period,
        periodName: `Period ${period}`,
        time: `${minuteInPeriod}:${String(seconds).padStart(2, "0")}`,
        score,
      },
      sort: totalMinutes * 60 + seconds,
    })
  })
  return events.sort((a, b) => a.sort - b.sort).map(({ event }) => event)
}

function detailStatus(html: string, card: FinlandCard | undefined): LiveStatus {
  if (card) return card.status
  const $ = load(html)
  const text = $(".match-status .status, .match-status")
    .first()
    .text()
    .toLowerCase()
  if (text.includes("live")) return "live"
  if (text.includes("ft") || text.includes("played") || text.includes("slut"))
    return "finished"
  return "upcoming"
}

export async function getFinlandLiveMatch(id: string): Promise<LiveMatch> {
  const cached = detailCache.get(id)
  if (cached && Date.now() - cached.at < 10_000) return cached.value
  const inflight = detailInflight.get(id)
  if (inflight) return inflight
  const request = loadFinlandLiveMatch(id)
    .then((value) => {
      detailCache.set(id, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      detailInflight.delete(id)
    })
  detailInflight.set(id, request)
  return request
}

async function loadFinlandLiveMatch(id: string): Promise<LiveMatch> {
  let card = cardCache.get(id)
  if (!card) {
    await Promise.all([loadSchedule("men"), loadSchedule("women")])
    card = cardCache.get(id)
  }
  if (!card) throw new Error(`unknown F-Liiga match ${id}`)
  const [html, liveData] = await Promise.all([
    fetchHtml(card.href),
    fetchLiveData(id),
  ])
  const events = normalizeEvents(html)
  const $ = load(html)
  const pageHome = number($(".match-scores .home-goals").first().text())
  const pageAway = number($(".match-scores .away-goals").first().text())
  const status = liveData
    ? statusFromLive(liveData.status)
    : detailStatus(html, card)
  const homeScore = liveData ? Number(liveData.home_goals) : pageHome
  const awayScore = liveData ? Number(liveData.away_goals) : pageAway
  const last = events.at(-1)
  return {
    ...toSummary(card),
    homeScore: status === "upcoming" ? null : (homeScore ?? card.homeScore),
    awayScore: status === "upcoming" ? null : (awayScore ?? card.awayScore),
    status,
    venue: liveData?.venue_name || null,
    period: last?.period ?? 0,
    periodName: last?.periodName ?? "",
    inBreak: false,
    clock: last?.time ?? "0:00",
    lastEventAt: null,
    events,
    eventsNote: null,
  }
}
