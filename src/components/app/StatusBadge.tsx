import { Badge } from "@/components/ui/badge";
import type { AccessStatus, SubscriptionStatus } from "@/lib/api/types";

const SUBSCRIPTION: Record<
  SubscriptionStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  pending: { label: "Pendente", variant: "info" },
  active: { label: "Ativa", variant: "success" },
  grace_period: { label: "Tolerância", variant: "warning" },
  expired: { label: "Expirada", variant: "danger" },
  suspended: { label: "Suspensa", variant: "neutral" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

const ACCESS: Record<
  AccessStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
  none: { label: "Sem acesso", variant: "neutral" },
  pending: { label: "A aguardar", variant: "info" },
  active: { label: "Com acesso", variant: "success" },
  retrying: { label: "A tentar novamente", variant: "warning" },
  invite_sent: { label: "Convite enviado", variant: "info" },
  removal_pending: { label: "Remoção pendente", variant: "warning" },
  removed: { label: "Removido", variant: "neutral" },
  failed: { label: "Falhou", variant: "danger" },
};

export const SUBSCRIPTION_STATUS_OPTIONS = Object.entries(SUBSCRIPTION).map(([value, v]) => ({
  value: value as SubscriptionStatus,
  label: v.label,
}));

export function SubscriptionBadge({ status }: { status: SubscriptionStatus | null }) {
  if (!status) return <Badge variant="neutral">Sem assinatura</Badge>;
  const s = SUBSCRIPTION[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function AccessBadge({ status }: { status: AccessStatus }) {
  const s = ACCESS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
