import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"

export type LeaderboardRow = {
  href: string
  name: string
  subtitle?: string
  value: string | number
}

export function LeaderboardCard({
  title,
  unit,
  rows,
  note,
  empty,
}: {
  title: string
  unit: string
  rows: LeaderboardRow[]
  note?: string
  empty?: string
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <h3 className="font-heading text-sm font-medium group-data-[size=sm]/card:text-sm">
          {title}
        </h3>
        <CardAction>
          <Badge variant="outline">{unit}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length > 0 ? (
          <ul>
            {rows.map((row, index) => (
              <li key={`${row.href}-${index}`}>
                <a
                  href={row.href}
                  className="flex min-w-0 items-baseline justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={cn(
                        "w-5 shrink-0 text-xs tabular-nums",
                        index < 3
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {row.name}
                      </span>
                      {row.subtitle ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {row.value}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">
            {empty ?? "Inga spelare registrerade."}
          </p>
        )}
        {note ? (
          <p className="mt-2 px-4 text-xs text-muted-foreground">{note}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
