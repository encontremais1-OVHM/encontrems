import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { formatKz } from "@/lib/format";

type Community = { id:string; name:string; slug:string; description:string|null; status:string; archived_at?:string|null; groups_count:number; members_count:number; plans:Array<{id:string;name:string;initial_price:number;renewal_price:number;duration_days:number;grace_days:number;is_active:boolean}> };

export const Route = createFileRoute("/superadmin/comunidades")({ head:()=>({meta:[{title:"Comunidades — Encontre +"}]}), component:ComunidadesPage });

function ComunidadesPage() {
  const client=useQueryClient();
  const [name,setName]=useState("");
  const [description,setDescription]=useState("");
  const [influencerName,setInfluencerName]=useState("");
  const [notice,setNotice]=useState<string|null>(null);
  const [showArchived,setShowArchived]=useState(false);
  const query=useQuery({queryKey:["admin","resource","communities"],queryFn:()=>apiRequest<{data:Community[]}>("/admin/resources/communities"),retry:false});
  const create=useMutation({
    mutationFn:()=>apiRequest<{message:string}>("/admin/communities",{method:"POST",body:{name,description,influencer_name:influencerName}}),
    onSuccess:async(result)=>{setNotice(result.message);setName("");setDescription("");setInfluencerName("");await client.invalidateQueries({queryKey:["admin","resource","communities"]});}
  });
  const update=useMutation({
    mutationFn:({id,status}:{id:string;status:"active"|"inactive"})=>apiRequest("/admin/communities/"+id,{method:"PATCH",body:{status}}),
    onSuccess:async()=>{setNotice("Estado da comunidade atualizado.");await client.invalidateQueries({queryKey:["admin","resource","communities"]});await client.invalidateQueries({queryKey:["public","communities"]});}
  });
  const archive=useMutation({
    mutationFn:(id:string)=>apiRequest<{message:string}>("/admin/communities/"+id,{method:"DELETE"}),
    onSuccess:async(result)=>{setNotice(result.message);await client.invalidateQueries({queryKey:["admin","resource","communities"]});await client.invalidateQueries({queryKey:["public","communities"]});await client.invalidateQueries({queryKey:["whatsapp","groups"]});},
  });
  const restore=useMutation({
    mutationFn:(id:string)=>apiRequest<{message:string}>("/admin/communities/"+id+"/restore",{method:"POST"}),
    onSuccess:async(result)=>{setNotice(result.message);await client.invalidateQueries({queryKey:["admin","resource","communities"]});await client.invalidateQueries({queryKey:["public","communities"]});await client.invalidateQueries({queryKey:["whatsapp","groups"]});},
  });
  const visibleCommunities=(query.data?.data??[]).filter(item=>showArchived||!item.archived_at);
  function submit(e:FormEvent){e.preventDefault();setNotice(null);create.mutate();}
  return <div className="space-y-6">
    <PageHeader title="Comunidades" description="Crie comunidades, configure o plano e decida quais ficam disponíveis no formulário público de inscrição."/>
    {(query.isError||create.error||update.error||archive.error||restore.error)&&<ApiErrorNotice message={describeApiError(query.error||create.error||update.error||archive.error||restore.error)} onRetry={()=>query.refetch()}/>}
    {notice&&<p className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">{notice}</p>}
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5 shadow-card">
      <div><h2 className="font-bold text-foreground">Adicionar comunidade</h2><p className="mt-1 text-sm text-muted-foreground">A nova comunidade é criada como privada. Só aparece aos visitantes depois de associar uma Comunidade do WhatsApp, disponibilizar pelo menos um subgrupo e publicar a comunidade.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="community-name">Nome da comunidade</Label><Input id="community-name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} placeholder="Ex.: Encontre + Negócios"/></div>
        <div className="space-y-1.5"><Label htmlFor="community-influencer">Responsável (opcional)</Label><Input id="community-influencer" value={influencerName} onChange={e=>setInfluencerName(e.target.value)} placeholder="Nome do responsável"/></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="community-description">Descrição</Label><Textarea id="community-description" value={description} onChange={e=>setDescription(e.target.value)} rows={2} placeholder="Explique o objetivo desta comunidade."/></div>
      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm"><p className="font-semibold text-foreground">Plano aplicado nesta fase</p><p className="mt-1 text-muted-foreground">Adesão gratuita · 1.000 Kz por renovação · 30 dias por período · 5 dias de tolerância. A personalização de preços por comunidade será ativada quando o fluxo de pagamentos suportar tarifas diferentes.</p></div>
      <div className="flex justify-end"><Button type="submit" disabled={create.isPending||name.trim().length<2}>{create.isPending?"A criar…":"Criar comunidade"}</Button></div>
    </form>
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-foreground">Comunidades registadas</h2><div className="flex items-center gap-2"><Badge variant="neutral">{visibleCommunities.length} apresentadas</Badge><Button size="sm" variant="outline" onClick={()=>setShowArchived(v=>!v)}>{showArchived?"Ocultar arquivadas":"Mostrar arquivadas"}</Button></div></div>
      {query.isPending?<div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">A carregar comunidades do Supabase…</div>:
      visibleCommunities.length?visibleCommunities.map(community=>{
        const plan=community.plans?.find(item=>item.is_active);
        return <article key={community.id} className="space-y-3 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-bold text-foreground">{community.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">/{community.slug} · {community.description||"Sem descrição"}</p></div><Badge variant={community.archived_at?"neutral":community.status==="active"?"success":"neutral"}>{community.archived_at?"Arquivada":community.status==="active"?"Visível nas inscrições":"Oculta do público"}</Badge></div>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Grupos ativos</p><p className="font-semibold text-foreground">{community.groups_count}</p></div>
            <div><p className="text-xs text-muted-foreground">Membros inscritos</p><p className="font-semibold text-foreground">{community.members_count}</p></div>
            <div><p className="text-xs text-muted-foreground">Adesão</p><p className="font-semibold text-foreground">{formatKz(plan?.initial_price??0)}</p></div>
            <div><p className="text-xs text-muted-foreground">Renovação</p><p className="font-semibold text-foreground">{formatKz(plan?.renewal_price??0)} / {plan?.duration_days??"—"} dias</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">{plan?"Tolerância: "+plan.grace_days+" dias":"Sem plano ativo"}. {community.archived_at?"O histórico permanece guardado; a Comunidade e os grupos reais do WhatsApp não são apagados.":"Para publicar, é obrigatório ter uma Comunidade WhatsApp e pelo menos um subgrupo ativo."}</p><div className="flex flex-wrap gap-2">{community.archived_at?<Button size="sm" variant="outline" disabled={restore.isPending} onClick={()=>restore.mutate(community.id)}><RotateCcw className="size-4"/>Restaurar</Button>:<><Button size="sm" variant={community.status==="active"?"outline":"default"} disabled={update.isPending||archive.isPending} onClick={()=>update.mutate({id:community.id,status:community.status==="active"?"inactive":"active"})}>{community.status==="active"?"Ocultar inscrições":"Publicar inscrições"}</Button><Button size="sm" variant="destructive" disabled={archive.isPending||update.isPending} onClick={()=>{if(window.confirm("Remover a comunidade "+community.name+"? A comunidade e os grupos associados deixarão de aparecer no catálogo e nas inscrições. O histórico e os registos financeiros serão preservados; nada será apagado do WhatsApp. A operação será bloqueada se existirem subscrições ativas ou operações em execução."))archive.mutate(community.id);}}><Trash2 className="size-4"/>Remover comunidade</Button></>}</div></div>
        </article>;
      }):<div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">Ainda não existem comunidades.</div>}
    </section>
  </div>;
}
