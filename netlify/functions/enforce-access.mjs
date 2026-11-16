import { baileysRequest } from "../lib/baileys.mjs";
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const KURSINHA_PRODUCT_ID = process.env.KURSINHA_PRODUCT_ID || "6aefd6a5531bcee4ede064fb";
const KURSINHA_CHECKOUT_URL = process.env.KURSINHA_CHECKOUT_URL || "https://pay.kursinha.com/c/6aefd6a5531bcee4ede064fb";

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
  return baileysRequest(path, { method: body ? "POST" : "GET", body });
}

const iso = (d) => d.toISOString();
async function processRenewalReminders(now, nowIso) {
  if (!KURSINHA_PRODUCT_ID || !KURSINHA_CHECKOUT_URL) return { sent: 0, pending: 0 };
  const windowEnd = iso(new Date(now.getTime() + 3 * 86400000));
  const due = await db("subscriptions?select=id,member_id,community_id,plan_id,status,expires_at,grace_ends_at&status=eq.active&expires_at=gte." + encodeURIComponent(nowIso) + "&expires_at=lte." + encodeURIComponent(windowEnd) + "&order=expires_at.asc&limit=100");
  let sent = 0, pending = 0;
  for (const subscription of due) {
    try {
      const plans = await db("plans?select=renewal_price,duration_days,grace_days&id=eq." + subscription.plan_id + "&limit=1");
      if (!plans[0] || Number(plans[0].renewal_price) !== 1000) continue;
      const expiryKey = String(new Date(subscription.expires_at).getTime());
      const idempotencyKey = "renewal:" + subscription.id + ":" + expiryKey;
      const existingPayments = await db("payments?select=id,payment_reference,status,metadata&subscription_id=eq." + subscription.id + "&payment_type=eq.renewal&provider=eq.kursinha&order=created_at.desc&limit=20");
      let payment = existingPayments.find((p) => ["initiated","pending","under_review"].includes(p.status)) || existingPayments[0] || null;
      if (!payment && existingPayments.length === 0) {
        const paymentReference = "EN-R-" + subscription.id.slice(0,8).toUpperCase() + "-" + expiryKey.slice(-6);
        const created = await db("payments", {
          method: "POST",
          body: JSON.stringify([{
            member_id: subscription.member_id, subscription_id: subscription.id, amount: 1000, currency: "AOA",
            payment_type: "renewal", provider: "kursinha", status: "pending", payment_reference: paymentReference,
            idempotency_key: idempotencyKey,
            metadata: { product_id: KURSINHA_PRODUCT_ID, checkout_url: KURSINHA_CHECKOUT_URL, expires_at: subscription.expires_at },
          }]),
          headers: { Prefer: "return=representation" },
        });
        payment = created[0];
      }
      const members = await db("members?select=full_name,phone_e164,phone&id=eq." + subscription.member_id + "&limit=1");
      const member = members[0];
      const phone = String(member?.phone_e164 || member?.phone || "").replace(/\D/g, "");
      if (!/^\d{8,15}$/.test(phone)) throw new Error("Número WhatsApp do membro inválido.");
      const notifications = await db("notifications?select=id,status,metadata&member_id=eq." + subscription.member_id + "&notification_type=eq.renewal_reminder&channel=eq.whatsapp&order=created_at.desc&limit=30");
      let notification = notifications.find((item) => item.metadata?.subscription_id === subscription.id && item.metadata?.expires_at === subscription.expires_at);
      if (notification?.status === "sent") continue;
      const message = "Olá " + (member.full_name || "") + "! O teu acesso à Comunidade Encontre + termina em 3 dias. Para continuares na comunidade e nos teus subgrupos, renova por 1.000 Kz através deste link seguro: " + KURSINHA_CHECKOUT_URL + ". Se já pagaste, aguarda a confirmação automática. Obrigado!";
      if (!notification) {
        const created = await db("notifications", {
          method: "POST",
          body: JSON.stringify([{
            member_id: subscription.member_id, notification_type: "renewal_reminder", channel: "whatsapp",
            message, status: "pending",
            metadata: { subscription_id: subscription.id, payment_id: payment.id, payment_reference: payment.payment_reference, expires_at: subscription.expires_at, checkout_url: KURSINHA_CHECKOUT_URL },
          }]),
          headers: { Prefer: "return=representation" },
        });
        notification = created[0];
      } else {
        await db("notifications?id=eq." + notification.id, { method: "PATCH", body: JSON.stringify({ status: "pending", message, error_message: null }), headers: { Prefer: "return=minimal" } });
      }
      await bridge("/messages/send", { phone, message });
      await db("notifications?id=eq." + notification.id, { method: "PATCH", body: JSON.stringify({ status: "sent", sent_at: nowIso, error_message: null }), headers: { Prefer: "return=minimal" } });
      await db("audit_logs", {
        method: "POST",
        body: JSON.stringify([{ member_id: subscription.member_id, action: "renewal.reminder_sent", entity_type: "subscription", entity_id: subscription.id, new_values: { notification_id: notification.id, payment_id: payment.id, checkout_url: KURSINHA_CHECKOUT_URL, expires_at: subscription.expires_at } }]),
        headers: { Prefer: "return=minimal" },
      });
      sent++;
    } catch (error) {
      pending++;
      console.warn("Renewal reminder could not be sent:", error instanceof Error ? error.message : "unknown");
    }
  }
  return { sent, pending };
}

async function syncConfirmedWhatsAppParticipants(nowIso) {
  let connected = false;
  try { connected = (await bridge("/status")).connected === true; } catch { /* WhatsApp may be offline */ }
  if (!connected) return { groups_checked: 0, memberships_confirmed: 0 };

  const [allGroups, members, subscriptions, memberships] = await Promise.all([
    db("whatsapp_groups?select=id,community_id,external_group_id,group_type,is_active,sync_status&is_active=eq.true&sync_status=eq.synced&order=id.asc&limit=1000"),
    db("members?select=id,phone,phone_e164&registration_source=eq.web&limit=1000"),
    db("subscriptions?select=id,member_id,community_id,status,expires_at,grace_ends_at&status=in.(active,grace_period)&limit=1000"),
    db("group_memberships?select=id,member_id,whatsapp_group_id,external_participant_id,status"),
  ]);

  // Keep the scheduled function below Netlify's 30-second execution limit:
  // inspect at most 20 WhatsApp groups per run, rotating batches every 5 minutes.
  const batchSize = 20;
  const batchCount = Math.max(1, Math.ceil(allGroups.length / batchSize));
  const batchIndex = Math.floor(Date.now() / (5 * 60 * 1000)) % batchCount;
  const groups = allGroups.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);

  const memberByPhone = new Map();
  for (const member of members) {
    const phone = String(member.phone_e164 || member.phone || "").replace(/\D/g, "");
    if (phone) memberByPhone.set(phone, member);
  }
  const subscriptionByMemberCommunity = new Map();
  for (const subscription of subscriptions) {
    const accessEnd = subscription.grace_ends_at || subscription.expires_at;
    const accessEndTime = accessEnd ? new Date(accessEnd).getTime() : Number.POSITIVE_INFINITY;
    if (accessEndTime >= Date.now()) subscriptionByMemberCommunity.set(subscription.member_id + ":" + subscription.community_id, subscription);
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
  const rowsToRemove = [];
  let groupsChecked = 0;
  for (const result of groupResults) {
    if (!result) continue;
    groupsChecked++;
    const { group, participants } = result;
    const seenParticipantIds = new Set();
    let safeToReconcileDepartures = participants.length > 0;
    for (const participant of participants) {
      // Baileys may expose a LID as id and its phone JID separately as jid.
      const jid = String(participant.jid || participant.id || "");
      if (!jid.endsWith("@s.whatsapp.net")) {
        safeToReconcileDepartures = false;
        continue; // Never infer a departure when this snapshot contains unresolvable LIDs.
      }
      const phone = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
      if (!phone) {
        safeToReconcileDepartures = false;
        continue;
      }
      const canonicalJid = phone + "@s.whatsapp.net";
      seenParticipantIds.add(canonicalJid);
      const member = memberByPhone.get(phone);
      if (!member || !subscriptionByMemberCommunity.has(member.id + ":" + group.community_id)) continue;
      const key = member.id + ":" + group.id;
      const existing = membershipByKey.get(key);
      if (existing?.status === "joined") continue;
      rowsToConfirm.push({
        member_id: member.id,
        whatsapp_group_id: group.id,
        external_participant_id: canonicalJid,
        status: "joined",
        joined_at: nowIso,
        removed_at: null,
        last_synced_at: nowIso,
        updated_at: nowIso,
      });
      membershipByKey.set(key, { ...existing, status: "joined" });
    }
    // Only mark a previously joined member as left when every participant in
    // the complete WhatsApp snapshot can be represented by a phone JID.
    if (safeToReconcileDepartures) {
      for (const membership of memberships) {
        if (membership.whatsapp_group_id !== group.id || membership.status !== "joined" || !membership.external_participant_id) continue;
        const canonical = String(membership.external_participant_id).split("@")[0].split(":")[0].replace(/\D/g, "") + "@s.whatsapp.net";
        if (seenParticipantIds.has(canonical)) continue;
        rowsToRemove.push(membership);
      }
    }
  }

  for (let index = 0; index < rowsToConfirm.length; index += 100) {
    await db("group_memberships?on_conflict=member_id,whatsapp_group_id", {
      method: "POST",
      body: JSON.stringify(rowsToConfirm.slice(index, index + 100)),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
  }
  for (const membership of rowsToRemove) {
    await db("group_memberships?id=eq." + membership.id, {
      method: "PATCH",
      body: JSON.stringify({ status: "removed", removed_at: nowIso, last_synced_at: nowIso, updated_at: nowIso }),
      headers: { Prefer: "return=minimal" },
    });
    await db("audit_logs", {
      method: "POST",
      body: JSON.stringify([{ member_id: membership.member_id, action: "whatsapp.member_left_detected", entity_type: "group_membership", entity_id: membership.id, old_values: { status: "joined" }, new_values: { status: "removed", whatsapp_group_id: membership.whatsapp_group_id, detected_at: nowIso } }]),
      headers: { Prefer: "return=minimal" },
    });
  }
  return { groups_checked: groupsChecked, memberships_confirmed: rowsToConfirm.length, memberships_removed: rowsToRemove.length };
}


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processPendingRemovals(nowIso) {
  const [operations, groups, members, subscriptions, plans, memberships] = await Promise.all([
    db("access_operations?select=id,member_id,whatsapp_group_id,status,attempts,next_retry_at,last_error,created_at&operation_type=eq.remove&status=in.(queued,retry_pending,processing)&order=created_at.asc&limit=100"),
    db("whatsapp_groups?select=id,community_id,external_group_id,group_type,is_active,sync_status"),
    db("members?select=id,phone,phone_e164"),
    db("subscriptions?select=id,member_id,community_id,plan_id,status,expires_at,grace_ends_at,created_at&order=created_at.desc&limit=2000"),
    db("plans?select=id,grace_days"),
    db("group_memberships?select=id,member_id,whatsapp_group_id,status"),
  ]);

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const membershipByKey = new Map(memberships.map((membership) => [membership.member_id + ":" + membership.whatsapp_group_id, membership]));
  const latestSubscriptionByKey = new Map();
  for (const subscription of subscriptions) {
    const key = subscription.member_id + ":" + subscription.community_id;
    if (!latestSubscriptionByKey.has(key)) latestSubscriptionByKey.set(key, subscription);
  }

  const due = operations.filter((operation) => !operation.next_retry_at || new Date(operation.next_retry_at).getTime() <= Date.now());
  due.sort((a, b) => {
    const aRank = groupById.get(a.whatsapp_group_id)?.group_type === "community" ? 0 : 1;
    const bRank = groupById.get(b.whatsapp_group_id)?.group_type === "community" ? 0 : 1;
    return aRank - bRank || String(a.created_at).localeCompare(String(b.created_at));
  });

  let attempted = 0;
  let confirmed = 0;
  let pending = 0;
  let cancelled = 0;
  const touchedSubscriptions = new Map();

  for (const operation of due.slice(0, 3)) {
    const group = groupById.get(operation.whatsapp_group_id);
    const member = memberById.get(operation.member_id);
    const membership = membershipByKey.get(operation.member_id + ":" + operation.whatsapp_group_id);
    if (!group || !member || !membership || !group.external_group_id || !group.is_active || group.sync_status !== "synced") {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "retry_pending", last_error: "O grupo, membro ou associação WhatsApp ainda não está disponível para remoção automática.", next_retry_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    const subscription = latestSubscriptionByKey.get(operation.member_id + ":" + group.community_id);
    if (!subscription) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "failed", last_error: "Não foi encontrada a assinatura que originou a remoção.", next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    const plan = planById.get(subscription.plan_id);
    const expiresAt = subscription.expires_at ? Date.parse(subscription.expires_at) : Number.NaN;
    const storedGraceEnd = subscription.grace_ends_at ? Date.parse(subscription.grace_ends_at) : Number.NaN;
    const calculatedGraceEnd = Number.isFinite(expiresAt)
      ? expiresAt + Math.max(0, Number(plan?.grace_days || 0)) * 86_400_000
      : Number.NaN;
    const cutoff = Math.max(
      Number.isFinite(storedGraceEnd) ? storedGraceEnd : Number.NEGATIVE_INFINITY,
      Number.isFinite(calculatedGraceEnd) ? calculatedGraceEnd : Number.NEGATIVE_INFINITY,
    );

    if (["active", "grace_period"].includes(subscription.status) && cutoff > Date.now()) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled", external_operation_id: null, last_error: "A assinatura foi renovada antes da remoção; operação cancelada automaticamente.", next_retry_at: null, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      if (membership.status === "removal_pending") {
        await db("group_memberships?id=eq." + membership.id, {
          method: "PATCH",
          body: JSON.stringify({ status: "pending_invitation", removed_at: null, updated_at: nowIso }),
          headers: { Prefer: "return=minimal" },
        });
        membership.status = "pending_invitation";
      }
      cancelled++;
      continue;
    }

    if (membership.status === "removed") {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", external_operation_id: "already-absent:verified-membership", last_error: null, next_retry_at: null, executed_at: nowIso, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      touchedSubscriptions.set(operation.member_id + ":" + group.community_id, subscription.id);
      confirmed++;
      continue;
    }
    if (!["joined", "removal_pending"].includes(membership.status)) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", external_operation_id: "no-active-membership", last_error: null, next_retry_at: null, executed_at: nowIso, updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      cancelled++;
      continue;
    }

    const phone = String(member.phone_e164 || member.phone || "").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(phone)) {
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "retry_pending", last_error: "Número WhatsApp inválido; a remoção não foi executada.", next_retry_at: new Date(Date.now() + 6 * 60 * 60_000).toISOString(), updated_at: nowIso }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
      continue;
    }

    const attempts = Number(operation.attempts || 0) + 1;
    await db("access_operations?id=eq." + operation.id, {
      method: "PATCH",
      body: JSON.stringify({ status: "processing", attempts, last_error: "Pedido de remoção enviado; a aguardar verificação da lista real de participantes.", next_retry_at: new Date(Date.now() + 15 * 60_000).toISOString(), updated_at: nowIso }),
      headers: { Prefer: "return=minimal" },
    });
    attempted++;

    try {
      const endpointBase = (group.group_type === "community" ? "/communities/" : "/groups/") + encodeURIComponent(group.external_group_id) + "/participants";
      await bridge(endpointBase + "/remove", { phone });

      let verified = false;
      let verificationError = "O WhatsApp ainda não confirmou a saída deste participante.";
      for (let check = 0; check < 3; check++) {
        await sleep(1200);
        const snapshot = await bridge(endpointBase + "?fresh=true");
        const participants = Array.isArray(snapshot?.participants) ? snapshot.participants : null;
        if (!participants || participants.length === 0) {
          verificationError = "A lista de participantes veio vazia ou incompleta; a remoção não será presumida.";
          continue;
        }
        let targetPresent = false;
        let unresolvedParticipant = false;
        for (const participant of participants) {
          const jid = String(participant.jid || participant.id || "");
          const participantPhone = String(participant.phoneNumber || "").replace(/\D/g, "")
            || (jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0].split(":")[0].replace(/\D/g, "") : "");
          if (participantPhone === phone) targetPresent = true;
          if (!participantPhone) unresolvedParticipant = true;
        }
        if (targetPresent) {
          verificationError = "O número ainda aparece na lista real de participantes do WhatsApp.";
          continue;
        }
        if (unresolvedParticipant) {
          verificationError = "A lista contém identidades LID sem correspondência de número; não é seguro confirmar a remoção.";
          continue;
        }
        verified = true;
        break;
      }

      if (!verified) throw new Error(verificationError);

      const verifiedAt = new Date().toISOString();
      await db("group_memberships?id=eq." + membership.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "removed", removed_at: verifiedAt, last_synced_at: verifiedAt, updated_at: verifiedAt }),
        headers: { Prefer: "return=minimal" },
      });
      membership.status = "removed";
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: "succeeded", external_operation_id: "removed-verified:live-participant-snapshot", last_error: null, next_retry_at: null, executed_at: verifiedAt, updated_at: verifiedAt }),
        headers: { Prefer: "return=minimal" },
      });
      await db("audit_logs", {
        method: "POST",
        body: JSON.stringify([{ member_id: operation.member_id, action: "whatsapp.member_removed_automatically", entity_type: "group_membership", entity_id: membership.id, old_values: { status: "removal_pending" }, new_values: { status: "removed", whatsapp_group_id: group.id, external_group_id: group.external_group_id, confirmed_by: "live_whatsapp_participant_snapshot", operation_id: operation.id, confirmed_at: verifiedAt } }]),
        headers: { Prefer: "return=minimal" },
      });
      touchedSubscriptions.set(operation.member_id + ":" + group.community_id, subscription.id);
      confirmed++;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : "Falha desconhecida ao remover participante.";
      const statusCode = Number(error?.statusCode || 0);
      const permanent = statusCode === 403 || /forbidden|not an administrator|community owner|refusing to remove a group administrator/i.test(message);
      const delayMs = /rate-overlimit/i.test(message)
        ? 6 * 60 * 60_000
        : statusCode === 408 || statusCode === 425 || statusCode === 429
          ? 15 * 60_000
          : statusCode >= 500
            ? Math.min(60 * 60_000, 30_000 * (2 ** Math.min(attempts, 7)))
            : 30 * 60_000;
      await db("access_operations?id=eq." + operation.id, {
        method: "PATCH",
        body: JSON.stringify({ status: permanent ? "failed" : "retry_pending", last_error: permanent && !/403|forbidden/i.test(message) ? "403 forbidden: " + message : message, next_retry_at: permanent ? null : new Date(Date.now() + delayMs).toISOString(), updated_at: new Date().toISOString() }),
        headers: { Prefer: "return=minimal" },
      });
      pending++;
    }
  }

  for (const [key, subscriptionId] of touchedSubscriptions) {
    const [memberId, communityId] = key.split(":");
    const communityGroupIds = groups.filter((group) => group.community_id === communityId && group.is_active).map((group) => group.id);
    if (!communityGroupIds.length) continue;
    const remaining = await db("group_memberships?select=id&member_id=eq." + memberId + "&whatsapp_group_id=in.(" + communityGroupIds.join(",") + ")&status=in.(joined,removal_pending)&limit=1");
    if (!remaining.length) {
      await db("rpc/finalize_subscription_expiry", { method: "POST", body: JSON.stringify({ p_subscription_id: subscriptionId }) });
    }
  }

  return { attempted, confirmed, pending, cancelled };
}

export default async (_request) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Expiry worker missing Supabase server configuration.");
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const now = new Date();
  const nowIso = iso(now);
  const participantSync = await syncConfirmedWhatsAppParticipants(nowIso);
  const removals = await processPendingRemovals(nowIso);
  // Member additions are dispatched only by the Supabase/Railway worker to avoid duplicate WhatsApp requests.
  const reminders = await processRenewalReminders(now, nowIso);
  const enteringGrace = await db("subscriptions?select=id,member_id,status,expires_at,grace_ends_at&status=eq.active&expires_at=lt." + encodeURIComponent(nowIso) + "&grace_ends_at=gte." + encodeURIComponent(nowIso) + "&limit=500");
  for (const subscription of enteringGrace) {
    await db("subscriptions?id=eq." + subscription.id, { method: "PATCH", body: JSON.stringify({ status: "grace_period", updated_at: nowIso }), headers: { Prefer: "return=minimal" } });
    await db("audit_logs", { method: "POST", body: JSON.stringify([{ member_id: subscription.member_id, action: "subscription.grace_period_started", entity_type: "subscription", entity_id: subscription.id, old_values: { status: "active", expires_at: subscription.expires_at }, new_values: { status: "grace_period", grace_ends_at: subscription.grace_ends_at } }]), headers: { Prefer: "return=minimal" } });
  }
  return Response.json({
    ok: true,
    participant_sync_groups: participantSync.groups_checked,
    memberships_confirmed: participantSync.memberships_confirmed,
    additions_worker: "supabase_railway",
    removals_worker: removals,
    renewal_reminders_sent: reminders.sent,
    renewal_reminders_pending: reminders.pending,
  });
};

export const config = {
  schedule: "*/5 * * * *",
};
