import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { ApiStatusPill } from "@/components/app/ApiStatus";
import { Logo } from "@/components/brand/Logo";
import { ALL_NAV_ITEMS, NAV_GROUPS } from "@/components/layout/nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { signOutSupabase } from "@/lib/supabase-auth";
import { cn } from "@/lib/utils";

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: item.to === "/superadmin" }}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground"
                >
                  <item.icon className="size-4 shrink-0 opacity-70 group-data-[status=active]:opacity-100" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-sidebar-border p-4">
      <div className="rounded-lg bg-background p-3 ring-1 ring-sidebar-border">
        <div className="h-1 w-10 rounded-full bg-gradient-brand" />
        <p className="mt-2 text-xs font-semibold text-foreground">Comunidade Encontre +</p>
        <p className="text-[0.7rem] text-muted-foreground">Acesso Super Admin · Angola</p>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const current =
    ALL_NAV_ITEMS.filter((i) => pathname === i.to || pathname.startsWith(`${i.to}/`)).sort(
      (a, b) => b.to.length - a.to.length,
    )[0] ?? ALL_NAV_ITEMS[0];

  async function handleLogout() {
    await signOutSupabase();
    navigate({ to: "/superadmin/entrar", replace: true });
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link to="/superadmin" aria-label="Encontre + — Dashboard">
            <Logo className="h-7" />
          </Link>
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">Navegação</SheetTitle>
              <div className="flex h-16 items-center border-b border-sidebar-border px-5">
                <Logo className="h-7" />
              </div>
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
              <SidebarFooter />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">Painel</span>
            <span className="hidden text-muted-foreground/50 sm:inline">/</span>
            <span className="truncate font-semibold text-foreground">{current?.label ?? "Dashboard"}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <ApiStatusPill />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </header>

        <main className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8")}>{children}</main>
      </div>
    </div>
  );
}
