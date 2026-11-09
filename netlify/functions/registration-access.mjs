const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BRIDGE_URL = (process.env.WHATSAPP_BRIDGE_URL || "").replace(/\/+$/, "");
const BRIDGE_TOKEN = process.env.WHATSAPP_BRIDGE_TOKEN || "";

const iso = (date) => date.toISOString();
const digits = (value) => String(value || "").replace(/\D/g, "");

async function db(path, init = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase server configuration is incomplete.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const raw = await response.text();
  const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
  if (!response.ok) throw new Error(data?.message || data?.details || `Supabase returned ${response.status}`);
  return data;
}

async function bridge(path, body) {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) throw new Error("WhatsApp bridge credentials are not configured.");
  const response = await fetch(`${BRIDGE_URL}/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(4000),
  });
  const raw = await response.text();
  const data = raw ? (() => { try { return JSON.parse(raw); } catch { return {}; } })() : {};
  if (!response.ok) throw new Error(data.message || data.error || `WhatsApp bridge returned ${response.status}`);
  return data;
}

async function audit(memberId, membershipId, action, details) {
  await db("audit_logs", {
    method: "POST",
    body: JSON.stringify([{
      member_id: memberId,
      action,
      entity_type: "group_membership",
      entity_id: membershipId,
      new_values: details,
    }]),
    headers: { Prefer: "return=minimal" },
  });
}

function participantMatches(participants, phone) {
  return (participants || []).some((participant) => {
    const jid = String(participant.jid || participant.id || "");
    return digits(jid.split("@")[0].split(":")[0]) === phone;
  });
}

/**
 * Initial registration access worker.
 *
 * Registration already stores one pending membership for the parent Community
 * and each subgroup explicitly selected by the member. This worker uses those
 * rows as the source of truth and attempts direct addition through Baileys.
 * A membership is marked joined only after a fresh WhatsApp participant
 * snapshot confirms the exact phone number.
 */
async function processInitialAccess(now, nowIso) {
  let connected = false;
  try { connected = (await bridge("/status")).connected === true; }
  catch { return { connected: false, attempted: 0, confirmed: 0, pending: 0 }; }
  if (!connected) return { connected: false, attempted: 0, confirmed: 0, pending: 0 };

  const [members, groups, subscriptions, memberships] = await Promise.all([
    db("members?select=id,phone,phone_e164,registration_source&registration_source=eq.web&limit=2000"),
    db("whatsapp_groups?select=id,community_id,name,external_group_id,group_type,is_active,sync_status&is_active=eq.true&sync_status=eq.synced&limit=1000"),
    db("subscriptions?select=id,member_id,community_id,status,expires_at,grace_ends_at&status=in.(active,grace_period)&limit=2000"),
    db("group_memberships?select=id,member_id,whatsapp_group_id,status,updated_at,created_at,external_participant_id&status=in.(pending_invitation,invited,failed)&order=updated_at.asc&limit=2000"),
  ]);

  const memberById = new Map(members.map((member) => [member.id, member]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const validSubscriptions = new Set(subscriptions
    .filter((subscription) => {
      const accessEnd = subscription.grace_ends_at || subscription.expires_at;
      return accessEnd && new Date(accessEnd).getTime() >= now.getTime();
    })
    .map((subscription) => subscription.member_id + ":" + subscription.community_id));

  const candidates = memberships.filter((membership) => {
    const member = memberById.get(membership.member_id);
    const group = groupById.get(membership.whatsapp_group_id);
    if (!member || !group || !group.external_group_id) return false;
    if (!validSubscriptions.has(member.id + ":" + group.community_id)) return false;
    const lastAttempt = membership.updated_at || membership.created_at;
    const updatedAt = lastAttempt ? new Date(lastAttempt).getTime() : 0;
    const retryAfter = membership.status === "pending_invitation"
      ? 5 * 60 * 1000
      : membership.status === "failed" ? 30 * 60 * 1000 : 15 * 60 * 1000;
    return now.getTime() - updatedAt >= retryAfter;
  }).slice(0, 1);

  let attempted = 0, confirmed = 0, pending = 0;
  for (const membership of candidates) {
    const group = groupById.get(membership.whatsapp_group_id);
    const member = memberById.get(membership.member_id);
    const phone = digits(member?.phone_e164 || member?.phone);
    if (!/^\d{8,15}$/.test(phone)) {
      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await audit(member.id, membership.id, "whatsapp.direct_add_invalid_phone", { group_id: group.id, group_name: group.name });
      pending++;
      continue;
    }

    // Claim the row to avoid two scheduled invocations adding the same member.
    const claimed = await db("group_memberships?id=eq." + membership.id + "&status=eq." + membership.status, {
      method: "PATCH",
      body: JSON.stringify({ status: "invited", updated_at: nowIso }),
      headers: { Prefer: "return=representation" },
    });
    if (!claimed?.length) continue;

    attempted++;
    const isCommunity = group.group_type === "community";
    const basePath = isCommunity
      ? "/communities/" + encodeURIComponent(group.external_group_id) + "/participants"
      : "/groups/" + encodeURIComponent(group.external_group_id) + "/participants";
    try {
      // Avoid duplicate add attempts when the member is already present.
      // Baileys may also return a pending/approval result, so verify afterwards.
      let confirmedInWhatsApp = participantMatches((await bridge(basePath)).participants, phone);
      if (!confirmedInWhatsApp) {
        await bridge(basePath + "/add", { phone });
        confirmedInWhatsApp = participantMatches((await bridge(basePath)).participants, phone);
      }
      if (!confirmedInWhatsApp) {
        await db("group_memberships?id=eq." + membership.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "pending_invitation", updated_at: nowIso, last_synced_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        await audit(member.id, membership.id, "whatsapp.direct_add_not_yet_confirmed", {
          group_id: group.id, group_name: group.name, group_type: group.group_type,
          reason: "WhatsApp did not yet include the member in its participant snapshot.",
        });
        pending++;
        continue;
      }

      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({
          status: "joined",
          external_participant_id: phone + "@s.whatsapp.net",
          joined_at: nowIso,
          removed_at: null,
          last_synced_at: nowIso,
          updated_at: nowIso,
        }),
        headers: { Prefer: "return=minimal" },
      });
      await audit(member.id, membership.id, "whatsapp.member_added_after_registration", {
        group_id: group.id, group_name: group.name, group_type: group.group_type,
        phone, confirmed_by: "live_whatsapp_participant_snapshot",
      });
      confirmed++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "WhatsApp direct addition failed";
      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "pending_invitation", updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await audit(member.id, membership.id, "whatsapp.direct_add_failed", {
        group_id: group.id, group_name: group.name, group_type: group.group_type, error: message,
      });
      pending++;
    }
  }
  return { connected: true, attempted, confirmed, pending };
}

export default async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }
  try {
    const now = new Date();
    const result = await processInitialAccess(now, iso(now));
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Initial WhatsApp access worker failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false, error: "initial_access_worker_failed" }, { status: 500 });
  }
};

export const config = {
  schedule: "* * * * *",
};
