import * as React from "react"
import {
  Broadcast,
  GithubLogo,
  House,
  Info,
  Moon,
  Rows,
  Sun,
} from "@phosphor-icons/react"
import { SearchBox } from "@/components/search-box"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

function ThemeToggle() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    // The inline head script applies the stored or system theme before paint.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    document.documentElement.style.colorScheme = next ? "dark" : "light"
    localStorage.setItem("theme", next ? "dark" : "light")
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? "Byt till ljust läge" : "Byt till mörkt läge"}
      aria-label={dark ? "Byt till ljust läge" : "Byt till mörkt läge"}
      className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

const SECTION_ICONS: Record<string, React.ElementType> = {
  Start: House,
  Live: Broadcast,
  "Alla serier": Rows,
  "Om sidan": Info,
}

function isItemActive(location: string, href: string) {
  const [path] = location.split("?")
  if (href === "/") return path === "/"
  const [hrefPath, hrefSearch] = href.split("?")
  if (hrefSearch) return path === hrefPath && location.includes(hrefSearch)
  return path === hrefPath || path.startsWith(hrefPath + "/")
}

export type NavGroup = {
  label: string
  items: { label: string; href: string }[]
}

export function AppShell({
  nav,
  location,
  children,
}: {
  nav: NavGroup[]
  location: string
  children: React.ReactNode
}) {
  const [liveCount, setLiveCount] = React.useState<number | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const response = await fetch("/api/live", { cache: "no-store" })
        if (!response.ok) return
        const data = (await response.json()) as {
          matches: { status: string }[]
        }
        if (!cancelled) {
          setLiveCount(data.matches.filter((m) => m.status === "live").length)
        }
      } catch {
        // the next navigation retries
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [location])

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="offcanvas">
          <SidebarHeader>
            <a
              href="/"
              className="px-2 py-1.5 font-heading text-lg font-semibold tracking-tight"
            >
              OpenFloorball
            </a>
          </SidebarHeader>
          <SidebarContent>
            {nav.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = SECTION_ICONS[item.label]
                    const liveHere =
                      item.href === "/live" && (liveCount ?? 0) > 0
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isItemActive(location, item.href)}
                        >
                          <a href={item.href}>
                            {Icon ? <Icon size={16} /> : null}
                            <span className="flex-1">{item.label}</span>
                            {liveHere ? (
                              <span className="flex items-center gap-1 text-[0.65rem] font-medium text-emerald-600">
                                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                {liveCount}
                              </span>
                            ) : null}
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <div className="flex items-center gap-1">
              <a
                href="/om"
                title="Om OpenFloorball"
                aria-label="Om OpenFloorball"
                className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Info size={16} />
              </a>
              <a
                href="https://github.com/rickyhugo/openfloorball"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Källkod på GitHub"
                title="Källkod på GitHub"
                className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <GithubLogo size={16} weight="fill" />
              </a>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger
              title="Visa eller dölj meny"
              aria-label="Visa eller dölj meny"
            />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="w-full max-w-sm min-w-0">
                <SearchBox />
              </div>
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
