import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/pagamentos")({
  head: () => ({
    meta: [
      { title: "Pagamentos — Encontre +" },
      { name: "description", content: "Confirmação manual de comprovativos e preparação para gateways de pagamento externos." },
      { property: "og:title", content: "Pagamentos — Encontre +" },
      { property: "og:description", content: "Confirmação manual de comprovativos e preparação para gateways de pagamento externos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PagamentosPage,
});

function PagamentosPage() {
  return (
    <ModulePlaceholder
      icon={CreditCard}
      title="Pagamentos"
      description="Confirmação manual de comprovativos e preparação para gateways de pagamento externos."
      phase={3}
      features={["Consulta, aprovação e rejeição de comprovativos com observações", "Referência única por pagamento e prevenção de duplicados", "Webhooks autenticados para gateways (quando configurados)", "Histórico financeiro auditado"]}
      endpoints={["GET /admin/payments", "POST /admin/payments/{id}/approve", "POST /admin/payments/{id}/reject", "POST /webhooks/payments/{provider}"]}
    />
  );
}
