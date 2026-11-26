import { useMemo, useState } from "react"
import { goalDifference, type Standing } from "@/lib/domain"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SortKey =
  | "position"
  | "played"
  | "regulationWins"
  | "goalsFor"
  | "goalsAgainst"
  | "goalDifference"
  | "points"

type SortDirection = "asc" | "desc"

type SortState = {
  key: SortKey
  direction: SortDirection
}

const DEFAULT_SORT: SortState = { key: "position", direction: "asc" }

const sortValue: Record<SortKey, (row: Standing) => number> = {
  position: (row) => row.position,
  played: (row) => row.played,
  regulationWins: (row) => row.regulationWins,
  goalsFor: (row) => row.goalsFor,
  goalsAgainst: (row) => row.goalsAgainst,
  goalDifference: (row) => goalDifference(row),
  points: (row) => row.points,
}

export type StandingTableProps = {
  competition: string
  season: string
  source: string
  updatedLabel: string
  rows: Standing[]
}

type SortableHeadProps = {
  sortKey: SortKey
  label: string
  description: string
  sort: SortState
  onSort: (key: SortKey) => void
  className?: string
}

function SortableHead({
  sortKey,
  label,
  description,
  sort,
  onSort,
  className,
}: SortableHeadProps) {
  const active = sort.key === sortKey

  return (
    <TableHead
      aria-sort={
        active
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      className={cn("text-right", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={description}
        aria-label={`Sortera efter ${description.toLowerCase()}`}
        className={cn(
          "ml-auto flex items-center justify-end gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          active && "text-foreground"
        )}
      >
        {label}
        <span aria-hidden="true" className="inline-block w-3 text-[0.625rem]">
          {active ? (sort.direction === "asc" ? "↑" : "↓") : null}
        </span>
      </button>
    </TableHead>
  )
}

type StaticHeadProps = {
  label: string
  description: string
  className?: string
}

function StaticHead({ label, description, className }: StaticHeadProps) {
  return (
    <TableHead className={cn("text-right", className)}>
      <abbr title={description} className="no-underline">
        {label}
      </abbr>
    </TableHead>
  )
}

function formatGoalDifference(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export function StandingTable({
  competition,
  season,
  source,
  updatedLabel,
  rows,
}: StandingTableProps) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)

  const sortedRows = useMemo(() => {
    const getValue = sortValue[sort.key]

    return [...rows].sort((a, b) => {
      const difference = getValue(a) - getValue(b)
      if (difference !== 0) {
        return sort.direction === "asc" ? difference : -difference
      }
      return a.position - b.position
    })
  }, [rows, sort])

  function handleSort(key: SortKey) {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        }
      }

      return { key, direction: key === "position" ? "asc" : "desc" }
    })
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Tabell
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {competition}{" "}
            <span className="font-normal text-muted-foreground">{season}</span>
          </h1>
        </div>
        <p className="text-xs tracking-wider text-muted-foreground uppercase">
          {updatedLabel}
        </p>
      </header>

      <Table className="min-w-[46rem] border-y">
        <TableCaption className="sr-only">
          Tabell för {competition} {season}
        </TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead
              sortKey="position"
              label="#"
              description="Placering"
              sort={sort}
              onSort={handleSort}
              className="sticky left-0 z-20 w-10 bg-background px-2"
            />
            <TableHead className="sticky left-10 z-20 bg-background px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Lag
            </TableHead>
            <SortableHead
              sortKey="played"
              label="S"
              description="Spelade matcher"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <SortableHead
              sortKey="regulationWins"
              label="V"
              description="Vinster i ordinarie tid"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <StaticHead
              label="ÖV"
              description="Övertidsvinster"
              className="px-2"
            />
            <StaticHead
              label="ÖF"
              description="Övertidsförluster"
              className="px-2"
            />
            <StaticHead
              label="F"
              description="Förluster i ordinarie tid"
              className="px-2"
            />
            <SortableHead
              sortKey="goalsFor"
              label="GM"
              description="Gjorda mål"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <SortableHead
              sortKey="goalsAgainst"
              label="IM"
              description="Insläppta mål"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <SortableHead
              sortKey="goalDifference"
              label="MS"
              description="Målskillnad"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
            <SortableHead
              sortKey="points"
              label="P"
              description="Poäng"
              sort={sort}
              onSort={handleSort}
              className="px-2"
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((row) => (
            <TableRow key={row.teamId} className="group/row">
              <TableCell className="sticky left-0 z-10 w-10 bg-background px-2 py-2.5 text-right text-muted-foreground tabular-nums group-hover/row:bg-muted/50">
                {row.position}
              </TableCell>
              <TableCell className="sticky left-10 z-10 bg-background px-2 py-2.5 font-medium group-hover/row:bg-muted/50">
                {row.teamName}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.played}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.regulationWins}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.overtimeWins}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.overtimeLosses}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.regulationLosses}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.goalsFor}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {row.goalsAgainst}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right tabular-nums">
                {formatGoalDifference(goalDifference(row))}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right font-semibold tabular-nums">
                {row.points}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <footer className="space-y-1 text-xs text-muted-foreground">
        <p>
          Källa:{" "}
          <a
            href={`https://${source}`}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-border underline-offset-4 hover:text-foreground"
          >
            {source}
          </a>
        </p>
        <p>Detta är exempeldata (fixture) och inte live-resultat.</p>
      </footer>
    </section>
  )
}
