import { createFileRoute } from "@tanstack/react-router";
import { FileClock } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — Encontre +" },
      { name: "description", content: "Registo imutável das ações administrativas e alterações financeiras." },
      { property: "og:title", content: "Auditoria — Encontre +" },
      { property: "og:description", content: "Registo imutável das ações administrativas e alterações financeiras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  return (
    <ModulePlaceholder
      icon={FileClock}
      title="Auditoria"
      description="Registo imutável das ações administrativas e alterações financeiras."
      phase={6}
      features={["Quem fez o quê e quando", "Valores anteriores e novos", "Filtro por utilizador, ação e período", "Alterações financeiras sempre auditadas"]}
      endpoints={["GET /admin/audit-logs"]}
    />
  );
}
