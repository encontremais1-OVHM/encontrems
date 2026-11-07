import { createFileRoute } from "@tanstack/react-router";
import { AdminResourceList } from "@/components/app/AdminResourceList";

export const Route = createFileRoute("/superadmin/utilizadores")({
  head: () => ({ meta: [{ title: "Utilizadores administrativos — Encontre +" }] }),
  component: () => <AdminResourceList resource="users" title="Utilizadores administrativos" description="Contas administrativas internas existentes. As credenciais são geridas pelo Supabase Auth e nunca são expostas nesta lista." columns={[{"key":"name","label":"Nome"},{"key":"email","label":"Email"},{"key":"role","label":"Função"},{"key":"is_active","label":"Ativo"},{"key":"last_login_at","label":"Último acesso"},{"key":"created_at","label":"Criado em"}]} />,
});
