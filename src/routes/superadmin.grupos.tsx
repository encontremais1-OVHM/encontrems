import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { formatPhone } from "@/lib/format";

type GroupContact = {id:string;name:string;phone:string;email:string|null;status:string};
type WhatsAppGroup = {id:string;name:string;description:string|null;external_group_id:string;sync_status:string;is_active:boolean;participants:GroupContact[];participants_count:number};

export const Route = createFileRoute("/superadmin/grupos")({
  head: () => ({meta:[{title:"Grupos WhatsApp — Encontre +"},{name:"description",content:"Grupos reais importados do WhatsApp e respetivos contactos."}]}),
  component: GruposPage,
});

function GruposPage() {
  const [expanded,setExpanded] = useState<string|null>(null);
  const query = useQuery({
    queryKey:["whatsapp","groups"],
    queryFn:()=>apiRequest<{data:WhatsAppGroup[]}>("/admin/whatsapp/groups"),
    retry:false,
  });
  return <div className="space-y-6">
    <PageHeader title="Grupos WhatsApp" description="Consulte os grupos importados da conta WhatsApp ligada e os contactos encontrados em cada grupo." />
    {query.isError && <ApiErrorNotice message={describeApiError(query.error)} onRetry={()=>query.refetch()} />}
    {query.data?.data?.length ? <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{query.data.data.length} grupos · {query.data.data.reduce((n,g)=>n+g.participants_count,0)} participações sincronizadas</p>
      {query.data.data.map((group)=> <section key={group.id} className="overflow-hidden rounded-xl border bg-card shadow-card">
        <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={()=>setExpanded(expanded===group.id?null:group.id)} aria-expanded={expanded===group.id}>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageCircle className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-foreground">{group.name}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{group.participants_count} contactos · {group.sync_status==="synced"?"Sincronizado":"Sincronização pendente"}</span>
          </span>
          <Badge variant={group.is_active?"success":"neutral"}>{group.is_active?"Activo":"Inactivo"}</Badge>
          {expanded===group.id?<ChevronUp className="size-4"/>:<ChevronDown className="size-4"/>}
        </button>
        {expanded===group.id && <div className="border-t p-4">
          {group.participants.length ? <div className="space-y-2">
            {group.participants.map((person)=> <div key={person.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-background"><Users className="size-4 text-muted-foreground"/></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{person.name}</span>
                <span className="block text-xs text-muted-foreground">{formatPhone(person.phone)}{person.email?" · "+person.email:""}</span>
              </span>
              <Badge variant="success">No grupo</Badge>
            </div>)}
          </div> : <p className="py-5 text-center text-sm text-muted-foreground">Ainda não existem contactos com número de telefone importável neste grupo.</p>}
        </div>}
      </section>)}
    </div> : <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <MessageCircle className="mx-auto size-8 text-muted-foreground"/>
      <h2 className="mt-3 font-semibold text-foreground">Nenhum grupo sincronizado</h2>
      <p className="mt-1 text-sm text-muted-foreground">Primeiro ligue o WhatsApp na área Integração WhatsApp e execute a sincronização.</p>
      <Button variant="outline" className="mt-4" onClick={()=>query.refetch()}>Actualizar lista</Button>
    </div>}
  </div>;
}
