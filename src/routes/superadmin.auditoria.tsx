import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — Encontre +" }] }),
  component: () => <AdminResourceList resource="audit" title="Auditoria" description="Histórico de operações registadas no Supabase, com entidade, membro e data." columns={[{"key":"action","label":"Acção"},{"key":"entity_type","label":"Entidade"},{"key":"member_name","label":"Membro"},{"key":"entity_id","label":"ID da entidade"},{"key":"created_at","label":"Data"}]} />,
});
