const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

/**
 * Initial WhatsApp registration is deliberately self-service:
 * the member opens the parent Community invite and chooses its subgroups
 * inside WhatsApp. This scheduled worker must never add participants.
 *
 * Older versions created registration-add operations and retried direct
 * additions every minute. Retire those stale operations so they cannot
 * compete with the member-driven invitation flow. Confirmed memberships
 * remain untouched and are reconciled by enforce-access from live snapshots.
 */
async function retireLegacyRegistrationAdds(nowIso) {
  const operations = await db(
    "access_operations?select=id,idempotency_key,status&operation_type=eq.add&limit=3000",
  );
  const stale = operations.filter((operation) =>
    String(operation.idempotency_key || "").startsWith("registration-add:") &&
    !["succeeded", "cancelled"].includes(operation.status),
  );

  for (const operation of stale) {
    await db("access_operations?id=eq." + operation.id, {
      method: "PATCH",
      body: JSON.stringify({
        status: "cancelled",
        last_error: "Fluxo inicial corrigido: o membro entra pelo convite da Comunidade e escolhe os subgrupos no WhatsApp. Não adicionar automaticamente.",
        next_retry_at: null,
        updated_at: nowIso,
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  return { retired: stale.length };
}

export default async () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }
  try {
    const result = await retireLegacyRegistrationAdds(new Date().toISOString());
    return Response.json({
      ok: true,
      connected: null,
      attempted: 0,
      confirmed: 0,
      pending: 0,
      legacy_registration_adds_cancelled: result.retired,
      mode: "member_self_service_community_invite",
    });
  } catch (error) {
    console.error("Initial WhatsApp access cleanup failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false, error: "initial_access_cleanup_failed" }, { status: 500 });
  }
};

export const config = {
  schedule: "* * * * *",
};
