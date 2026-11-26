import * as React from "react"
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

export type NavGroup = {
  label: string
  items: { label: string; href: string }[]
}

export function AppShell({
  nav,
  seasonLabel,
  children,
}: {
  nav: NavGroup[]
  seasonLabel: string
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
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Säsong {seasonLabel}
            </p>
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
            <p className="px-2 py-1 text-[0.65rem] text-muted-foreground">
              Data från iBIS
            </p>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
            <SidebarTrigger className="md:hidden" />
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
