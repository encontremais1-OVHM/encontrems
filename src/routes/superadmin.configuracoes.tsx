import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Encontre +" },
      { name: "description", content: "Parâmetros da organização geridos pelo Super Admin." },
      { property: "og:title", content: "Configurações — Encontre +" },
      { property: "og:description", content: "Parâmetros da organização geridos pelo Super Admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <ModulePlaceholder
      icon={Settings}
      title="Configurações"
      description="Parâmetros da organização geridos pelo Super Admin."
      phase={2}
      features={["Nome e logótipo da organização", "Preço inicial, mensalidade, duração e tolerância", "Notificações e estado da integração WhatsApp", "Configurações de pagamento"]}
      endpoints={["GET /admin/settings", "PATCH /admin/settings"]}
    />
  );
}
