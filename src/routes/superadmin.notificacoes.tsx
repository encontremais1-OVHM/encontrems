import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — Encontre +" }] }),
  component: () => <AdminResourceList resource="notifications" title="Notificações" description="Mensagens internas, email e WhatsApp registadas no sistema, com estado de envio." columns={[{"key":"member_name","label":"Destinatário"},{"key":"channel","label":"Canal"},{"key":"notification_type","label":"Tipo"},{"key":"message","label":"Mensagem"},{"key":"status","label":"Estado"},{"key":"sent_at","label":"Enviado em"},{"key":"error_message","label":"Erro"}]} />,
});
