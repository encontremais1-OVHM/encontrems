const corsHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function digits(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "");
}

async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return toHex(new Uint8Array(signature));
}

async function restRows<T>(baseUrl: string, serviceKey: string, path: string): Promise<T[]> {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase preflight query failed (${response.status}): ${text.slice(0, 300)}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows as T[] : [];
}

type GroupRow = { id: string; community_id: string; group_type: "community" | "subgroup" };
type MemberRow = { id: string; phone_e164: string | null; phone: string | null };
type MembershipRow = { id: string; status: string };
type SubscriptionRow = {
  id: string;
  status: string;
  plan_id: string;
  expires_at: string | null;
  grace_ends_at: string | null;
  whatsapp_activated_at: string | null;
};
type PlanRow = { grace_days: number | null };
type OperationRow = { id: string; status: string; created_at: string };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(503, { ok: false, error: "server_configuration_missing" });

  const rawBody = await req.text();
  if (!rawBody || rawBody.length > 32_768) return json(413, { ok: false, error: "invalid_payload_size" });

  try {
    const secretResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_whatsapp_webhook_secret`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (!secretResponse.ok) return json(503, { ok: false, error: "webhook_secret_unavailable" });
    const secret = await secretResponse.json();
    if (typeof secret !== "string" || secret.length < 32) return json(503, { ok: false, error: "webhook_secret_invalid" });

    const suppliedSignature = (req.headers.get("x-encontre-signature") || "").toLowerCase();
    const expectedSignature = await hmacSha256(secret, rawBody);
    if (!safeEqual(suppliedSignature, expectedSignature)) return json(401, { ok: false, error: "invalid_signature" });

    const payload = JSON.parse(rawBody);
    if (payload?.event !== "whatsapp.participant_added" || payload?.action !== "add") {
      return json(202, { ok: true, ignored: true });
    }

    const externalGroupId = String(payload.group_id || "");
    const participantJid = String(payload.participant_jid || payload.participant || "");
    const phone = digits(participantJid.split("@")[0].split(":")[0]);
    const eventId = String(payload.event_id || "");
    if (!externalGroupId.endsWith("@g.us") || !/^\d{8,15}$/.test(phone) || !eventId || eventId.length > 128) {
      return json(422, { ok: false, error: "invalid_participant_event" });
    }

    const occurredAt = payload.occurred_at && !Number.isNaN(Date.parse(payload.occurred_at))
      ? new Date(payload.occurred_at).toISOString()
      : new Date().toISOString();
    const now = Date.now();

    const groupQuery = new URLSearchParams({
      select: "id,community_id,group_type",
      external_group_id: `eq.${externalGroupId}`,
      is_active: "eq.true",
      limit: "1",
    });
    const groups = await restRows<GroupRow>(supabaseUrl, serviceKey, `whatsapp_groups?${groupQuery}`);
    const group = groups[0];
    if (!group) {
      console.warn("WhatsApp confirmation ignored: active group not found", { eventId });
      return json(202, { ok: true, ignored: true, reason: "active_group_not_found" });
    }

    const memberQuery = new URLSearchParams({
      select: "id,phone_e164,phone",
      or: `(phone_e164.eq.${phone},phone.eq.${phone},phone_e164.eq.+${phone},phone.eq.+${phone})`,
      limit: "2",
    });
    const members = await restRows<MemberRow>(supabaseUrl, serviceKey, `members?${memberQuery}`);
    const member = members.find((item) => digits(item.phone_e164 || item.phone) === phone);
    if (!member) {
      console.warn("WhatsApp confirmation ignored: member not found", { eventId });
      return json(202, { ok: true, ignored: true, reason: "member_not_found" });
    }

    const membershipQuery = new URLSearchParams({
      select: "id,status",
      member_id: `eq.${member.id}`,
      whatsapp_group_id: `eq.${group.id}`,
      limit: "1",
    });
    const memberships = await restRows<MembershipRow>(supabaseUrl, serviceKey, `group_memberships?${membershipQuery}`);
    const membership = memberships[0];
    if (!membership) {
      console.warn("WhatsApp confirmation ignored: membership not authorised", { eventId });
      return json(202, { ok: true, ignored: true, reason: "membership_not_authorised" });
    }

    const subscriptionQuery = new URLSearchParams({
      select: "id,status,plan_id,expires_at,grace_ends_at,whatsapp_activated_at",
      member_id: `eq.${member.id}`,
      community_id: `eq.${group.community_id}`,
      order: "created_at.desc",
      limit: "1",
    });
    const subscriptions = await restRows<SubscriptionRow>(supabaseUrl, serviceKey, `subscriptions?${subscriptionQuery}`);
    const subscription = subscriptions[0];
    if (!subscription) {
      console.warn("WhatsApp confirmation ignored: subscription not found", { eventId });
      return json(202, { ok: true, ignored: true, reason: "subscription_not_found" });
    }

    const isFirstCommunityJoin = group.group_type === "community"
      && subscription.status === "pending"
      && !subscription.whatsapp_activated_at;
    let hasCurrentAccess = false;
    if (["active", "grace_period"].includes(subscription.status)) {
      const plansQuery = new URLSearchParams({ select: "grace_days", id: `eq.${subscription.plan_id}`, limit: "1" });
      const plans = await restRows<PlanRow>(supabaseUrl, serviceKey, `plans?${plansQuery}`);
      const expiresAt = subscription.expires_at ? Date.parse(subscription.expires_at) : Number.NaN;
      const storedGraceEnd = subscription.grace_ends_at ? Date.parse(subscription.grace_ends_at) : Number.NaN;
      const calculatedGraceEnd = Number.isFinite(expiresAt)
        ? expiresAt + Math.max(0, Number(plans[0]?.grace_days || 0)) * 86_400_000
        : Number.NaN;
      const effectiveGraceEnd = Math.max(storedGraceEnd, calculatedGraceEnd);
      hasCurrentAccess = Number.isFinite(effectiveGraceEnd) && effectiveGraceEnd >= now;
    }

    if (!isFirstCommunityJoin && !hasCurrentAccess) {
      console.warn("WhatsApp confirmation ignored: subscription is not eligible", { eventId, subscriptionStatus: subscription.status });
      return json(202, { ok: true, ignored: true, reason: "subscription_not_eligible" });
    }

    if (group.group_type === "subgroup") {
      const parentQuery = new URLSearchParams({
        select: "id",
        community_id: `eq.${group.community_id}`,
        group_type: "eq.community",
        is_active: "eq.true",
        limit: "1",
      });
      const parents = await restRows<{ id: string }>(supabaseUrl, serviceKey, `whatsapp_groups?${parentQuery}`);
      const parent = parents[0];
      if (!parent) return json(202, { ok: true, ignored: true, reason: "community_not_found" });
      const parentMembershipQuery = new URLSearchParams({
        select: "id",
        member_id: `eq.${member.id}`,
        whatsapp_group_id: `eq.${parent.id}`,
        status: "eq.joined",
        limit: "1",
      });
      const parentMemberships = await restRows<{ id: string }>(supabaseUrl, serviceKey, `group_memberships?${parentMembershipQuery}`);
      if (!parentMemberships[0]) {
        return json(202, { ok: true, ignored: true, reason: "community_membership_not_confirmed" });
      }
    }

    if (membership.status === "joined") {
      return json(200, { ok: true, already_joined: true });
    }

    const operationQuery = new URLSearchParams({
      select: "id,status,created_at",
      member_id: `eq.${member.id}`,
      whatsapp_group_id: `eq.${group.id}`,
      operation_type: "eq.add",
      status: "in.(queued,processing,retry_pending)",
      order: "created_at.desc",
      limit: "1",
    });
    const operations = await restRows<OperationRow>(supabaseUrl, serviceKey, `access_operations?${operationQuery}`);
    if (!operations[0]) {
      console.warn("WhatsApp confirmation ignored: no active add operation", { eventId });
      return json(202, { ok: true, ignored: true, reason: "no_active_add_operation" });
    }

    if (Date.parse(occurredAt) > now + 5 * 60_000) {
      return json(422, { ok: false, error: "participant_event_from_future" });
    }

    const confirmResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/confirm_whatsapp_participant`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_event_id: eventId,
        p_external_group_id: externalGroupId,
        p_participant_phone: phone,
        p_occurred_at: occurredAt,
      }),
    });

    const resultText = await confirmResponse.text();
    if (!confirmResponse.ok) {
      console.error("WhatsApp confirmation RPC failed", confirmResponse.status, resultText.slice(0, 500));
      return json(409, { ok: false, error: "membership_confirmation_failed" });
    }
    const result = resultText ? JSON.parse(resultText) : {};
    return json(200, result && typeof result === "object" ? result : { ok: true });
  } catch (error) {
    console.error("WhatsApp confirmation webhook error", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "webhook_processing_failed" });
  }
});
