import * as React from "react"
import type {
  LiveEvent,
  LiveMatch as LiveMatchData,
  LiveSource,
} from "@/lib/live-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

function eventLabel(event: LiveEvent) {
  if (event.label === "Periodstart") return `${event.periodName} start`
  if (event.label === "Periodslut") return `${event.periodName} slut`
  if (event.label.startsWith("Time Out")) return "Time out"
  return event.label
}

function teamName(match: LiveMatchData, event: LiveEvent) {
  if (event.team === "home") return match.home.shortName || match.home.name
  if (event.team === "away") return match.away.shortName || match.away.name
  return null
}

function EventRow({
  match,
  event,
}: {
  match: LiveMatchData
  event: LiveEvent
}) {
  const goal = event.kind === "goal"
  const name = teamName(match, event)
  return (
    <li
      className={`grid grid-cols-[3.5rem_1fr_auto] gap-3 py-2.5 ${goal ? "bg-muted/40" : ""}`}
    >
      <span className="pt-0.5 text-xs text-muted-foreground tabular-nums">
        {event.time}
      </span>
      <div className="min-w-0">
        <p className="text-sm">
          <span className={goal ? "font-semibold" : "font-medium"}>
            {eventLabel(event)}
          </span>
          {event.detail ? (
            <span className="text-muted-foreground"> · {event.detail}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {event.periodName}
          {name ? ` · ${name}` : ""}
        </p>
      </div>
      {event.score ? (
        <span className="pt-0.5 text-sm font-semibold tabular-nums">
          {event.score.home}–{event.score.away}
        </span>
      ) : null}
    </li>
  )
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
      className="size-10 shrink-0 object-contain sm:size-12"
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
  const events = [...match.events].reverse()

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
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <div className="flex min-w-0 items-center justify-end gap-3 text-right">
            <p className="min-w-0 truncate font-heading text-lg font-semibold">
              {match.home.name}
            </p>
            <TeamLogo team={match.home} />
          </div>
          <p className="text-3xl font-semibold whitespace-nowrap tabular-nums sm:text-4xl">
            {match.status === "upcoming" ? "–" : (match.homeScore ?? 0)}–
            {match.status === "upcoming" ? "–" : (match.awayScore ?? 0)}
          </p>
          <div className="flex min-w-0 items-center gap-3">
            <TeamLogo team={match.away} />
            <p className="min-w-0 truncate font-heading text-lg font-semibold">
              {match.away.name}
            </p>
          </div>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Händelser</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length > 0 ? (
            <ul className="divide-y">
              {events.map((event) => (
                <EventRow key={event.id} match={match} event={event} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {match.status === "upcoming"
                ? `Matchen börjar ${startTime(match)}.`
                : "Inga händelser registrerade."}
            </p>
          )}
          {error ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Uppdateringen misslyckades.
            </p>
          ) : null}
          {match.eventsNote ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {match.eventsNote}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
