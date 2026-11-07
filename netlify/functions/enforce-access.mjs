const SUPABASE_URL = (Netlify.env.get("VITE_SUPABASE_URL") || Netlify.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BRIDGE_URL = (Netlify.env.get("WHATSAPP_BRIDGE_URL") || "").replace(/\/+$/, "");
const BRIDGE_TOKEN = Netlify.env.get("WHATSAPP_BRIDGE_TOKEN") || "";

async function db(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) throw new Error(data?.message || data?.details || `Supabase returned ${response.status}`);
  return data;
}

async function bridge(path, body) {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) throw new Error("WhatsApp bridge credentials are not configured.");
  const response = await fetch(`${BRIDGE_URL}/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${BRIDGE_TOKEN}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(7000),
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!response.ok) throw new Error(data.message || data.error || `WhatsApp bridge returned ${response.status}`);
  return data;
}

const iso = (d) => d.toISOString();
const chunk = (items, size = 50) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export default async (_request) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Expiry worker missing Supabase server configuration.");
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = iso(now);
  const expired = await db(
    "subscriptions?select=id,member_id,community_id,status,expires_at,grace_ends_at&status=in.(active,grace_period,expired)&grace_ends_at=lt." + encodeURIComponent(nowIso) + "&limit=500",
  );

  if (!expired.length) return Response.json({ ok: true, subscriptions_checked: 0, removals_succeeded: 0, removals_pending: 0 });

  let removalsSucceeded = 0;
  let removalsPending = 0;
  let bridgeConnected = false;
  try {
    const status = await bridge("/status");
    bridgeConnected = status.connected === true;
  } catch (error) {
    console.warn("WhatsApp bridge unavailable during expiry run:", error instanceof Error ? error.message : "unknown");
  }

  for (const subscription of expired) {
    const memberships = await db(
      "group_memberships?select=id,member_id,whatsapp_group_id,external_participant_id,status&member_id=eq." +
      subscription.member_id + "&status=in.(joined,removal_pending)",
    );

    for (const membership of memberships) {
      const idempotencyKey = `expiry-remove:${subscription.id}:${membership.whatsapp_group_id}`;
      const existingOps = await db("access_operations?select=id,status,attempts&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1");
      let operation = existingOps[0];

      if (membership.status === "joined") {
        if (operation?.status === "succeeded") continue;
        if (!operation) {
          const created = await db("access_operations", {
            method: "POST",
            body: JSON.stringify([{
              member_id: membership.member_id,
              whatsapp_group_id: membership.whatsapp_group_id,
              operation_type: "remove",
              status: "queued",
              idempotency_key: idempotencyKey,
              attempts: 0,
            }]),
            headers: { Prefer: "return=representation" },
          });
          operation = created[0];
        }
        await db("group_memberships?id=eq." + membership.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "removal_pending", updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
      }

      if (!operation || operation.status === "succeeded") continue;
      if (!bridgeConnected || !membership.external_participant_id) {
        const message = !bridgeConnected ? "WhatsApp desconectado; remoção aguarda reconexão." : "Identificador do participante não disponível.";
        await db("access_operations?id=eq." + operation.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "retry_pending", attempts: Number(operation.attempts || 0) + 1, last_error: message, next_retry_at: iso(new Date(now.getTime() + 60 * 60 * 1000)), updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        removalsPending++;
        continue;
      }

      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "processing", attempts: Number(operation.attempts || 0) + 1, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      try {
        await bridge("/groups/" + encodeURIComponent((await db("whatsapp_groups?select=external_group_id&id=eq." + membership.whatsapp_group_id + "&limit=1"))[0]?.external_group_id || "") + "/participants/remove", {
          participant: membership.external_participant_id,
        });
        await db("group_memberships?id=eq." + membership.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "removed", removed_at: nowIso, updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        await db("access_operations?id=eq." + operation.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "succeeded", executed_at: nowIso, last_error: null, updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        removalsSucceeded++;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "WhatsApp removal failed";
        await db("access_operations?id=eq." + operation.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "retry_pending", last_error: message, next_retry_at: iso(new Date(now.getTime() + 6 * 60 * 60 * 1000)), updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        removalsPending++;
      }
    }

    if (subscription.status !== "expired") {
      await db("subscriptions?id=eq." + subscription.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "expired", ended_at: nowIso, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await db("audit_logs", {
        method: "POST",
        body: JSON.stringify([{
          member_id: subscription.member_id,
          action: "subscription.expired_after_grace",
          entity_type: "subscription",
          entity_id: subscription.id,
          old_values: { status: subscription.status, expires_at: subscription.expires_at, grace_ends_at: subscription.grace_ends_at },
          new_values: { status: "expired", ended_at: nowIso },
        }]),
        headers: { Prefer: "return=minimal" },
      });
    }
  }

  return Response.json({
    ok: true,
    subscriptions_checked: expired.length,
    removals_succeeded: removalsSucceeded,
    removals_pending: removalsPending,
  });
};

export const config = {
  schedule: "0 1 * * *",
};
