import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";

import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { formatDate, formatKz } from "@/lib/format";

type Row = Record<string, unknown>;
type Column = { key: string; label: string };

const STATUS_LABELS: Record<string, string> = {
  joined: "Entrada confirmada",
  pending_invitation: "Convite enviado — entrada pendente",
  pending: "Pendente",
  active: "Ativa",
  grace_period: "Em período de tolerância",
  expired: "Expirada",
  suspended: "Suspensa",
  cancelled: "Cancelada",
  failed: "Falhou",
  invalid: "Inválido",
  removed: "Removido",
  removal_pending: "Remoção pendente",
};

function displayValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "selected_subgroups" && Array.isArray(value)) {
    return value.map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const subgroup = item as { name?: string; status?: string };
      return `${subgroup.name || "Subgrupo"} — ${STATUS_LABELS[subgroup.status || ""] || subgroup.status || "Estado desconhecido"}`;
    }).join(" · ");
  }
  if (key === "community_access" && value === "joined") return "Entrada confirmada na Comunidade";
  if (key === "community_access" && value === "pending") return "A aguardar entrada na Comunidade";
  if (typeof value === "number" && (key.includes("price") || key.includes("amount") || key.endsWith("_kz"))) return formatKz(value);
  if (typeof value === "string" && (key.endsWith("_at") || key === "created_at" || key === "expires_at")) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : formatDate(value, true);
  }
  if (typeof value === "string" && STATUS_LABELS[value]) return STATUS_LABELS[value];
  if (typeof value === "object") {
    const serialized = JSON.stringify(value);
    return serialized.length > 160 ? serialized.slice(0,157) + "…" : serialized;
  }
  return String(value);
}

export function AdminResourceList({resource,title,description,columns}:{resource:string;title:string;description:string;columns:Column[]}) {
  const query = useQuery({
    queryKey:["admin","resource",resource],
    queryFn:()=>apiRequest<{data:Row[]}>(`/admin/resources/${resource}`),
    retry:false,
    refetchInterval: resource === "access" || resource === "registrations" ? 30_000 : false,
  });
  const rows=query.data?.data||[];
  return <div className="space-y-6">
    <PageHeader title={title} description={description}/>
    {query.isError&&<ApiErrorNotice message={describeApiError(query.error)} onRetry={()=>query.refetch()}/>}
    {query.isPending?<div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">A carregar dados reais do Supabase…</div>:rows.length?(
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-medium text-foreground">{rows.length} registos</p>
          <Badge variant="neutral">Dados do Supabase</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{columns.map((column)=><th key={column.key} className="px-4 py-3 font-semibold">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row,index)=><tr key={String(row["id"]||index)} className="align-top hover:bg-muted/30">
                {columns.map((column)=><td key={column.key} className="max-w-[360px] px-4 py-3 text-foreground">
                  {column.key==="status" ? <Badge variant={row[column.key]==="active"||row[column.key]==="paid"||row[column.key]==="succeeded"||row[column.key]==="joined"?"success":row[column.key]==="expired"||row[column.key]==="failed"||row[column.key]==="rejected"?"danger":"neutral"}>{displayValue(column.key,row[column.key])}</Badge> : <span className="break-words">{displayValue(column.key,row[column.key])}</span>}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
    ):<div className="rounded-xl border border-dashed bg-card p-10">
      <EmptyState icon={Database} title="Ainda não existem registos" description="Quando os dados forem criados ou sincronizados no Supabase, aparecerão aqui. Nenhum dado de demonstração é apresentado."/>
    </div>}
  </div>;
}
