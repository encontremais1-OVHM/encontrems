import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/whatsapp")({
  head: () => ({
    meta: [
      { title: "Integração WhatsApp — Encontre +" },
      { name: "description", content: "Ligação à API Bider através de um adaptador substituível. Aguarda documentação oficial e credenciais." },
      { property: "og:title", content: "Integração WhatsApp — Encontre +" },
      { property: "og:description", content: "Ligação à API Bider através de um adaptador substituível. Aguarda documentação oficial e credenciais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappPage,
});

function WhatsappPage() {
  return (
    <ModulePlaceholder
      icon={Activity}
      title="Integração WhatsApp"
      description="Ligação à API Bider através de um adaptador substituível. Aguarda documentação oficial e credenciais."
      phase={5}
      features={["Estado da conexão e monitorização de desconexões", "Adaptador de simulação claramente identificado como não real", "Registo, repetição e resultado de operações", "Ativação real apenas após análise da documentação Bider"]}
      endpoints={["GET /admin/whatsapp/status", "GET /admin/whatsapp/operations", "POST /admin/whatsapp/reconnect"]}
    />
  );
}
