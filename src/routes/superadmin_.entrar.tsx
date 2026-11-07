import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured } from "@/lib/config";
import {
  isEncontreSuperAdmin,
  signInWithPassword,
  signOutSupabase,
} from "@/lib/supabase-auth";

export const Route = createFileRoute("/superadmin_/entrar")({
  head: () => ({
    meta: [
      { title: "Acesso Super Admin — Encontre +" },
      { name: "description", content: "Área reservada ao Super Admin da Encontre +." },
      { property: "og:title", content: "Acesso Super Admin — Encontre +" },
      { property: "og:description", content: "Área reservada ao Super Admin da Encontre +." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Introduza um email válido.").max(255),
  password: z.string().min(1, "Introduza a palavra-passe.").max(255),
});

function LoginPage() {
  const navigate = useNavigate();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("hgconnect1@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await signInWithPassword(parsed.data.email, parsed.data.password);
      if (!isEncontreSuperAdmin(user)) {
        await signOutSupabase();
        setError("Esta conta não está autorizada como Super Admin da Encontre+.");
        return;
      }
      navigate({ to: "/superadmin", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar sessão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" aria-label="Encontre + — Início">
            <Logo className="h-9" />
          </Link>
          <h1 className="mt-10 text-2xl font-extrabold text-foreground">Acesso Super Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Área reservada. Apenas a conta proprietária autorizada pode entrar.
          </p>

          {!configured && (
            <Alert className="mt-6 border-primary/20 bg-info-soft">
              <AlertDescription className="text-muted-foreground">
                Falta configurar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de
                ambiente do projeto. Nenhum deploy foi realizado.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!configured || submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Palavra-passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!configured || submitting}
              />
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!configured || submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
              Entrar
            </Button>
          </form>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-sidebar lg:block">
        <div className="surface-grid absolute inset-0" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <div className="h-1 w-16 rounded-full bg-gradient-brand" />
          <p className="mt-6 max-w-md font-display text-3xl font-black leading-tight text-foreground">
            Membros, pagamentos e grupos WhatsApp num só lugar.
          </p>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">
            Comunidade, oportunidades e conexões.
          </p>
        </div>
      </div>
    </div>
  );
}
