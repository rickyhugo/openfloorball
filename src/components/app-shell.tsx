import * as React from "react"
import { GithubLogo, Moon, Sun } from "@phosphor-icons/react"
import { SearchBox } from "@/components/search-box"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
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
      className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {dark ? "Ljust läge" : "Mörkt läge"}
    </button>
  )
}

export type NavGroup = {
  label: string
  items: { label: string; href: string }[]
}

export function AppShell({
  nav,
  children,
}: {
  nav: NavGroup[]
  children: React.ReactNode
}) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="offcanvas">
          <SidebarContent className="pt-3">
            {nav.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild>
                        <a href={item.href}>{item.label}</a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <ThemeToggle />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger
              title="Visa eller dölj meny"
              aria-label="Visa eller dölj meny"
            />
            <a
              href="/"
              className="shrink-0 font-heading text-sm font-semibold tracking-tight sm:text-base"
            >
              OpenFloorball
            </a>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="w-full max-w-sm min-w-0">
                <SearchBox />
              </div>
              <a
                href="https://github.com/rickyhugo/openfloorball"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Källkod på GitHub"
                title="Källkod på GitHub"
                className="inline-flex size-9 shrink-0 items-center justify-center border text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                <GithubLogo size={18} weight="fill" />
              </a>
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
