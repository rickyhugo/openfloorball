import * as React from "react"
import { cn } from "@/lib/utils"

type Hit = { kind: string; title: string; subtitle: string | null; url: string }

const LABELS: Record<string, string> = {
  competition: "Serier",
  team: "Lag",
  game: "Matcher",
  player: "Spelare",
}

export function SearchBox() {
  const [query, setQuery] = React.useState("")
  const [hits, setHits] = React.useState<Hit[]>([])
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(-1)
  const [loading, setLoading] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const abort = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const value = query.trim()
    if (value.length < 2) return
    const timer = window.setTimeout(async () => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      setLoading(true)
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(value)}`,
          {
            signal: controller.signal,
          }
        )
        if (!response.ok) return
        const data = (await response.json()) as { hits: Hit[] }
        setHits(data.hits)
        setOpen(true)
        setActive(-1)
      } catch (error) {
        if ((error as Error).name !== "AbortError") console.error(error)
      } finally {
        setLoading(false)
      }
    }, 120)
    return () => window.clearTimeout(timer)
  }, [query])

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node))
        setOpen(false)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])

  const groups: { kind: string; label: string; items: Hit[] }[] = []
  for (const hit of hits) {
    let group = groups.find((entry) => entry.kind === hit.kind)
    if (!group) {
      group = { kind: hit.kind, label: LABELS[hit.kind] ?? hit.kind, items: [] }
      groups.push(group)
    }
    group.items.push(hit)
  }
  const flat = groups.flatMap((group) => group.items)

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setQuery(value)
    if (value.trim().length < 2) {
      setHits([])
      setOpen(false)
      setActive(-1)
      setLoading(false)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const anchors = Array.from(
      root.current?.querySelectorAll<HTMLAnchorElement>("[data-result]") ?? []
    )
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (!anchors.length) return
      const next = active < anchors.length - 1 ? active + 1 : 0
      setActive(next)
      anchors[next].scrollIntoView({ block: "nearest" })
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (!anchors.length) return
      const next = active > 0 ? active - 1 : anchors.length - 1
      setActive(next)
      anchors[next].scrollIntoView({ block: "nearest" })
    } else if (event.key === "Enter") {
      if (active >= 0) {
        event.preventDefault()
        anchors[active]?.click()
      }
    } else if (event.key === "Escape") {
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div ref={root} className="relative w-full">
      <label className="sr-only" htmlFor="global-search">
        Sök
      </label>
      <input
        id="global-search"
        type="search"
        value={query}
        onChange={onChange}
        onFocus={() => {
          if (hits.length) setOpen(true)
        }}
        onKeyDown={onKeyDown}
        placeholder="Sök lag, serie, match, spelare"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {open && query.trim().length >= 2 ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-sm"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {loading ? "Söker..." : "Inga träffar."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.kind}>
                <p className="px-3 pt-2 pb-1 text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.items.map((hit) => {
                  const index = flat.indexOf(hit)
                  return (
                    <a
                      key={`${hit.kind}-${hit.url}-${index}`}
                      href={hit.url}
                      data-result
                      role="option"
                      aria-selected={index === active}
                      className={cn(
                        "flex flex-col gap-0.5 px-3 py-2 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        index === active && "bg-muted"
                      )}
                    >
                      <span>{hit.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    </a>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
