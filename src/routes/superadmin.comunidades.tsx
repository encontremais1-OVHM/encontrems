import { createFileRoute } from "@tanstack/react-router";
import { UsersRound } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/comunidades")({
  head: () => ({
    meta: [
      { title: "Comunidades — Encontre +" },
      { name: "description", content: "Comunidade principal Encontre + e preparação para várias comunidades e influencers." },
      { property: "og:title", content: "Comunidades — Encontre +" },
      { property: "og:description", content: "Comunidade principal Encontre + e preparação para várias comunidades e influencers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComunidadesPage,
});

function ComunidadesPage() {
  return (
    <ModulePlaceholder
      icon={UsersRound}
      title="Comunidades"
      description="Comunidade principal Encontre + e preparação para várias comunidades e influencers."
      phase={4}
      features={["Comunidade principal e comunidades adicionais", "Imagem, descrição e finalidade publicadas no catálogo público", "Planos e regras por comunidade", "Associação de subgrupos"]}
      endpoints={["GET /admin/communities", "POST /admin/communities", "PATCH /admin/communities/{id}"]}
    />
  );
}
