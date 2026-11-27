import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type PlayerRow = {
  competitionName: string
  competitionExternalId: string
  categoryName: string | null
  seasonLabel: string
  clubName: string
  teamExternalId: string
  teamName: string
  matches: number | null
  goals: number | null
  assists: number | null
  points: number | null
  penaltyMinutes: number | null
  goalieMatches: number | null
  shotsAgainst: number | null
  goalsAgainst: number | null
  savePercentage: number | null
}

type Person = {
  name: string
  imageUrl: string | null
  position: string | null
}

const ALL = "all"

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function leagueKey(row: PlayerRow) {
  const base =
    row.categoryName && /ssl|allsvenskan/i.test(row.categoryName)
      ? row.categoryName
      : row.competitionName
  return normalize(base)
    .split(" ")
    .map((word) =>
      word === "herrar"
        ? "herr"
        : word === "damer"
          ? "dam"
          : word === "division"
            ? "div"
            : word
    )
    .join(" ")
}

function sum(values: Array<number | null>) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

type StatGroup = {
  key: string
  seasonLabel: string
  leagueKey: string
  leagueLabel: string
  teams: Set<string>
  matches: number
  goals: number
  assists: number
  points: number
  penaltyMinutes: number
  goalieMatches: number
  shotsAgainst: number
  goalsAgainst: number
}

type GoalieTotals = {
  matches: number
  shotsAgainst: number
  goalsAgainst: number
  savePercentage: number | null
}

function savePercentage(
  goalie: Pick<GoalieTotals, "shotsAgainst" | "goalsAgainst">
) {
  if (!goalie.shotsAgainst) return null
  return (
    ((goalie.shotsAgainst - goalie.goalsAgainst) / goalie.shotsAgainst) * 100
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-64">
      <span className="font-medium tracking-wider uppercase">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full appearance-none border bg-background pr-9 pl-3 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        >
          <path
            d="m4 6 4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      </span>
    </label>
  )
}

function StatGrid({
  items,
  columns = 5,
}: {
  items: Array<{ label: string; value: string }>
  columns?: 4 | 5
}) {
  return (
    <dl
      className={`grid grid-cols-2 gap-2 ${columns === 4 ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}
    >
      {items.map((item) => (
        <div key={item.label} className="border px-4 py-3">
          <dt className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-1 font-heading text-2xl font-semibold tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function BreakdownTable({
  groups,
  goalie = false,
}: {
  groups: StatGroup[]
  goalie?: boolean
}) {
  if (groups.length === 0) return null
  const totals = groups.reduce(
    (total, group) => ({
      matches: total.matches + (goalie ? group.goalieMatches : group.matches),
      goals: total.goals + group.goals,
      assists: total.assists + group.assists,
      points: total.points + group.points,
      penaltyMinutes: total.penaltyMinutes + group.penaltyMinutes,
      shotsAgainst: total.shotsAgainst + group.shotsAgainst,
      goalsAgainst: total.goalsAgainst + group.goalsAgainst,
    }),
    {
      matches: 0,
      goals: 0,
      assists: 0,
      points: 0,
      penaltyMinutes: 0,
      shotsAgainst: 0,
      goalsAgainst: 0,
    }
  )
  const percentage = savePercentage(totals)

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Säsong</TableHead>
            <TableHead>Serie</TableHead>
            <TableHead className="hidden sm:table-cell">Lag</TableHead>
            <TableHead className="text-right">M</TableHead>
            {goalie ? (
              <>
                <TableHead className="hidden text-right sm:table-cell">
                  Skott
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  IM
                </TableHead>
                <TableHead className="text-right">Räddning %</TableHead>
              </>
            ) : (
              <>
                <TableHead className="text-right">Mål</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Ass
                </TableHead>
                <TableHead className="text-right">P</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  Utv
                </TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.key}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {group.seasonLabel}
              </TableCell>
              <TableCell
                className="max-w-52 truncate"
                title={group.leagueLabel}
              >
                {group.leagueLabel}
              </TableCell>
              <TableCell
                className="hidden max-w-52 truncate text-muted-foreground sm:table-cell"
                title={[...group.teams].join(", ")}
              >
                {[...group.teams].join(", ")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {goalie ? group.goalieMatches : group.matches}
              </TableCell>
              {goalie ? (
                <>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {group.shotsAgainst}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {group.goalsAgainst}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {savePercentage(group)?.toFixed(2) ?? "-"}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right tabular-nums">
                    {group.goals}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {group.assists}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {group.points}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {group.penaltyMinutes}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
          {groups.length > 1 ? (
            <TableRow className="border-t-2">
              <TableCell className="font-semibold">Totalt</TableCell>
              <TableCell />
              <TableCell className="hidden sm:table-cell" />
              <TableCell className="text-right font-semibold tabular-nums">
                {totals.matches}
              </TableCell>
              {goalie ? (
                <>
                  <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
                    {totals.shotsAgainst}
                  </TableCell>
                  <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
                    {totals.goalsAgainst}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {percentage?.toFixed(2) ?? "-"}
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {totals.goals}
                  </TableCell>
                  <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
                    {totals.assists}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {totals.points}
                  </TableCell>
                  <TableCell className="hidden text-right font-semibold tabular-nums sm:table-cell">
                    {totals.penaltyMinutes}
                  </TableCell>
                </>
              )}
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  )
}

export function PlayerProfile({
  person,
  rows,
}: {
  person: Person
  rows: PlayerRow[]
}) {
  const seasons = React.useMemo(
    () => [...new Set(rows.map((row) => row.seasonLabel))].sort().reverse(),
    [rows]
  )
  const latest = rows[0] ?? null
  const [season, setSeason] = React.useState(seasons[0] ?? ALL)
  const [league, setLeague] = React.useState(ALL)

  const allLeagues = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      const key = leagueKey(row)
      if (!map.has(key)) map.set(key, row.competitionName)
    }
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "sv"))
  }, [rows])

  const seasonLeagues = React.useMemo(
    () =>
      season === ALL
        ? allLeagues
        : allLeagues.filter((league) =>
            rows.some(
              (row) =>
                row.seasonLabel === season && leagueKey(row) === league.key
            )
          ),
    [allLeagues, rows, season]
  )

  const filtered = React.useMemo(
    () =>
      rows.filter(
        (row) =>
          (season === ALL || row.seasonLabel === season) &&
          (league === ALL || leagueKey(row) === league)
      ),
    [league, rows, season]
  )

  const skaterRows = filtered.filter((row) => row.matches !== null)
  const goalieRows = filtered.filter((row) => row.goalieMatches !== null)

  const skaterTotals = {
    matches: sum(skaterRows.map((row) => row.matches)),
    goals: sum(skaterRows.map((row) => row.goals)),
    assists: sum(skaterRows.map((row) => row.assists)),
    points: sum(skaterRows.map((row) => row.points)),
    penaltyMinutes: sum(skaterRows.map((row) => row.penaltyMinutes)),
  }

  const goalieTotals = {
    matches: sum(goalieRows.map((row) => row.goalieMatches)),
    shotsAgainst: sum(goalieRows.map((row) => row.shotsAgainst)),
    goalsAgainst: sum(goalieRows.map((row) => row.goalsAgainst)),
  }
  const goaliePercentage = savePercentage(goalieTotals)

  const leagueLabels = React.useMemo(
    () => new Map(allLeagues.map((item) => [item.key, item.label])),
    [allLeagues]
  )

  function groupsFor(source: PlayerRow[], goalie: boolean) {
    const map = new Map<string, StatGroup>()
    for (const row of source) {
      if (goalie ? row.goalieMatches === null : row.matches === null) continue
      const key = `${row.seasonLabel}|${leagueKey(row)}`
      const group =
        map.get(key) ??
        ({
          key,
          seasonLabel: row.seasonLabel,
          leagueKey: leagueKey(row),
          leagueLabel: leagueLabels.get(leagueKey(row)) ?? row.competitionName,
          teams: new Set<string>(),
          matches: 0,
          goals: 0,
          assists: 0,
          points: 0,
          penaltyMinutes: 0,
          goalieMatches: 0,
          shotsAgainst: 0,
          goalsAgainst: 0,
        } satisfies StatGroup)
      group.teams.add(row.teamName)
      if (goalie) {
        group.goalieMatches += row.goalieMatches ?? 0
        group.shotsAgainst += row.shotsAgainst ?? 0
        group.goalsAgainst += row.goalsAgainst ?? 0
      } else {
        group.matches += row.matches ?? 0
        group.goals += row.goals ?? 0
        group.assists += row.assists ?? 0
        group.points += row.points ?? 0
        group.penaltyMinutes += row.penaltyMinutes ?? 0
      }
      map.set(key, group)
    }
    return [...map.values()].sort(
      (a, b) =>
        b.seasonLabel.localeCompare(a.seasonLabel) ||
        a.leagueLabel.localeCompare(b.leagueLabel, "sv")
    )
  }

  const skaterGroups = groupsFor(skaterRows, false)
  const goalieGroups = groupsFor(goalieRows, true)

  function changeSeason(value: string) {
    setSeason(value)
    if (
      value !== ALL &&
      league !== ALL &&
      !rows.some(
        (row) => row.seasonLabel === value && leagueKey(row) === league
      )
    ) {
      setLeague(ALL)
    }
  }

  function changeLeague(value: string) {
    setLeague(value)
    if (
      value !== ALL &&
      season !== ALL &&
      !rows.some(
        (row) => row.seasonLabel === season && leagueKey(row) === value
      )
    ) {
      setSeason(ALL)
    }
  }

  const initials = person.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <div>
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-center">
        {person.imageUrl ? (
          <img
            src={person.imageUrl}
            alt=""
            width="96"
            height="96"
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-20 shrink-0 rounded-full border object-cover sm:size-24"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-full border bg-muted font-heading text-2xl text-muted-foreground sm:size-24">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            {person.name}
          </h1>
          {latest ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {person.position ? `${person.position} · ` : null}
              <a
                href={`/lag/${latest.competitionExternalId}/${latest.teamExternalId}`}
                className="underline decoration-border underline-offset-4 hover:text-foreground"
              >
                {latest.clubName}
              </a>
              {" · "}
              <a
                href={`/serie/${latest.competitionExternalId}`}
                className="underline decoration-border underline-offset-4 hover:text-foreground"
              >
                {latest.competitionName}
              </a>
              {" · "}
              {latest.seasonLabel}
            </p>
          ) : null}
        </div>
      </header>

      <section className="flex flex-col gap-3 border-b py-5 sm:flex-row">
        <FilterSelect label="Säsong" value={season} onChange={changeSeason}>
          <option value={ALL}>Alla säsonger</option>
          {seasons.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Serie" value={league} onChange={changeLeague}>
          <option value={ALL}>Alla serier</option>
          {seasonLeagues.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </FilterSelect>
      </section>

      {skaterRows.length > 0 ? (
        <section className="mt-7">
          <h2 className="font-heading text-xl font-semibold">
            Sammanställning
          </h2>
          <div className="mt-3">
            <StatGrid
              items={[
                { label: "Matcher", value: String(skaterTotals.matches) },
                { label: "Mål", value: String(skaterTotals.goals) },
                { label: "Assists", value: String(skaterTotals.assists) },
                { label: "Poäng", value: String(skaterTotals.points) },
                {
                  label: "Utvisning",
                  value: String(skaterTotals.penaltyMinutes),
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {goalieRows.length > 0 ? (
        <section className="mt-7">
          <h2 className="font-heading text-xl font-semibold">Målvakt</h2>
          <div className="mt-3">
            <StatGrid
              columns={4}
              items={[
                { label: "Matcher", value: String(goalieTotals.matches) },
                { label: "Skott", value: String(goalieTotals.shotsAgainst) },
                {
                  label: "Insläppta",
                  value: String(goalieTotals.goalsAgainst),
                },
                {
                  label: "Räddning %",
                  value:
                    goaliePercentage != null
                      ? goaliePercentage.toFixed(2)
                      : "-",
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {skaterRows.length > 0 ? (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-xl font-semibold">
              Per säsong och serie
            </h2>
            <span className="text-xs text-muted-foreground">
              {skaterGroups.length}
            </span>
          </div>
          <div className="mt-3 border-y">
            <BreakdownTable groups={skaterGroups} />
          </div>
        </section>
      ) : null}

      {goalieRows.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-heading text-xl font-semibold">
            Målvakt per säsong
          </h2>
          <div className="mt-3 border-y">
            <BreakdownTable groups={goalieGroups} goalie />
          </div>
        </section>
      ) : null}

      {skaterRows.length === 0 && goalieRows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          Ingen statistik för valet.
        </p>
      ) : null}
    </div>
  )
}
