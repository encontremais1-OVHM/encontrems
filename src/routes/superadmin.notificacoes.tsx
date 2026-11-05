import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações — Encontre +" },
      { name: "description", content: "Mensagens automáticas por WhatsApp e email ao longo do ciclo do membro." },
      { property: "og:title", content: "Notificações — Encontre +" },
      { property: "og:description", content: "Mensagens automáticas por WhatsApp e email ao longo do ciclo do membro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesPage,
});

function NotificacoesPage() {
  return (
    <ModulePlaceholder
      icon={Bell}
      title="Notificações"
      description="Mensagens automáticas por WhatsApp e email ao longo do ciclo do membro."
      phase={5}
      features={["Inscrição, pagamento pendente, confirmado e rejeitado", "Aviso de renovação (dia 27), vencimento e tolerância", "Expiração, remoção e reativação", "Respeito pelo consentimento e limites do fornecedor"]}
      endpoints={["GET /admin/notifications", "GET /admin/notification-templates", "PATCH /admin/notification-templates/{id}"]}
    />
  );
}
