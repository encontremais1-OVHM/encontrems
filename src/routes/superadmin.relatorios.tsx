import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — Encontre +" }] }),
  component: () => <AdminResourceList resource="reports" title="Relatórios" description="Indicadores calculados a partir dos membros, subscrições e pagamentos confirmados no Supabase." columns={[{"key":"metric","label":"Indicador"},{"key":"value","label":"Valor"}]} />,
});
