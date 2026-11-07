import { useQuery } from "@tanstack/react-query";
import { PlugZap, ServerOff } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { healthQuery } from "@/lib/api/endpoints";
import { isApiConfigured } from "@/lib/config";
import { cn } from "@/lib/utils";

export function ApiStatusPill() {
  const configured = isApiConfigured();
  const health = useQuery(healthQuery());
  let tone = "bg-neutral-soft text-muted-foreground";
  let dot = "bg-muted-foreground/60";
  let label = "Supabase não configurado";
  if (configured) {
    if (health.isPending) label = "A verificar ligação…";
    else if (health.isError) { tone = "bg-danger-soft text-destructive"; dot = "bg-destructive"; label = "API indisponível"; }
    else { tone = "bg-success-soft text-success"; dot = "bg-success"; label = "Supabase ligado"; }
  }
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",tone)}>
    <span className={cn("size-1.5 rounded-full",dot)} />{label}
  </span>;
}

export function ApiNotConfiguredNotice() {
  if (isApiConfigured()) return null;
  return <Alert className="border-primary/20 bg-info-soft">
    <ServerOff className="size-4 text-primary" />
    <AlertTitle className="text-foreground">Ligação ao Supabase ainda não configurada</AlertTitle>
    <AlertDescription className="text-muted-foreground">
      Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente da Netlify e publique uma nova versão.
    </AlertDescription>
  </Alert>;
}

export function ApiErrorNotice({message,onRetry}:{message:string;onRetry?:()=>void}) {
  return <Alert variant="destructive" className="bg-danger-soft">
    <PlugZap className="size-4" />
    <AlertTitle>Não foi possível carregar os dados</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center gap-3">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="text-xs font-semibold underline underline-offset-4">Tentar novamente</button>}
    </AlertDescription>
  </Alert>;
}
