import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { Logo } from "@/components/brand/Logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeApiError } from "@/lib/api/client";
import { login } from "@/lib/api/endpoints";
import { setToken } from "@/lib/auth-storage";
import { isApiConfigured } from "@/lib/config";

export const Route = createFileRoute("/superadmin_/entrar")({
  head: () => ({
    meta: [
      { title: "Iniciar sessão — Encontre +" },
      { name: "description", content: "Acesso ao painel administrativo da comunidade Encontre +." },
      { property: "og:title", content: "Iniciar sessão — Encontre +" },
      { property: "og:description", content: "Acesso ao painel administrativo da comunidade Encontre +." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
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
  const configured = isApiConfigured();
  const [email, setEmail] = useState("");
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
      const res = await login(parsed.data.email, parsed.data.password);
      setToken(res.token);
      navigate({ to: "/admin" });
    } catch (err) {
      setError(describeApiError(err));
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
          <h1 className="mt-10 text-2xl font-extrabold text-foreground">Painel administrativo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesso reservado a Super Admin, Gestores e Suporte.
          </p>

          {!configured && (
            <Alert className="mt-6 border-primary/20 bg-info-soft">
              <AlertDescription className="text-muted-foreground">
                O backend Laravel ainda não está ligado. O início de sessão ficará disponível quando a
                API for publicada e configurada.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
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

          <Link to="/admin" className="mt-6 inline-block text-xs font-medium text-muted-foreground hover:text-primary">
            Ver pré-visualização do painel →
          </Link>
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
