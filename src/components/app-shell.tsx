import * as React from "react"
import { Moon, Sun } from "@phosphor-icons/react"
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
            <div className="ml-auto w-full max-w-sm min-w-0">
              <SearchBox />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
