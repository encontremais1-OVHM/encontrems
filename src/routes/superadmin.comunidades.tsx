import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/comunidades")({
  head: () => ({ meta: [{ title: "Comunidades — Encontre +" }] }),
  component: () => <AdminResourceList resource="communities" title="Comunidades" description="Comunidades ativas, planos, grupos importados e total de membros associados." columns={[{"key":"name","label":"Comunidade"},{"key":"slug","label":"Slug"},{"key":"status","label":"Estado"},{"key":"influencer_name","label":"Responsável"},{"key":"members_count","label":"Membros"},{"key":"groups_count","label":"Grupos"}]} />,
});
