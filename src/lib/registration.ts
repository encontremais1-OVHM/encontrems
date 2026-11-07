import type { RegistrationStatusResponse } from "./api/types";

export type JourneyState = "done" | "current" | "pending" | "failed";

export interface JourneyStep {
  key: "registration" | "payment" | "subscription" | "community" | "subgroup";
  label: string;
  state: JourneyState;
  hint?: string;
}

const ACTIVE_SUBSCRIPTION = new Set(["active", "grace_period"]);

/**
 * WhatsApp invite links are only shown when the backend has confirmed the
 * payment, activated the subscription and authorised access. The backend is
 * the authority (it only sends links when allowed); this is a second guard so
 * a link is never exposed before validation.
 */
export function inviteLinks(s: RegistrationStatusResponse): {
  community: string | null;
  subgroup: string | null;
  subgroups: Array<{id:string;name:string;url:string}>;
} {
  const paid = s.payment?.status === "confirmed";
  const subscribed = s.subscription ? ACTIVE_SUBSCRIPTION.has(s.subscription.status) : false;
  const approved = s.status === "approved";
  if (!paid || !subscribed || !approved || !s.access) return { community: null, subgroup: null, subgroups: [] };
  const subgroups = s.access.subgroup === "active"
    ? (s.access.subgroup_invite_urls ?? (s.access.subgroup_invite_url ? [{id:"subgroup",name:"Subgrupo",url:s.access.subgroup_invite_url}] : []))
    : [];
  return {
    community: s.access.community === "active" ? s.access.community_invite_url : null,
    subgroup: subgroups[0]?.url ?? null,
    subgroups,
  };
}

/** Turns the backend status into the five visible steps of the member journey. */
export function deriveJourney(s: RegistrationStatusResponse): JourneyStep[] {
  const rejected = s.status === "rejected" || s.status === "cancelled";
  const paymentStatus = s.payment?.status ?? "pending";
  const paid = paymentStatus === "confirmed";
  const subscribed = s.subscription ? ACTIVE_SUBSCRIPTION.has(s.subscription.status) : false;
  const links = inviteLinks(s);

  const registration: JourneyStep = {
    key: "registration",
    label: "Inscrição recebida",
    state: rejected ? "failed" : "done",
    ...(rejected && s.rejection_reason ? { hint: s.rejection_reason } : {}),
  };

  const payment: JourneyStep = {
    key: "payment",
    label: "Pagamento confirmado",
    state: rejected
      ? "pending"
      : paid
        ? "done"
        : paymentStatus === "rejected"
          ? "failed"
          : "current",
    ...(!paid && !rejected
      ? {
          hint:
            paymentStatus === "rejected"
              ? "O comprovativo foi recusado. Envie um novo ou contacte o suporte."
              : s.status === "payment_under_review"
                ? "Comprovativo recebido — a aguardar validação."
                : "A aguardar o pagamento da adesão.",
        }
      : {}),
  };

  const subscription: JourneyStep = {
    key: "subscription",
    label: "Assinatura activa",
    state: subscribed ? "done" : paid && !rejected ? "current" : "pending",
  };

  const accessStep = (
    key: "community" | "subgroup",
    label: string,
    link: string | null,
    status: string | undefined,
  ): JourneyStep => ({
    key,
    label,
    state: link
      ? "done"
      : status === "failed"
        ? "failed"
        : subscribed && !rejected
          ? "current"
          : "pending",
  });

  return [
    registration,
    payment,
    subscription,
    accessStep("community", "Acesso à comunidade", links.community, s.access?.community),
    accessStep("subgroup", "Acesso ao subgrupo", links.subgroup, s.access?.subgroup),
  ];
}
