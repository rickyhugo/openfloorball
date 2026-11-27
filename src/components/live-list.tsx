import * as React from "react"
import {
  LIVE_SOURCE_COUNTRY,
  type LiveMatches,
  type LiveMatchSummary,
} from "@/lib/live-types"

function startTime(match: LiveMatchSummary) {
  return match.timeLabel || match.startsAt.slice(11, 16)
}

function score(match: LiveMatchSummary) {
  if (match.homeScore === null || match.awayScore === null) return "–"
  return `${match.homeScore}–${match.awayScore}`
}

function Row({ match }: { match: LiveMatchSummary }) {
  const live = match.status === "live"
  return (
    <a
      href={`/live/${match.source}/${match.id}`}
      className="flex items-center justify-between gap-4 border-b border-border/60 py-3 transition-colors last:border-0 hover:bg-muted/40"
    >
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">
            {LIVE_SOURCE_COUNTRY[match.source]}
          </span>
          {" · "}
          {match.competition}
          {match.round ? ` · ${match.round}` : ""}
        </p>
        <p className="mt-1 truncate text-sm font-medium">
          {match.home.name}{" "}
          <span className="font-semibold tabular-nums">{score(match)}</span>{" "}
          {match.away.name}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        {live ? (
          <span className="flex items-center gap-1.5 font-medium text-emerald-600">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live
          </span>
        ) : match.status === "finished" ? (
          <span className="text-muted-foreground">Slut</span>
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {startTime(match)}
          </span>
        )}
      </div>
    </a>
  )
}

function Group({
  title,
  matches,
}: {
  title: string
  matches: LiveMatchSummary[]
}) {
  if (matches.length === 0) return null
  return (
    <section className="mt-8">
      <h2 className="font-heading text-xl font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {matches.length}
        </span>
      </h2>
      <div className="mt-2 border-y">
        {matches.map((match) => (
          <Row key={`${match.source}-${match.id}`} match={match} />
        ))}
      </div>
    </section>
  )
}

export function LiveList({ initial }: { initial: LiveMatches | null }) {
  const [data, setData] = React.useState(initial)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    async function update() {
      try {
        const response = await fetch("/api/live", { cache: "no-store" })
        if (!response.ok) throw new Error("live list")
        const next = (await response.json()) as LiveMatches
        if (!cancelled) {
          setData(next)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    if (!initial) void update()
    const timer = setInterval(update, 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [initial])

  if (!data) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        {error ? "Kunde inte hämta matcher." : "Hämtar matcher…"}
      </p>
    )
  }

  const live = data.matches.filter((match) => match.status === "live")
  const upcoming = data.matches.filter((match) => match.status === "upcoming")
  const finished = data.matches.filter((match) => match.status === "finished")
  const cancelled = data.matches.filter((match) => match.status === "cancelled")

  if (data.matches.length === 0) {
    return (
      <p className="mt-8 text-sm text-muted-foreground">Inga matcher idag.</p>
    )
  }

  return (
    <div>
      <Group title="Live nu" matches={live} />
      <Group title="Kommande" matches={upcoming} />
      <Group title="Dagens resultat" matches={finished} />
      <Group title="Inställda" matches={cancelled} />
      {error ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Uppdateringen misslyckades.
        </p>
      ) : null}
    </div>
  )
}
