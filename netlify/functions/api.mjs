const SUPABASE_URL = (Netlify.env.get("VITE_SUPABASE_URL") || Netlify.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = Netlify.env.get("VITE_SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BRIDGE_URL = (Netlify.env.get("WHATSAPP_BRIDGE_URL") || "").replace(/\/+$/, "");
const BRIDGE_TOKEN = Netlify.env.get("WHATSAPP_BRIDGE_TOKEN") || "";
const OWNER_EMAIL = "hgconnect1@gmail.com";

const json = (statusCode, payload) => Response.json(payload, {
  status: statusCode,
  headers: { "cache-control": "no-store" },
});

async function sb(path, init = {}) {
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
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!response.ok) {
    const message = data && typeof data === "object" ? data.message || data.details || data.hint : data;
    throw new Error(`Supabase ${response.status}: ${message || "request failed"}`);
  }
  return data;
}

async function requireSuperAdmin(request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user.email?.toLowerCase() === OWNER_EMAIL && user.app_metadata?.role === "super_admin" ? user : null;
}

async function bridge(path, method = "GET", body) {
  if (!BRIDGE_URL || !BRIDGE_TOKEN) throw new Error("A ligação segura ao serviço WhatsApp ainda não está configurada no servidor.");
  const response = await fetch(`${BRIDGE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${BRIDGE_TOKEN}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(path === "/status" ? 5000 : 20000),
  });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};
  if (!response.ok) {
    const error = new Error(data.message || data.error || `WhatsApp bridge returned ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

const digits = (value) => String(value || "").replace(/\D/g, "");
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const iso = (date) => date.toISOString();

async function publicCommunities() {
  const [communities, groups] = await Promise.all([
    sb("communities?select=id,name,slug,description,status,image_url,whatsapp_community_id&status=eq.active&order=name.asc"),
    sb("whatsapp_groups?select=id,community_id,name,description,group_type,is_active,image_url&is_active=eq.true&order=name.asc"),
  ]);
  return { data: communities.map((community) => {
    const container = groups.find((group) => group.community_id === community.id && group.group_type === "community");
    return {
      id: community.id, slug: community.slug, name: community.name,
      description: community.description, purpose: community.description,
      image_url: community.image_url || container?.image_url || null,
      subgroups: groups.filter((group) => group.community_id === community.id && group.group_type === "subgroup")
        .map((group) => ({ id: group.id, slug: group.id, name: group.name, description: group.description, image_url: group.image_url || null })),
    };
  }) };
}

async function publicPlan() {
  const rows = await sb("plans?select=initial_price,renewal_price,duration_days,grace_days&is_active=eq.true&order=created_at.asc&limit=1");
  const p = rows?.[0];
  if (!p) return { initial_price_kz: 0, renewal_price_kz: 1000, duration_days: 30, warning_day: 27, grace_days: 5 };
  return { initial_price_kz: Number(p.initial_price), renewal_price_kz: Number(p.renewal_price), duration_days: p.duration_days, warning_day: 27, grace_days: p.grace_days };
}

async function publicInterests() {
  const rows = await sb("interests?select=id,name,slug&is_active=eq.true&order=name.asc");
  return {data:rows};
}

async function adminResource(resource) {
  if (resource === "subscriptions") {
    const [rows,members,communities,plans] = await Promise.all([
      sb("subscriptions?select=id,member_id,community_id,plan_id,status,starts_at,expires_at,grace_ends_at,created_at&order=created_at.desc&limit=500"),
      sb("members?select=id,full_name,phone_e164,phone"),
      sb("communities?select=id,name"),
      sb("plans?select=id,name"),
    ]);
    return {data:rows.map((s)=>({
      ...s,member_name:members.find((m)=>m.id===s.member_id)?.full_name || "—",
      phone:members.find((m)=>m.id===s.member_id)?.phone_e164 || members.find((m)=>m.id===s.member_id)?.phone || "—",
      community_name:communities.find((c)=>c.id===s.community_id)?.name || "—",
      plan_name:plans.find((p)=>p.id===s.plan_id)?.name || "—",
    }))};
  }
  if (resource === "audit") {
    const [rows,members] = await Promise.all([
      sb("audit_logs?select=id,action,entity_type,entity_id,member_id,old_values,new_values,created_at&order=created_at.desc&limit=500"),
      sb("members?select=id,full_name,phone_e164,phone"),
    ]);
    return {data:rows.map((a)=>({...a,member_name:members.find((m)=>m.id===a.member_id)?.full_name || "—"}))};
  }
  if (resource === "communities") {
    const [rows,plans,groups,subscriptions] = await Promise.all([
      sb("communities?select=id,name,slug,description,influencer_name,status,created_at&order=name.asc"),
      sb("plans?select=id,community_id,name,initial_price,renewal_price,duration_days,grace_days,is_active"),
      sb("whatsapp_groups?select=id,community_id,is_active,group_type"),
      sb("subscriptions?select=id,community_id,member_id"),
    ]);
    return {data:rows.map((community)=>({
      ...community,
      plans:plans.filter((p)=>p.community_id===community.id),
      groups_count:groups.filter((g)=>g.community_id===community.id && g.is_active && g.group_type==="subgroup").length,
      members_count:new Set(subscriptions.filter((s)=>s.community_id===community.id).map((s)=>s.member_id)).size,
    }))};
  }
  if (resource === "access") {
    const [rows,members,groups] = await Promise.all([
      sb("access_operations?select=id,member_id,whatsapp_group_id,operation_type,status,attempts,last_error,created_at,executed_at,next_retry_at&order=created_at.desc&limit=500"),
      sb("members?select=id,full_name,phone_e164,phone"),
      sb("whatsapp_groups?select=id,name"),
    ]);
    return {data:rows.map((op)=>({
      ...op,member_name:members.find((m)=>m.id===op.member_id)?.full_name || "—",
      phone:members.find((m)=>m.id===op.member_id)?.phone_e164 || members.find((m)=>m.id===op.member_id)?.phone || "—",
      group_name:groups.find((g)=>g.id===op.whatsapp_group_id)?.name || "—",
    }))};
  }
  if (resource === "registrations") {
    const [members,subscriptions,memberships,groups,communities] = await Promise.all([
      sb("members?select=id,full_name,phone_e164,phone,email,city,province,status,registration_source,created_at&registration_source=eq.web&order=created_at.desc&limit=500"),
      sb("subscriptions?select=id,member_id,community_id,status,expires_at,grace_ends_at,created_at&order=created_at.desc"),
      sb("group_memberships?select=member_id,whatsapp_group_id,status"),
      sb("whatsapp_groups?select=id,name,community_id,group_type"),
      sb("communities?select=id,name"),
    ]);
    const memberById = new Map(members.map((member)=>[member.id,member]));
    return {data:subscriptions.filter((sub)=>memberById.has(sub.member_id)).map((sub)=>{
      const member = memberById.get(sub.member_id);
      const selected = memberships.filter((membership)=>membership.member_id===member.id && groups.some((group)=>group.id===membership.whatsapp_group_id && group.group_type==="subgroup" && group.community_id===sub.community_id));
      const main = memberships.find((membership)=>membership.member_id===member.id && membership.status==="joined" && groups.some((group)=>group.id===membership.whatsapp_group_id && group.group_type==="community" && group.community_id===sub.community_id));
      return {...member,subscription_id:sub.id,community_name:communities.find((community)=>community.id===sub.community_id)?.name || "—",selected_subgroups:selected.map((membership)=>({name:groups.find((g)=>g.id===membership.whatsapp_group_id)?.name || "Grupo",status:membership.status})),community_access:main?"joined":"pending",subscription_status:sub.status || "sem_subscrição",expires_at:sub.expires_at || null,created_at:sub.created_at || member.created_at};
    })};
  }
  if (resource === "notifications") {
    const [rows,members] = await Promise.all([
      sb("notifications?select=id,member_id,notification_type,channel,message,status,sent_at,error_message,created_at&order=created_at.desc&limit=500"),
      sb("members?select=id,full_name,phone_e164,phone"),
    ]);
    return {data:rows.map((n)=>({...n,member_name:members.find((m)=>m.id===n.member_id)?.full_name || "Geral"}))};
  }
  if (resource === "plans") {
    const [rows,communities] = await Promise.all([
      sb("plans?select=id,community_id,name,description,initial_price,renewal_price,currency,duration_days,grace_days,is_active,created_at&order=created_at.desc"),
      sb("communities?select=id,name"),
    ]);
    return {data:rows.map((p)=>({...p,community_name:communities.find((c)=>c.id===p.community_id)?.name || "—"}))};
  }
  if (resource === "users") {
    const rows=await sb("users?select=id,name,email,role,is_active,last_login_at,created_at&order=created_at.desc");
    return {data:rows};
  }
  if (resource === "reports") {
    const summary=await adminDashboard();
    return {data:Object.entries(summary.totals).map(([metric,value])=>({id:metric,metric,value}))};
  }
  return {data:[]};
}


function makeSlug(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

async function writeAudit(user, action, entityType, entityId, oldValues, newValues, memberId = null) {
  await sb("audit_logs", {
    method: "POST",
    body: JSON.stringify([{ user_id: user?.id || null, member_id: memberId, action, entity_type: entityType, entity_id: entityId, old_values: oldValues || null, new_values: newValues || null }]),
    headers: { Prefer: "return=minimal" },
  });
}

async function adminCreateCommunity(body, user) {
  const name = String(body.name || "").trim();
  const slug = makeSlug(body.slug || name);
  const description = String(body.description || "").trim().slice(0, 1000) || null;
  const influencerName = String(body.influencer_name || "").trim().slice(0, 120) || null;
  // The current registration/payment flow supports the existing Encontre + tariff only.
  const initialPrice = 0;
  const renewalPrice = 1000;
  const durationDays = 30;
  const graceDays = 5;
  if (name.length < 2 || !slug) {
    return { status: 422, body: { message: "Preencha um nome, slug e plano com valores válidos." } };
  }
  const existing = await sb("communities?select=id&slug=eq." + encodeURIComponent(slug) + "&limit=1");
  if (existing.length) return { status: 409, body: { message: "Já existe uma comunidade com este endereço." } };
  const created = await sb("communities", {
    method: "POST",
    body: JSON.stringify([{ name, slug, description, influencer_name: influencerName, status: "inactive" }]),
    headers: { Prefer: "return=representation" },
  });
  const community = created?.[0];
  if (!community?.id) throw new Error("O Supabase não confirmou a criação da comunidade.");
  try {
    const plans = await sb("plans", {
      method: "POST",
      body: JSON.stringify([{ community_id: community.id, name: "Plano " + name, description: "Plano de adesão da comunidade " + name, initial_price: initialPrice, renewal_price: renewalPrice, currency: "AOA", duration_days: durationDays, grace_days: graceDays, is_active: true }]),
      headers: { Prefer: "return=representation" },
    });
    await writeAudit(user, "community.created", "community", community.id, null, { name, slug, status: "inactive", plan_id: plans?.[0]?.id || null });
    return { status: 201, body: { data: { ...community, plan: plans?.[0] || null }, message: "Comunidade criada. Associe o grupo principal e os subgrupos antes de a publicar." } };
  } catch (error) {
    await sb("communities?id=eq." + community.id, { method: "PATCH", body: JSON.stringify({ status: "inactive" }), headers: { Prefer: "return=minimal" } });
    throw error;
  }
}

async function adminUpdateCommunity(communityId, body, user) {
  if (!isUuid(communityId)) return { status: 422, body: { message: "Identificador de comunidade inválido." } };
  const rows = await sb("communities?select=id,name,slug,description,influencer_name,status&id=eq." + communityId + "&limit=1");
  const current = rows[0];
  if (!current) return { status: 404, body: { message: "Comunidade não encontrada." } };
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return { status: 422, body: { message: "O nome deve ter pelo menos 2 caracteres." } };
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = String(body.description || "").trim().slice(0, 1000) || null;
  if (body.influencer_name !== undefined) patch.influencer_name = String(body.influencer_name || "").trim().slice(0, 120) || null;
  if (body.status !== undefined) {
    if (!["active", "inactive"].includes(body.status)) return { status: 422, body: { message: "Estado de comunidade inválido." } };
    if (body.status === "active") {
      const [main, subgroups, plans] = await Promise.all([
        sb("whatsapp_groups?select=id,external_group_id&community_id=eq." + communityId + "&group_type=eq.community&is_active=eq.true"),
        sb("whatsapp_groups?select=id&community_id=eq." + communityId + "&group_type=eq.subgroup&is_active=eq.true"),
        sb("plans?select=id&community_id=eq." + communityId + "&is_active=eq.true&limit=1"),
      ]);
      if (main.length !== 1 || !main[0].external_group_id) return { status: 409, body: { message: "Antes de publicar, associe uma Comunidade do WhatsApp ativa e sincronizada." } };
      if (!subgroups.length) return { status: 409, body: { message: "Antes de publicar, disponibilize pelo menos um subgrupo ativo." } };
      if (!plans.length) return { status: 409, body: { message: "Esta comunidade ainda não tem um plano ativo." } };
    }
    patch.status = body.status;
  }
  if (!Object.keys(patch).length) return { status: 422, body: { message: "Não foram fornecidas alterações." } };
  patch.updated_at = iso(new Date());
  await sb("communities?id=eq." + communityId, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } });
  await writeAudit(user, "community.updated", "community", communityId, current, patch);
  return { status: 200, body: { message: "Comunidade atualizada.", data: { ...current, ...patch } } };
}

async function adminUpdateGroup(groupId, body, user) {
  if (!isUuid(groupId)) return { status: 422, body: { message: "Identificador de grupo inválido." } };
  const rows = await sb("whatsapp_groups?select=id,community_id,name,group_type,is_active,external_group_id&id=eq." + groupId + "&limit=1");
  const current = rows[0];
  if (!current) return { status: 404, body: { message: "Grupo não encontrado." } };
  const communityId = body.community_id === undefined ? current.community_id : body.community_id;
  if (!isUuid(communityId)) return { status: 422, body: { message: "Escolha uma comunidade válida." } };
  const communities = await sb("communities?select=id&id=eq." + communityId + "&limit=1");
  if (!communities.length) return { status: 404, body: { message: "Comunidade não encontrada." } };
  const groupType = body.group_type === undefined ? current.group_type : body.group_type;
  const isActive = body.is_active === undefined ? current.is_active : body.is_active;
  if (!["community", "subgroup"].includes(groupType) || typeof isActive !== "boolean") return { status: 422, body: { message: "Escolha se este registo representa a Comunidade ou um subgrupo." } };
  if (!current.external_group_id) return { status: 409, body: { message: "Este registo ainda não está sincronizado com o WhatsApp." } };
  if (groupType === "community") {
    const duplicates = await sb("whatsapp_groups?select=id&community_id=eq." + communityId + "&group_type=eq.community&id=neq." + groupId + "&limit=1");
    if (duplicates.length) return { status: 409, body: { message: "Esta comunidade da plataforma já tem uma Comunidade WhatsApp associada." } };
  }
  const patch = { community_id: communityId, group_type: groupType, is_active: isActive, updated_at: iso(new Date()) };
  await sb("whatsapp_groups?id=eq." + groupId, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } });
  if (groupType === "community") await sb("communities?id=eq." + communityId, {
    method: "PATCH", body: JSON.stringify({ whatsapp_community_id: current.external_group_id, updated_at: iso(new Date()) }),
    headers: { Prefer: "return=minimal" },
  });
  for (const affectedCommunityId of new Set([current.community_id, communityId])) {
    const [communityRows, containerRows, subgroupRows, planRows] = await Promise.all([
      sb("communities?select=id,status&id=eq." + affectedCommunityId + "&limit=1"),
      sb("whatsapp_groups?select=id,external_group_id&community_id=eq." + affectedCommunityId + "&group_type=eq.community&is_active=eq.true"),
      sb("whatsapp_groups?select=id&community_id=eq." + affectedCommunityId + "&group_type=eq.subgroup&is_active=eq.true"),
      sb("plans?select=id&community_id=eq." + affectedCommunityId + "&is_active=eq.true&limit=1"),
    ]);
    const ready = containerRows.length === 1 && Boolean(containerRows[0].external_group_id) && subgroupRows.length > 0 && planRows.length > 0;
    if (communityRows[0]?.status === "active" && !ready) await sb("communities?id=eq." + affectedCommunityId, {
      method: "PATCH", body: JSON.stringify({ status: "inactive", updated_at: iso(new Date()) }), headers: { Prefer: "return=minimal" },
    });
  }
  await writeAudit(user, "whatsapp_group.settings_updated", "whatsapp_group", groupId, current, patch);
  return { status: 200, body: { message: "Associação WhatsApp atualizada.", data: { ...current, ...patch } } };
}

async function adminDashboard() {
  const [members, subscriptions, payments, connections, operations] = await Promise.all([
    sb("members?select=id,status,created_at"),
    sb("subscriptions?select=id,member_id,status,expires_at,grace_ends_at,created_at"),
    sb("payments?select=id,amount,status,paid_at,created_at,payment_type"),
    sb("whatsapp_connections?select=id,connection_status,last_connected_at,last_disconnected_at,last_error&order=updated_at.desc&limit=1"),
    sb("access_operations?select=id,status,operation_type&operation_type=eq.remove&status=in.(queued,processing,retry_pending)"),
  ]);
  const now = Date.now();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const active = subscriptions.filter((s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now)).length;
  const grace = subscriptions.filter((s) => (s.status === "grace_period" || (s.status === "active" && s.expires_at && new Date(s.expires_at).getTime() <= now)) && (!s.grace_ends_at || new Date(s.grace_ends_at).getTime() >= now)).length;
  const expired = subscriptions.filter((s) => s.status === "expired" || (s.grace_ends_at && new Date(s.grace_ends_at).getTime() < now)).length;
  const dueSoon = subscriptions.filter((s) => s.expires_at && new Date(s.expires_at).getTime() >= now && new Date(s.expires_at).getTime() <= now + 7 * 86400000).length;
  const paid = payments.filter((p) => p.status === "paid");
  const pending = payments.filter((p) => ["initiated","pending","under_review"].includes(p.status));
  const revenue = paid.reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const revenueMonth = paid.filter((p) => p.paid_at && new Date(p.paid_at) >= monthStart).reduce((sum,p) => sum + Number(p.amount || 0), 0);
  const connection = connections[0];
  let waStatus = connection?.connection_status || "disconnected";
  try { const live = await bridge("/status"); waStatus = live.state || waStatus; } catch { /* keep last persisted state */ }
  const last30 = new Date(now - 30 * 86400000);
  const seriesByMonth = (rows, field, filter = () => true) => {
    const map = new Map();
    for (const row of rows.filter(filter)) {
      const key = String(row[field] || "").slice(0,7);
      if (key) map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort().map(([period,value]) => ({period,value}));
  };
  return {
    totals: {
      members: members.length, active, grace_period: grace, expired,
      new_signups: members.filter((m) => new Date(m.created_at) >= last30).length,
      payments_confirmed: paid.length, payments_pending: pending.length,
      revenue_total_kz: revenue, revenue_month_kz: revenueMonth, due_soon: dueSoon,
      removals_pending: operations.length,
    },
    whatsapp: { status: waStatus === "connected" ? "connected" : waStatus === "error" ? "error" : "disconnected", adapter: "bider", last_seen_at: connection?.last_connected_at || null },
    series: {
      member_growth: seriesByMonth(members,"created_at"),
      revenue_kz: seriesByMonth(paid,"paid_at").map((x) => ({...x,value: paid.filter((p) => String(p.paid_at || "").slice(0,7) === x.period).reduce((s,p) => s + Number(p.amount || 0),0)})),
      payments: seriesByMonth(paid,"paid_at"),
      renewals: seriesByMonth(paid.filter((p) => p.payment_type === "renewal"),"paid_at"),
      expirations: seriesByMonth(subscriptions,"expires_at",(s) => s.status === "expired"),
    },
  };
}

async function adminMembers(q) {
  const page = Math.max(1, Number(q.page || 1));
  const perPage = 25;
  const [members, subscriptions, memberships] = await Promise.all([
    sb("members?select=id,full_name,phone,phone_e164,email,province,city,status,created_at&order=created_at.desc"),
    sb("subscriptions?select=member_id,status,expires_at,grace_ends_at&order=created_at.desc"),
    sb("group_memberships?select=member_id,status"),
  ]);
  const latestSub = new Map();
  for (const s of subscriptions) if (!latestSub.has(s.member_id)) latestSub.set(s.member_id,s);
  const access = new Map();
  for (const m of memberships) if (m.status === "joined") access.set(m.member_id,"active");
  let rows = members.map((m) => {
    const sub = latestSub.get(m.id);
    const due = sub?.expires_at || null;
    return {
      id: m.id, full_name: m.full_name, whatsapp: m.phone_e164 || m.phone, email: m.email,
      province: m.province || "", city: m.city || "", registered_at: m.created_at,
      subscription_status: !sub ? null : (sub.grace_ends_at && new Date(sub.grace_ends_at).getTime() < Date.now() ? "expired" : (sub.expires_at && new Date(sub.expires_at).getTime() <= Date.now() ? "grace_period" : sub.status)), due_at: due,
      access_status: access.get(m.id) || "none",
    };
  });
  if (q.search) {
    const term = String(q.search).toLowerCase();
    rows = rows.filter((m) => [m.full_name,m.whatsapp,m.email].some((v) => String(v || "").toLowerCase().includes(term)));
  }
  if (q.status && q.status !== "all") rows = rows.filter((m) => m.subscription_status === q.status);
  if (q.from) rows = rows.filter((m) => m.registered_at >= q.from);
  if (q.to) rows = rows.filter((m) => m.registered_at.slice(0,10) <= q.to);
  const total = rows.length;
  return { data: rows.slice((page-1)*perPage,page*perPage), meta: { current_page: page, last_page: Math.max(1,Math.ceil(total/perPage)), per_page: perPage, total } };
}

async function adminPayments() {
  const [payments,members] = await Promise.all([
    sb("payments?select=id,member_id,subscription_id,amount,currency,status,payment_reference,payment_type,provider,created_at,paid_at,rejection_reason&order=created_at.desc&limit=500"),
    sb("members?select=id,full_name,phone_e164,phone,email"),
  ]);
  return {data:payments.map((p)=>({
    ...p,
    member:members.find((m)=>m.id===p.member_id) || null,
  }))};
}

async function confirmRenewalPayment(paymentId) {
  const rows = await sb("payments?select=id,member_id,subscription_id,amount,status,payment_type,payment_reference&id=eq."+paymentId+"&limit=1");
  const payment = rows[0];
  if (!payment) return {status:404,body:{message:"Pagamento não encontrado."}};
  if (payment.status === "paid") return {status:200,body:{message:"Pagamento já confirmado."}};
  if (payment.payment_type !== "renewal" || !payment.subscription_id) return {status:409,body:{message:"Este pagamento não é uma renovação válida."}};
  const [subs,members] = await Promise.all([
    sb("subscriptions?select=id,member_id,community_id,plan_id,status,starts_at,expires_at,grace_ends_at&id=eq."+payment.subscription_id+"&limit=1"),
    sb("members?select=id,phone_e164,phone&id=eq."+payment.member_id+"&limit=1"),
  ]);
  const sub=subs[0], member=members[0];
  if (!sub || !member || sub.member_id !== payment.member_id) return {status:409,body:{message:"A subscrição associada ao pagamento não é válida."}};
  const plans = await sb("plans?select=renewal_price,duration_days,grace_days&id=eq."+sub.plan_id+"&limit=1");
  const plan=plans[0];
  if (!plan || Number(payment.amount)!==Number(plan.renewal_price) || Number(plan.renewal_price)!==1000) return {status:409,body:{message:"O valor do pagamento não corresponde à renovação de 1.000 Kz."}};
  const now=new Date();
  const currentExpiry=sub.expires_at ? new Date(sub.expires_at) : now;
  const renewalStart=currentExpiry.getTime()>now.getTime()?currentExpiry:now;
  const expires=new Date(renewalStart.getTime()+Number(plan.duration_days)*86400000);
  const grace=new Date(expires.getTime()+Number(plan.grace_days)*86400000);
  await sb("subscriptions?id=eq."+sub.id,{
    method:"PATCH",
    body:JSON.stringify({status:"active",starts_at:sub.starts_at || iso(now),expires_at:iso(expires),grace_ends_at:iso(grace),ended_at:null,updated_at:iso(now)}),
    headers:{Prefer:"return=minimal"},
  });
  await sb("payments?id=eq."+payment.id,{
    method:"PATCH",
    body:JSON.stringify({status:"paid",paid_at:iso(now),verified_at:iso(now),rejection_reason:null,updated_at:iso(now)}),
    headers:{Prefer:"return=minimal"},
  });
  const communityGroups=await sb("whatsapp_groups?select=id&community_id=eq."+sub.community_id);
  const communityGroupIds=communityGroups.map((group)=>group.id);
  const memberships=communityGroupIds.length
    ? await sb("group_memberships?select=id,whatsapp_group_id,status&member_id=eq."+member.id+"&whatsapp_group_id=in.("+communityGroupIds.join(",")+")")
    : [];
  const phone=digits(member.phone_e164 || member.phone);
  let waConnected=false;
  try { waConnected=(await bridge("/status")).connected===true; } catch {}
  for(const membership of memberships){
    if(membership.status==="joined") continue;
    if(!waConnected || !phone){
      await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"pending_invitation",updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
      continue;
    }
    const groupRows=await sb("whatsapp_groups?select=external_group_id&id=eq."+membership.whatsapp_group_id+"&limit=1");
    const externalGroupId=groupRows[0]?.external_group_id;
    if(!externalGroupId) continue;
    try{
      await bridge("/groups/"+encodeURIComponent(externalGroupId)+"/participants/add","POST",{phone});
      await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"joined",joined_at:iso(now),removed_at:null,updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
    }catch{
      await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"pending_invitation",updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
    }
  }
  await sb("audit_logs",{
    method:"POST",
    body:JSON.stringify([{member_id:member.id,action:"renewal.payment_confirmed",entity_type:"payment",entity_id:payment.id,old_values:{payment_status:payment.status,subscription_status:sub.status},new_values:{payment_status:"paid",subscription_status:"active",expires_at:iso(expires)}}]),
    headers:{Prefer:"return=minimal"},
  });
  return {status:200,body:{message:"Renovação confirmada.",expires_at:iso(expires)}};
}


async function ensureConnection(communityId, status) {
  // One connected WhatsApp account is shared across the platform's communities.
  const rows = await sb("whatsapp_connections?select=id,community_id&name=eq.Encontre%20%2B%20Principal&order=created_at.asc&limit=1");
  const now = iso(new Date());
  if (rows[0]) {
    const patch = { connection_status: status, updated_at: now };
    if (status === "connected") patch.last_connected_at = now;
    if (status === "disconnected") patch.last_disconnected_at = now;
    await sb("whatsapp_connections?id=eq." + rows[0].id, { method:"PATCH", body: JSON.stringify(patch), headers: { Prefer:"return=minimal" } });
    return rows[0].id;
  }
  const created = await sb("whatsapp_connections", { method:"POST", body:JSON.stringify({community_id:communityId,name:"Encontre + Principal",provider:"baileys",connection_status:status,last_connected_at:status==="connected"?now:null,last_disconnected_at:status==="disconnected"?now:null}), headers:{Prefer:"return=representation"} });
  return created[0].id;
}

async function syncWhatsApp(communityId, whatsappCommunityId) {
  const [platformRows, sourceResult] = await Promise.all([
    sb("communities?select=id,name,whatsapp_community_id&id=eq." + communityId + "&limit=1"),
    bridge("/communities"),
  ]);
  const platformCommunity = platformRows[0];
  const source = (sourceResult.communities || []).find((item) => item.id === whatsappCommunityId);
  if (!platformCommunity) throw new Error("Comunidade da plataforma não encontrada.");
  if (!source) throw new Error("A Comunidade WhatsApp selecionada já não está disponível na conta ligada.");
  if (platformCommunity.whatsapp_community_id && platformCommunity.whatsapp_community_id !== source.id) throw new Error("Esta comunidade da plataforma já está associada a outra Comunidade WhatsApp.");
  const connectionId = await ensureConnection(communityId, "connected");
  let groupsImported = 0, contactsImported = 0, skipped = 0;
  const chunk = (items, size = 150) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
  const existingContainer = await sb("whatsapp_groups?select=id,is_active,community_id&whatsapp_connection_id=eq." + encodeURIComponent(connectionId) + "&external_group_id=eq." + encodeURIComponent(source.id) + "&limit=1");
  if (existingContainer[0] && existingContainer[0].community_id !== communityId) throw new Error("Esta Comunidade WhatsApp já está associada a outra comunidade da plataforma.");
  const containerRows = await sb("whatsapp_groups?on_conflict=whatsapp_connection_id,external_group_id", {
    method: "POST",
    body: JSON.stringify([{
      community_id: communityId, whatsapp_connection_id: connectionId, external_group_id: source.id,
      name: source.subject || platformCommunity.name, description: source.description || null, group_type: "community",
      invite_link: source.invite_link || null, image_url: source.profile_picture_url || null, linked_parent_id: null,
      is_active: existingContainer[0]?.is_active ?? false, sync_status: "synced",
    }]),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  if (!containerRows[0]?.id) throw new Error("O Supabase não confirmou a Comunidade WhatsApp.");
  await sb("communities?id=eq." + communityId, {
    method: "PATCH",
    body: JSON.stringify({ whatsapp_community_id: source.id, image_url: source.profile_picture_url || null, updated_at: iso(new Date()) }),
    headers: { Prefer: "return=minimal" },
  });
  groupsImported++;
  for (const group of source.subgroups || []) {
    const existingRows = await sb("whatsapp_groups?select=id,is_active,community_id&whatsapp_connection_id=eq." + encodeURIComponent(connectionId) + "&external_group_id=eq." + encodeURIComponent(group.id) + "&limit=1");
    if (existingRows[0] && existingRows[0].community_id !== communityId) throw new Error("O subgrupo " + (group.subject || group.id) + " já está associado a outra comunidade da plataforma.");
    let inviteLink = null;
    try { inviteLink = (await bridge("/groups/" + encodeURIComponent(group.id) + "/invite-link")).invite_link || null; } catch { /* optional; requires admin role */ }
    const stored = await sb("whatsapp_groups?on_conflict=whatsapp_connection_id,external_group_id", {
      method: "POST",
      body: JSON.stringify([{
        community_id: communityId, whatsapp_connection_id: connectionId, external_group_id: group.id,
        name: group.subject || "Grupo WhatsApp", description: group.description || null, group_type: "subgroup",
        invite_link: inviteLink, image_url: group.profile_picture_url || null, linked_parent_id: group.linked_parent_id || source.id,
        is_active: existingRows[0]?.is_active ?? false, sync_status: "synced",
      }]),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    const dbGroup = stored[0];
    if (!dbGroup?.id) throw new Error("O Supabase não confirmou o subgrupo " + (group.subject || group.id));
    groupsImported++;
    const participants = await bridge("/groups/" + encodeURIComponent(group.id) + "/participants");
    const valid = [];
    for (const participant of participants.participants || []) {
      const jid = String(participant.id || "");
      if (!jid.endsWith("@s.whatsapp.net")) { skipped++; continue; }
      const phone = digits(jid.split("@")[0].split(":")[0]);
      if (!/^\\d{8,15}$/.test(phone)) { skipped++; continue; }
      valid.push({ jid, phone });
    }
    const uniquePhones = [...new Set(valid.map((participant) => participant.phone))];
    const memberByPhone = new Map();
    for (const phoneChunk of chunk(uniquePhones)) {
      const filter = phoneChunk.map(encodeURIComponent).join(",");
      const existing = await sb("members?select=id,phone_e164&phone_e164=in.(" + filter + ")");
      for (const member of existing) memberByPhone.set(member.phone_e164, member.id);
    }
    const missing = uniquePhones.filter((phone) => !memberByPhone.has(phone));
    for (const phoneChunk of chunk(missing)) {
      const created = await sb("members?on_conflict=phone_e164", {
        method: "POST",
        body: JSON.stringify(phoneChunk.map((phone) => ({ full_name: phone, phone, phone_e164: phone, status: "active", registration_source: "whatsapp_import", country: "Angola" }))),
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      });
      for (const member of created || []) memberByPhone.set(member.phone_e164, member.id);
    }
    const memberships = valid.filter((participant) => memberByPhone.has(participant.phone)).map((participant) => ({
      member_id: memberByPhone.get(participant.phone), whatsapp_group_id: dbGroup.id, external_participant_id: participant.jid,
      status: "joined", joined_at: iso(new Date()), last_synced_at: iso(new Date()),
    }));
    for (const batch of chunk(memberships)) await sb("group_memberships?on_conflict=member_id,whatsapp_group_id", {
      method: "POST", body: JSON.stringify(batch), headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    contactsImported += memberships.length;
  }
  await ensureConnection(communityId, "connected");
  return { communities_imported: 1, groups_imported: groupsImported, subgroups_imported: source.subgroups?.length || 0, contacts_imported: contactsImported, participants_skipped: skipped };
}

export default async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  const method = request.method || "GET";
  const url = new URL(request.url);
  const q = Object.fromEntries(url.searchParams.entries());
  const path = q.path || "/";
  try {
    if (path === "/health") { await sb("plans?select=id&limit=1"); return json(200,{status:"ok",supabase:"connected",time:iso(new Date())}); }
    if (path === "/public/communities" && method === "GET") return json(200,await publicCommunities());
    if (path === "/public/plan" && method === "GET") return json(200,await publicPlan());
    if (path === "/public/interests" && method === "GET") return json(200,await publicInterests());

    const publicRoute = (path === "/public/registrations" && method === "POST") || (path.startsWith("/public/registrations/") && method === "GET") || (path.startsWith("/public/registrations/") && path.endsWith("/renewal") && method === "POST");
    const user = await requireSuperAdmin(request);
    if (!publicRoute && !user) return json(401,{message:"Sessão inválida ou sem permissão de Super Admin."});

    if (path === "/admin/communities" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const result = await adminCreateCommunity(body, user);
      return json(result.status, result.body);
    }
    const communityAction = path.match(/^\/admin\/communities\/([0-9a-f-]{36})$/i);
    if (communityAction && method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const result = await adminUpdateCommunity(communityAction[1], body, user);
      return json(result.status, result.body);
    }
    if (path === "/admin/dashboard" && method === "GET") return json(200,await adminDashboard());
    const resourceMatch = path.match(/^\/admin\/resources\/(subscriptions|audit|communities|access|registrations|notifications|plans|users|reports)$/);
    if (resourceMatch && method === "GET") return json(200,await adminResource(resourceMatch[1]));
    if (path === "/admin/members" && method === "GET") return json(200,await adminMembers(q));
    if (path === "/admin/payments" && method === "GET") return json(200,await adminPayments());
    const paymentAction = path.match(/^\/admin\/payments\/([0-9a-f-]{36})\/(confirm|reject)$/i);
    if (paymentAction && method === "POST") {
      if (paymentAction[2] === "confirm") {
        const result = await confirmRenewalPayment(paymentAction[1]);
        return json(result.status,result.body);
      }
      const rows = await sb("payments?select=id,status,member_id&id=eq."+paymentAction[1]+"&limit=1");
      const payment = rows[0];
      if (!payment) return json(404,{message:"Pagamento não encontrado."});
      if (!["pending","initiated","under_review"].includes(payment.status)) return json(409,{message:"Só é possível rejeitar pagamentos pendentes."});
      const body = await request.json().catch(() => ({}));
      const reason = String(body.reason || "Pagamento não confirmado.").slice(0,500);
      await sb("payments?id=eq."+paymentAction[1],{
        method:"PATCH",
        body:JSON.stringify({status:"rejected",rejection_reason:reason,verified_at:iso(new Date()),updated_at:iso(new Date())}),
        headers:{Prefer:"return=minimal"},
      });
      await sb("audit_logs",{
        method:"POST",
        body:JSON.stringify([{member_id:payment.member_id,action:"renewal.payment_rejected",entity_type:"payment",entity_id:payment.id,new_values:{status:"rejected",reason}}]),
        headers:{Prefer:"return=minimal"},
      });
      return json(200,{message:"Pagamento rejeitado."});
    }
    if (path === "/admin/whatsapp/status" && method === "GET") {
      const status = await bridge("/status");
      return json(200,status);
    }
    if (path === "/admin/whatsapp/groups" && method === "GET") {
      const [groups,memberships,members] = await Promise.all([
        sb("whatsapp_groups?select=id,name,description,external_group_id,group_type,sync_status,is_active,community_id&order=name.asc"),
        sb("group_memberships?select=member_id,whatsapp_group_id,status,external_participant_id"),
        sb("members?select=id,full_name,phone_e164,phone,email"),
      ]);
      return json(200,{data:groups.map((g)=>({
        ...g,
        participants:memberships.filter((m)=>m.whatsapp_group_id===g.id && m.status==="joined").map((m)=>{
          const person=members.find((p)=>p.id===m.member_id);
          return person ? {id:person.id,name:person.full_name,phone:person.phone_e164 || person.phone,email:person.email,status:m.status} : null;
        }).filter(Boolean),
        participants_count:memberships.filter((m)=>m.whatsapp_group_id===g.id && m.status==="joined").length,
      }))});
    }
    const groupSettings = path.match(/^\/admin\/whatsapp\/groups\/([0-9a-f-]{36})\/settings$/i);
    if (groupSettings && method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const result = await adminUpdateGroup(groupSettings[1], body, user);
      return json(result.status, result.body);
    }
    if (path.startsWith("/admin/whatsapp/groups/") && path.endsWith("/type") && method === "PATCH") {
      const groupId = path.slice("/admin/whatsapp/groups/".length, -"/type".length);
      const body = await request.json().catch(() => ({}));
      if (!isUuid(groupId) || !["main","subgroup"].includes(body.group_type)) return json(422,{message:"Tipo de grupo inválido."});
      const selected = await sb("whatsapp_groups?select=id,community_id&id=eq."+groupId+"&limit=1");
      if (!selected.length) return json(404,{message:"Grupo não encontrado."});
      if (body.group_type === "main") {
        await sb("whatsapp_groups?community_id=eq."+selected[0].community_id+"&group_type=eq.main",{
          method:"PATCH",body:JSON.stringify({group_type:"subgroup"}),headers:{Prefer:"return=minimal"},
        });
      }
      await sb("whatsapp_groups?id=eq."+groupId,{
        method:"PATCH",body:JSON.stringify({group_type:body.group_type}),headers:{Prefer:"return=minimal"},
      });
      return json(200,{message:"Tipo do grupo atualizado.",group_id:groupId,group_type:body.group_type});
    }
    if (path === "/admin/whatsapp/connect" && method === "POST") return json(202,await bridge("/connect","POST",{}));
    if (path === "/admin/whatsapp/qr" && method === "GET") return json(200,await bridge("/qr"));
    if (path === "/admin/whatsapp/pairing-code" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const phone = digits(body.phone);
      if (!/^\d{8,15}$/.test(phone)) return json(400,{message:"Introduza o número com indicativo do país."});
      return json(200,await bridge("/pairing-code","POST",{phone}));
    }
    if (path === "/admin/whatsapp/disconnect" && method === "POST") return json(200,await bridge("/disconnect","POST",{}));
    if (path === "/admin/whatsapp/sync" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const communities = await sb("communities?select=id&status=eq.active&limit=1");
      const communityId = isUuid(body.community_id) ? body.community_id : communities[0]?.id;
      if (!communityId) return json(409,{message:"Crie uma comunidade ativa antes de sincronizar os grupos."});
      const result = await syncWhatsApp(communityId);
      return json(200,result);
    }
    if (path === "/public/registrations" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const phone = digits(body.whatsapp);
      const rawSubgroupIds = Array.isArray(body.subgroup_ids) ? body.subgroup_ids : [body.subgroup_id];
      const subgroupIds = [...new Set(rawSubgroupIds.filter(isUuid))];
      if (!body.full_name || String(body.full_name).trim().length < 3 || !/^\d{8,15}$/.test(phone) || !isUuid(body.community_id) || rawSubgroupIds.length === 0 || subgroupIds.length === 0 || subgroupIds.length > 20 || rawSubgroupIds.some((id)=>!isUuid(id))) {
        return json(422,{message:"Dados da inscrição inválidos. Escolha pelo menos um subgrupo."});
      }
      const [community,subgroups,mainGroups,plans] = await Promise.all([
        sb("communities?select=id,status&id=eq."+body.community_id+"&status=eq.active"),
        sb("whatsapp_groups?select=id,name,community_id,external_group_id,invite_link,group_type,is_active&id=in.("+subgroupIds.join(",")+")&is_active=eq.true&group_type=eq.subgroup"),
        sb("whatsapp_groups?select=id,name,external_group_id,invite_link,group_type,is_active&community_id=eq."+body.community_id+"&is_active=eq.true&group_type=eq.main"),
        sb("plans?select=id,initial_price,renewal_price,duration_days,grace_days&community_id=eq."+body.community_id+"&is_active=eq.true&limit=1"),
      ]);
      if (!community.length || subgroups.length !== subgroupIds.length || subgroups.some((g)=>g.community_id !== body.community_id || !g.external_group_id) || !plans.length) return json(422,{message:"Comunidade, subgrupos ou plano indisponíveis. Todos os grupos escolhidos precisam estar sincronizados."});
      if (mainGroups.length !== 1 || !mainGroups[0].external_group_id) return json(409,{message:"Esta comunidade ainda não tem um único grupo principal ativo e sincronizado. Contacte a equipa Encontre +."});
      const now = new Date();
      const plan = plans[0];
      if (Number(plan.initial_price) !== 0) return json(409,{message:"O plano ainda não está configurado para adesão gratuita."});
      const expires = new Date(now.getTime()+Number(plan.duration_days)*86400000);
      const grace = new Date(expires.getTime()+Number(plan.grace_days)*86400000);
      const memberRows = await sb("members?on_conflict=phone_e164", {
        method:"POST",
        body:JSON.stringify([{full_name:String(body.full_name).trim(),phone,phone_e164:phone,email:body.email || null,province:body.province || null,city:body.city || null,country:"Angola",status:"active",registration_source:"web",terms_accepted_at:iso(now),privacy_consent_at:iso(now)}]),
        headers:{Prefer:"resolution=merge-duplicates,return=representation"},
      });
      const member = memberRows[0];
      const interestSlugs = Array.isArray(body.interests) ? [...new Set(body.interests.map((v)=>String(v).trim()).filter(Boolean))] : [];
      if (interestSlugs.length) {
        const foundInterests = await sb("interests?select=id,slug&is_active=eq.true&slug=in.("+interestSlugs.map(encodeURIComponent).join(",")+")");
        if (foundInterests.length) {
          await sb("member_interests?on_conflict=member_id,interest_id",{
            method:"POST",
            body:JSON.stringify(foundInterests.map((interest)=>({member_id:member.id,interest_id:interest.id}))),
            headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},
          });
        }
      }
      const previousSubs = await sb("subscriptions?select=id,status,expires_at,grace_ends_at&member_id=eq."+member.id+"&community_id=eq."+body.community_id+"&order=created_at.desc&limit=1");
      let subscriptionId = previousSubs[0]?.id;
      if (previousSubs[0] && (["expired","cancelled","suspended","grace_period"].includes(previousSubs[0].status) || (previousSubs[0].expires_at && new Date(previousSubs[0].expires_at).getTime() <= now.getTime()))) {
        if (Number(plan.renewal_price) !== 1000) return json(409,{message:"O plano de renovação não está configurado para 1.000 Kz."});
        const renewals = await sb("payments?select=id,status,payment_reference,amount&subscription_id=eq."+subscriptionId+"&payment_type=eq.renewal&order=created_at.desc&limit=50");
        const pendingRenewal = renewals.find((p)=>["initiated","pending","under_review"].includes(p.status));
        if (pendingRenewal) {
          return json(201,{reference:subscriptionId,status:"pending_payment",payment:{reference:pendingRenewal.payment_reference,amount_kz:Number(pendingRenewal.amount),status:"pending",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null}});
        }
        const referenceCode = "EN-R-" + crypto.randomUUID().slice(0,8).toUpperCase();
        const createdPayment = await sb("payments",{
          method:"POST",
          body:JSON.stringify([{member_id:member.id,subscription_id:subscriptionId,amount:1000,currency:"AOA",payment_type:"renewal",provider:"manual",status:"pending",payment_reference:referenceCode,idempotency_key:"renewal:"+subscriptionId+":"+(renewals.length+1)}]),
          headers:{Prefer:"return=representation"},
        });
        return json(201,{reference:subscriptionId,status:"pending_payment",payment:{reference:createdPayment[0].payment_reference,amount_kz:Number(createdPayment[0].amount),status:"pending",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null}});
      }
      if (!subscriptionId) {
        const createdSubscription = await sb("subscriptions",{method:"POST",body:JSON.stringify([{member_id:member.id,community_id:body.community_id,plan_id:plan.id,status:"active",starts_at:iso(now),expires_at:iso(expires),grace_ends_at:iso(grace),activated_at:iso(now)}]),headers:{Prefer:"return=representation"}});
        subscriptionId = createdSubscription[0].id;
      }
      const targets = [
        {group:mainGroups[0],kind:"community"},
        ...subgroups.map((group)=>({group,kind:"subgroup"})),
      ];
      const accessResults = [];
      let waConnected = false;
      try { waConnected = (await bridge("/status")).connected === true; } catch { /* access remains pending until WhatsApp is available */ }
      for (const target of targets) {
        const found = await sb("group_memberships?select=id,status&member_id=eq."+member.id+"&whatsapp_group_id=eq."+target.group.id+"&limit=1");
        let membership = found[0];
        if (!membership) {
          const inserted = await sb("group_memberships",{method:"POST",body:JSON.stringify([{member_id:member.id,whatsapp_group_id:target.group.id,status:"pending_invitation"}]),headers:{Prefer:"return=representation"}});
          membership = inserted[0];
        }
        let accessStatus = membership.status === "joined" ? "joined" : "pending_invitation";
        if (accessStatus !== "joined") {
          const idempotencyKey = "registration-add:" + subscriptionId + ":" + target.group.id;
          const existingOps = await sb("access_operations?select=id,status,attempts&idempotency_key=eq." + encodeURIComponent(idempotencyKey) + "&limit=1");
          let operation = existingOps[0];
          if (!operation) {
            const createdOps = await sb("access_operations", {
              method: "POST",
              body: JSON.stringify([{ member_id: member.id, whatsapp_group_id: target.group.id, operation_type: "add", status: "queued", idempotency_key: idempotencyKey, attempts: 0 }]),
              headers: { Prefer: "return=representation" },
            });
            operation = createdOps[0];
          }
          if (waConnected && target.group.external_group_id && operation) {
            const attempt = Number(operation.attempts || 0) + 1;
            await sb("access_operations?id=eq." + operation.id, { method: "PATCH", body: JSON.stringify({ status: "processing", attempts: attempt, updated_at: iso(new Date()) }), headers: { Prefer: "return=minimal" } });
            try {
              await bridge("/groups/"+encodeURIComponent(target.group.external_group_id)+"/participants/add","POST",{phone});
              accessStatus = "joined";
              await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"joined",joined_at:iso(new Date()),removed_at:null,last_synced_at:iso(new Date())}),headers:{Prefer:"return=minimal"}});
              await sb("access_operations?id=eq." + operation.id, { method: "PATCH", body: JSON.stringify({ status: "succeeded", executed_at: iso(new Date()), last_error: null, next_retry_at: null, updated_at: iso(new Date()) }), headers: { Prefer: "return=minimal" } });
            } catch (error) {
              const message = error instanceof Error ? error.message.slice(0, 300) : "Não foi possível adicionar o participante ao grupo.";
              await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"pending_invitation",updated_at:iso(new Date())}),headers:{Prefer:"return=minimal"}});
              await sb("access_operations?id=eq." + operation.id, { method: "PATCH", body: JSON.stringify({ status: "retry_pending", last_error: message, next_retry_at: iso(new Date(Date.now() + 15 * 60 * 1000)), updated_at: iso(new Date()) }), headers: { Prefer: "return=minimal" } });
            }
          } else if (operation) {
            await sb("access_operations?id=eq." + operation.id, { method: "PATCH", body: JSON.stringify({ status: "retry_pending", last_error: "WhatsApp indisponível ou grupo sem identificador externo.", next_retry_at: iso(new Date(Date.now() + 15 * 60 * 1000)), updated_at: iso(new Date()) }), headers: { Prefer: "return=minimal" } });
          }
        }
        accessResults.push({id:target.group.id,name:target.group.name,kind:target.kind,status:accessStatus,invite_url:target.group.invite_link || null});
      }
      const communityAccess = accessResults.find((item)=>item.kind==="community");
      const subgroupAccess = accessResults.filter((item)=>item.kind==="subgroup");
      const accessState = {
        community: communityAccess?.status || "pending_invitation",
        subgroups: subgroupAccess,
        community_invite_url: communityAccess?.invite_url || null,
        subgroup_invite_url: subgroupAccess.find((item)=>item.invite_url)?.invite_url || null,
        subgroup_invite_urls: subgroupAccess.filter((item)=>item.invite_url).map((item)=>({id:item.id,name:item.name,url:item.invite_url})),
      };
      await writeAudit(null,"registration.created","registration",subscriptionId,null,{member_id:member.id,community_id:body.community_id,subgroup_ids:subgroupIds,access:accessState},member.id);
      return json(201,{reference:subscriptionId,status:"approved",payment:{reference:subscriptionId,amount_kz:0,status:"confirmed",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null},access:accessState});
    }
    if (path.startsWith("/public/registrations/") && path.endsWith("/renewal") && method === "POST") {
      const reference = path.slice("/public/registrations/".length).replace(/\/renewal$/, "");
      const body = await request.json().catch(() => ({}));
      const phone = digits(body.whatsapp);
      if (!isUuid(reference) || !/^\d{8,15}$/.test(phone)) return json(404,{message:"Inscrição não encontrada."});
      const subs = await sb("subscriptions?select=id,member_id,community_id,plan_id,expires_at,status&id=eq."+reference+"&limit=1");
      const sub = subs[0];
      if (!sub) return json(404,{message:"Inscrição não encontrada."});
      const members = await sb("members?select=id,full_name,phone_e164,phone&id=eq."+sub.member_id+"&limit=1");
      const member = members[0];
      if (!member || digits(member.phone_e164 || member.phone) !== phone) return json(404,{message:"Inscrição não encontrada."});
      const plans = await sb("plans?select=renewal_price,duration_days,grace_days&id=eq."+sub.plan_id+"&limit=1");
      const plan = plans[0];
      if (!plan || Number(plan.renewal_price) !== 1000) return json(409,{message:"O preço de renovação não está configurado para 1.000 Kz."});
      const renewals = await sb("payments?select=id,payment_reference,amount,status&subscription_id=eq."+sub.id+"&payment_type=eq.renewal&order=created_at.desc&limit=50");
      const pending = renewals.find((p)=>["pending","under_review","initiated"].includes(p.status));
      if (pending) return json(200,{reference:sub.id,status:"pending",payment:{reference:pending.payment_reference,amount_kz:Number(pending.amount),status:"pending",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null}});
      const referenceCode = "EN-R-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const idempotencyKey = "renewal:" + sub.id + ":" + (renewals.length+1);
      const created = await sb("payments",{
        method:"POST",
        body:JSON.stringify([{
          member_id:sub.member_id,subscription_id:sub.id,amount:1000,currency:"AOA",payment_type:"renewal",
          provider:"manual",status:"pending",payment_reference:referenceCode,idempotency_key:idempotencyKey,
        }]),
        headers:{Prefer:"return=representation"},
      });
      return json(201,{reference:sub.id,status:"pending",payment:{reference:created[0].payment_reference,amount_kz:Number(created[0].amount),status:"pending",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null}});
    }
    if (path.startsWith("/public/registrations/") && method === "GET") {
      const reference = path.slice("/public/registrations/".length);
      const phone = digits(q.whatsapp);
      if (!isUuid(reference) || !/^\d{8,15}$/.test(phone)) return json(404,{message:"Inscrição não encontrada."});
      const subs = await sb("subscriptions?select=id,member_id,community_id,status,expires_at,created_at&id=eq."+reference+"&limit=1");
      const sub = subs[0];
      if (!sub) return json(404,{message:"Inscrição não encontrada."});
      const [members,communities,groups,memberships,payments] = await Promise.all([
        sb("members?select=id,full_name,phone_e164,phone,created_at&id=eq."+sub.member_id+"&limit=1"),
        sb("communities?select=id,name,slug&id=eq."+sub.community_id+"&limit=1"),
        sb("whatsapp_groups?select=id,name,group_type,invite_link&community_id=eq."+sub.community_id+"&is_active=eq.true"),
        sb("group_memberships?select=whatsapp_group_id,status&member_id=eq."+sub.member_id+"&order=created_at.desc"),
        sb("payments?select=payment_reference,amount,status,created_at,paid_at&subscription_id=eq."+sub.id+"&order=created_at.desc&limit=1"),
      ]);
      const member = members[0], community = communities[0];
      if (!member || digits(member.phone_e164 || member.phone) !== phone || !community) return json(404,{message:"Inscrição não encontrada."});
      const selectedSubgroups = memberships
        .filter((m)=>groups.some((g)=>g.id===m.whatsapp_group_id && g.group_type==="subgroup"))
        .map((m)=>groups.find((g)=>g.id===m.whatsapp_group_id))
        .filter(Boolean);
      const mainGroup = groups.find((g)=>g.group_type==="main") || null;
      const communityJoined = memberships.some((m)=>m.status==="joined" && groups.some((g)=>g.id===m.whatsapp_group_id && g.group_type==="main"));
      const communityInvite = mainGroup?.invite_link || null;
      const subgroupInviteUrls = selectedSubgroups.filter((g)=>g.invite_link).map((g)=>({id:g.id,name:g.name,url:g.invite_link}));
      const subgroupAccessReady = selectedSubgroups.length > 0 && selectedSubgroups.every((g)=>memberships.some((m)=>m.whatsapp_group_id===g.id && m.status==="joined") || Boolean(g.invite_link));
      const subgroupInvite = subgroupInviteUrls[0]?.url || null;
      const subgroup = selectedSubgroups[0] || null;
      const latestPayment = payments[0];
      const payment = latestPayment ? {
        reference:latestPayment.payment_reference,amount_kz:Number(latestPayment.amount),
        status:latestPayment.status==="paid"?"confirmed":latestPayment.status==="rejected"?"rejected":"pending",
        instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null,
      } : {reference:sub.id,amount_kz:0,status:"confirmed",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null};
      const registrationStatus = latestPayment && ["pending","initiated","under_review"].includes(latestPayment.status) ? "pending_payment" : "approved";
      return json(200,{
        reference:sub.id,status:registrationStatus,full_name:member.full_name,created_at:sub.created_at,
        community:{name:community.name,slug:community.slug},
        subgroup:{name:subgroup?.name || "Subgrupo",slug:subgroup?.id || ""},
        subgroups:selectedSubgroups.map((g)=>({name:g.name,slug:g.id})),
        payment,
        subscription:{status:sub.status,due_at:sub.expires_at},
        access:{community:communityJoined || communityInvite ? "active" : "pending",subgroup:subgroupAccessReady ? "active" : "pending",community_invite_url:communityInvite,subgroup_invite_url:subgroupInvite,subgroup_invite_urls:subgroupInviteUrls},
        rejection_reason:null,
      });
    }
    return json(404,{message:"Endpoint não encontrado."});
  } catch (error) {
    const status = error.statusCode || 500;
    return json(status,{message:error.message || "Erro interno.",code:"integration_error"});
  }
};
