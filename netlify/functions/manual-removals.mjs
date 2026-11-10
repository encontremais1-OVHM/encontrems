const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BRIDGE_URL = (process.env.WHATSAPP_BRIDGE_URL || "").replace(/\/+$/, "");
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || "";

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

const iso = (date) => date.toISOString();

export default async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }
  const now = new Date();
  const nowIso = iso(now);
  const operations = await db("access_operations?select=id,member_id,whatsapp_group_id,idempotency_key,status,attempts,next_retry_at,updated_at&operation_type=eq.remove&status=in.(queued,retry_pending,processing)&or=(idempotency_key.like.manual-remove%,idempotency_key.like.expiry-remove%)&order=created_at.asc&limit=100");
  const due = operations.filter((operation) =>
    (!operation.next_retry_at || new Date(operation.next_retry_at).getTime() <= now.getTime()) &&
    (operation.status !== "processing" || !operation.updated_at || now.getTime() - new Date(operation.updated_at).getTime() >= 10 * 60 * 1000)
  ).slice(0, 1);
  if (!due.length) return Response.json({ ok: true, succeeded: 0, pending: 0 });

  let connected = false;
  try { connected = (await bridge("/status")).connected === true; } catch {}
  let succeeded = 0;
  let pending = 0;

  for (const operation of due) {
    const [groups, memberships, members] = await Promise.all([
      db("whatsapp_groups?select=id,external_group_id,group_type&id=eq." + operation.whatsapp_group_id + "&limit=1"),
      db("group_memberships?select=id,status,external_participant_id&member_id=eq." + operation.member_id + "&whatsapp_group_id=eq." + operation.whatsapp_group_id + "&limit=1"),
      db("members?select=phone_e164,phone&id=eq." + operation.member_id + "&limit=1"),
    ]);
    const group = groups[0];
    const membership = memberships[0];
    const phone = String(members[0]?.phone_e164 || members[0]?.phone || "").replace(/\D/g, "");
    const attempt = Number(operation.attempts || 0) + 1;

    if (!group || !membership) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "O grupo ou a associação do membro já não existe.", next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    const participant = String(membership.external_participant_id || (phone ? phone + "@s.whatsapp.net" : ""));
    if (!/^\d+@s\.whatsapp\.net$/.test(participant)) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "Não foi possível identificar o participante WhatsApp para remoção.", next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    await db("group_memberships?id=eq." + membership.id, {
      method: "PATCH",
      body: JSON.stringify({ status: "removal_pending", external_participant_id: participant, updated_at: nowIso }),
      headers: { Prefer: "return=minimal" },
    });

    if (!connected || !group.external_group_id) {
      const delay = Math.min(360, 5 * (2 ** Math.min(attempt - 1, 6)));
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: "retry_pending",
          attempts: attempt,
          last_error: !connected ? "WhatsApp desconectado; a remoção será retomada quando a conta administradora voltar a ligar." : "Identificador externo do grupo indisponível.",
          next_retry_at: iso(new Date(now.getTime() + delay * 60 * 1000)),
          updated_at: nowIso,
        }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    await db("access_operations?id=eq." + operation.id, {
      method: "PATCH",
      body: JSON.stringify({ status: "processing", attempts: attempt, next_retry_at: null, updated_at: nowIso }),
      headers: { Prefer: "return=minimal" },
    });

    try {
      const endpoint = group.group_type === "community"
        ? "/communities/" + encodeURIComponent(group.external_group_id) + "/participants"
        : "/groups/" + encodeURIComponent(group.external_group_id) + "/participants";
      let removalError = null;
      try {
        await bridge(endpoint + "/remove", { participant });
      } catch (error) {
        removalError = error;
      }
      const snapshot = await bridge(endpoint);
      const stillPresent = (snapshot.participants || []).some((item) => {
        const value = String(item.jid || item.phoneNumber || item.id || "");
        const digitsOnly = value.split("@")[0].split(":")[0].replace(/\D/g, "");
        return digitsOnly && digitsOnly === phone;
      });
      if (stillPresent) {
        throw removalError || new Error("O WhatsApp ainda apresenta este número como participante após a remoção.");
      }

      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", removed_at: nowIso, last_synced_at: nowIso, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", executed_at: nowIso, last_error: null, next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await db("audit_logs", {
        method: "POST",
        body: JSON.stringify([{
          member_id: operation.member_id,
          action: "whatsapp.member_removed_manually",
          entity_type: "group_membership",
          entity_id: membership.id,
          old_values: { status: membership.status },
          new_values: { status: "removed", whatsapp_group_id: group.id, operation_id: operation.id, confirmed_by: "live_whatsapp_participant_snapshot" },
        }]),
        headers: { Prefer: "return=minimal" },
      });
      const expiryMatch = /^expiry-remove:([0-9a-f-]{36}):/i.exec(String(operation.idempotency_key || ""));
      if (expiryMatch) {
        const finalized = await db("rpc/finalize_subscription_expiry", {
          method: "POST",
          body: JSON.stringify({ p_subscription_id: expiryMatch[1] }),
        });
        if (finalized === true) {
          await db("audit_logs", {
            method: "POST",
            body: JSON.stringify([{
              member_id: operation.member_id,
              action: "subscription.expired_after_whatsapp_removal",
              entity_type: "subscription",
              entity_id: expiryMatch[1],
              new_values: { status: "expired", confirmed_by: "live_whatsapp_participant_snapshot" },
            }]),
            headers: { Prefer: "return=minimal" },
          });
        }
      }
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "WhatsApp participant removal failed";
      const delay = /bot_must_be_(community|group)_admin|forbidden/i.test(message)
        ? 30
        : Math.min(360, 5 * (2 ** Math.min(attempt - 1, 6)));
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "retry_pending", attempts: attempt, last_error: message, next_retry_at: iso(new Date(now.getTime() + delay * 60 * 1000)), updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
    }
  }
  return Response.json({ ok: true, succeeded, pending });
};

export const config = {
  schedule: "* * * * *",
};
