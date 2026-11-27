import * as React from "react"
import type { LiveMatch as LiveMatchData, LiveSource } from "@/lib/live-types"
import { MatchTimeline } from "@/components/match-timeline"

function startTime(match: LiveMatchData) {
  return match.timeLabel || match.startsAt.slice(11, 16)
}

function periodText(match: LiveMatchData) {
  if (match.status === "upcoming") return `Start ${startTime(match)}`
  if (match.status === "finished") return ""
  if (match.status === "cancelled") return "Inställd"
  if (match.inBreak) {
    return `${match.periodName || `Period ${match.period}`} · Paus`
  }
  if (match.period > 0) {
    return `${match.periodName || `Period ${match.period}`} · senast ${match.clock}`
  }
  return "Live"
}

function TeamLogo({ team }: { team: LiveMatchData["home"] }) {
  return team.logoUrl ? (
    <img
      src={team.logoUrl}
      alt=""
      width="48"
      height="48"
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-9 shrink-0 object-contain sm:size-12"
    />
  ) : (
    <div className="size-10 shrink-0 rounded-full bg-muted sm:size-12" />
  )
}

export function LiveMatch({
  initial,
  matchId,
  source,
}: {
  initial: LiveMatchData
  matchId: string
  source: LiveSource
}) {
  const [match, setMatch] = React.useState(initial)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function update() {
      try {
        const response = await fetch(`/api/live/${source}/${matchId}`, {
          cache: "no-store",
        })
        if (!response.ok) throw new Error("live match")
        const next = (await response.json()) as LiveMatchData
        if (!cancelled) {
          setMatch(next)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    const timer = setInterval(update, 5_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [matchId, source])

  const live = match.status === "live"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {match.competition}
          {match.round ? ` · ${match.round}` : ""}
        </span>
        {match.venue ? <span>· {match.venue}</span> : null}
      </div>

      <div className="mt-4 rounded-xl border p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium tracking-wider uppercase">
            {live ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            ) : match.status === "finished" ? (
              "Slut"
            ) : match.status === "cancelled" ? (
              "Inställd"
            ) : (
              "Kommande"
            )}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {periodText(match)}
          </span>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-6">
          <div className="flex min-w-0 items-center justify-center gap-2 sm:justify-end sm:gap-3 sm:text-right">
            <p className="min-w-0 truncate font-heading text-base font-semibold sm:text-lg">
              {match.home.name}
            </p>
            <TeamLogo team={match.home} />
          </div>
          <p className="text-center text-3xl font-semibold whitespace-nowrap tabular-nums sm:text-4xl">
            {match.status === "upcoming" ? "–" : (match.homeScore ?? 0)}–
            {match.status === "upcoming" ? "–" : (match.awayScore ?? 0)}
          </p>
          <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
            <TeamLogo team={match.away} />
            <p className="min-w-0 truncate font-heading text-base font-semibold sm:text-lg">
              {match.away.name}
            </p>
          </div>
        </div>
      </div>

      <MatchTimeline match={match} />
      {error ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Uppdateringen misslyckades.
        </p>
      ) : null}
    </div>
  )
}
