export type LiveSource = "se" | "fi" | "ch"

export const LIVE_SOURCE_COUNTRY: Record<LiveSource, string> = {
  se: "Sverige",
  fi: "Finland",
  ch: "Schweiz",
}

export type LiveStatus = "live" | "finished" | "upcoming" | "cancelled"

export type LiveTeam = {
  name: string
  shortName: string
  logoUrl: string | null
}

export type LiveEventKind =
  "goal" | "penalty" | "timeout" | "goalie" | "period" | "other"

export type LiveEvent = {
  id: number | string
  kind: LiveEventKind
  label: string
  detail: string | null
  team: "home" | "away" | "neutral"
  period: number
  periodName: string
  time: string
  score: { home: number; away: number } | null
}

export type LiveMatchSummary = {
  id: string
  source: LiveSource
  competition: string
  competitionHref: string | null
  round: string | null
  home: LiveTeam
  away: LiveTeam
  homeScore: number | null
  awayScore: number | null
  startsAt: string
  timeLabel: string
  status: LiveStatus
}

export type LiveMatch = LiveMatchSummary & {
  venue: string | null
  period: number
  periodName: string
  inBreak: boolean
  clock: string
  lastEventAt: string | null
  events: LiveEvent[]
  eventsNote: string | null
}

export type LiveMatches = {
  date: string
  matches: LiveMatchSummary[]
}
