import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/admin/acessos")({
  head: () => ({
    meta: [
      { title: "Controlo de acesso — Encontre +" },
      { name: "description", content: "Ordens de entrada e remoção dos grupos, com confirmação de cada operação." },
      { property: "og:title", content: "Controlo de acesso — Encontre +" },
      { property: "og:description", content: "Ordens de entrada e remoção dos grupos, com confirmação de cada operação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AcessosPage,
});

function AcessosPage() {
  return (
    <ModulePlaceholder
      icon={ShieldCheck}
      title="Controlo de acesso"
      description="Ordens de entrada e remoção dos grupos, com confirmação de cada operação."
      phase={4}
      features={["Fila de ordens de adição e remoção", "Nenhum membro considerado removido sem confirmação", "Operações pendentes mantidas se o WhatsApp estiver desligado", "Cancelamento automático de remoções após renovação"]}
      endpoints={["GET /admin/access-operations", "POST /admin/access-operations/{id}/retry", "POST /admin/access-operations/{id}/cancel"]}
    />
  );
}
