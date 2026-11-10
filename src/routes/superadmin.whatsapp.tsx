import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, CheckCircle2, CircleAlert, Loader2, MessageCircle, QrCode, RefreshCw, Smartphone, Users } from "lucide-react";
import { useState } from "react";

import { ApiErrorNotice } from "@/components/app/ApiStatus";
import { PageHeader } from "@/components/app/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, describeApiError } from "@/lib/api/client";

type WhatsAppStatus = {
  state: "disconnected" | "connecting" | "connected" | "logged_out" | "error" | "unavailable";
  connected: boolean;
  has_qr: boolean;
  has_pairing_code: boolean;
  last_error: string | null;
  phone: string | null;
  pairing_in_progress?: boolean;
  qr_expires_at?: string | null;
};
type Group = { id: string; name: string; description: string | null; group_type: "community" | "subgroup"; sync_status: string; participants: {id:string;name:string;phone:string;email:string|null;status:string}[]; participants_count:number; external_group_id: string; is_active:boolean };
type CommunityParticipant = {id:string;name:string;phone:string;email:string|null;admin:boolean;registered:boolean};

export const Route = createFileRoute("/superadmin/whatsapp")({
  head: () => ({ meta: [{ title: "Integração WhatsApp — Encontre +" }, { name: "description", content: "Conecte o WhatsApp, importe grupos e sincronize os participantes da comunidade." }] }),
  component: WhatsappPage,
});

function WhatsappPage() {
  const client = useQueryClient();
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{groups_imported:number;contacts_imported:number;participants_skipped:number} | null>(null);

  const status = useQuery({
    queryKey: ["whatsapp","status"],
    queryFn: () => apiRequest<WhatsAppStatus>("/admin/whatsapp/status"),
    retry: 3,
    retryDelay: attempt => Math.min(1000 * (2 ** attempt), 8000),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });
  const qr = useQuery({
    queryKey: ["whatsapp","qr"],
    queryFn: () => apiRequest<{qr_data_url:string;expires_in_seconds:number}>("/admin/whatsapp/qr"),
    enabled: Boolean(status.data?.has_qr),
    retry: false,
    refetchInterval: 2500,
  });
  const groups = useQuery({
    queryKey: ["whatsapp","groups"],
    queryFn: () => apiRequest<{data:Group[];community_participants:CommunityParticipant[];community_participants_error:string|null;community_participants_checked_at:string|null}>("/admin/whatsapp/groups"),
    retry: false,
  });

  const connect = useMutation({
    mutationFn: () => apiRequest("/admin/whatsapp/connect",{method:"POST",body:{}}),
    onSuccess: () => { setPairingCode(null); void client.invalidateQueries({queryKey:["whatsapp","status"]}); },
  });
  const pair = useMutation({
    mutationFn: () => apiRequest<{pairing_code:string}>("/admin/whatsapp/pairing-code",{method:"POST",body:{phone}}),
    onSuccess: (data) => { setPairingCode(data.pairing_code); void client.invalidateQueries({queryKey:["whatsapp","status"]}); },
  });
  const disconnect = useMutation({
    mutationFn: () => apiRequest("/admin/whatsapp/disconnect",{method:"POST",body:{}}),
    onSuccess: () => { setPairingCode(null); void client.invalidateQueries({queryKey:["whatsapp","status"]}); },
  });
  const sync = useMutation({
    mutationFn: () => apiRequest<{groups_imported:number;contacts_imported:number;participants_skipped:number}>("/admin/whatsapp/sync",{method:"POST",body:{}}),
    onSuccess: (data) => { setSyncResult(data); void client.invalidateQueries({queryKey:["whatsapp","groups"]}); void client.invalidateQueries({queryKey:["admin","members"]}); void client.invalidateQueries({queryKey:["admin","dashboard"]}); },
  });

  const state = status.data?.state;
  const connected = Boolean(status.data?.connected);
  const actionError = connect.error || pair.error || disconnect.error || sync.error;
  const sessionActive = state === "connected" || state === "connecting" || state === "error";
  const serviceUnavailable = state === "unavailable" || status.isError;
  const statusLabel = status.isPending ? "A verificar" : serviceUnavailable ? "A verificar ligação" : connected ? "Ligado" : state === "connecting" ? "A ligar" : state === "error" ? "Erro" : "Desligado";
  const pairingBusy = Boolean(status.data?.pairing_in_progress) || pair.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title="Integração WhatsApp" description="Conecte a conta oficial da comunidade por QR Code ou código de vinculação. Depois sincronize os grupos e os contactos para o portal." />
      {status.isError && <ApiErrorNotice message={describeApiError(status.error)} onRetry={() => status.refetch()} />}
      {actionError && <ApiErrorNotice message={describeApiError(actionError)} />}
      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-foreground">Estado da ligação</h2>
            <Badge variant={connected ? "success" : state === "connecting" ? "warning" : state === "error" ? "danger" : "neutral"}>
              {statusLabel}
            </Badge>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-4">
            <span className="flex size-11 items-center justify-center rounded-xl bg-success-soft text-success"><MessageCircle className="size-5" /></span>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{connected ? "WhatsApp conectado" : serviceUnavailable ? "Não foi possível confirmar a ligação" : status.isPending ? "A consultar a sessão guardada" : "Conta WhatsApp não conectada"}</p>
              <p className="text-sm text-muted-foreground">{status.data?.phone ? "Número: +" + status.data.phone : serviceUnavailable ? "O serviço está temporariamente indisponível. A página voltará a consultar automaticamente; não gere outro QR Code." : "A sessão fica guardada no volume persistente do Railway."}</p>
            </div>
            <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={() => status.refetch()} aria-label="Actualizar estado"><RefreshCw className="size-4" /></Button>
          </div>
          {status.data?.last_error && <p className="flex gap-2 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" />{status.data.last_error}</p>}
          {serviceUnavailable && <p className="text-sm text-muted-foreground">Não confunda falha temporária de comunicação com desconexão do WhatsApp. O painel não vai iniciar uma nova vinculação enquanto não conseguir consultar o estado real do serviço.</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => connect.mutate()} disabled={connected || state === "connecting" || connect.isPending || pair.isPending || status.isPending || serviceUnavailable}>
              {connect.isPending ? <Loader2 className="animate-spin" /> : <QrCode />} {state === "connecting" ? "A aguardar leitura" : "Gerar QR Code"}
            </Button>
            <Button variant="outline" onClick={() => {
              if (window.confirm("Isto vai terminar a sessão WhatsApp actual e apagar apenas as credenciais locais para poderes ligar outro número. Queres continuar?")) disconnect.mutate();
            }} disabled={!sessionActive || disconnect.isPending || pairingBusy}>
              {disconnect.isPending ? <Loader2 className="animate-spin" /> : null} {state === "connecting" ? "Cancelar ligação" : "Desconectar / trocar número"}
            </Button>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <h2 className="font-bold text-foreground">Ligar por código</h2>
          <p className="text-sm text-muted-foreground">Introduza o número da conta WhatsApp com indicativo internacional, apenas dígitos. O código deve ser inserido em WhatsApp → Dispositivos associados → Associar com número de telefone.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="244923000000" inputMode="numeric" aria-label="Número com indicativo" />
            <Button variant="outline" onClick={() => pair.mutate()} disabled={pairingBusy || connected || state === "connecting" || serviceUnavailable || status.isPending || phone.replace(/\D/g,"").length < 8}>
              {pair.isPending ? <Loader2 className="animate-spin" /> : <Smartphone />} Gerar código
            </Button>
          </div>
          {state === "connecting" && pairingCode && <p className="text-sm text-warning">Código gerado. Introduza-o no telemóvel e mantenha esta página aberta até aparecer «Ligado».</p>}
          {state === "connecting" && !pairingCode && <p className="text-sm text-muted-foreground">A preparar a ligação segura. Aguarde o QR Code ou cancele para mudar o método.</p>}
          {pairingCode && <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Código de vinculação</p>
            <p className="mt-2 font-mono text-3xl font-black tracking-[0.2em] text-foreground">{pairingCode}</p>
            <p className="mt-2 text-xs text-muted-foreground">Não partilhe este código. Utilize-o apenas no seu WhatsApp.</p>
          </div>}
        </div>
      </section>

      {status.data?.has_qr && qr.data?.qr_data_url && (
        <section className="rounded-xl border bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-foreground">Leia o QR Code com o WhatsApp</h2>
            <Badge variant="warning">Expira em {qr.data.expires_in_seconds}s</Badge>
          </div>
          <div className="mt-4 flex flex-col items-center gap-3">
            <img src={qr.data.qr_data_url} alt="QR Code de ligação do WhatsApp" className="size-64 rounded-xl border bg-white p-2" />
            <p className="max-w-lg text-center text-sm text-muted-foreground">No telemóvel, abra WhatsApp → Dispositivos associados → Associar dispositivo e leia este código. Mantenha o telemóvel desbloqueado e a página aberta até a ligação ser confirmada.</p>
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-foreground">Grupos e contactos sincronizados</h2>
            <p className="text-sm text-muted-foreground">A sincronização lê os grupos onde esta conta participa e importa os números disponíveis para o Supabase.</p>
          </div>
          <Button onClick={() => sync.mutate()} disabled={!connected || sync.isPending}>
            {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar grupos e contactos
          </Button>
        </div>
        {syncResult && <div className="rounded-lg bg-success-soft p-3 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="size-4" /> {syncResult.groups_imported} grupos, {syncResult.contacts_imported} contactos sincronizados; {syncResult.participants_skipped} participantes sem número importável.
        </div>}
        {groups.isError && <p className="text-sm text-muted-foreground">Ainda não foi possível carregar os grupos guardados.</p>}
        {groups.data?.data?.length ? (
          <div className="divide-y rounded-lg border">
            {groups.data.data.map((group) => <div key={group.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted"><Users className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{group.name}</p>
                <p className="text-xs text-muted-foreground">{group.participants_count} contactos · {group.sync_status === "synced" ? "Sincronizado" : "Pendente"}</p>
              </div>
              <Badge variant={group.is_active ? "success" : "neutral"}>{group.is_active ? "Activo" : "Inactivo"}</Badge>
            </div>)}
          </div>
        ) : <div className="rounded-lg border border-dashed p-8 text-center">
          <Activity className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-2 font-semibold text-foreground">Nenhum grupo importado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ligue o WhatsApp e sincronize para carregar os grupos reais da comunidade.</p>
        </div>}
      </section>
      {groups.data?.data.some((group) => group.group_type === "community") && (
        <section className="rounded-xl border bg-card p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-foreground">Participantes reais da Comunidade principal</h2>
              <p className="text-sm text-muted-foreground">
                Lista consultada directamente no WhatsApp, incluindo participantes que ainda não se inscreveram no portal.
                {groups.data.community_participants_checked_at ? " Consulta: " + new Date(groups.data.community_participants_checked_at).toLocaleString("pt-PT") : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => groups.refetch()} disabled={groups.isFetching}>
              {groups.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />} Actualizar lista
            </Button>
          </div>
          {groups.data.community_participants_error && (
            <ApiErrorNotice message={"Não foi possível consultar a lista em tempo real: " + groups.data.community_participants_error} onRetry={() => groups.refetch()} />
          )}
          {!groups.data.community_participants_error && groups.data.community_participants.length === 0 && (
            <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">A consulta não devolveu participantes. Confirme que a conta WhatsApp está ligada e é administradora da Comunidade.</p>
          )}
          {groups.data.community_participants.length > 0 && (
            <div className="max-h-96 divide-y overflow-y-auto rounded-lg border">
              {groups.data.community_participants.map((participant) => (
                <div key={participant.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{participant.name}</p>
                    <p className="text-xs text-muted-foreground">{participant.phone}{participant.email ? " · " + participant.email : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {participant.admin && <Badge variant="success">Administrador</Badge>}
                    <Badge variant={participant.registered ? "info" : "neutral"}>{participant.registered ? "Inscrito no portal" : "Sem inscrição no portal"}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="text-xs text-muted-foreground">Os 30 dias gratuitos começam após a confirmação de entrada na Comunidade principal. Sem renovação até ao fim desse período, a remoção é agendada automaticamente. Nas renovações pagas aplica-se a tolerância configurada no plano; a remoção só é concluída após verificação no WhatsApp.</p>
    </div>
  );
}
