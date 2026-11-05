import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/admin/inscricoes")({
  head: () => ({
    meta: [
      { title: "Inscrições — Encontre +" },
      { name: "description", content: "Pedidos de adesão recebidos pelo formulário público e respetivo estado de pagamento." },
      { property: "og:title", content: "Inscrições — Encontre +" },
      { property: "og:description", content: "Pedidos de adesão recebidos pelo formulário público e respetivo estado de pagamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InscricoesPage,
});

function InscricoesPage() {
  return (
    <ModulePlaceholder
      icon={UserPlus}
      title="Inscrições"
      description="Pedidos de adesão recebidos pelo formulário público e respetivo estado de pagamento."
      phase={3}
      features={["Lista de inscrições com estado (pendente, paga, rejeitada)", "Validação de número WhatsApp único", "Associação de interesses aos subgrupos", "Ativação da assinatura após pagamento confirmado"]}
      endpoints={["POST /public/registrations", "GET /admin/registrations", "GET /admin/registrations/{id}"]}
    />
  );
}
