import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/grupos")({
  head: () => ({
    meta: [
      { title: "Grupos WhatsApp — Encontre +" },
      { name: "description", content: "Subgrupos por interesse, geridos como dados — nunca fixos no código." },
      { property: "og:title", content: "Grupos WhatsApp — Encontre +" },
      { property: "og:description", content: "Subgrupos por interesse, geridos como dados — nunca fixos no código." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GruposPage,
});

function GruposPage() {
  return (
    <ModulePlaceholder
      icon={MessageCircle}
      title="Grupos WhatsApp"
      description="Subgrupos por interesse, geridos como dados — nunca fixos no código."
      phase={4}
      features={["Criar, editar e desativar grupos", "Identificadores externos do WhatsApp", "Estado de sincronização", "Consulta de participantes"]}
      endpoints={["GET /admin/groups", "POST /admin/groups", "PATCH /admin/groups/{id}", "GET /admin/groups/{id}/participants"]}
    />
  );
}
