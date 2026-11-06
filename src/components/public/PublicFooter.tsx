import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr]">
        <div>
          <Logo className="h-7" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Comunidade, oportunidades e conexões. Comunidades privadas no WhatsApp, organizadas por
            interesse, em Angola.
          </p>
        </div>
        <nav aria-label="Rodapé" className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:justify-self-end">
          <a href="#quem-somos" className="font-medium text-foreground transition-colors hover:text-primary">
            Quem somos
          </a>
          <a href="#o-que-fazemos" className="font-medium text-foreground transition-colors hover:text-primary">
            O que fazemos
          </a>
          <a href="#junte-se" className="font-medium text-foreground transition-colors hover:text-primary">
            Junte-se à nossa comunidade
          </a>
          <Link to="/comunidades" className="font-medium text-foreground transition-colors hover:text-primary">
            Explorar comunidades
          </Link>
          <Link to="/inscricao" className="font-medium text-foreground transition-colors hover:text-primary">
            Inscrever-me
          </Link>
          <Link to="/inscricao/estado" className="font-medium text-foreground transition-colors hover:text-primary">
            Consultar inscrição
          </Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Encontre + · Angola
        </p>
      </div>
    </footer>
  );
}
