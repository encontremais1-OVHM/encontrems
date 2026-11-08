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
async function processPendingAdditions(now, nowIso) {
  const operations = await db("access_operations?select=id,member_id,whatsapp_group_id,status,attempts,next_retry_at,updated_at&operation_type=eq.add&status=in.(queued,retry_pending,processing)&order=created_at.asc&limit=100");
  const due = operations.filter((operation) => (!operation.next_retry_at || new Date(operation.next_retry_at).getTime() <= now.getTime()) && (operation.status !== "processing" || !operation.updated_at || now.getTime() - new Date(operation.updated_at).getTime() >= 15 * 60 * 1000)).slice(0, 3);
  if (!due.length) return { succeeded: 0, pending: 0 };
  let connected = false;
  try { connected = (await bridge("/status")).connected === true; } catch { /* queued additions remain pending */ }
  let succeeded = 0;
  let pending = 0;
  for (const operation of due) {
    const [groups, memberships] = await Promise.all([
      db("whatsapp_groups?select=id,community_id,external_group_id,group_type,is_active&id=eq." + operation.whatsapp_group_id + "&limit=1"),
      db("group_memberships?select=id,status&member_id=eq." + operation.member_id + "&whatsapp_group_id=eq." + operation.whatsapp_group_id + "&limit=1"),
    ]);
    const group = groups[0];
    const membership = memberships[0];
    if (!group || !membership || !group.is_active) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "O grupo ou a associação já não está disponível.", updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      continue;
    }
    if (membership.status === "joined") {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", executed_at: nowIso, last_error: null, next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      succeeded++;
      continue;
    }
    const subscriptions = await db("subscriptions?select=id,status,expires_at,grace_ends_at&member_id=eq." + operation.member_id + "&community_id=eq." + group.community_id + "&order=created_at.desc&limit=1");
    const subscription = subscriptions[0];
    const expiry = subscription?.expires_at ? new Date(subscription.expires_at).getTime() : 0;
    const graceEnd = subscription?.grace_ends_at ? new Date(subscription.grace_ends_at).getTime() : expiry;
    const eligible = subscription && ["active", "grace_period"].includes(subscription.status) && graceEnd >= now.getTime();
    if (!eligible) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "A subscrição desta comunidade já não autoriza a entrada.", updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      continue;
    }
    if (!connected || !group.external_group_id) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "retry_pending", last_error: !connected ? "WhatsApp desconectado; a entrada será tentada novamente." : "Identificador do grupo não disponível.", next_retry_at: iso(new Date(now.getTime() + 15 * 60 * 1000)), updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }
    const members = await db("members?select=phone_e164,phone&id=eq." + operation.member_id + "&limit=1");
    const phone = String(members[0]?.phone_e164 || members[0]?.phone || "").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(phone)) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "Número de WhatsApp inválido para a entrada.", updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      continue;
    }
    const attempt = Number(operation.attempts || 0) + 1;
    await db("access_operations?id=eq." + operation.id, {
      method: "PATCH",
      body: JSON.stringify({ status: "processing", attempts: attempt, updated_at: nowIso }),
      headers: { Prefer: "return=minimal" },
    });
    try {
      await bridge(group.group_type === "community" ? "/communities/" + encodeURIComponent(group.external_group_id) + "/participants/add" : "/groups/" + encodeURIComponent(group.external_group_id) + "/participants/add", { phone });
      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "joined", external_participant_id: phone + "@s.whatsapp.net", joined_at: nowIso, removed_at: null, last_synced_at: nowIso, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", executed_at: nowIso, last_error: null, next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "WhatsApp addition failed";
      const permanentPermissionFailure = /bot_must_be_(community|group)_admin|forbidden/i.test(message);
      const terminal = attempt >= 8 || permanentPermissionFailure;
      const retryMinutes = Math.min(60, 5 * (2 ** Math.max(0, attempt - 1)));
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: terminal ? "failed" : "retry_pending", last_error: message, next_retry_at: terminal ? null : iso(new Date(now.getTime() + retryMinutes * 60 * 1000)), updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
    }
  }
  return { succeeded, pending };
}


async function syncConfirmedWhatsAppParticipants(nowIso) {
  let connected = false;
  try { connected = (await bridge("/status")).connected === true; } catch { /* WhatsApp may be offline */ }
  if (!connected) return { groups_checked: 0, memberships_confirmed: 0 };

  const [allGroups, members, subscriptions, memberships] = await Promise.all([
    db("whatsapp_groups?select=id,community_id,external_group_id,group_type,is_active,sync_status&is_active=eq.true&sync_status=eq.synced&order=id.asc&limit=1000"),
    db("members?select=id,phone,phone_e164&registration_source=eq.web&limit=1000"),
    db("subscriptions?select=id,member_id,community_id,status,grace_ends_at&status=in.(active,grace_period)&limit=1000"),
    db("group_memberships?select=id,member_id,whatsapp_group_id,status"),
  ]);

  // Keep the scheduled function below Netlify's 30-second execution limit:
  // inspect at most 20 WhatsApp groups per run, rotating batches every 15 minutes.
  const batchSize = 20;
  const batchCount = Math.max(1, Math.ceil(allGroups.length / batchSize));
  const batchIndex = Math.floor(Date.now() / (15 * 60 * 1000)) % batchCount;
  const groups = allGroups.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  const memberByPhone = new Map();
  for (const member of members) {
    const phone = String(member.phone_e164 || member.phone || "").replace(/\D/g, "");
    if (phone) memberByPhone.set(phone, member);
  }
  const subscriptionByMemberCommunity = new Map();
  for (const subscription of subscriptions) {
    const graceEnd = subscription.grace_ends_at ? new Date(subscription.grace_ends_at).getTime() : Number.POSITIVE_INFINITY;
    if (graceEnd >= Date.now()) subscriptionByMemberCommunity.set(subscription.member_id + ":" + subscription.community_id, subscription);
  }
  const membershipByKey = new Map(memberships.map((membership) => [membership.member_id + ":" + membership.whatsapp_group_id, membership]));
  const groupResults = await Promise.all(groups.filter((group) => group.external_group_id).map(async (group) => {
    const endpoint = group.group_type === "community"
      ? "/communities/" + encodeURIComponent(group.external_group_id) + "/participants"
      : "/groups/" + encodeURIComponent(group.external_group_id) + "/participants";
    try {
      const result = await bridge(endpoint);
      return { group, participants: result.participants || [] };
    } catch (error) {
      console.warn("WhatsApp participant sync skipped for one group:", error instanceof Error ? error.message : "unknown");
      return null;
    }
  }));

  const rowsToConfirm = [];
  let groupsChecked = 0;
  for (const result of groupResults) {
    if (!result) continue;
    groupsChecked++;
    const { group, participants } = result;
    for (const participant of participants) {
      const jid = String(participant.id || "");
      const phone = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
      if (!phone) continue; // WhatsApp LID identifiers cannot safely be mapped to a phone.
      const member = memberByPhone.get(phone);
      if (!member || !subscriptionByMemberCommunity.has(member.id + ":" + group.community_id)) continue;
      const key = member.id + ":" + group.id;
      const existing = membershipByKey.get(key);
      if (existing?.status === "joined") continue;
      rowsToConfirm.push({
        member_id: member.id,
        whatsapp_group_id: group.id,
        external_participant_id: phone + "@s.whatsapp.net",
        status: "joined",
        joined_at: nowIso,
        removed_at: null,
        last_synced_at: nowIso,
        updated_at: nowIso,
      });
      membershipByKey.set(key, { ...existing, status: "joined" });
    }
  }

  for (let index = 0; index < rowsToConfirm.length; index += 100) {
    await db("group_memberships?on_conflict=member_id,whatsapp_group_id", {
      method: "POST",
      body: JSON.stringify(rowsToConfirm.slice(index, index + 100)),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }
  return { groups_checked: groupsChecked, memberships_confirmed: rowsToConfirm.length };
}

export default async (_request) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Expiry worker missing Supabase server configuration.");
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = iso(now);
  const participantSync = await syncConfirmedWhatsAppParticipants(nowIso);
  const additions = await processPendingAdditions(now, nowIso);
  const expired = await db(
    "subscriptions?select=id,member_id,community_id,status,expires_at,grace_ends_at&status=in.(active,grace_period,expired)&grace_ends_at=lt." + encodeURIComponent(nowIso) + "&limit=500",
  );

  if (!expired.length) return Response.json({ ok: true, participant_sync_groups: participantSync.groups_checked, memberships_confirmed: participantSync.memberships_confirmed, additions_succeeded: additions.succeeded, additions_pending: additions.pending, subscriptions_checked: 0, removals_succeeded: 0, removals_pending: 0 });

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
    const communityGroups = await db("whatsapp_groups?select=id&community_id=eq." + subscription.community_id);
    const communityGroupIds = communityGroups.map((group) => group.id);
    if (!communityGroupIds.length) continue;
    const memberships = await db(
      "group_memberships?select=id,member_id,whatsapp_group_id,external_participant_id,status&member_id=eq." +
      subscription.member_id + "&whatsapp_group_id=in.(" + communityGroupIds.join(",") + ")&status=in.(joined,removal_pending)",
    );

    for (const membership of memberships) {
      const idempotencyKey = `expiry-remove:${subscription.id}:${membership.whatsapp_group_id}`;
      const existingOps = await db("access_operations?select=id,status,attempts&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1");
      let operation = existingOps[0];

      if (operation?.status === "succeeded") {
        if (membership.status !== "removed") {
          await db("group_memberships?id=eq." + membership.id, {
            method: "PATCH",
            body: JSON.stringify({ status: "removed", removed_at: nowIso, updated_at: nowIso }),
            headers: { Prefer: "return=minimal" },
          });
        }
        continue;
      }
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
      if (membership.status === "joined") {
        await db("group_memberships?id=eq." + membership.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "removal_pending", updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
      }
      if (!operation) continue;
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
        const groupRows = await db("whatsapp_groups?select=external_group_id,group_type&id=eq." + membership.whatsapp_group_id + "&limit=1");
        const externalGroupId = groupRows[0]?.external_group_id;
        if (!externalGroupId) throw new Error("Identificador do grupo WhatsApp não disponível.");
        await bridge(groupRows[0]?.group_type === "community" ? "/communities/" + encodeURIComponent(externalGroupId) + "/participants/remove" : "/groups/" + encodeURIComponent(externalGroupId) + "/participants/remove", {
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
    participant_sync_groups: participantSync.groups_checked,
    memberships_confirmed: participantSync.memberships_confirmed,
    subscriptions_checked: expired.length,
    removals_succeeded: removalsSucceeded,
    additions_succeeded: additions.succeeded,
    additions_pending: additions.pending,
    removals_pending: removalsPending,
  });
};

export const config = {
  schedule: "*/15 * * * *",
};
