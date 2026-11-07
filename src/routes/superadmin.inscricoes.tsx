import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/inscricoes")({
  head: () => ({ meta: [{ title: "Inscrições — Encontre +" }] }),
  component: () => <AdminResourceList resource="registrations" title="Inscrições" description="Inscrições feitas no site, dados dos membros, comunidade escolhida, subgrupos selecionados e estado de acesso ao WhatsApp." columns={[{"key":"full_name","label":"Nome"},{"key":"phone_e164","label":"WhatsApp"},{"key":"email","label":"Email"},{"key":"community_name","label":"Comunidade"},{"key":"selected_subgroups","label":"Subgrupos escolhidos"},{"key":"community_access","label":"Acesso principal"},{"key":"subscription_status","label":"Subscrição"},{"key":"province","label":"Província"},{"key":"city","label":"Cidade"},{"key":"created_at","label":"Registado em"}]} />,
});
