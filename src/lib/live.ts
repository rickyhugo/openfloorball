import type {
  LiveMatch,
  LiveMatches,
  LiveMatchSummary,
  LiveSource,
  LiveStatus,
} from "./live-types"
import {
  getLiveMatch as getSwedishMatch,
  getTodayLiveMatches as getSwedishMatches,
} from "./ibis-live"
import { getFinlandLiveMatch, getFinlandLiveMatches } from "./finland-live"
import { getSwissLiveMatch, getSwissLiveMatches } from "./swiss-live"
import { getFcLiveMatch, getFcLiveMatches } from "./fc-live"

const RANK: Record<LiveStatus, number> = {
  live: 0,
  upcoming: 1,
  finished: 2,
  cancelled: 3,
}

const reportedFailures = new Set<string>()

export async function getLiveMatches(): Promise<LiveMatches> {
  const sources = [
    { name: "se", promise: getSwedishMatches() },
    { name: "fi", promise: getFinlandLiveMatches() },
    { name: "ch", promise: getSwissLiveMatches() },
    { name: "cz", promise: getFcLiveMatches("cz") },
    { name: "sk", promise: getFcLiveMatches("sk") },
    { name: "lv", promise: getFcLiveMatches("lv") },
    { name: "de", promise: getFcLiveMatches("de") },
  ]
  const results = await Promise.allSettled(
    sources.map((source) => source.promise)
  )
  const matches: LiveMatchSummary[] = []
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      matches.push(...result.value.matches)
      reportedFailures.delete(sources[index].name)
    } else if (!reportedFailures.has(sources[index].name)) {
      reportedFailures.add(sources[index].name)
      console.error(`live source failed: ${sources[index].name}`, result.reason)
    }
  })
  matches.sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status])
      return RANK[a.status] - RANK[b.status]
    if (a.status === "finished") return b.startsAt.localeCompare(a.startsAt)
    return a.startsAt.localeCompare(b.startsAt)
  })
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  return { date, matches }
}

export function isLiveSource(value: string): value is LiveSource {
  return value === "se" || value === "fi" || value === "ch"
}

export async function getLiveMatch(
  source: LiveSource,
  id: string
): Promise<LiveMatch> {
  if (source === "se") return getSwedishMatch(Number(id))
  if (source === "fi") return getFinlandLiveMatch(id)
  if (source === "ch") return getSwissLiveMatch(id)
  return getFcLiveMatch(source, id)
}
