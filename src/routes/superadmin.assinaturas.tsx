import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/assinaturas")({
  head: () => ({ meta: [{ title: "Assinaturas — Encontre +" }] }),
  component: () => <AdminResourceList resource="subscriptions" title="Assinaturas" description="Subscrições, períodos de 30 dias, datas de renovação e tolerância de 5 dias." columns={[{"key":"member_name","label":"Membro"},{"key":"phone","label":"WhatsApp"},{"key":"community_name","label":"Comunidade"},{"key":"plan_name","label":"Plano"},{"key":"status","label":"Estado"},{"key":"expires_at","label":"Expira em"},{"key":"grace_ends_at","label":"Fim da tolerância"}]} />,
});
