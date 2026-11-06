import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Building2,
  Clock3,
  CreditCard,
  Handshake,
  LayoutGrid,
  Lightbulb,
  MessageCircle,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";

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
          "Uma cadeia comunitária em Angola que conecta pessoas, profissionais e negócios para partilhar oportunidades, colaborar e crescer em conjunto.",
      },
      { property: "og:title", content: "Encontre + — Comunidade. Oportunidade. Conexão." },
      {
        property: "og:description",
        content: "Conectamos quem procura com quem pode oferecer. Juntos, criamos mais oportunidades.",
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

const audiences = [
  {
    icon: Search,
    title: "Pessoas à procura de emprego",
    text: "Encontre oportunidades de trabalho, contactos e caminhos para crescer profissionalmente.",
  },
  {
    icon: Building2,
    title: "Empresas",
    text: "Descubra trabalhadores, profissionais qualificados e parceiros para as necessidades do seu negócio.",
  },
  {
    icon: Lightbulb,
    title: "Empreendedores",
    text: "Partilhe ideias, encontre potenciais sócios e transforme projectos em iniciativas concretas.",
  },
  {
    icon: Store,
    title: "Negócios",
    text: "Ligue-se a clientes, fornecedores, investidores e novas oportunidades comerciais.",
  },
  {
    icon: UserRound,
    title: "Profissionais independentes",
    text: "Apresente os seus serviços, conquiste clientes e crie relações profissionais.",
  },
  {
    icon: Handshake,
    title: "Projectos e iniciativas",
    text: "Encontre colaboradores, parceiros e pessoas que possam ajudar a fazer acontecer.",
  },
];

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
                Comunidade. Oportunidade. Conexão.
              </p>
              <h1 className="mt-6 max-w-2xl text-[2.45rem] font-black leading-[1.04] tracking-tight text-foreground sm:text-5xl lg:text-[3.7rem]">
                Tem algo para oferecer?
                <span className="mt-1 block text-gradient-brand">Está à procura de uma oportunidade?</span>
                <span className="mt-1 block">Comece aqui.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Encontre clientes, parceiros, fornecedores, profissionais e oportunidades de emprego num ecossistema criado para conectar quem procura com quem pode oferecer.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="h-12 px-7 text-base font-semibold">
                  <Link to="/comunidades">
                    Explorar comunidades <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base font-semibold">
                  <Link to="/inscricao">Fazer parte da comunidade</Link>
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

        {/* Quem somos */}
        <section id="quem-somos" className="border-t bg-muted/30" aria-labelledby="quem-somos-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div className="order-2 overflow-hidden rounded-3xl shadow-elevated ring-1 ring-foreground/10 lg:order-1">
              <img
                src="/images/encontre-quem-somos.jpg"
                alt="Pessoas de diferentes origens unem as mãos num gesto de colaboração."
                width={678}
                height={452}
                loading="lazy"
                className="h-full max-h-[430px] w-full object-cover"
              />
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">A nossa identidade</p>
              <h2 id="quem-somos-title" className="mt-3 text-3xl font-black leading-tight text-foreground sm:text-4xl">
                Quem somos?
              </h2>
              <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  A <strong className="text-foreground">Encontre +</strong> é uma cadeia comunitária onde o apoio financeiro, as oportunidades e o crescimento acontecem através da colaboração entre os próprios membros.
                </p>
                <p>
                  Nascemos em Angola com um propósito: organizar e conectar pessoas e negócios que acreditam que juntos podem crescer mais.
                </p>
                <p>
                  Criamos conexões, estabelecemos regras e construímos uma estrutura que incentiva a cooperação, a circulação de oportunidades e o fortalecimento dos negócios locais.
                </p>
                <p>
                  Na Encontre +, acreditamos que uma comunidade forte é construída por pessoas que participam, contribuem e apoiam umas às outras.
                </p>
              </div>
              <p className="mt-6 border-l-4 border-brand-teal pl-4 text-lg font-extrabold text-foreground">
                Nós criamos a estrutura. Os membros fazem a cadeia girar.
              </p>
            </div>
          </div>
        </section>

        {/* O que fazemos */}
        <section id="o-que-fazemos" aria-labelledby="o-que-fazemos-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">A nossa missão</p>
              <h2 id="o-que-fazemos-title" className="mt-3 text-3xl font-black leading-tight text-foreground sm:text-4xl">
                O que fazemos?
              </h2>
              <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  A Encontre + é um ecossistema comunitário que nasceu em Angola para responder a um desafio: os recursos financeiros circulam pouco dentro do nosso próprio mercado, enquanto muitos negócios e profissionais continuam à procura de oportunidades para crescer.
                </p>
                <p>
                  Para mudar essa realidade, criamos a <strong className="text-foreground">Cadeia Comunitária</strong>: um modelo que incentiva pessoas e negócios a apoiarem-se mutuamente, partilharem oportunidades e fortalecerem a economia dentro da comunidade.
                </p>
                <p>
                  Não somos apenas um grupo de descontos. Somos uma rede de conexões, colaboração e oportunidades.
                </p>
                <p>
                  Acreditamos que, quando o conhecimento circula, surgem novas oportunidades. Quando os negócios se apoiam, fortalecem-se. E quando os recursos circulam dentro da comunidade, todos têm mais possibilidades de crescer.
                </p>
              </div>
              <p className="mt-6 text-lg font-extrabold text-foreground">
                O crescimento de um pode tornar-se uma oportunidade para muitos.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl bg-muted shadow-elevated ring-1 ring-foreground/10">
              <img
                src="/images/encontre-cadeia.jpg"
                alt="Mãos unidas representam uma cadeia de apoio e colaboração."
                width={468}
                height={298}
                loading="lazy"
                className="h-full max-h-[390px] w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Junte-se à comunidade */}
        <section id="junte-se" className="border-y bg-muted/30" aria-labelledby="junte-se-title">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div className="overflow-hidden rounded-3xl shadow-elevated ring-1 ring-foreground/10">
              <img
                src="/images/encontre-quem-somos.jpg"
                alt="Uma comunidade diversa de pessoas que se encontram e trocam oportunidades."
                width={740}
                height={740}
                loading="lazy"
                className="aspect-square max-h-[460px] w-full object-cover"
              />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">Junte-se à nossa comunidade</p>
              <h2 id="junte-se-title" className="mt-3 text-3xl font-black leading-tight text-foreground sm:text-4xl">
                Encontre quem pode crescer consigo.
              </h2>
              <p className="mt-3 text-lg font-semibold text-foreground">Parceiros, sócios e novas oportunidades.</p>
              <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>Ninguém precisa de crescer sozinho.</p>
                <p>
                  Na Encontre +, pode encontrar pessoas com objectivos, ideias e interesses em comum. Crie parcerias, encontre potenciais sócios e transforme conexões em oportunidades reais.
                </p>
                <p>
                  Partilhe experiências, conhecimentos, serviços e oportunidades de negócio. Conheça pessoas, descubra possibilidades e construa relações que podem abrir portas para o seu futuro.
                </p>
              </div>
              <p className="mt-6 text-lg font-extrabold text-foreground">
                Juntos, podemos chegar mais longe do que chegaríamos sozinhos.
              </p>
              <Button asChild size="lg" className="mt-7 h-12 px-7 font-semibold">
                <Link to="/inscricao">Juntar-me à Encontre + <ArrowUpRight /></Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Para quem é */}
        <section id="para-quem" aria-labelledby="para-quem-title">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-teal">Um lugar para todos</p>
              <h2 id="para-quem-title" className="mt-3 text-3xl font-black text-foreground sm:text-4xl">
                Para quem é esta comunidade?
              </h2>
              <p className="mt-4 text-muted-foreground">
                A Encontre + foi criada para conectar pessoas e organizações com diferentes objectivos, mas com algo em comum: a vontade de encontrar oportunidades e crescer.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {audiences.map((audience) => (
                <article key={audience.title} className="rounded-2xl border bg-card p-6 shadow-card transition-transform hover:-translate-y-1">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-info-soft text-primary">
                    <audience.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-extrabold text-foreground">{audience.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{audience.text}</p>
                </article>
              ))}
            </div>
            <p className="mx-auto mt-9 max-w-3xl text-center text-base font-semibold leading-relaxed text-foreground">
              Se tem algo para oferecer ou procura algo que possa ajudar o seu crescimento, existe espaço para si na Encontre +.
            </p>
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

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Faça parte da cadeia. Encontre mais oportunidades.</h2>
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
