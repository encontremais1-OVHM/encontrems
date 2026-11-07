import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações do plano — Encontre +" }] }),
  component: () => <AdminResourceList resource="plans" title="Configurações do plano" description="Valores reais do plano ativo da comunidade: adesão gratuita, renovação de 1.000 Kz, 30 dias e 5 dias de tolerância." columns={[{"key":"community_name","label":"Comunidade"},{"key":"name","label":"Plano"},{"key":"initial_price","label":"Adesão"},{"key":"renewal_price","label":"Renovação"},{"key":"duration_days","label":"Dias"},{"key":"grace_days","label":"Tolerância"},{"key":"is_active","label":"Ativo"}]} />,
});
