import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/admin/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Encontre +" },
      { name: "description", content: "Relatórios financeiros e de membros exportáveis." },
      { property: "og:title", content: "Relatórios — Encontre +" },
      { property: "og:description", content: "Relatórios financeiros e de membros exportáveis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <ModulePlaceholder
      icon={BarChart3}
      title="Relatórios"
      description="Relatórios financeiros e de membros exportáveis."
      phase={6}
      features={["Receitas por período", "Adesões, renovações e expirações", "Retenção de membros", "Exportação CSV"]}
      endpoints={["GET /admin/reports/revenue", "GET /admin/reports/members", "GET /admin/reports/export"]}
    />
  );
}
