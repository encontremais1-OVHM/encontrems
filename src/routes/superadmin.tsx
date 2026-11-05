import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AdminShell } from "@/components/layout/AdminShell";

export const Route = createFileRoute("/superadmin")({
  head: () => ({
    meta: [
      { title: "Painel administrativo — Encontre +" },
      { name: "description", content: "Gestão de membros, pagamentos, assinaturas e grupos WhatsApp da comunidade Encontre +." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
