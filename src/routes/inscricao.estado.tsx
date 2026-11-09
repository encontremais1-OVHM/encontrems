import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Check, Circle, Loader2, MessageCircle, RefreshCw, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { PaymentPanel } from "@/components/public/PaymentPanel";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiRequest, describeApiError } from "@/lib/api/client";
import { registrationStatusQuery } from "@/lib/api/endpoints";
import type { RegistrationStatus } from "@/lib/api/types";
import { isApiConfigured } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { normalizeAngolaWhatsapp } from "@/lib/phone";
import { deriveJourney, inviteLinks, type JourneyState } from "@/lib/registration";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/inscricao/estado")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } =>
    typeof search["ref"] === "string" ? { ref: search["ref"] } : {},
  head: () => ({
    meta: [
      { title: "Consultar inscrição — Encontre +" },
      {
        name: "description",
        content: "Consulte o estado da sua inscrição, do pagamento e do acesso aos grupos Encontre +.",
      },
      { property: "og:title", content: "Consultar inscrição — Encontre +" },
      {
        property: "og:description",
        content: "Estado da inscrição, pagamento e acesso aos grupos WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EstadoPage,
});

const STATUS_LABEL: Record<RegistrationStatus, { label: string; variant: "warning" | "info" | "success" | "danger" | "neutral" }> = {
  pending_payment: { label: "A aguardar pagamento", variant: "warning" },
  payment_under_review: { label: "Pagamento em validação", variant: "info" },
  approved: { label: "Aprovada", variant: "success" },
  rejected: { label: "Recusada", variant: "danger" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

function StepIcon({ state }: { state: JourneyState }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-full";
  if (state === "done") return <span className={cn(base, "bg-success text-success-foreground")}><Check className="size-4" /></span>;
  if (state === "failed") return <span className={cn(base, "bg-destructive text-destructive-foreground")}><X className="size-4" /></span>;
  if (state === "current")
    return (
      <span className={cn(base, "border-2 border-primary bg-info-soft text-primary")}>
        <span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
      </span>
    );
  return <span className={cn(base, "border-2 border-border text-muted-foreground/40")}><Circle className="size-2 fill-current" /></span>;
}

function EstadoPage() {
  const search = Route.useSearch();
  const configured = isApiConfigured();
  const [reference, setReference] = useState(search["ref"] ?? "");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ reference: string; whatsapp: string } | null>(null);

  const query = useQuery({
    ...registrationStatusQuery(lookup?.reference ?? "", lookup?.whatsapp ?? ""),
    enabled: configured && lookup !== null,
  });
  const data = query.data;
  const renewal = useMutation({
    mutationFn: () => apiRequest("/public/registrations/" + encodeURIComponent(data?.reference || "") + "/renewal", {
      method: "POST", body: { whatsapp: lookup?.whatsapp }, auth: false,
    }),
    onSuccess: () => { void query.refetch(); },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const ref = reference.trim();
    const wa = normalizeAngolaWhatsapp(phone);
    if (!ref) return setFormError("Indique o número da inscrição.");
    if (!wa) return setFormError("Indique o número de WhatsApp usado na inscrição (ex.: 923 000 000).");
    setLookup({ reference: ref, whatsapp: wa });
  }

  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="text-3xl font-black text-foreground sm:text-4xl">Consultar inscrição</h1>
        <p className="mt-2 text-muted-foreground">
          Introduza o número da inscrição e o WhatsApp usado para acompanhar o pagamento e o acesso aos grupos.
        </p>

        {!configured && (
          <Alert className="mt-6 border-primary/20 bg-info-soft">
            <AlertDescription className="text-muted-foreground">
              A consulta fica disponível assim que o servidor da Encontre + estiver ligado.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-4 rounded-2xl border bg-card p-5 shadow-card sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ref">Número da inscrição</Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} disabled={!configured} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa">WhatsApp</Label>
            <Input
              id="wa"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="923 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!configured}
            />
          </div>
          <Button type="submit" disabled={!configured || query.isFetching}>
            {query.isFetching ? <Loader2 className="animate-spin" /> : <Search />}
            Consultar
          </Button>
          {formError && <p className="text-sm font-medium text-destructive sm:col-span-3">{formError}</p>}
        </form>

        {lookup && query.isError && (
          <p className="mt-6 flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {notFound
              ? "Não encontrámos nenhuma inscrição com estes dados. Confirme o número da inscrição e o WhatsApp."
              : describeApiError(query.error)}
          </p>
        )}

        {data && lookup && (
          <div className="mt-8 space-y-6 animate-in fade-in duration-300">
            <section className="rounded-2xl border bg-card p-5 shadow-card sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display text-xl font-extrabold text-foreground">{data.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.community.name} · {(data.subgroups?.length ? data.subgroups.map((g)=>g.name) : [data.subgroup.name]).join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inscrição {data.reference} · {formatDate(data.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_LABEL[data.status].variant}>{STATUS_LABEL[data.status].label}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => query.refetch()} aria-label="Actualizar estado" disabled={query.isFetching}>
                    <RefreshCw className={cn(query.isFetching && "animate-spin")} />
                  </Button>
                </div>
              </div>

              <ol className="mt-6 space-y-0">
                {deriveJourney(data).map((s, i, all) => (
                  <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < all.length - 1 && <span className="absolute left-3.5 top-7 h-[calc(100%-1.75rem)] w-px bg-border" />}
                    <StepIcon state={s.state} />
                    <div className="pt-0.5">
                      <p className={cn("text-sm font-semibold", s.state === "pending" ? "text-muted-foreground" : "text-foreground")}>
                        {s.label}
                      </p>
                      {s.hint && <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>}
                    </div>
                  </li>
                ))}
              </ol>

              {data.subscription?.due_at && (
                <p className="mt-5 border-t pt-4 text-sm text-muted-foreground">
                  Acesso válido até <span className="font-semibold text-foreground">{formatDate(data.subscription.due_at)}</span>
                </p>
              )}
            </section>

            <WhatsAppAccess
              links={inviteLinks(data)}
              subgroupNames={data.subgroups?.map((group) => group.name) || []}
              communityStatus={data.access?.community || "pending"}
              groups={data.access?.groups || []}
            />

            {data.subscription?.due_at && Date.now() >= new Date(data.subscription.due_at).getTime() - 7 * 86400000 && data.payment?.status !== "pending" && data.status === "approved" && (
              <section className="rounded-2xl border bg-card p-5 shadow-card">
                <h2 className="font-semibold text-foreground">Renovar a participação</h2>
                <p className="mt-1 text-sm text-muted-foreground">A adesão inicial foi gratuita. A renovação mantém o acesso por mais 30 dias e custa 1.000 Kz. Pode pagar nos últimos 7 dias do período ou durante a tolerância.</p>
                {renewal.error && <p className="mt-2 text-sm text-destructive">{describeApiError(renewal.error)}</p>}
                <Button className="mt-4" onClick={() => renewal.mutate()} disabled={renewal.isPending}>
                  {renewal.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Solicitar renovação de 1.000 Kz
                </Button>
              </section>
            )}

            {data.payment && data.payment.status !== "confirmed" && data.status !== "rejected" && data.status !== "cancelled" && (
              <PaymentPanel
                payment={data.payment}
                registrationReference={data.reference}
                whatsapp={lookup.whatsapp}
                onProofSent={() => query.refetch()}
              />
            )}
          </div>
        )}

        <p className="mt-10 text-sm text-muted-foreground">
          Ainda não se inscreveu?{" "}
          <Link to="/inscricao" className="font-semibold text-primary hover:underline">
            Inscrever-me
          </Link>
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}

function WhatsAppAccess({ links, subgroupNames, communityStatus, groups }: {
  links: { community: string | null; subgroup: string | null; subgroups:Array<{id:string;name:string;url:string}> };
  subgroupNames: string[];
  communityStatus: string;
  groups: Array<{id:string;name:string;status:string;joined_at:string|null;removed_at?:string|null}>;
}) {
  if (!links.community) return null;
  return (
    <section className="rounded-2xl border border-success/30 bg-success-soft p-5 sm:p-6">
      <p className="flex items-center gap-2 font-display text-lg font-extrabold text-foreground">
        <MessageCircle className="size-5 text-success" /> Convite para a Comunidade WhatsApp
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Entre primeiro na Comunidade. Depois, dentro do WhatsApp, abra a lista de grupos e escolha os subgrupos em que pretende participar.
      </p>
      <p className="mt-3 text-sm text-foreground">
        Estado da Comunidade: <span className="font-semibold">{communityStatus === "active" ? "Entrada confirmada" : "Ainda não confirmada"}</span>
      </p>
      {subgroupNames.length > 0 && (
        <div className="mt-3 rounded-lg border px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grupos seleccionados / detectados</p>
          <ul className="mt-2 space-y-1 text-sm">
            {subgroupNames.map((name) => {
              const group = groups.find((item) => item.name === name);
              return <li key={name} className="flex items-center justify-between gap-3">
                <span>{name}</span>
                <span className={group?.status === "joined" ? "font-semibold text-success" : "text-muted-foreground"}>
                  {group?.status === "joined" ? "Entrada confirmada" : group?.status === "removed" ? "Saiu do grupo" : "A aguardar entrada"}
                </span>
              </li>;
            })}
          </ul>
        </div>
      )}
      {links.community ? (
        <div className="mt-4">
          <Button asChild>
            <a href={links.community} target="_blank" rel="noopener noreferrer">
              Abrir WhatsApp e entrar na Comunidade
            </a>
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-amber-700">O convite ainda não está disponível. Actualize o estado mais tarde ou contacte a equipa Encontre +.</p>
      )}
    </section>
  );
}
