import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BellRing, Clock3, CreditCard, LayoutGrid, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";

import { CommunityCatalog } from "@/components/public/CommunityCatalog";
import { HeroColumns } from "@/components/public/HeroColumns";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Button } from "@/components/ui/button";
import { publicPlanQuery } from "@/lib/api/endpoints";
import { formatKz } from "@/lib/format";
import { DEFAULT_PLAN } from "@/lib/plan-defaults";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Encontre + — Comunidade. Oportunidade. Conexão." },
      {
        name: "description",
        content:
          "Comunidades privadas no WhatsApp onde pessoas, profissionais, empreendedores e negócios em Angola se encontram, partilham oportunidades e criam conexões.",
      },
      { property: "og:title", content: "Encontre + — Comunidade. Oportunidade. Conexão." },
      {
        property: "og:description",
        content: "Comunidades e subgrupos no WhatsApp para pessoas, profissionais e negócios em Angola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

/** Plan values from the backend when available; display-only fallback otherwise. */
function usePlan() {
  const plan = useQuery(publicPlanQuery());
  return {
    initialPriceKz: plan.data?.initial_price_kz ?? DEFAULT_PLAN.initialPriceKz,
    renewalPriceKz: plan.data?.renewal_price_kz ?? DEFAULT_PLAN.renewalPriceKz,
    durationDays: plan.data?.duration_days ?? DEFAULT_PLAN.durationDays,
    warningDay: plan.data?.warning_day ?? DEFAULT_PLAN.warningDay,
    graceDays: plan.data?.grace_days ?? DEFAULT_PLAN.graceDays,
  };
}

function Home() {
  const plan = usePlan();

  const steps = [
    { icon: UsersRound, title: "Escolha a comunidade", text: "Explore as comunidades e veja a finalidade de cada uma." },
    { icon: LayoutGrid, title: "Seleccione o subgrupo", text: "Cada comunidade tem subgrupos por actividade ou interesse." },
    {
      icon: CreditCard,
      title: "Pague a adesão",
      text: `${formatKz(plan.initialPriceKz)} incluem a adesão e os primeiros ${plan.durationDays} dias.`,
    },
    { icon: MessageCircle, title: "Entre no WhatsApp", text: "Após a confirmação, recebe o acesso à comunidade e ao subgrupo." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="surface-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-14 pt-8 sm:pt-12 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-20 lg:pt-10">
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-700">
              <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground shadow-card">
                <span className="size-1.5 rounded-full bg-brand-green" />
                Comunidades privadas no WhatsApp · Angola
              </p>
              <h1 className="mt-6 text-[2.6rem] font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]">
                Comunidade.
                <br />
                <span className="text-gradient-brand">Oportunidade.</span>
                <br />
                Conexão.
              </h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
                O espaço onde pessoas, profissionais, empreendedores e negócios se encontram para partilhar
                oportunidades e criar ligações que fazem crescer.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="h-12 px-7 text-base font-semibold">
                  <Link to="/comunidades">
                    Explorar comunidades <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base font-semibold">
                  <Link to="/inscricao">Inscrever-me</Link>
                </Button>
              </div>

              <p className="mt-6 text-sm text-muted-foreground">
                Adesão de <span className="font-bold text-foreground tabular">{formatKz(plan.initialPriceKz)}</span> com{" "}
                {plan.durationDays} dias de acesso incluídos.
              </p>
            </div>

            <HeroColumns className="h-[360px] sm:h-[480px] lg:h-[600px]" />
          </div>
        </section>

        {/* Explorar comunidades */}
        <section className="border-t bg-muted/40" aria-labelledby="explorar">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">Explorar comunidades</p>
                <h2 id="explorar" className="mt-2 text-3xl font-black text-foreground sm:text-4xl">
                  Encontre o seu lugar
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Cada comunidade reúne subgrupos dedicados a uma actividade. Conheça-os antes de entrar.
                </p>
              </div>
              <Button variant="ghost" asChild className="self-start font-semibold text-primary sm:self-auto">
                <Link to="/comunidades">
                  Ver todas <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="mt-10">
              <CommunityCatalog limit={3} />
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20" aria-labelledby="como-funciona">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">Como funciona</p>
          <h2 id="como-funciona" className="mt-2 max-w-xl text-3xl font-black text-foreground sm:text-4xl">
            Da inscrição ao WhatsApp em quatro passos
          </h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-primary">
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-display text-sm font-black text-muted-foreground/70 tabular">0{i + 1}</span>
                  {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-border lg:block" />}
                </div>
                <p className="mt-5 font-display text-lg font-extrabold text-foreground">{s.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Regras e acesso */}
        <section className="border-y bg-muted/40" aria-labelledby="regras">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:py-20 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
            <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Adesão</p>
              <p className="mt-3 font-display text-5xl font-black tabular text-foreground">
                {formatKz(plan.initialPriceKz)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">inclui os primeiros {plan.durationDays} dias</p>
              <div className="my-6 h-px bg-border" />
              <p className="text-sm text-foreground">
                Renovação: <span className="font-bold tabular">{formatKz(plan.renewalPriceKz)}</span> a cada{" "}
                {plan.durationDays} dias
              </p>
              <Button asChild className="mt-6 w-full font-semibold">
                <Link to="/inscricao">Inscrever-me</Link>
              </Button>
            </div>

            <div>
              <h2 id="regras" className="text-3xl font-black text-foreground sm:text-4xl">
                Regras claras, acesso seguro
              </h2>
              <ul className="mt-8 space-y-6">
                <li className="flex gap-4">
                  <BellRing className="mt-0.5 size-5 shrink-0 text-brand-teal" />
                  <div>
                    <p className="font-semibold text-foreground">Lembrete antes do vencimento</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Recebe um aviso no dia {plan.warningDay} para renovar sem interrupções.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-brand-teal" />
                  <div>
                    <p className="font-semibold text-foreground">{plan.graceDays} dias de tolerância</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Depois desse prazo sem renovação, o acesso aos grupos é retirado.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-teal" />
                  <div>
                    <p className="font-semibold text-foreground">Comunidade privada</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      O acesso aos grupos só é disponibilizado depois de a inscrição e o pagamento serem confirmados.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Pronto para encontrar mais?</h2>
              <p className="mt-2 text-sm text-primary-foreground/80">
                Já se inscreveu?{" "}
                <Link to="/inscricao/estado" className="font-semibold underline underline-offset-4">
                  Consulte o estado da inscrição
                </Link>
                .
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" asChild className="font-semibold">
                <Link to="/inscricao">Inscrever-me</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                asChild
                className="font-semibold text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/comunidades">Explorar comunidades</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
