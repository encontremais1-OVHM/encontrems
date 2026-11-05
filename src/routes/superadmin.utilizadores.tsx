import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";

import { ModulePlaceholder } from "@/components/app/ModulePlaceholder";

export const Route = createFileRoute("/superadmin/utilizadores")({
  head: () => ({
    meta: [
      { title: "Utilizadores — Encontre +" },
      { name: "description", content: "Contas administrativas e perfis de acesso." },
      { property: "og:title", content: "Utilizadores — Encontre +" },
      { property: "og:description", content: "Contas administrativas e perfis de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UtilizadoresPage,
});

function UtilizadoresPage() {
  return (
    <ModulePlaceholder
      icon={UserCog}
      title="Utilizadores"
      description="Contas administrativas e perfis de acesso."
      phase={2}
      features={["Perfis: Super Admin, Gestor e Suporte", "Autorização validada no backend", "Ativação e desativação de contas", "Registo de acessos"]}
      endpoints={["GET /admin/users", "POST /admin/users", "PATCH /admin/users/{id}"]}
    />
  );
}
