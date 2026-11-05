import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, CreditCard, MessageCircle, ShieldCheck, UserPlus } from "lucide-react";

import heroImage from "@/assets/comunidade-hero.jpg";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { formatKz } from "@/lib/format";
import { DEFAULT_PLAN, SIGNUP_INTERESTS } from "@/lib/plan-defaults";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encontre + — Comunidade, oportunidades e conexões" },
      {
        name: "description",
        content:
          "Comunidade privada no WhatsApp em parceria com Oswaldina. Adesão de 1.000 Kz com 30 dias de acesso a subgrupos de negócios, tecnologia, beleza e mais.",
      },
      { property: "og:title", content: "Encontre + — Comunidade, oportunidades e conexões" },
      {
        property: "og:description",
        content: "Comunidade privada no WhatsApp em parceria com Oswaldina, em Angola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const STEPS = [
  { icon: UserPlus, title: "Inscreva-se", text: "Preencha os seus dados e escolha os seus interesses." },
  { icon: CreditCard, title: "Pague a adesão", text: `${formatKz(DEFAULT_PLAN.initialPriceKz)} incluem a adesão e os primeiros ${DEFAULT_PLAN.durationDays} dias.` },
  { icon: MessageCircle, title: "Entre na comunidade", text: "Após a confirmação recebe acesso ao grupo principal e aos subgrupos." },
];

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5">
        <Logo className="h-9 sm:h-10" />
        <Button variant="outline" size="sm" asChild>
          <Link to="/entrar">Área administrativa</Link>
        </Button>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-2 lg:pt-14">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <span className="size-1.5 rounded-full bg-brand-green" />
                Em parceria com Oswaldina
              </p>
              <h1 className="mt-5 text-4xl font-black leading-[1.05] text-foreground sm:text-5xl lg:text-6xl">
                Comunidade, <span className="text-gradient-brand">oportunidades</span> e conexões.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                Uma comunidade privada no WhatsApp para quem quer crescer em Angola — com subgrupos
                organizados por interesse e acesso gerido de forma simples e transparente.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <div className="rounded-xl border bg-card px-5 py-4 shadow-card">
                  <p className="text-xs font-medium text-muted-foreground">Adesão + 30 dias</p>
                  <p className="font-display text-3xl font-black tabular text-foreground">
                    {formatKz(DEFAULT_PLAN.initialPriceKz)}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  Renovação: <span className="font-semibold text-foreground">{formatKz(DEFAULT_PLAN.renewalPriceKz)}</span> / {DEFAULT_PLAN.durationDays} dias
                  <br />
                  <span className="text-xs">Inscrições online abrem brevemente.</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-3 -z-10 rounded-[2rem] bg-gradient-brand opacity-15 blur-2xl" />
              <img
                src={heroImage}
                alt="Membros da comunidade Encontre + a conversar pelo telemóvel"
                width={1280}
                height={960}
                className="aspect-[4/3] w-full rounded-3xl object-cover shadow-elevated"
              />
            </div>
          </div>
        </section>

        <section className="border-y bg-muted/50">
          <div className="mx-auto max-w-6xl px-5 py-14">
            <h2 className="text-2xl font-extrabold text-foreground">Como funciona</h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border bg-card p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-info-soft text-primary">
                      <s.icon className="size-4" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground tabular">Passo {i + 1}</span>
                  </div>
                  <p className="mt-4 font-display text-lg font-bold text-foreground">{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground">Subgrupos por interesse</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Escolha os temas que lhe interessam no momento da inscrição.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {SIGNUP_INTERESTS.map((i) => (
                <li key={i} className="rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground">
                  {i}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border p-5">
              <BellRing className="size-5 text-brand-teal" />
              <p className="mt-3 font-semibold text-foreground">Aviso antes do vencimento</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Recebe um lembrete no dia {DEFAULT_PLAN.warningDay} e tem {DEFAULT_PLAN.graceDays} dias de tolerância após o vencimento.
              </p>
            </div>
            <div className="rounded-xl border p-5">
              <ShieldCheck className="size-5 text-brand-teal" />
              <p className="mt-3 font-semibold text-foreground">Comunidade privada</p>
              <p className="mt-1 text-sm text-muted-foreground">
                O acesso aos grupos só é dado após a confirmação do pagamento.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Encontre + · Angola</p>
          <Link to="/entrar" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            Entrar no painel <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
