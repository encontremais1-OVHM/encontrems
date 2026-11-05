import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[4.5rem]">
        <Link to="/" aria-label="Encontre + — Início" className="shrink-0">
          <Logo className="h-7 sm:h-8" />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          <Link
            to="/comunidades"
            className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
          >
            Explorar comunidades
          </Link>
          <Link
            to="/inscricao/estado"
            className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
          >
            Consultar inscrição
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="hidden sm:inline-flex md:hidden lg:inline-flex" asChild>
            <Link to="/comunidades">Explorar comunidades</Link>
          </Button>
          <Button asChild className="font-semibold">
            <Link to="/inscricao">Inscrever-me</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <nav className="mt-10 flex flex-col gap-1" aria-label="Menu">
                {[
                  { to: "/comunidades", label: "Explorar comunidades" },
                  { to: "/inscricao", label: "Inscrever-me" },
                  { to: "/inscricao/estado", label: "Consultar inscrição" },
                ].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-base font-semibold text-foreground hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
