import * as React from "react"
import { Badge } from "@/components/ui/badge"
import type { LiveMatches, LiveMatchSummary } from "@/lib/live-types"

function TickerCard({ match }: { match: LiveMatchSummary }) {
  const live = match.status === "live"
  const started = match.status !== "upcoming"
  return (
    <a
      href={`/live/${match.source}/${match.id}`}
      className="flex w-44 shrink-0 flex-col gap-2 border bg-background p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center justify-between gap-2 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        <span className="min-w-0 truncate">{match.competition}</span>
        {live ? (
          <Badge className="h-4 gap-1 px-1.5 text-[0.6rem]">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </Badge>
        ) : match.status === "finished" ? (
          <span className="shrink-0">Slut</span>
        ) : (
          <span className="shrink-0 tabular-nums">
            {match.timeLabel || match.startsAt.slice(11, 16)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{match.home.name}</span>
        <span
          className={
            live
              ? "font-semibold text-emerald-600 tabular-nums"
              : "font-semibold tabular-nums"
          }
        >
          {started ? (match.homeScore ?? "-") : "–"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate">{match.away.name}</span>
        <span
          className={
            live
              ? "font-semibold text-emerald-600 tabular-nums"
              : "font-semibold tabular-nums"
          }
        >
          {started ? (match.awayScore ?? "-") : "–"}
        </span>
      </div>
    </a>
  )
}

export function ScoreTicker({ initial }: { initial: LiveMatches }) {
  const [matches, setMatches] = React.useState(initial.matches)

  React.useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const response = await fetch("/api/live", { cache: "no-store" })
        if (!response.ok) return
        const next = (await response.json()) as LiveMatches
        setMatches(next.matches)
      } catch {
        // next poll retries in 30s
      }
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  if (matches.length === 0) return null

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {matches.map((match) => (
        <TickerCard key={`${match.source}-${match.id}`} match={match} />
      ))}
    </div>
  )
}
