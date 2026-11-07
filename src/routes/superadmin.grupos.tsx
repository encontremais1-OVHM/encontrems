import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Users, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { formatPhone } from "@/lib/format";

type GroupContact = { id: string; name: string; phone: string; email: string | null; status: string };
type Community = { id: string; name: string; status: string };
type WhatsAppCommunity = { id: string; subject: string; description: string | null; profile_picture_url: string | null; subgroups: Array<{ id: string; subject: string; profile_picture_url: string | null }> };
type WhatsAppGroup = { id: string; name: string; description: string | null; external_group_id: string; community_id: string; group_type: "community" | "subgroup"; sync_status: string; is_active: boolean; image_url: string | null; linked_parent_id: string | null; participants: GroupContact[]; participants_count: number };

export const Route = createFileRoute("/superadmin/grupos")({
  head: () => ({ meta: [{ title: "Comunidades WhatsApp — Encontre +" }, { name: "description", content: "Associe Comunidades WhatsApp e subgrupos às comunidades disponíveis nas inscrições." }] }),
  component: GruposPage,
});

function GruposPage() {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncCommunity, setSyncCommunity] = useState("");
  const [syncWhatsAppCommunityId, setSyncWhatsAppCommunityId] = useState("");
  const [syncResult, setSyncResult] = useState<{ groups_imported: number; subgroups_imported: number; contacts_imported: number; participants_skipped: number } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["whatsapp", "groups"], queryFn: () => apiRequest<{ data: WhatsAppGroup[] }>("/admin/whatsapp/groups"), retry: false });
  const communities = useQuery({ queryKey: ["admin", "resource", "communities"], queryFn: () => apiRequest<{ data: Community[] }>("/admin/resources/communities"), retry: false });
  const whatsappCommunities = useQuery({ queryKey: ["whatsapp", "communities"], queryFn: () => apiRequest<{ communities: WhatsAppCommunity[] }>("/admin/whatsapp/communities"), retry: false });

  const sync = useMutation({
    mutationFn: () => apiRequest<{ groups_imported: number; subgroups_imported: number; contacts_imported: number; participants_skipped: number }>("/admin/whatsapp/sync", {
      method: "POST",
      body: { community_id: syncCommunity, whatsapp_community_id: syncWhatsAppCommunityId },
    }),
    onSuccess: data => {
      setSyncResult(data);
      void query.refetch();
      void client.invalidateQueries({ queryKey: ["admin", "resource", "communities"] });
      void client.invalidateQueries({ queryKey: ["admin", "members"] });
      void client.invalidateQueries({ queryKey: ["public", "communities"] });
    },
    onError: error => setActionError(describeApiError(error)),
  });

  const saveGroup = useMutation({
    mutationFn: (input: { id: string; community_id: string; group_type: "community" | "subgroup"; is_active: boolean }) =>
      apiRequest("/admin/whatsapp/groups/" + input.id + "/settings", {
        method: "PATCH",
        body: { community_id: input.community_id, group_type: input.group_type, is_active: input.is_active },
      }),
    onSuccess: () => {
      void query.refetch();
      void client.invalidateQueries({ queryKey: ["admin", "resource", "communities"] });
      void client.invalidateQueries({ queryKey: ["public", "communities"] });
    },
    onError: error => setActionError(describeApiError(error)),
  });

  return <div className="space-y-6">
    <PageHeader title="Comunidades e grupos WhatsApp" description="Associe uma Comunidade verdadeira do WhatsApp a cada comunidade da plataforma. Os grupos internos ligados a ela serão importados como subgrupos selecionáveis." />
    {query.isError && <ApiErrorNotice message={describeApiError(query.error)} onRetry={() => query.refetch()} />}
    {communities.isError && <ApiErrorNotice message={describeApiError(communities.error)} onRetry={() => communities.refetch()} />}
    {whatsappCommunities.isError && <ApiErrorNotice message={describeApiError(whatsappCommunities.error)} onRetry={() => whatsappCommunities.refetch()} />}
    {actionError && <ApiErrorNotice message={actionError} onRetry={() => setActionError(null)} />}

    <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Sincronizar uma Comunidade WhatsApp</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha a comunidade criada no Superadmin e a Comunidade real encontrada pela conta WhatsApp conectada. A sincronização importa a fotografia da Comunidade e as fotografias dos grupos internos.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Comunidade da plataforma</label>
          <Select value={syncCommunity} onValueChange={setSyncCommunity}>
            <SelectTrigger><SelectValue placeholder="Escolha a comunidade" /></SelectTrigger>
            <SelectContent>{(communities.data?.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Comunidade encontrada no WhatsApp</label>
          <Select value={syncWhatsAppCommunityId} onValueChange={setSyncWhatsAppCommunityId}>
            <SelectTrigger><SelectValue placeholder="Escolha a Comunidade WhatsApp" /></SelectTrigger>
            <SelectContent>
              {(whatsappCommunities.data?.communities ?? []).map(item => <SelectItem key={item.id} value={item.id}>{item.subject}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {syncWhatsAppCommunityId && (() => {
        const selected = whatsappCommunities.data?.communities.find(item => item.id === syncWhatsAppCommunityId);
        return selected ? <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
          {selected.profile_picture_url ? <img src={selected.profile_picture_url} alt="" className="size-12 rounded-xl object-cover" referrerPolicy="no-referrer" /> : <span className="flex size-12 items-center justify-center rounded-xl bg-background"><Users className="size-5" /></span>}
          <div className="min-w-0"><p className="font-semibold text-foreground">{selected.subject}</p><p className="text-xs text-muted-foreground">{selected.subgroups.length} grupos internos detetados</p></div>
        </div> : null;
      })()}
      <div className="flex justify-end">
        <Button onClick={() => sync.mutate()} disabled={!syncCommunity || !syncWhatsAppCommunityId || sync.isPending || whatsappCommunities.isPending}>
          {sync.isPending ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
          {sync.isPending ? "A sincronizar…" : "Sincronizar Comunidade"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Os grupos importados começam ocultos. Depois, ative a Comunidade e os subgrupos que pretende mostrar no formulário de inscrição.</p>
      {syncResult && <p className="text-sm text-success">{syncResult.groups_imported} elementos sincronizados, incluindo {syncResult.subgroups_imported} subgrupos · {syncResult.contacts_imported} participações registadas · {syncResult.participants_skipped} contactos ignorados.</p>}
    </section>

    {query.data?.data?.length ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{query.data.data.length} elementos sincronizados · {query.data.data.reduce((n, group) => n + group.participants_count, 0)} participações registadas</p>
      {query.data.data.map(group => <section key={group.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
        <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setExpanded(expanded === group.id ? null : group.id)} aria-expanded={expanded === group.id}>
          {group.image_url ? <img src={group.image_url} alt="" className="size-12 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5" /></span>}
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-foreground">{group.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{group.group_type === "community" ? "Comunidade WhatsApp" : "Grupo interno"} · {group.participants_count} contactos · {group.sync_status === "synced" ? "Sincronizado" : "Sincronização pendente"}</span></span>
          <Badge variant={group.is_active ? "success" : "neutral"}>{group.is_active ? "Disponível" : "Oculto"}</Badge>
          {expanded === group.id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {expanded === group.id && <div className="space-y-4 border-t p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Comunidade da plataforma</label><Select value={group.community_id} onValueChange={community_id => saveGroup.mutate({ id: group.id, community_id, group_type: group.group_type, is_active: group.is_active })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(communities.data?.data ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Tipo de elemento</label><div className="flex h-10 items-center"><Badge variant={group.group_type === "community" ? "success" : "neutral"}>{group.group_type === "community" ? "Comunidade WhatsApp" : "Grupo interno"}</Badge></div></div>
            <div className="flex items-end"><Button className="w-full" variant={group.is_active ? "outline" : "default"} disabled={saveGroup.isPending} onClick={() => saveGroup.mutate({ id: group.id, community_id: group.community_id, group_type: group.group_type, is_active: !group.is_active })}>{group.is_active ? "Ocultar nas inscrições" : "Disponibilizar nas inscrições"}</Button></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={group.group_type === "community" ? "success" : "neutral"}>{group.group_type === "community" ? "Entrada na Comunidade obrigatória" : "Subgrupo selecionável"}</Badge><span className="text-xs text-muted-foreground">O elemento só aparece no formulário se estiver disponível.</span></div>
          {group.participants.length ? <div className="space-y-2">{group.participants.map(person => <div key={person.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2"><span className="flex size-8 items-center justify-center rounded-full bg-background"><Users className="size-4 text-muted-foreground" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{person.name}</span><span className="block text-xs text-muted-foreground">{formatPhone(person.phone)}{person.email ? " · " + person.email : ""}</span></span><Badge variant="success">No grupo</Badge></div>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">{group.group_type === "community" ? "A Comunidade não é importada como grupo interno." : "Ainda não existem contactos com número de telefone importável neste grupo."}</p>}
        </div>}
      </section>)}
    </div> : <div className="rounded-xl border border-dashed bg-card p-10 text-center"><MessageCircle className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold text-foreground">Nenhuma Comunidade sincronizada</h2><p className="mt-1 text-sm text-muted-foreground">Ligue a conta WhatsApp, escolha uma Comunidade da plataforma e sincronize a Comunidade WhatsApp correspondente.</p></div>}
  </div>;
}
