import { createFileRoute } from "@tanstack/react-router";
import { RefreshCcw } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/assinaturas")({
  head: () => ({
    meta: [
      { title: "Assinaturas — Encontre +" },
      { name: "description", content: "Estados, vencimentos e histórico de renovações — todos calculados pelo backend." },
      { property: "og:title", content: "Assinaturas — Encontre +" },
      { property: "og:description", content: "Estados, vencimentos e histórico de renovações — todos calculados pelo backend." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssinaturasPage,
});

function AssinaturasPage() {
  return (
    <ModulePlaceholder
      icon={RefreshCcw}
      title="Assinaturas"
      description="Estados, vencimentos e histórico de renovações — todos calculados pelo backend."
      phase={3}
      features={["Estados: Pendente, Ativa, Tolerância, Expirada, Suspensa, Cancelada", "Dias restantes e vencimento em Africa/Luanda", "Histórico de renovações por membro", "Transições de estado executadas pelo Laravel Scheduler"]}
      endpoints={["GET /admin/subscriptions", "GET /admin/subscriptions/{id}", "GET /admin/members/{id}/subscriptions"]}
    />
  );
}
