import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiErrorNotice, ApiNotConfiguredNotice } from "@/components/app/ApiStatus";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import {
  AccessBadge,
  SUBSCRIPTION_STATUS_OPTIONS,
  SubscriptionBadge,
} from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { membersQuery, type MemberFilters } from "@/lib/api/endpoints";
import { isApiConfigured } from "@/lib/config";
import { formatDate, formatNumber, formatPhone } from "@/lib/format";

export const Route = createFileRoute("/superadmin/membros")({
  head: () => ({
    meta: [
      { title: "Membros — Encontre +" },
      { name: "description", content: "Pesquisa, filtros e estado de assinatura dos membros da comunidade Encontre +." },
      { property: "og:title", content: "Membros — Encontre +" },
      { property: "og:description", content: "Pesquisa, filtros e estado de assinatura dos membros da comunidade Encontre +." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MembersPage,
});

function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function MembersPage() {
  const configured = isApiConfigured();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<NonNullable<MemberFilters["status"]>>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setPage(1), [debouncedSearch, status, from, to]);

  const query = useQuery({
    ...membersQuery({ search: debouncedSearch, status, from, to, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => apiRequest<{message:string}>(`/admin/members/${memberId}/remove`, { method: "POST" }),
    onSuccess: async (result) => {
      window.alert(result.message);
      await query.refetch();
    },
  });

  const hasFilters = search !== "" || status !== "all" || from !== "" || to !== "";
  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setFrom("");
    setTo("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membros"
        description="Consulte e filtre os membros inscritos, o estado da assinatura e o acesso aos grupos WhatsApp."
        actions={
          meta && (
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular">{formatNumber(meta.total)}</span>{" "}
              membros
            </span>
          )
        }
      />

      <ApiNotConfiguredNotice />
      {query.isError && (
        <ApiErrorNotice message={describeApiError(query.error)} onRetry={() => query.refetch()} />
      )}
      {removeMember.isError && (
        <ApiErrorNotice message={describeApiError(removeMember.error)} onRetry={() => removeMember.reset()} />
      )}

      <section className="rounded-xl border bg-card shadow-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, WhatsApp ou email"
              className="pl-9"
              aria-label="Pesquisar membros"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex">
            <Select value={status} onValueChange={(v) => setStatus(v as NonNullable<MemberFilters["status"]>)}>
              <SelectTrigger className="lg:w-44" aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os estados</SelectItem>
                {SUBSCRIPTION_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex flex-col gap-1 text-[0.7rem] font-medium text-muted-foreground">
              Inscrito desde
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="lg:w-40" />
            </label>
            <label className="flex flex-col gap-1 text-[0.7rem] font-medium text-muted-foreground">
              Até
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="lg:w-40" />
            </label>
          </div>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="self-start lg:self-end">
              <X /> Limpar
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Nome</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead className="hidden xl:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Província / Cidade</TableHead>
              <TableHead className="hidden lg:table-cell">Inscrição</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead className="hidden md:table-cell">Vencimento</TableHead>
              <TableHead className="hidden md:table-cell">Dias restantes</TableHead>
              <TableHead className="hidden sm:table-cell">Acesso</TableHead>
              <TableHead>Comunidade / grupos</TableHead>
              <TableHead>Acção</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configured && query.isPending
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-28" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-foreground">{m.full_name}</TableCell>
                    <TableCell className="tabular">{formatPhone(m.whatsapp)}</TableCell>
                    <TableCell className="hidden xl:table-cell text-muted-foreground">{m.email ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {m.province} · {m.city}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{formatDate(m.registered_at)}</TableCell>
                    <TableCell>
                      <SubscriptionBadge status={m.subscription_status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{formatDate(m.due_at)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground tabular-nums">
                      {m.days_remaining > 0 ? `${m.days_remaining} dias` : m.grace_days_remaining > 0 ? `Tolerância: ${m.grace_days_remaining} dias` : "Expirado"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <AccessBadge status={m.access_status} />
                    </TableCell>
                    <TableCell className="min-w-56">
                      <p className="text-sm font-medium">{m.community_name || "—"}</p>
                      {m.community_joined_at && <p className="text-xs text-muted-foreground">Comunidade desde {formatDate(m.community_joined_at)}</p>}
                      {m.groups?.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {m.groups.map((group) => (
                            <li key={group.id} className="text-xs text-muted-foreground">
                              {group.name} · {group.status === "joined" ? "dentro" : group.status === "removed" ? "saiu" : group.status === "removal_pending" ? "remoção pendente" : "aguarda"}
                              {group.status === "joined" && group.joined_at ? ` · desde ${formatDate(group.joined_at)}` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-xs text-muted-foreground">Sem subgrupos confirmados</p>}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={removeMember.isPending || !m.subscription_status || m.access_status === "removed"}
                        onClick={() => {
                          if (window.confirm(`Revogar o acesso de ${m.full_name}? A subscrição será cancelada e a remoção da Comunidade e dos subgrupos será colocada em fila.`)) {
                            removeMember.mutate(m.id);
                          }
                        }}
                      >
                        {removeMember.isPending && removeMember.variables === m.id ? "A processar…" : "Remover acesso"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!(configured && query.isPending) && rows.length === 0 && (
          <EmptyState
            icon={Users}
            title={
              !configured
                ? "Sem ligação ao backend"
                : hasFilters
                  ? "Nenhum membro corresponde aos filtros"
                  : "Ainda não existem membros"
            }
            description={
              !configured
                ? "Os membros serão listados aqui quando a API Laravel estiver ligada."
                : hasFilters
                  ? "Ajuste a pesquisa ou limpe os filtros."
                  : "Os novos membros aparecem aqui após a inscrição pública."
            }
            action={
              hasFilters && configured ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        )}

        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Página {meta.current_page} de {meta.last_page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.last_page || query.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
