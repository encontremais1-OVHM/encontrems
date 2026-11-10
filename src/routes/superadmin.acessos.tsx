import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/acessos")({
  head: () => ({ meta: [{ title: "Controlo de acesso — Encontre +" }] }),
  component: () => <AdminResourceList resource="access" title="Controlo de acesso" description="Operações reais de entrada e remoção nos grupos WhatsApp, com tentativas, erros e estado de execução." columns={[{"key":"member_name","label":"Membro"},{"key":"phone","label":"WhatsApp"},{"key":"group_name","label":"Grupo"},{"key":"operation_type","label":"Operação"},{"key":"status","label":"Estado"},{"key":"attempts","label":"Tentativas"},{"key":"next_retry_at","label":"Próxima tentativa"},{"key":"last_error","label":"Último erro"}]} />,
});
