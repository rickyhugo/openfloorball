import * as React from "react"
import {
  Flag,
  Target,
  Timer,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react"
import type { LiveEvent, LiveMatch } from "@/lib/live-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filter = "all" | "goals" | "penalties" | "other"

function eventIcon(event: LiveEvent) {
  if (event.kind === "goal") return <Target weight="fill" />
  if (event.kind === "penalty") return <WarningCircle weight="fill" />
  if (event.kind === "timeout") return <Timer />
  if (event.kind === "goalie") return <UserCircle />
  return <Flag />
}

function eventTone(event: LiveEvent) {
  if (event.kind === "goal") return "bg-foreground text-background"
  if (event.kind === "penalty")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400"
  if (event.kind === "timeout")
    return "bg-sky-500/15 text-sky-700 dark:text-sky-400"
  return "bg-muted text-muted-foreground"
}

function teamName(match: LiveMatch, event: LiveEvent) {
  if (event.team === "home") return match.home.shortName || match.home.name
  if (event.team === "away") return match.away.shortName || match.away.name
  return null
}

function EventCard({
  match,
  event,
  latest,
}: {
  match: LiveMatch
  event: LiveEvent
  latest: boolean
}) {
  const goal = event.kind === "goal"
  const team = teamName(match, event)
  return (
    <li className="relative pl-12">
      <span
        className={cn(
          "absolute top-3 left-0 z-10 flex size-8 items-center justify-center rounded-full [&_svg]:size-4",
          eventTone(event)
        )}
      >
        {eventIcon(event)}
      </span>
      <div
        className={cn(
          "border bg-background p-3 transition-colors hover:bg-muted/40",
          goal && "border-l-2 border-l-foreground bg-muted/25",
          latest && "ring-1 ring-emerald-500/30"
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {event.time}
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              event.kind === "penalty" && "text-amber-700 dark:text-amber-400"
            )}
          >
            {event.label}
          </span>
          {event.score ? (
            <span className="ml-auto bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
              {event.score.home}–{event.score.away}
            </span>
          ) : null}
        </div>
        {event.detail ? (
          <p className="mt-1 text-sm text-muted-foreground">{event.detail}</p>
        ) : null}
        <p className="mt-1 text-[0.65rem] tracking-wide text-muted-foreground uppercase">
          {event.periodName}
          {team ? ` · ${team}` : ""}
        </p>
      </div>
    </li>
  )
}

export function MatchTimeline({ match }: { match: LiveMatch }) {
  const [filter, setFilter] = React.useState<Filter>("all")
  const events = match.events.filter((event) => event.kind !== "period")

  const counts = {
    all: events.length,
    goals: events.filter((event) => event.kind === "goal").length,
    penalties: events.filter((event) => event.kind === "penalty").length,
    other: events.filter(
      (event) => event.kind !== "goal" && event.kind !== "penalty"
    ).length,
  }

  const visible = events.filter((event) => {
    if (filter === "goals") return event.kind === "goal"
    if (filter === "penalties") return event.kind === "penalty"
    if (filter === "other")
      return event.kind !== "goal" && event.kind !== "penalty"
    return true
  })

  const groups = new Map<
    number,
    { periodName: string; events: LiveEvent[]; score: LiveEvent["score"] }
  >()
  for (const event of visible) {
    const group = groups.get(event.period) ?? {
      periodName: event.periodName,
      events: [],
      score: null,
    }
    group.events.push(event)
    if (event.score) group.score = event.score
    groups.set(event.period, group)
  }

  const latestId = match.status === "live" ? visible.at(-1)?.id : undefined
  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Alla" },
    { key: "goals", label: "Mål" },
    { key: "penalties", label: "Utvisningar" },
    { key: "other", label: "Övrigt" },
  ]

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="font-heading text-xl">Händelser</CardTitle>
          <div className="flex flex-wrap gap-1">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                aria-pressed={filter === item.key}
                className={cn(
                  "border px-2 py-1 text-xs transition-colors",
                  filter === item.key
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
                <span className="ml-1 opacity-60">{counts[item.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {groups.size > 0 ? (
          <ol className="relative mt-1">
            <span className="absolute top-0 bottom-4 left-4 w-px bg-border" />
            {[...groups.entries()].map(([period, group]) => (
              <React.Fragment key={period}>
                <li className="relative flex items-center gap-3 py-3 pl-12">
                  <span className="absolute left-2.5 size-3 rounded-full border-2 border-background bg-muted-foreground" />
                  <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
                    {group.periodName}
                  </span>
                  {group.score ? (
                    <span className="ml-auto text-xs font-semibold tabular-nums">
                      {group.score.home}–{group.score.away}
                    </span>
                  ) : null}
                </li>
                {group.events.map((event) => (
                  <EventCard
                    key={event.id}
                    match={match}
                    event={event}
                    latest={event.id === latestId}
                  />
                ))}
              </React.Fragment>
            ))}
            {match.status === "finished" ? (
              <li className="relative flex items-center py-3 pl-12">
                <span className="absolute left-2.5 size-3 rounded-full border-2 border-background bg-foreground" />
                <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Matchens slut
                </span>
                <span className="ml-auto text-sm font-semibold tabular-nums">
                  {match.homeScore ?? "-"}–{match.awayScore ?? "-"}
                </span>
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            {match.status === "upcoming"
              ? `Matchen börjar ${match.timeLabel}.`
              : "Inga händelser registrerade."}
          </p>
        )}
        {match.eventsNote ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {match.eventsNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
