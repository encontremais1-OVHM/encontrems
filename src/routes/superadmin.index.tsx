import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlarmClock,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  Clock4,
  LineChart,
  MessageCircle,
  ReceiptText,
  UserMinus,
  UserPlus,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";

import { ApiErrorNotice, ApiNotConfiguredNotice } from "@/components/app/ApiStatus";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { describeApiError } from "@/lib/api/client";
import { dashboardQuery } from "@/lib/api/endpoints";
import type { DashboardSummary, SeriesPoint } from "@/lib/api/types";
import { isApiConfigured } from "@/lib/config";
import { formatDate, formatKz, formatNumber } from "@/lib/format";
import { DEFAULT_PLAN } from "@/lib/plan-defaults";

export const Route = createFileRoute("/superadmin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Encontre +" },
      { name: "description", content: "Indicadores de membros, receitas e assinaturas da comunidade Encontre +." },
      { property: "og:title", content: "Dashboard — Encontre +" },
      { property: "og:description", content: "Indicadores de membros, receitas e assinaturas da comunidade Encontre +." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const configured = isApiConfigured();
  const query = useQuery(dashboardQuery());
  const loading = configured && query.isPending;
  const data = query.data;
  const t = data?.totals;
  const v = (n: number | undefined) => (t ? formatNumber(n) : "—");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Visão geral da comunidade Encontre +: membros, assinaturas, pagamentos e acessos aos grupos WhatsApp."
      />

      <ApiNotConfiguredNotice />
      {query.isError && (
        <ApiErrorNotice message={describeApiError(query.error)} onRetry={() => query.refetch()} />
      )}

      <section aria-label="Membros" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total de membros" value={v(t?.members)} icon={Users} loading={loading} />
        <StatCard label="Membros ativos" value={v(t?.active)} icon={BadgeCheck} tone="success" loading={loading} />
        <StatCard label="Em tolerância" value={v(t?.grace_period)} icon={Clock4} tone="warning" loading={loading} />
        <StatCard label="Expirados" value={v(t?.expired)} icon={UserX} tone="danger" loading={loading} />
        <StatCard label="Novas adesões" value={v(t?.new_signups)} hint="Últimos 30 dias" icon={UserPlus} tone="teal" loading={loading} />
        <StatCard label="Próximos do vencimento" value={v(t?.due_soon)} hint={`A partir do dia ${DEFAULT_PLAN.warningDay}`} icon={CalendarClock} tone="warning" loading={loading} />
        <StatCard label="Remoções pendentes" value={v(t?.removals_pending)} icon={UserMinus} tone="neutral" loading={loading} />
        <WhatsAppCard data={data} loading={loading} />
      </section>

      <section aria-label="Finanças" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Receita total" value={t ? formatKz(t.revenue_total_kz) : "—"} icon={Wallet} tone="primary" loading={loading} />
        <StatCard label="Receita do mês" value={t ? formatKz(t.revenue_month_kz) : "—"} icon={CircleDollarSign} tone="teal" loading={loading} />
        <StatCard label="Pagamentos confirmados" value={v(t?.payments_confirmed)} icon={ReceiptText} tone="success" loading={loading} />
        <StatCard label="Pagamentos pendentes" value={v(t?.payments_pending)} icon={AlarmClock} tone="warning" loading={loading} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SeriesChart
          title="Crescimento de membros"
          description="Total de membros por período"
          points={data?.series.member_growth}
          loading={loading}
          kind="area"
          color="var(--chart-1)"
          label="Membros"
        />
        <SeriesChart
          title="Evolução de receitas"
          description="Receita confirmada (Kz)"
          points={data?.series.revenue_kz}
          loading={loading}
          kind="area"
          color="var(--chart-3)"
          label="Receita"
          money
        />
        <SeriesChart
          title="Pagamentos por período"
          description="Pagamentos confirmados"
          points={data?.series.payments}
          loading={loading}
          kind="bar"
          color="var(--chart-2)"
          label="Pagamentos"
        />
        <RenewalsVsExpirations data={data} loading={loading} />
      </section>

      <SubscriptionCycle />
    </div>
  );
}

function WhatsAppCard({ data, loading }: { data?: DashboardSummary | undefined; loading: boolean }) {
  const status = data?.whatsapp.status;
  const map = {
    connected: { label: "Ligado", variant: "success" as const },
    disconnected: { label: "Desligado", variant: "danger" as const },
    error: { label: "Erro", variant: "danger" as const },
    not_configured: { label: "Não configurado", variant: "neutral" as const },
  };
  const s = status ? map[status] : null;
  return (
    <StatCard
      label="Conexão WhatsApp"
      icon={MessageCircle}
      tone="teal"
      loading={loading}
      value={s ? <Badge variant={s.variant} className="text-sm">{s.label}</Badge> : "—"}
      hint={
        data?.whatsapp.adapter === "mock"
          ? "Adaptador de simulação (não real)"
          : data?.whatsapp.last_seen_at
            ? `Última atividade: ${formatDate(data.whatsapp.last_seen_at, true)}`
            : undefined
      }
    />
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function ChartBody({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) return <Skeleton className="h-56 w-full" />;
  if (empty)
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed">
        <EmptyState
          compact
          icon={LineChart}
          title="Sem dados para apresentar"
          description="O gráfico será preenchido assim que existirem registos na base de dados."
        />
      </div>
    );
  return <>{children}</>;
}

function SeriesChart({
  title,
  description,
  points,
  loading,
  kind,
  color,
  label,
  money,
}: {
  title: string;
  description: string;
  points?: SeriesPoint[] | undefined;
  loading: boolean;
  kind: "area" | "bar";
  color: string;
  label: string;
  money?: boolean | undefined;
}) {
  const config = { value: { label, color } } satisfies ChartConfig;
  const fmt = (n: number) => (money ? formatKz(n) : formatNumber(n));
  const gradientId = `fill-${title.replace(/\W+/g, "-")}`;

  return (
    <ChartCard title={title} description={description}>
      <ChartBody loading={loading} empty={!points || points.length === 0}>
        <ChartContainer config={config} className="h-56 w-full">
          {kind === "area" ? (
            <AreaChart data={points ?? []} margin={{ left: 4, right: 8, top: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={money ? 72 : 36} tickFormatter={fmt} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill={`url(#${gradientId})`} />
            </AreaChart>
          ) : (
            <BarChart data={points ?? []} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={36} tickFormatter={fmt} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ChartContainer>
      </ChartBody>
    </ChartCard>
  );
}

function RenewalsVsExpirations({ data, loading }: { data?: DashboardSummary | undefined; loading: boolean }) {
  const merged = new Map<string, { period: string; renewals: number; expirations: number }>();
  for (const p of data?.series.renewals ?? []) {
    merged.set(p.period, { period: p.period, renewals: p.value, expirations: 0 });
  }
  for (const p of data?.series.expirations ?? []) {
    const row = merged.get(p.period) ?? { period: p.period, renewals: 0, expirations: 0 };
    row.expirations = p.value;
    merged.set(p.period, row);
  }
  const rows = [...merged.values()].sort((a, b) => a.period.localeCompare(b.period));
  const config = {
    renewals: { label: "Renovações", color: "var(--chart-1)" },
    expirations: { label: "Expirações", color: "var(--chart-5)" },
  } satisfies ChartConfig;

  return (
    <ChartCard title="Renovações e expirações" description="Comparação por período">
      <ChartBody loading={loading} empty={rows.length === 0}>
        <ChartContainer config={config} className="h-56 w-full">
          <BarChart data={rows} margin={{ left: 4, right: 8, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={36} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="renewals" fill="var(--color-renewals)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expirations" fill="var(--color-expirations)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartBody>
    </ChartCard>
  );
}

function SubscriptionCycle() {
  const steps = [
    { day: "Dia 0", title: "Pagamento confirmado", text: `${formatKz(DEFAULT_PLAN.initialPriceKz)} · adesão + 30 dias`, tone: "bg-primary" },
    { day: `Dia ${DEFAULT_PLAN.warningDay}`, title: "Aviso de renovação", text: "Notificação por WhatsApp/email", tone: "bg-brand-teal" },
    { day: `Dia ${DEFAULT_PLAN.durationDays}`, title: "Vencimento", text: `Início da tolerância de ${DEFAULT_PLAN.graceDays} dias`, tone: "bg-warning" },
    { day: `Dia ${DEFAULT_PLAN.durationDays + DEFAULT_PLAN.graceDays}`, title: "Expiração", text: "Ordens de remoção dos grupos", tone: "bg-destructive" },
  ];
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Ciclo de assinatura</h2>
        <p className="text-xs text-muted-foreground">
          Regras padrão · fuso Africa/Luanda · calculadas pelo backend
        </p>
      </div>
      <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <li key={s.day} className="relative rounded-lg bg-muted/60 p-4">
            <span className={`absolute inset-x-4 top-0 h-0.5 rounded-full ${s.tone}`} />
            <p className="text-xs font-semibold text-muted-foreground tabular">{s.day}</p>
            <p className="mt-1 text-sm font-bold text-foreground">{s.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
