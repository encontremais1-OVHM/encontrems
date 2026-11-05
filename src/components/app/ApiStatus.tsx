import { useQuery } from "@tanstack/react-query";
import { PlugZap, ServerOff } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { healthQuery } from "@/lib/api/endpoints";
import { isApiConfigured } from "@/lib/config";
import { cn } from "@/lib/utils";

/** Small pill in the top bar showing whether the Laravel API answers. */
export function ApiStatusPill() {
  const configured = isApiConfigured();
  const health = useQuery(healthQuery());

  let tone = "bg-neutral-soft text-muted-foreground";
  let dot = "bg-muted-foreground/60";
  let label = "Backend não ligado";

  if (configured) {
    if (health.isPending) {
      label = "A verificar API…";
    } else if (health.isError) {
      tone = "bg-danger-soft text-destructive";
      dot = "bg-destructive";
      label = "API indisponível";
    } else {
      tone = "bg-success-soft text-success";
      dot = "bg-success";
      label = "API online";
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

/** Explains, without faking data, that the Laravel backend is not connected yet. */
export function ApiNotConfiguredNotice() {
  if (isApiConfigured()) return null;
  return (
    <Alert className="border-primary/20 bg-info-soft">
      <ServerOff className="size-4 text-primary" />
      <AlertTitle className="text-foreground">Backend Laravel ainda não ligado</AlertTitle>
      <AlertDescription className="text-muted-foreground">
        Esta interface está pronta, mas só apresenta dados reais vindos da API Laravel. Defina
        <code className="mx-1 rounded bg-background px-1 py-0.5 text-[0.7rem]">VITE_API_URL</code>
        quando o backend estiver publicado no Railway. Nenhum número abaixo é fictício.
      </AlertDescription>
    </Alert>
  );
}

export function ApiErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="bg-danger-soft">
      <PlugZap className="size-4" />
      <AlertTitle>Não foi possível carregar os dados</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-semibold underline underline-offset-4"
          >
            Tentar novamente
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}
