import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AdminShell } from "@/components/layout/AdminShell";
import { Button } from "@/components/ui/button";
import {
  getAuthenticatedUser,
  isEncontreSuperAdmin,
  signOutSupabase,
} from "@/lib/supabase-auth";

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

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">{children}</div>;
}

/**
 * This browser-side gate improves navigation UX. The authoritative role is
 * stored in Supabase app_metadata and must also be checked by server-side
 * functions/RLS before any privileged data operation is enabled.
 */
function SuperAdminLayout() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let active = true;

    async function verifyAccess() {
      const user = await getAuthenticatedUser();
      const allowed = isEncontreSuperAdmin(user);
      if (!active) return;

      if (allowed) {
        setStatus("allowed");
        return;
      }

      setStatus("denied");
      await signOutSupabase();
      navigate({ to: "/superadmin/entrar", replace: true });
    }

    void verifyAccess();
    return () => {
      active = false;
    };
  }, [navigate]);


  if (status === "checking") {
    return (
      <FullScreen>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="A verificar sessão" />
      </FullScreen>
    );
  }

  if (status === "denied") {
    return (
      <FullScreen>
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-destructive">
            <ShieldAlert className="size-6" />
          </span>
          <p className="mt-4 font-semibold text-foreground">Acesso reservado ao Super Admin</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A sessão não pertence à conta proprietária autorizada.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => navigate({ to: "/superadmin/entrar" })}>
            Ir para o acesso
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
