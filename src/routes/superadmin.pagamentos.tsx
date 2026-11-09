import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CreditCard, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, describeApiError } from "@/lib/api/client";
import { formatKz, formatDate, formatPhone } from "@/lib/format";

type PaymentRow = {
  id:string; amount:number; currency:string; status:string; payment_reference:string;
  payment_type:string; provider:string; provider_reference:string|null; created_at:string; paid_at:string|null;
  rejection_reason:string|null; member:{id:string;full_name:string;phone_e164:string|null;phone:string|null;email:string|null}|null;
};

export const Route = createFileRoute("/superadmin/pagamentos")({
  head:()=>({meta:[{title:"Pagamentos — Encontre +"},{name:"description",content:"Verifique pagamentos de renovação e mantenha as subscrições atualizadas."}]}),
  component:PagamentosPage,
});

function PagamentosPage(){
  const client=useQueryClient();
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const query=useQuery({queryKey:["admin","payments"],queryFn:()=>apiRequest<{data:PaymentRow[]}>("/admin/payments"),retry:false});
  const confirm=useMutation({
    mutationFn:(id:string)=>apiRequest<{message:string;expires_at?:string}>(`/admin/payments/${id}/confirm`,{method:"POST",body:{}}),
    onSuccess:()=>{void client.invalidateQueries({queryKey:["admin","payments"]});void client.invalidateQueries({queryKey:["admin","dashboard"]});void client.invalidateQueries({queryKey:["admin","members"]});},
  });
  const reject=useMutation({
    mutationFn:({id,reason}:{id:string;reason:string})=>apiRequest(`/admin/payments/${id}/reject`,{method:"POST",body:{reason}}),
    onSuccess:()=>{void client.invalidateQueries({queryKey:["admin","payments"]});void client.invalidateQueries({queryKey:["admin","dashboard"]});},
  });
  const error=query.error||confirm.error||reject.error;
  const rows=query.data?.data||[];
  const pending=rows.filter(p=>["pending","initiated","under_review"].includes(p.status));
  const paid=rows.filter(p=>p.status==="paid");
  const rejected=rows.filter(p=>p.status==="rejected");
  const cancelled=rows.filter(p=>p.status==="cancelled");
  return <div className="space-y-6">
    <PageHeader title="Pagamentos" description="Verifique manualmente as transferências de renovação. A confirmação estende o prazo por mais 30 dias e tenta restabelecer o acesso aos grupos." />
    {error&&<ApiErrorNotice message={describeApiError(error)} onRetry={()=>query.refetch()}/>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">A aguardar verificação</p><p className="mt-1 text-2xl font-bold tabular-nums">{pending.length}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Confirmados</p><p className="mt-1 text-2xl font-bold tabular-nums">{paid.length}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Rejeitados</p><p className="mt-1 text-2xl font-bold tabular-nums">{rejected.length}</p></div>
      <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Cancelados</p><p className="mt-1 text-2xl font-bold tabular-nums">{cancelled.length}</p></div>
    </div>
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold text-foreground">Histórico de pagamentos</h2>
      <Button variant="outline" size="sm" onClick={()=>query.refetch()}><RefreshCw className="size-4"/> Actualizar</Button>
    </div>
    {query.isPending?<div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">A carregar pagamentos…</div>:rows.length?(
      <div className="space-y-3">
        {rows.map(payment=><article key={payment.id} className="rounded-xl border bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{payment.member?.full_name||"Membro"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(payment.member?.phone_e164||payment.member?.phone||"")} · {payment.member?.email||"Sem email"}</p>
              <p className="mt-2 font-mono text-xs text-muted-foreground">{payment.payment_reference}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums text-foreground">{formatKz(payment.amount)}</p>
              <Badge variant={payment.status==="paid"?"success":payment.status==="rejected"||payment.status==="cancelled"?"danger":"warning"}>{payment.status==="paid"?"Confirmado":payment.status==="rejected"?"Rejeitado":payment.status==="cancelled"?"Cancelado":"Pendente"}</Badge>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{payment.payment_type==="renewal"?"Renovação":"Pagamento"}</span>
            <span>{payment.provider==="manual"?"Verificação manual":payment.provider==="kursinha"?"Kursinha · automático":payment.provider}</span>
            <span>{formatDate(payment.created_at,true)}</span>
            {payment.provider_reference&&<span>Venda Kursinha: {payment.provider_reference}</span>}
            {payment.paid_at&&<span>Pago em {formatDate(payment.paid_at,true)}</span>}
          </div>
          {payment.rejection_reason&&<p className="mt-2 text-sm text-destructive">Motivo: {payment.rejection_reason}</p>}
          {payment.provider==="manual"&&["pending","initiated","under_review"].includes(payment.status)&&<div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input value={reasons[payment.id]||""} onChange={e=>setReasons(prev=>({...prev,[payment.id]:e.target.value}))} placeholder="Motivo da rejeição (se aplicável)" aria-label="Motivo da rejeição"/>
            <Button onClick={()=>confirm.mutate(payment.id)} disabled={confirm.isPending||reject.isPending}>
              {confirm.isPending&&confirm.variables===payment.id?<Loader2 className="animate-spin"/>:<CheckCircle2/>} Confirmar 1.000 Kz
            </Button>
            <Button variant="outline" onClick={()=>reject.mutate({id:payment.id,reason:reasons[payment.id]||"Não foi possível confirmar a transferência."})} disabled={reject.isPending||confirm.isPending}>
              {reject.isPending&&reject.variables?.id===payment.id?<Loader2 className="animate-spin"/>:<XCircle/>} Rejeitar
            </Button>
          </div>}
        </article>)}
      </div>
    ):<div className="rounded-xl border border-dashed p-10 text-center">
      <CreditCard className="mx-auto size-8 text-muted-foreground"/>
      <p className="mt-3 font-semibold text-foreground">Ainda não existem pagamentos</p>
      <p className="mt-1 text-sm text-muted-foreground">As adesões iniciais são gratuitas. Os pedidos de renovação de 1.000 Kz aparecerão aqui para verificação.</p>
    </div>}
    <p className="text-xs text-muted-foreground">A confirmação manual pressupõe que a equipa já verificou a entrada do valor fora da plataforma. Não existe ainda um gateway automático nem carregamento de comprovativos nesta versão.</p>
  </div>;
}
