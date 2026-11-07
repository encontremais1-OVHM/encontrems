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

type GroupContact={id:string;name:string;phone:string;email:string|null;status:string};
type Community={id:string;name:string;status:string};
type WhatsAppGroup={id:string;name:string;description:string|null;external_group_id:string;community_id:string;group_type:"main"|"subgroup";sync_status:string;is_active:boolean;participants:GroupContact[];participants_count:number};

export const Route=createFileRoute("/superadmin/grupos")({head:()=>({meta:[{title:"Grupos WhatsApp — Encontre +"},{name:"description",content:"Importe grupos do WhatsApp e controle quais aparecem na inscrição."}]}),component:GruposPage});

function GruposPage(){
  const client=useQueryClient();
  const [expanded,setExpanded]=useState<string|null>(null);
  const [syncCommunity,setSyncCommunity]=useState("");
  const [syncResult,setSyncResult]=useState<{groups_imported:number;contacts_imported:number;participants_skipped:number}|null>(null);
  const [actionError,setActionError]=useState<string|null>(null);
  const query=useQuery({queryKey:["whatsapp","groups"],queryFn:()=>apiRequest<{data:WhatsAppGroup[]}>("/admin/whatsapp/groups"),retry:false});
  const communities=useQuery({queryKey:["admin","resource","communities"],queryFn:()=>apiRequest<{data:Community[]}>("/admin/resources/communities"),retry:false});
  const sync=useMutation({
    mutationFn:()=>apiRequest<{groups_imported:number;contacts_imported:number;participants_skipped:number}>("/admin/whatsapp/sync",{method:"POST",body:{community_id:syncCommunity}}),
    onSuccess:data=>{setSyncResult(data);void client.invalidateQueries({queryKey:["whatsapp","groups"]});void client.invalidateQueries({queryKey:["admin","resource","communities"]});void client.invalidateQueries({queryKey:["admin","members"]});},
    onError:error=>setActionError(describeApiError(error))
  });
  const saveGroup=useMutation({
    mutationFn:(input:{id:string;community_id:string;group_type:"main"|"subgroup";is_active:boolean})=>apiRequest("/admin/whatsapp/groups/"+input.id+"/settings",{method:"PATCH",body:{community_id:input.community_id,group_type:input.group_type,is_active:input.is_active}}),
    onSuccess:()=>{void query.refetch();void client.invalidateQueries({queryKey:["admin","resource","communities"]});void client.invalidateQueries({queryKey:["public","communities"]});},
    onError:error=>setActionError(describeApiError(error))
  });
  return <div className="space-y-6">
    <PageHeader title="Grupos WhatsApp" description="Importe os grupos da conta ligada, associe cada grupo à sua comunidade e escolha o grupo principal e os subgrupos que ficam disponíveis nas inscrições."/>
    {query.isError&&<ApiErrorNotice message={describeApiError(query.error)} onRetry={()=>query.refetch()}/>}
    {communities.isError&&<ApiErrorNotice message={describeApiError(communities.error)} onRetry={()=>communities.refetch()}/>}
    {actionError&&<ApiErrorNotice message={actionError} onRetry={()=>setActionError(null)}/>}
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5"><label className="text-sm font-medium text-foreground">Importar grupos para a comunidade</label><Select value={syncCommunity} onValueChange={setSyncCommunity}><SelectTrigger><SelectValue placeholder="Escolha a comunidade"/></SelectTrigger><SelectContent>{(communities.data?.data??[]).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
        <Button onClick={()=>sync.mutate()} disabled={!syncCommunity||sync.isPending}>{sync.isPending?<RefreshCw className="animate-spin"/>:<RefreshCw/>}{sync.isPending?"A sincronizar…":"Sincronizar WhatsApp"}</Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">A sincronização importa os grupos que a conta WhatsApp conectada consegue consultar. Depois, associe cada grupo à comunidade correta. A importação não publica automaticamente nenhum subgrupo.</p>
      {syncResult&&<p className="mt-3 text-sm text-success">{syncResult.groups_imported} grupos sincronizados · {syncResult.contacts_imported} participações registadas · {syncResult.participants_skipped} contactos ignorados.</p>}
    </section>
    {query.data?.data?.length?<div className="space-y-3">
      <p className="text-sm text-muted-foreground">{query.data.data.length} grupos · {query.data.data.reduce((n,g)=>n+g.participants_count,0)} participações sincronizadas</p>
      {query.data.data.map(group=><section key={group.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
        <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={()=>setExpanded(expanded===group.id?null:group.id)} aria-expanded={expanded===group.id}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5"/></span>
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-foreground">{group.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{group.participants_count} contactos · {group.sync_status==="synced"?"Sincronizado":"Sincronização pendente"}</span></span>
          <Badge variant={group.is_active?"success":"neutral"}>{group.is_active?"Disponível":"Oculto"}</Badge>
          {expanded===group.id?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
        </button>
        {expanded===group.id&&<div className="space-y-4 border-t p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Comunidade</label><Select value={group.community_id} onValueChange={community_id=>saveGroup.mutate({id:group.id,community_id,group_type:group.group_type,is_active:group.is_active})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(communities.data?.data??[]).map(c=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><label className="text-xs font-semibold text-muted-foreground">Função do grupo</label><Select value={group.group_type} onValueChange={value=>saveGroup.mutate({id:group.id,community_id:group.community_id,group_type:value as "main"|"subgroup",is_active:group.is_active})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="main">Comunidade principal</SelectItem><SelectItem value="subgroup">Subgrupo de interesse</SelectItem></SelectContent></Select></div>
            <div className="flex items-end"><Button className="w-full" variant={group.is_active?"outline":"default"} disabled={saveGroup.isPending} onClick={()=>saveGroup.mutate({id:group.id,community_id:group.community_id,group_type:group.group_type,is_active:!group.is_active})}>{group.is_active?"Ocultar nas inscrições":"Disponibilizar nas inscrições"}</Button></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant={group.group_type==="main"?"success":"neutral"}>{group.group_type==="main"?"Grupo principal obrigatório":"Subgrupo selecionável"}</Badge><span className="text-xs text-muted-foreground">O grupo só aparece no formulário se estiver disponível.</span></div>
          {group.participants.length?<div className="space-y-2">{group.participants.map(person=><div key={person.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2"><span className="flex size-8 items-center justify-center rounded-full bg-background"><Users className="size-4 text-muted-foreground"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-foreground">{person.name}</span><span className="block text-xs text-muted-foreground">{formatPhone(person.phone)}{person.email?" · "+person.email:""}</span></span><Badge variant="success">No grupo</Badge></div>)}</div>:<p className="py-5 text-center text-sm text-muted-foreground">Ainda não existem contactos com número de telefone importável neste grupo.</p>}
        </div>}
      </section>)}
    </div>:<div className="rounded-xl border border-dashed bg-card p-10 text-center"><MessageCircle className="mx-auto size-8 text-muted-foreground"/><h2 className="mt-3 font-semibold text-foreground">Nenhum grupo sincronizado</h2><p className="mt-1 text-sm text-muted-foreground">Selecione a comunidade acima e sincronize a conta WhatsApp. Depois defina um grupo principal e escolha os subgrupos visíveis.</p></div>}
  </div>;
}
