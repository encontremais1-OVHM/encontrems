import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { ApiError, describeApiError } from "@/lib/api/client";
import { meQuery } from "@/lib/api/endpoints";
import { clearToken, getToken } from "@/lib/auth-storage";
import { isApiConfigured } from "@/lib/config";

export const Route = createFileRoute("/superadmin")({
  head: () => ({
    meta: [
      { title: "Painel Super Admin — Encontre +" },
      { name: "description", content: "Área reservada ao Super Admin da Encontre +." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SuperAdminLayout,
});

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">{children}</div>;
}

/**
 * Client gate for the panel. The real protection is the Laravel API: every
 * /admin/* endpoint requires a Sanctum token with the super_admin role and
 * answers 401/403 otherwise. This gate only avoids rendering the panel to
 * visitors without a valid Super Admin session.
 */
function SuperAdminLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const configured = isApiConfigured();
  const [token, setTokenState] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setTokenState(getToken());
  }, []);

  const me = useQuery({ ...meQuery(), enabled: configured && Boolean(token) });

  useEffect(() => {
    if (token === null || (token !== undefined && !configured)) {
      navigate({ to: "/superadmin/entrar", replace: true });
    }
  }, [token, configured, navigate]);

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      clearToken();
      queryClient.removeQueries({ queryKey: ["auth"] });
      navigate({ to: "/superadmin/entrar", replace: true });
    }
  }, [me.error, navigate, queryClient]);

  function signOut() {
    clearToken();
    queryClient.removeQueries({ queryKey: ["auth"] });
    navigate({ to: "/superadmin/entrar", replace: true });
  }

  if (token === undefined || token === null || !configured || me.isPending) {
    return (
      <FullScreen>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="A verificar sessão" />
      </FullScreen>
    );
  }

  if (me.isError) {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <p className="font-semibold text-foreground">Não foi possível verificar a sessão</p>
          <p className="mt-1 text-sm text-muted-foreground">{describeApiError(me.error)}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => me.refetch()}>
              Tentar novamente
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sair
            </Button>
          </div>
        </div>
      </FullScreen>
    );
  }

  if (me.data.user.role !== "super_admin") {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-destructive">
            <ShieldAlert className="size-6" />
          </span>
          <p className="mt-4 font-semibold text-foreground">Acesso reservado ao Super Admin</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A sua conta não tem permissão para aceder a este painel.
          </p>
          <Button className="mt-5" variant="outline" onClick={signOut}>
            Terminar sessão
          </Button>
        </div>
      </FullScreen>
    );
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
