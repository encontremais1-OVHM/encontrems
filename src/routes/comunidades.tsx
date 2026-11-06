import { createFileRoute } from "@tanstack/react-router";

import { CommunityCatalog } from "@/components/public/CommunityCatalog";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicHeader } from "@/components/public/PublicHeader";

export const Route = createFileRoute("/comunidades")({
  head: () => ({
    meta: [
      { title: "Explorar comunidades — Encontre +" },
      {
        name: "description",
        content: "Conheça as comunidades Encontre +, a finalidade de cada uma e os subgrupos disponíveis no WhatsApp.",
      },
      { property: "og:title", content: "Explorar comunidades — Encontre +" },
      {
        property: "og:description",
        content: "Comunidades e subgrupos no WhatsApp para pessoas, profissionais e negócios em Angola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComunidadesPage,
});

function ComunidadesPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <section className="border-b bg-muted/40">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">Explorar comunidades</p>
            <h1 className="mt-2 max-w-2xl text-4xl font-black text-foreground sm:text-5xl">
              Comunidades e subgrupos
            </h1>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Veja a finalidade de cada comunidade e os subgrupos que a compõem. Escolha a que lhe interessa e
              carregue em «Quero entrar».
            </p>
          </div>
        </section>
        <section className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
          <CommunityCatalog />
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
