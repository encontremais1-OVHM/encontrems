import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";

import { EmptyState } from "@/components/app/EmptyState";
import { PaymentPanel } from "@/components/public/PaymentPanel";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicHeader } from "@/components/public/PublicHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, describeApiError } from "@/lib/api/client";
import { createRegistration, publicCommunitiesQuery, registrationStatusQuery } from "@/lib/api/endpoints";
import type { PublicCommunity, RegistrationReceipt } from "@/lib/api/types";
import { ANGOLA_PROVINCES } from "@/lib/angola";
import { isApiConfigured } from "@/lib/config";
import { formatPhone } from "@/lib/format";
import { normalizeAngolaWhatsapp } from "@/lib/phone";
import { SIGNUP_INTERESTS } from "@/lib/plan-defaults";
import { cn } from "@/lib/utils";

interface InscricaoSearch {
  comunidade?: string;
  subgrupo?: string;
}

export const Route = createFileRoute("/inscricao/")({
  validateSearch: (search: Record<string, unknown>): InscricaoSearch => ({
    ...(typeof search["comunidade"] === "string" ? { comunidade: search["comunidade"] } : {}),
    ...(typeof search["subgrupo"] === "string" ? { subgrupo: search["subgrupo"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Inscrever-me — Encontre +" },
      {
        name: "description",
        content: "Escolha a comunidade e os subgrupos, preencha os seus dados e entre gratuitamente durante os primeiros 30 dias.",
      },
      { property: "og:title", content: "Inscrever-me — Encontre +" },
      {
        property: "og:description",
        content: "Inscrição nas comunidades Encontre + no WhatsApp, em Angola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InscricaoPage,
});

const STEPS = ["Comunidade", "Subgrupo", "Os seus dados", "Confirmar"] as const;

const dataSchema = z.object({
  full_name: z.string().trim().min(3, "Indique o nome completo.").max(120, "Nome demasiado longo."),
  whatsapp: z.string().trim().min(1, "Indique o número de WhatsApp."),
  email: z
    .string()
    .trim()
    .max(255)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Email inválido."),
  province: z.string().min(1, "Escolha a província."),
  city: z.string().trim().min(2, "Indique a cidade ou município.").max(80),
});

type FormData = z.infer<typeof dataSchema> & { interests: string[] };
type FieldErrors = Partial<Record<keyof FormData, string>>;

const EMPTY_FORM: FormData = { full_name: "", whatsapp: "", email: "", province: "", city: "", interests: [] };

function Stepper({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progresso da inscrição">
      {STEPS.map((label, i) => (
        <li key={label} className="min-w-0">
          <div className={cn("h-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-border")} />
          <p
            className={cn(
              "mt-2 truncate text-xs font-semibold",
              i === step ? "text-foreground" : "text-muted-foreground",
            )}
            aria-current={i === step ? "step" : undefined}
          >
            <span className="tabular">{i + 1}.</span> {label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function OptionCard({
  selected,
  onSelect,
  title,
  description,
  imageUrl,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-card",
        selected && "border-primary ring-2 ring-primary/15",
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <UsersRound className="size-6" />
        </span>
      )}
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected && <Check className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}

function InscricaoPage() {
  const search = Route.useSearch();
  const configured = isApiConfigured();
  const catalog = useQuery(publicCommunitiesQuery());
  const communities = useMemo(() => catalog.data?.data ?? [], [catalog.data]);

  const [step, setStep] = useState(0);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [subgroupIds, setSubgroupIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);
  const [preselected, setPreselected] = useState(false);
  const whatsappWindowRef = useRef<Window | null>(null);

  const community: PublicCommunity | undefined = communities.find((c) => c.id === communityId);
  const selectedSubgroups = community?.subgroups.filter((s) => subgroupIds.includes(s.id)) ?? [];
  const normalizedPhone = normalizeAngolaWhatsapp(form.whatsapp);

  // Preselect the community (and subgroup) passed from the catalogue.
  useEffect(() => {
    if (preselected || communities.length === 0 || !search.comunidade) return;
    const c = communities.find((x) => x.slug === search.comunidade);
    if (c) {
      setCommunityId(c.id);
      const s = search.subgrupo ? c.subgroups.find((x) => x.slug === search.subgrupo) : undefined;
      if (s) {
        setSubgroupIds([s.id]);
        setStep(2);
      } else {
        setStep(1);
      }
    }
    setPreselected(true);
  }, [communities, search.comunidade, search.subgrupo, preselected]);

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateData(): boolean {
    const parsed = dataSchema.safeParse(form);
    const next: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormData;
        next[key] ??= issue.message;
      }
    }
    if (!next.whatsapp && !normalizeAngolaWhatsapp(form.whatsapp)) {
      next.whatsapp = "Número inválido. Use um número angolano, ex.: 923 000 000.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    const firstSubgroup = selectedSubgroups[0];
    if (!community || !firstSubgroup || !normalizedPhone) return;
    setSubmitError(null);
    setSubmitting(true);
    // Open a blank tab during the user's click so the browser permits the
    // WhatsApp deep link to open after the server confirms actual membership.
    if (!whatsappWindowRef.current || whatsappWindowRef.current.closed) {
      whatsappWindowRef.current = window.open("about:blank", "_blank");
    }
    try {
      const res = await createRegistration({
        community_id: community.id,
        subgroup_ids: selectedSubgroups.map((s) => s.id),
        subgroup_id: firstSubgroup.id,
        full_name: form.full_name.trim(),
        whatsapp: normalizedPhone,
        email: form.email.trim() === "" ? null : form.email.trim(),
        province: form.province,
        city: form.city.trim(),
        interests: form.interests,
      });
      setReceipt(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (whatsappWindowRef.current && !whatsappWindowRef.current.closed) {
        whatsappWindowRef.current.close();
      }
      whatsappWindowRef.current = null;
      if (err instanceof ApiError && err.status === 422 && err.body && typeof err.body === "object") {
        const apiErrors = (err.body as { errors?: Record<string, string[]> }).errors ?? {};
        const mapped: FieldErrors = {};
        for (const [k, v] of Object.entries(apiErrors)) {
          if (k in EMPTY_FORM && v[0]) mapped[k as keyof FormData] = v[0];
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          setStep(2);
        }
      }
      setSubmitError(describeApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function onDataSubmit(e: FormEvent) {
    e.preventDefault();
    if (validateData()) setStep(3);
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        {receipt && community && selectedSubgroups.length > 0 && normalizedPhone ? (
          <Receipt receipt={receipt} communityName={community.name} subgroupNames={selectedSubgroups.map((s)=>s.name)} whatsapp={normalizedPhone} whatsappWindowRef={whatsappWindowRef} />
        ) : (
          <>
            <h1 className="text-3xl font-black text-foreground sm:text-4xl">Inscrever-me</h1>
            <p className="mt-2 text-muted-foreground">
              Escolha a comunidade e os subgrupos, preencha os seus dados e confirme a inscrição.
            </p>

            <div className="mt-8">
              <Stepper step={step} />
            </div>

            {!configured ? (
              <Alert className="mt-8 border-primary/20 bg-info-soft">
                <AlertDescription className="text-muted-foreground">
                  As inscrições online abrem assim que o servidor da Encontre + estiver ligado. Entretanto, pode{" "}
                  <Link to="/comunidades" className="font-semibold text-primary underline-offset-4 hover:underline">
                    conhecer as comunidades
                  </Link>
                  .
                </AlertDescription>
              </Alert>
            ) : catalog.isPending ? (
              <div className="mt-8 space-y-3" aria-busy="true">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            ) : catalog.isError ? (
              <div className="mt-8 rounded-2xl border">
                <EmptyState
                  icon={AlertCircle}
                  title="Não foi possível carregar as comunidades"
                  description={describeApiError(catalog.error)}
                  action={
                    <Button variant="outline" size="sm" onClick={() => catalog.refetch()}>
                      Tentar novamente
                    </Button>
                  }
                />
              </div>
            ) : communities.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed">
                <EmptyState
                  icon={UsersRound}
                  title="Ainda não há comunidades abertas a inscrições"
                  description="Volte em breve."
                />
              </div>
            ) : (
              <div className="mt-8">
                {step === 0 && (
                  <section className="space-y-3 animate-in fade-in duration-300">
                    <h2 className="text-lg font-extrabold text-foreground">Escolha a comunidade</h2>
                    {communities.map((c) => (
                      <OptionCard
                        key={c.id}
                        selected={c.id === communityId}
                        onSelect={() => {
                          if (c.id !== communityId) setSubgroupIds([]);
                          setCommunityId(c.id);
                        }}
                        title={c.name}
                        description={c.description}
                        imageUrl={c.image_url}
                      />
                    ))}
                    <div className="flex justify-end pt-3">
                      <Button onClick={() => setStep(1)} disabled={!community}>
                        Continuar <ArrowRight />
                      </Button>
                    </div>
                  </section>
                )}

                {step === 1 && community && (
                  <section className="space-y-3 animate-in fade-in duration-300">
                    <h2 className="text-lg font-extrabold text-foreground">Escolha os subgrupos de {community.name}</h2>
                    <p className="text-sm text-muted-foreground">Pode escolher um ou vários subgrupos para integrar.</p>
                    {community.subgroups.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Esta comunidade ainda não tem subgrupos abertos. Escolha outra comunidade.
                      </p>
                    ) : (
                      community.subgroups.map((s) => (
                        <OptionCard
                          key={s.id}
                          selected={subgroupIds.includes(s.id)}
                          onSelect={() => setSubgroupIds((current)=>current.includes(s.id)?current.filter((id)=>id!==s.id):[...current,s.id])}
                          title={s.name}
                          description={s.description}
                          imageUrl={s.image_url}
                        />
                      ))
                    )}
                    <div className="flex justify-between pt-3">
                      <Button variant="ghost" onClick={() => setStep(0)}>
                        <ArrowLeft /> Voltar
                      </Button>
                      <Button onClick={() => setStep(2)} disabled={selectedSubgroups.length===0}>
                        Continuar <ArrowRight />
                      </Button>
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <form onSubmit={onDataSubmit} noValidate className="space-y-5 animate-in fade-in duration-300">
                    <h2 className="text-lg font-extrabold text-foreground">Os seus dados</h2>
                    <Field id="full_name" label="Nome completo" error={errors.full_name}>
                      <Input
                        id="full_name"
                        autoComplete="name"
                        value={form.full_name}
                        onChange={(e) => update("full_name", e.target.value)}
                        aria-invalid={Boolean(errors.full_name)}
                      />
                    </Field>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field id="whatsapp" label="Número de WhatsApp" hint="Ex.: 923 000 000" error={errors.whatsapp}>
                        <Input
                          id="whatsapp"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={form.whatsapp}
                          onChange={(e) => update("whatsapp", e.target.value)}
                          aria-invalid={Boolean(errors.whatsapp)}
                        />
                      </Field>
                      <Field id="email" label="Email (opcional)" error={errors.email}>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          value={form.email}
                          onChange={(e) => update("email", e.target.value)}
                          aria-invalid={Boolean(errors.email)}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field id="province" label="Província" error={errors.province}>
                        <Select value={form.province} onValueChange={(v) => update("province", v)}>
                          <SelectTrigger id="province" aria-invalid={Boolean(errors.province)}>
                            <SelectValue placeholder="Escolha a província" />
                          </SelectTrigger>
                          <SelectContent>
                            {ANGOLA_PROVINCES.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field id="city" label="Cidade / Município" error={errors.city}>
                        <Input
                          id="city"
                          autoComplete="address-level2"
                          value={form.city}
                          onChange={(e) => update("city", e.target.value)}
                          aria-invalid={Boolean(errors.city)}
                        />
                      </Field>
                    </div>
                    <fieldset>
                      <legend className="text-sm font-medium text-foreground">Outros interesses (opcional)</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {SIGNUP_INTERESTS.map((i) => {
                          const on = form.interests.includes(i);
                          return (
                            <button
                              key={i}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                update("interests", on ? form.interests.filter((x) => x !== i) : [...form.interests, i])
                              }
                              className={cn(
                                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                                on
                                  ? "border-primary bg-info-soft text-primary"
                                  : "bg-card text-foreground hover:border-primary/40",
                              )}
                            >
                              {i}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="flex justify-between pt-3">
                      <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                        <ArrowLeft /> Voltar
                      </Button>
                      <Button type="submit">
                        Rever inscrição <ArrowRight />
                      </Button>
                    </div>
                  </form>
                )}

                {step === 3 && community && selectedSubgroups.length > 0 && (
                  <section className="space-y-5 animate-in fade-in duration-300">
                    <h2 className="text-lg font-extrabold text-foreground">Confirme a sua inscrição</h2>
                    <dl className="divide-y rounded-2xl border bg-card">
                      {[
                        ["Comunidade", community.name],
                        ["Subgrupos", selectedSubgroups.map((s)=>s.name).join(", ")],
                        ["Nome", form.full_name.trim()],
                        ["WhatsApp", formatPhone(normalizedPhone)],
                        ["Email", form.email.trim() || "—"],
                        ["Localização", `${form.city.trim()}, ${form.province}`],
                        ["Interesses", form.interests.length ? form.interests.join(", ") : "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-3 text-sm">
                          <dt className="text-muted-foreground">{k}</dt>
                          <dd className="font-medium text-foreground">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {submitError && (
                      <p className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-destructive">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {submitError}
                      </p>
                    )}
                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}>
                        <ArrowLeft /> Corrigir dados
                      </Button>
                      <Button onClick={submit} disabled={submitting} className="font-semibold">
                        {submitting ? <Loader2 className="animate-spin" /> : <Check />}
                        Confirmar inscrição
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Receipt({
  receipt,
  communityName,
  subgroupNames,
  whatsapp,
  whatsappWindowRef,
}: {
  receipt: RegistrationReceipt;
  communityName: string;
  subgroupNames: string[];
  whatsapp: string;
  whatsappWindowRef: { current: Window | null };
}) {
  const liveStatus = useQuery(registrationStatusQuery(receipt.reference, whatsapp));
  const liveAccess = liveStatus.data?.access;
  const communityJoined = liveAccess?.community === "active" || receipt.access?.community === "joined";
  const communityFailed = liveAccess?.community === "failed";
  const communityRetrying = liveAccess?.community === "retrying";
  const communityError = liveAccess?.community_error || null;
  const communityInviteUrl = liveAccess?.community_invite_url || receipt.access?.community_invite_url || null;
  const liveGroups = liveAccess?.groups ?? [];
  const currentSubgroups = (receipt.access?.subgroups ?? []).map((group) => {
    const liveGroup = liveGroups.find((item) => item.id === group.id);
    return { ...group, status: liveGroup?.status === "joined" ? "joined" as const : group.status };
  });
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [showManualOpen, setShowManualOpen] = useState(false);

  useEffect(() => {
    if (!communityJoined || !communityInviteUrl || whatsappOpened) return;
    const popup = whatsappWindowRef.current;
    if (popup && !popup.closed) {
      try {
        popup.opener = null;
        popup.location.replace(communityInviteUrl);
        whatsappWindowRef.current = null;
        setWhatsappOpened(true);
      } catch {
        setShowManualOpen(true);
      }
    } else {
      setShowManualOpen(true);
    }
  }, [communityJoined, communityInviteUrl, whatsappOpened, whatsappWindowRef]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-success-soft text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-black text-foreground sm:text-3xl">Inscrição registada</h1>
          <p className="mt-1 text-muted-foreground">
            {communityName} · {subgroupNames.join(", ")}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-muted/50 p-5">
        <p className="text-sm text-muted-foreground">Número da inscrição — guarde-o para consultar o estado</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-wide text-foreground">{receipt.reference}</p>
      </div>

      {receipt.access && (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <div>
            <h2 className="font-bold text-foreground">Acesso à Comunidade Encontre +</h2>
            <p className="mt-1 text-sm text-muted-foreground">{communityFailed ? "O WhatsApp não reconheceu o número indicado nesta inscrição. Corrija o número para podermos concluir a entrada." : communityRetrying ? (communityError || "O WhatsApp está a limitar temporariamente as tentativas. A plataforma vai tentar novamente automaticamente; não precisa de fazer outra inscrição.") : communityJoined ? "A sua entrada foi confirmada pelo WhatsApp." : "A conta administradora está a adicionar automaticamente o seu número à Comunidade e aos subgrupos seleccionados. O WhatsApp será aberto assim que a entrada for confirmada."}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-3 text-sm">
            <span className="font-medium text-foreground">{communityName} · Comunidade principal</span>
            <span className={communityJoined ? "font-semibold text-success" : "font-semibold text-amber-600"}>{communityFailed ? "Número não reconhecido no WhatsApp" : communityRetrying ? "Nova tentativa automática agendada" : communityJoined ? "Entrada confirmada pelo WhatsApp" : "Adição automática em curso"}</span>
          </div>
          {receipt.access.subgroups.length > 0 && (
            <div className="rounded-lg border px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subgrupos seleccionados</p>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                {currentSubgroups.map((group) => (
                  <li key={group.id} className="flex items-center justify-between gap-3">
                    <span>{group.name}</span>
                    <span className={group.status === "joined" ? "text-xs font-semibold text-success" : "text-xs text-muted-foreground"}>{group.status === "joined" ? "Entrada confirmada" : "Adição em curso"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-muted-foreground">O estado será actualizado automaticamente assim que o WhatsApp confirmar a participação. Guarde o número da inscrição para acompanhar o processo.</p>
        </section>
      )}
      {communityFailed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {communityError || "O WhatsApp não reconheceu o número indicado. Confirme o número completo com o indicativo +244 e tente novamente."}
        </div>
      )}
      {communityJoined && communityInviteUrl && showManualOpen && (
        <Button className="w-full" onClick={() => window.open(communityInviteUrl, "_blank", "noopener,noreferrer")}>
          Abrir Comunidade no WhatsApp <ArrowRight />
        </Button>
      )}
      {communityJoined && whatsappOpened && (
        <p className="text-sm font-semibold text-success">O WhatsApp foi aberto na Comunidade Encontre +.</p>
      )}
      {communityJoined && !communityInviteUrl && (
        <p className="text-sm text-muted-foreground">Entrada confirmada. A preparar a abertura do WhatsApp…</p>
      )}
      <PaymentPanel payment={receipt.payment} registrationReference={receipt.reference} whatsapp={whatsapp} />

      <p className="text-sm text-muted-foreground">
        Os 30 dias começam apenas depois da confirmação real da entrada na Comunidade. A conta administradora Encontre + adicionará o seu número aos grupos seleccionados.
      </p>
      <Button variant="outline" asChild>
        <Link to="/inscricao/estado" search={{ ref: receipt.reference }}>
          Consultar estado da inscrição <ArrowRight />
        </Link>
      </Button>
    </div>
  );
}
