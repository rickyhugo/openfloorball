export type LiveStatus = "live" | "finished" | "upcoming" | "cancelled"

export type LiveTeam = {
  name: string
  shortName: string
  logoUrl: string | null
}

export type LiveEventKind =
  "goal" | "penalty" | "timeout" | "goalie" | "period" | "other"

export type LiveEvent = {
  id: number
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
  id: number
  competition: string
  competitionId: number
  round: string | null
  home: LiveTeam
  away: LiveTeam
  homeScore: number | null
  awayScore: number | null
  startsAt: string
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
}

export type LiveMatches = {
  date: string
  matches: LiveMatchSummary[]
}
