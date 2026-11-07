import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/inscricoes")({
  head: () => ({ meta: [{ title: "Inscrições — Encontre +" }] }),
  component: () => <AdminResourceList resource="registrations" title="Inscrições" description="Registos reais de membros, origem da inscrição e situação da subscrição." columns={[{"key":"full_name","label":"Nome"},{"key":"phone_e164","label":"WhatsApp"},{"key":"email","label":"Email"},{"key":"province","label":"Província"},{"key":"city","label":"Cidade"},{"key":"subscription_status","label":"Subscrição"},{"key":"registration_source","label":"Origem"},{"key":"created_at","label":"Registado em"}]} />,
});
