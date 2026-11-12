import { createHmac, timingSafeEqual } from "node:crypto";
import { baileysRequest } from "../lib/baileys.mjs";
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const KURSINHA_SECRET = process.env.KURSINHA_WEBHOOK_SECRET || "";
const KURSINHA_PRODUCT_ID = process.env.KURSINHA_PRODUCT_ID || "6aefd6a5531bcee4ede064fb";
const KURSINHA_CHECKOUT_URL = process.env.KURSINHA_CHECKOUT_URL || "https://pay.kursinha.com/c/6aefd6a5531bcee4ede064fb";
const OWNER_EMAIL = "hgconnect1@gmail.com";

// The dashboard polls session status frequently. Cache the expensive community
// permission/discovery check separately so one page poll cannot fan out into
// repeated WhatsApp IQ requests and trigger rate-overlimit.
let whatsappCommunityCheckCache = null;
let whatsappCommunityCheckInFlight = null;
let whatsappStatusGeneration = 0;

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
  return baileysRequest(path, { method, body });
}

/**
 * Never return a cached WhatsApp invite: an administrator can reset it at any time.
 * Refresh from the live bridge and clear the stored value whenever it cannot be verified.
 */
async function refreshCommunityInvite(group) {
  if (!group?.id || !group.external_group_id) return null;
  try {
    const status = await bridge("/status");
    if (status.connected !== true) throw new Error("WhatsApp bridge is disconnected.");
    const result = await bridge("/communities/" + encodeURIComponent(group.external_group_id) + "/invite-link");
    const candidate = typeof result.invite_link === "string" ? result.invite_link : "";
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.hostname !== "chat.whatsapp.com" || !parsed.pathname.slice(1)) {
      throw new Error("WhatsApp did not return a valid community invite link.");
    }
    const inviteLink = parsed.toString();
    await sb("whatsapp_groups?id=eq." + group.id, {
      method: "PATCH", body: JSON.stringify({ invite_link: inviteLink, updated_at: iso(new Date()) }),
      headers: { Prefer: "return=minimal" },
    });
    return inviteLink;
  } catch (error) {
    await sb("whatsapp_groups?id=eq." + group.id, {
      method: "PATCH", body: JSON.stringify({ invite_link: null, updated_at: iso(new Date()) }),
      headers: { Prefer: "return=minimal" },
    }).catch(() => {});
    console.warn("Live WhatsApp community invite unavailable; cached invite cleared:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

const digits = (value) => String(value || "").replace(/\D/g, "");
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
const iso = (date) => date.toISOString();

let whatsappImageBucketReady = false;
async function persistWhatsAppGroupImage(externalGroupId, objectKey) {
  try {
    const picture = await bridge('/groups/' + encodeURIComponent(externalGroupId) + '/profile-picture');
    const sourceUrl = typeof picture.profile_picture_url === 'string' ? picture.profile_picture_url : '';
    if (!sourceUrl) return null;
    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('WhatsApp profile image returned ' + response.status);
    const contentType = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : contentType === 'image/jpeg' ? 'jpg' : null;
    if (!extension) throw new Error('Unsupported WhatsApp profile image format.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error('WhatsApp profile image exceeds the 2 MB limit.');
    const bucket = 'whatsapp-group-images';
    if (!whatsappImageBucketReady) {
      const bucketResponse = await fetch(SUPABASE_URL + '/storage/v1/bucket', {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 2097152, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }),
      });
      if (!bucketResponse.ok && bucketResponse.status !== 409) {
        const detail = await bucketResponse.text();
        throw new Error('Could not prepare public image storage: ' + detail.slice(0, 180));
      }
      whatsappImageBucketReady = true;
    }
    const objectPath = objectKey + '.' + extension;
    const upload = await fetch(SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + objectPath, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': contentType, 'x-upsert': 'true' },
      body: bytes,
    });
    if (!upload.ok) throw new Error('Could not store WhatsApp profile image (' + upload.status + ').');
    return SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + objectPath;
  } catch (error) {
    console.warn('WhatsApp group image sync skipped:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

async function publicCommunities() {
  const [communities, groups] = await Promise.all([
    sb("communities?select=id,name,slug,description,status,image_url,whatsapp_community_id&status=eq.active&order=name.asc"),
    sb("whatsapp_groups?select=id,community_id,name,description,group_type,is_active,image_url&is_active=eq.true&order=name.asc"),
  ]);
  const data = communities.flatMap((community) => {
    const container = groups.find((group) => group.community_id === community.id && group.group_type === "community");
    const subgroups = groups.filter((group) => group.community_id === community.id && group.group_type === "subgroup");
    if (!container || subgroups.length === 0) return [];
    return [{
      id: community.id,
      slug: community.slug,
      name: community.name,
      description: community.description,
      purpose: community.description,
      image_url: community.image_url || container.image_url || null,
      subgroups: subgroups.map((group) => ({
        id: group.id,
        slug: group.id,
        name: group.name,
        description: group.description,
        image_url: group.image_url || null,
      })),
    }];
  });
  return { data };
}

async function publicPlan() {
  const [plans, communities] = await Promise.all([
    sb("plans?select=community_id,initial_price,renewal_price,duration_days,grace_days&is_active=eq.true&order=created_at.asc"),
    publicCommunities(),
  ]);
  // A plan is publicly selectable only when its community is actually visible
  // in the registration catalog (active root + at least one active subgroup).
  const visibleCommunityIds = new Set((communities.data || []).map((item) => item.id));
  const p = plans.find((plan) => visibleCommunityIds.has(plan.community_id));
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
      sb("communities?select=id,name,slug,description,influencer_name,status,archived_at,created_at&order=name.asc"),
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
      const main = memberships.find((membership)=>membership.member_id===member.id && groups.some((group)=>group.id===membership.whatsapp_group_id && group.group_type==="community" && group.community_id===sub.community_id));
      const communityAccess = main?.status === "joined" ? "joined" : main?.status === "removed" ? "removed" : main?.status === "failed" ? "failed" : main?.status === "removal_pending" ? "removal_pending" : "pending";
      return {...member,subscription_id:sub.id,community_name:communities.find((community)=>community.id===sub.community_id)?.name || "—",selected_subgroups:selected.map((membership)=>({name:groups.find((g)=>g.id===membership.whatsapp_group_id)?.name || "Grupo",status:membership.status})),community_access:communityAccess,subscription_status:sub.status || "sem_subscrição",expires_at:sub.expires_at || null,created_at:sub.created_at || member.created_at};
    })};
  }
  if (resource === "notifications") {
    const [rows,members] = await Promise.all([
      sb("notifications?select=id,member_id,notification_type,channel,message,status,sent_at,error_message,metadata,created_at&order=created_at.desc&limit=500"),
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
  // Supabase Auth users and public.users are separate identity stores. The
  // audit_logs.user_id FK targets public.users(id), never auth.users(id).
  let auditUserId = null;
  if (user?.email) {
    const mappedUsers = await sb("users?select=id&email=eq." + encodeURIComponent(String(user.email).trim()) + "&limit=1");
    auditUserId = mappedUsers?.[0]?.id || null;
  }
  const auditNewValues = user?.email && !auditUserId
    ? { ...(newValues && typeof newValues === "object" && !Array.isArray(newValues) ? newValues : {}), audit_actor_email: user.email, audit_actor_source: "supabase_auth" }
    : (newValues || null);
  await sb("audit_logs", {
    method: "POST",
    body: JSON.stringify([{ user_id: auditUserId, member_id: memberId, action, entity_type: entityType, entity_id: entityId, old_values: oldValues || null, new_values: auditNewValues }]),
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
    return { status: 201, body: { data: { ...community, plan: plans?.[0] || null }, message: "Comunidade criada. Associe a Comunidade do WhatsApp e os subgrupos antes de a publicar." } };
  } catch (error) {
    await sb("communities?id=eq." + community.id, { method: "PATCH", body: JSON.stringify({ status: "inactive" }), headers: { Prefer: "return=minimal" } });
    throw error;
  }
}

async function adminUpdateCommunity(communityId, body, user) {
  if (!isUuid(communityId)) return { status: 422, body: { message: "Identificador de comunidade inválido." } };
  const rows = await sb("communities?select=id,name,slug,description,influencer_name,status,archived_at&id=eq." + communityId + "&limit=1");
  const current = rows[0];
  if (!current) return { status: 404, body: { message: "Comunidade não encontrada." } };
  if (current.archived_at) return { status: 409, body: { message: "Esta comunidade está arquivada. Restaure-a antes de editar ou publicar." } };
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

async function adminArchiveCommunity(communityId, user) {
  if (!isUuid(communityId)) return { status: 422, body: { message: "Identificador de comunidade inválido." } };
  const rows = await sb("communities?select=id,name,status,archived_at,whatsapp_community_id&id=eq." + communityId + "&limit=1");
  const current = rows[0];
  if (!current) return { status: 404, body: { message: "Comunidade não encontrada." } };
  if (current.archived_at) return { status: 200, body: { message: "Esta comunidade já estava arquivada." } };
  try {
    const result = await sb("rpc/archive_whatsapp_community", { method:"POST", body:JSON.stringify({p_community_id:communityId}) });
    await writeAudit(user,"community.archived","community",communityId,current,{...result,archived_at:iso(new Date())});
    return { status:200, body:{message:"Comunidade removida do catálogo e dessincronizada. Subscrições, planos, membros e histórico foram preservados; nenhum membro foi removido do WhatsApp."} };
  } catch (error) {
    const message=error instanceof Error?error.message:"Não foi possível arquivar a comunidade.";
    return { status:message.includes("não encontrada")?404:409, body:{message} };
  }
}

async function adminRestoreCommunity(communityId,user) {
  if(!isUuid(communityId))return {status:422,body:{message:"Identificador de comunidade inválido."}};
  const rows=await sb("communities?select=id,name,status,archived_at&id=eq."+communityId+"&limit=1");
  const current=rows[0];
  if(!current)return {status:404,body:{message:"Comunidade não encontrada."}};
  if(!current.archived_at)return {status:200,body:{message:"A comunidade já está disponível. Associe e sincronize novamente os grupos WhatsApp."}};
  const patch={archived_at:null,status:"inactive",updated_at:iso(new Date())};
  await sb("communities?id=eq."+communityId,{method:"PATCH",body:JSON.stringify(patch),headers:{Prefer:"return=minimal"}});
  await writeAudit(user,"community.restored","community",communityId,current,patch);
  return {status:200,body:{message:"Comunidade restaurada como privada. Volte a associar e sincronizar a Comunidade WhatsApp; os grupos antigos continuam arquivados."}};
}

async function adminRemoveWhatsAppGroup(groupId,user) {
  if(!isUuid(groupId))return {status:422,body:{message:"Identificador de grupo inválido."}};
  const rows=await sb("whatsapp_groups?select=id,name,community_id,group_type,is_active,sync_status,external_group_id&id=eq."+groupId+"&limit=1");
  const current=rows[0];
  if(!current)return {status:404,body:{message:"Grupo não encontrado."}};
  if(current.sync_status==="removed")return {status:200,body:{message:"Este grupo já estava removido do catálogo."}};
  try {
    const result=await sb("rpc/archive_whatsapp_group",{method:"POST",body:JSON.stringify({p_group_id:groupId})});
    await writeAudit(user,"whatsapp_group.removed_from_catalog","whatsapp_group",groupId,current,result);
    return {status:200,body:{message:"Grupo removido do catálogo e dessincronizado de forma segura. O grupo real, os membros e o histórico no WhatsApp foram preservados."}};
  } catch(error) {
    const message=error instanceof Error?error.message:"Não foi possível remover o grupo.";
    return {status:message.includes("não encontrado")?404:409,body:{message}};
  }
}

async function adminRestoreWhatsAppGroup(groupId,user) {
  if(!isUuid(groupId))return {status:422,body:{message:"Identificador de grupo inválido."}};
  const rows=await sb("whatsapp_groups?select=id,name,community_id,sync_status&id=eq."+groupId+"&limit=1");
  const current=rows[0];
  if(!current)return {status:404,body:{message:"Grupo não encontrado."}};
  const community=await sb("communities?select=id,archived_at&id=eq."+current.community_id+"&limit=1");
  if(!community[0]||community[0].archived_at)return {status:409,body:{message:"Restaure primeiro a comunidade associada."}};
  if(current.sync_status!=="removed")return {status:200,body:{message:"O grupo já não está marcado como removido."}};
  const patch={is_active:false,sync_status:"disabled",invite_link:null,updated_at:iso(new Date())};
  await sb("whatsapp_groups?id=eq."+groupId,{method:"PATCH",body:JSON.stringify(patch),headers:{Prefer:"return=minimal"}});
  await writeAudit(user,"whatsapp_group.restored_to_catalog","whatsapp_group",groupId,current,patch);
  return {status:200,body:{message:"Registo restaurado como oculto. Sincronize novamente ou disponibilize-o após confirmar a associação WhatsApp."}};
}

async function adminUpdateGroup(groupId, body, user) {
  if (!isUuid(groupId)) return { status: 422, body: { message: "Identificador de grupo inválido." } };
  const rows = await sb("whatsapp_groups?select=id,community_id,name,group_type,is_active,sync_status,external_group_id,linked_parent_id&id=eq." + groupId + "&limit=1");
  const current = rows[0];
  if (!current) return { status: 404, body: { message: "Grupo não encontrado." } };
  if (current.sync_status === "removed") return { status: 409, body: { message: "Este grupo foi removido do catálogo. Restaure-o antes de editar." } };
  const communityId = body.community_id === undefined ? current.community_id : body.community_id;
  if (!isUuid(communityId)) return { status: 422, body: { message: "Escolha uma comunidade válida." } };
  const communities = await sb("communities?select=id,archived_at&id=eq." + communityId + "&limit=1");
  if (communities[0]?.archived_at) return { status: 409, body: { message: "Não é possível associar grupos a uma comunidade arquivada." } };
  if (!communities.length) return { status: 404, body: { message: "Comunidade não encontrada." } };
  const groupType = body.group_type === undefined ? current.group_type : body.group_type;
  const isActive = body.is_active === undefined ? current.is_active : body.is_active;
  if (!["community", "subgroup"].includes(groupType) || typeof isActive !== "boolean") return { status: 422, body: { message: "Escolha se este registo representa a Comunidade ou um subgrupo." } };
  if (!current.external_group_id) return { status: 409, body: { message: "Este registo ainda não está sincronizado com o WhatsApp." } };
  if (current.group_type === "community" && groupType !== "community") return { status: 409, body: { message: "O contentor da Comunidade WhatsApp não pode ser convertido num subgrupo." } };
  if (groupType === "community" && current.linked_parent_id) return { status: 422, body: { message: "Só uma Comunidade WhatsApp detetada como contentor pode ser marcada como Comunidade principal." } };
  if (groupType === "subgroup" && current.linked_parent_id) {
    const parentRows = await sb("whatsapp_groups?select=community_id,group_type&external_group_id=eq." + encodeURIComponent(current.linked_parent_id) + "&group_type=eq.community&limit=1");
    if (!parentRows[0] || parentRows[0].community_id !== communityId) return { status: 409, body: { message: "Este subgrupo pertence a outra Comunidade WhatsApp. Associe-o à mesma comunidade da plataforma que o contentor principal." } };
  }
  if (groupType === "community") {
    const duplicates = await sb("whatsapp_groups?select=id&community_id=eq." + communityId + "&group_type=eq.community&id=neq." + groupId + "&limit=1");
    if (duplicates.length) return { status: 409, body: { message: "Esta comunidade da plataforma já tem uma Comunidade WhatsApp associada." } };
  }
  const patch = { community_id: communityId, group_type: groupType, is_active: isActive, updated_at: iso(new Date()) };
  await sb("whatsapp_groups?id=eq." + groupId, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=minimal" } });
  if (current.group_type === "community" && (groupType !== "community" || current.community_id !== communityId)) {
    await sb("communities?id=eq." + current.community_id, {
      method: "PATCH", body: JSON.stringify({ whatsapp_community_id: null, image_url: null, updated_at: iso(new Date()) }),
      headers: { Prefer: "return=minimal" },
    });
  }
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
    whatsapp: { status: waStatus === "connected" ? "connected" : waStatus === "error" ? "error" : "disconnected", adapter: "baileys", last_seen_at: connection?.last_connected_at || null },
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
  const [members, subscriptions, memberships, groups, communities, operations] = await Promise.all([
    sb("members?select=id,full_name,phone,phone_e164,email,province,city,status,created_at&order=created_at.desc"),
    sb("subscriptions?select=member_id,community_id,status,expires_at,grace_ends_at&order=created_at.desc"),
    sb("group_memberships?select=member_id,whatsapp_group_id,status,joined_at"),
    sb("whatsapp_groups?select=id,name,community_id,group_type,is_active"),
    sb("communities?select=id,name"),
    sb("access_operations?select=member_id,whatsapp_group_id,operation_type,status,idempotency_key"),
  ]);
  const latestSub = new Map();
  for (const s of subscriptions) if (!latestSub.has(s.member_id)) latestSub.set(s.member_id,s);
  const membershipsByMember = new Map();
  for (const membership of memberships) {
    const list = membershipsByMember.get(membership.member_id) || [];
    list.push(membership);
    membershipsByMember.set(membership.member_id, list);
  }
  let rows = members.map((m) => {
    const sub = latestSub.get(m.id);
    const due = sub?.expires_at || null;
    const communityGroup = groups.find((group) => group.community_id === sub?.community_id && group.group_type === "community" && group.is_active);
    const communityMembership = communityGroup
      ? (membershipsByMember.get(m.id) || []).find((membership) => membership.whatsapp_group_id === communityGroup.id)
      : null;
    const communityOperationFailed = communityGroup && operations.some((operation) =>
      operation.member_id === m.id &&
      operation.whatsapp_group_id === communityGroup.id &&
      operation.operation_type === "add" &&
      operation.status === "failed" &&
(String(operation.idempotency_key || "").startsWith("renewal-add:") || String(operation.idempotency_key || "").startsWith("registration-add:"))
    );
    let accessStatus = "none";
    if (communityMembership?.status === "joined") accessStatus = "active";
    else if (communityMembership?.status === "removal_pending") accessStatus = "removal_pending";
    else if (communityMembership?.status === "removed") accessStatus = "removed";
    else if (communityOperationFailed) accessStatus = "failed";
    else if (communityMembership?.status === "pending_invitation" || communityMembership?.status === "invited") accessStatus = "pending";
    else if (communityMembership?.status === "failed") accessStatus = "failed";
    const daysRemaining = due ? Math.max(0, Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)) : 0;
    const graceDaysRemaining = sub?.grace_ends_at ? Math.max(0, Math.ceil((new Date(sub.grace_ends_at).getTime() - Date.now()) / 86400000)) : 0;
    return {
      id: m.id, full_name: m.full_name, whatsapp: m.phone_e164 || m.phone, email: m.email,
      province: m.province || "", city: m.city || "", registered_at: m.created_at,
      subscription_status: !sub ? null : (sub.grace_ends_at && new Date(sub.grace_ends_at).getTime() < Date.now() ? "expired" : (sub.expires_at && new Date(sub.expires_at).getTime() <= Date.now() ? "grace_period" : sub.status)),
      due_at: due,
      days_remaining: daysRemaining,
      grace_days_remaining: graceDaysRemaining,
      access_status: accessStatus,
      community_name: communities.find((community)=>community.id===sub?.community_id)?.name || "—",
      community_joined_at: communityMembership?.status === "joined" ? communityMembership.joined_at || null : null,
      groups: (membershipsByMember.get(m.id) || [])
        .filter((membership)=>groups.some((group)=>group.id===membership.whatsapp_group_id && group.community_id===sub?.community_id && group.group_type==="subgroup"))
        .map((membership)=>({
          id:membership.whatsapp_group_id,
          name:groups.find((group)=>group.id===membership.whatsapp_group_id)?.name || "Grupo",
          status:membership.status,
          joined_at:membership.joined_at || null,
        })),
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
    sb("payments?select=id,member_id,subscription_id,amount,currency,status,payment_reference,payment_type,provider,provider_reference,created_at,paid_at,rejection_reason,metadata&order=created_at.desc&limit=500"),
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
  // Renewal restores the parent Community only. Members choose their subgroups again inside WhatsApp.
  const communityGroups=await sb("whatsapp_groups?select=id&community_id=eq."+sub.community_id+"&group_type=eq.community");
  const communityGroupIds=communityGroups.map((group)=>group.id);
  const memberships=communityGroupIds.length
    ? await sb("group_memberships?select=id,whatsapp_group_id,status&member_id=eq."+member.id+"&whatsapp_group_id=in.("+communityGroupIds.join(",")+")")
    : [];
  const phone=digits(member.phone_e164 || member.phone);
  let waConnected=false;
  try { waConnected=(await bridge("/status")).connected===true; } catch {}
  for(const membership of memberships){
    if(membership.status==="joined") continue;
    const operationKey="renewal-add:"+payment.id+":"+membership.whatsapp_group_id;
    const existingOps=await sb("access_operations?select=id,status,attempts&idempotency_key=eq."+encodeURIComponent(operationKey)+"&limit=1");
    let operation=existingOps[0];
    if(!operation){
      const createdOps=await sb("access_operations",{method:"POST",body:JSON.stringify([{member_id:member.id,whatsapp_group_id:membership.whatsapp_group_id,operation_type:"add",status:"queued",idempotency_key:operationKey,attempts:0}]),headers:{Prefer:"return=representation"}});
      operation=createdOps[0];
    }
    await sb("group_memberships?id=eq."+membership.id,{method:"PATCH",body:JSON.stringify({status:"pending_invitation",updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
    const groupRows=await sb("whatsapp_groups?select=external_group_id,group_type&id=eq."+membership.whatsapp_group_id+"&limit=1");
    const externalGroupId=groupRows[0]?.external_group_id;
    if(!waConnected || !phone || !externalGroupId){
      await sb("access_operations?id=eq."+operation.id,{method:"PATCH",body:JSON.stringify({status:"retry_pending",last_error:!waConnected?"WhatsApp desconectado; a reentrada será tentada novamente.":!phone?"Número WhatsApp inválido.":"Identificador externo do grupo indisponível.",next_retry_at:iso(new Date(now.getTime()+15*60*1000)),updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
      continue;
    }
    const attempt=Number(operation.attempts || 0)+1;
    await sb("access_operations?id=eq."+operation.id,{method:"PATCH",body:JSON.stringify({status:"processing",attempts:attempt,updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
    try{
      await bridge(groupRows[0]?.group_type==="community"?"/communities/"+encodeURIComponent(externalGroupId)+"/participants/add":"/groups/"+encodeURIComponent(externalGroupId)+"/participants/add","POST",{phone});
      // The Baileys response only means that WhatsApp accepted the request.
      // The signed participant event (or a live snapshot) is the only source
      // allowed to mark this membership as joined.
      await sb("access_operations?id=eq."+operation.id,{method:"PATCH",body:JSON.stringify({status:"retry_pending",last_error:"Pedido submetido; a aguardar confirmação real do participante no WhatsApp.",next_retry_at:iso(new Date(now.getTime()+15*60*1000)),updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
    }catch(error){
      const message=error instanceof Error?error.message.slice(0,300):"WhatsApp addition failed";
      await sb("access_operations?id=eq."+operation.id,{method:"PATCH",body:JSON.stringify({status:"retry_pending",last_error:message,next_retry_at:iso(new Date(now.getTime()+15*60*1000)),updated_at:iso(now)}),headers:{Prefer:"return=minimal"}});
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
  // Keep its platform anchor on the community being synchronized, not on an archived predecessor.
  const rows = await sb("whatsapp_connections?select=id,community_id&name=eq.Encontre%20%2B%20Principal&order=created_at.asc&limit=1");
  const now = iso(new Date());
  if (rows[0]) {
    const patch = { community_id: communityId, connection_status: status, updated_at: now };
    if (status === "connected") {
      patch.last_connected_at = now;
      patch.last_error = null;
    }
    if (status === "disconnected") patch.last_disconnected_at = now;
    await sb("whatsapp_connections?id=eq." + rows[0].id, { method:"PATCH", body: JSON.stringify(patch), headers: { Prefer:"return=minimal" } });
    return rows[0].id;
  }
  const created = await sb("whatsapp_connections", { method:"POST", body:JSON.stringify({community_id:communityId,name:"Encontre + Principal",provider:"baileys",connection_status:status,last_connected_at:status==="connected"?now:null,last_disconnected_at:status==="disconnected"?now:null}), headers:{Prefer:"return=representation"} });
  return created[0].id;
}

async function syncAllWhatsApp() {
  const associations = await sb("communities?select=id,whatsapp_community_id&whatsapp_community_id=not.is.null&order=name.asc");
  if (!associations.length) {
    return { status: 409, body: { message: "Ainda não existe uma Comunidade WhatsApp associada. Abra Comunidades e grupos WhatsApp e faça a primeira sincronização." } };
  }
  const total = { communities_synced: 0, groups_imported: 0, subgroups_imported: 0, contacts_imported: 0, participants_skipped: 0 };
  for (const association of associations) {
    if (!association.whatsapp_community_id) continue;
    const result = await syncWhatsApp(association.id, association.whatsapp_community_id);
    total.communities_synced += Number(result.communities_imported || 0);
    total.groups_imported += Number(result.groups_imported || 0);
    total.subgroups_imported += Number(result.subgroups_imported || 0);
    total.contacts_imported += Number(result.contacts_imported || 0);
    total.participants_skipped += Number(result.participants_skipped || 0);
  }
  return { status: 200, body: total };
}

async function syncWhatsApp(communityId, whatsappCommunityId) {
  const [platformRows, sourceResult] = await Promise.all([
    sb("communities?select=id,name,whatsapp_community_id,archived_at&id=eq." + communityId + "&limit=1"),
    bridge("/communities"),
  ]);
  const platformCommunity = platformRows[0];
  const source = (sourceResult.communities || []).find((item) => item.id === whatsappCommunityId);
  if (!platformCommunity) throw new Error("Comunidade da plataforma não encontrada.");
  if (platformCommunity.archived_at) throw new Error("Esta comunidade da plataforma está arquivada. Restaure-a antes de sincronizar.");
  if (!source) throw new Error("A Comunidade WhatsApp selecionada já não está disponível na conta ligada.");
  if (source.admin_status !== "admin" && source.admin_status !== "not_admin") {
    const detail = source.admin_check_error ? " Detalhe: " + String(source.admin_check_error).slice(0, 240) : "";
    throw new Error("Não foi possível confirmar as permissões administrativas desta Comunidade WhatsApp. A consulta de metadados ou a identificação PN/LID não foi concluída; a sincronização foi bloqueada por segurança." + detail);
  }
  if (source.admin_status === "admin" && source.isAdmin !== true) {
    throw new Error("O backend devolveu estados contraditórios para as permissões da Comunidade WhatsApp. A sincronização foi bloqueada por segurança.");
  }
  if (source.admin_status === "not_admin") throw new Error("A conta WhatsApp ligada foi identificada como participante sem permissões de administração desta Comunidade. Confirme a função da conta no WhatsApp antes de sincronizar.");
  if (platformCommunity.whatsapp_community_id && platformCommunity.whatsapp_community_id !== source.id) throw new Error("Esta comunidade da plataforma já está associada a outra Comunidade WhatsApp.");
  const connectionId = await ensureConnection(communityId, "connected");
  let groupsImported = 0, contactsImported = 0, skipped = 0;
  const chunk = (items, size = 150) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
  const existingContainer = await sb("whatsapp_groups?select=id,is_active,community_id,image_url,sync_status&whatsapp_connection_id=eq." + encodeURIComponent(connectionId) + "&external_group_id=eq." + encodeURIComponent(source.id) + "&limit=1");
  if (existingContainer[0]?.sync_status === "removed") throw new Error("Esta Comunidade WhatsApp pertence a uma configuração antiga arquivada e mantém histórico de membros/subscrições. O mesmo ID não pode ser reutilizado automaticamente noutra comunidade, porque isso pode misturar acessos antigos e novos. Para esta comunidade da plataforma, escolha uma Comunidade WhatsApp realmente nova (com ID diferente) ou restaure a comunidade original.");
  if (existingContainer[0] && existingContainer[0].community_id !== communityId) throw new Error("Esta Comunidade WhatsApp já está associada a outra comunidade da plataforma.");
  // Validate every subgroup before writing the community root. This prevents a
  // partial sync if one of the WhatsApp groups was previously archived.
  const existingSubgroups = new Map();
  for (const group of source.subgroups || []) {
    const rows = await sb("whatsapp_groups?select=id,is_active,community_id,image_url,sync_status&whatsapp_connection_id=eq." + encodeURIComponent(connectionId) + "&external_group_id=eq." + encodeURIComponent(group.id) + "&limit=1");
    if (rows[0]?.sync_status === "removed") throw new Error("O grupo WhatsApp " + (group.subject || group.id) + " pertence a uma configuração antiga arquivada e mantém histórico de membros/subscrições. O mesmo ID não pode ser reutilizado automaticamente noutra comunidade, para não misturar acessos antigos e novos. Utilize um grupo WhatsApp realmente novo (com ID diferente) ou restaure a configuração original.");
    if (rows[0] && rows[0].community_id !== communityId) throw new Error("O subgrupo " + (group.subject || group.id) + " já está associado a outra comunidade da plataforma.");
    existingSubgroups.set(group.id, rows[0] || null);
  }
  const communityImage = await persistWhatsAppGroupImage(source.id, communityId + '/community');
  const communityImageUrl = communityImage || existingContainer[0]?.image_url || source.profile_picture_url || null;
  if (existingContainer[0] && existingContainer[0].community_id !== communityId) throw new Error("Esta Comunidade WhatsApp já está associada a outra comunidade da plataforma.");
  const containerRows = await sb("whatsapp_groups?on_conflict=whatsapp_connection_id,external_group_id", {
    method: "POST",
    body: JSON.stringify([{
      community_id: communityId, whatsapp_connection_id: connectionId, external_group_id: source.id,
      name: source.subject || platformCommunity.name, description: source.description || null, group_type: "community",
      invite_link: source.invite_link || null, image_url: communityImageUrl, linked_parent_id: null,
      is_active: existingContainer[0]?.is_active ?? false, sync_status: "synced",
    }]),
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
  });
  if (!containerRows[0]?.id) throw new Error("O Supabase não confirmou a Comunidade WhatsApp.");
  await sb("communities?id=eq." + communityId, {
    method: "PATCH",
    body: JSON.stringify({ whatsapp_community_id: source.id, image_url: communityImageUrl, updated_at: iso(new Date()) }),
    headers: { Prefer: "return=minimal" },
  });
  groupsImported++;
  for (const group of source.subgroups || []) {
    const existingRow = existingSubgroups.get(group.id);
    const subgroupImage = await persistWhatsAppGroupImage(group.id, communityId + '/' + group.id);
    const subgroupImageUrl = subgroupImage || existingRow?.image_url || group.profile_picture_url || null;
    let inviteLink = null;
    try { inviteLink = (await bridge("/groups/" + encodeURIComponent(group.id) + "/invite-link")).invite_link || null; } catch { /* optional; requires admin role */ }
    const stored = await sb("whatsapp_groups?on_conflict=whatsapp_connection_id,external_group_id", {
      method: "POST",
      body: JSON.stringify([{
        community_id: communityId, whatsapp_connection_id: connectionId, external_group_id: group.id,
        name: group.subject || "Grupo WhatsApp", description: group.description || null, group_type: "subgroup",
        invite_link: inviteLink, image_url: subgroupImageUrl, linked_parent_id: group.linked_parent_id || source.id,
        is_active: existingRow?.is_active ?? false, sync_status: "synced",
      }]),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    });
    const dbGroup = stored[0];
    if (!dbGroup?.id) throw new Error("O Supabase não confirmou o subgrupo " + (group.subject || group.id));
    groupsImported++;
    const participants = await bridge("/groups/" + encodeURIComponent(group.id) + "/participants");
    const valid = [];
    for (const participant of participants.participants || []) {
      const jid = String(participant.jid || participant.id || "");
      if (!jid.endsWith("@s.whatsapp.net")) { skipped++; continue; }
      const phone = digits(jid.split("@")[0].split(":")[0]);
      if (!/^\d{8,15}$/.test(phone)) { skipped++; continue; }
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


function verifyKursinhaSignature(rawBody, header) {
  if (!KURSINHA_SECRET || !header) return false;
  const expected = "sha256=" + createHmac("sha256", KURSINHA_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(String(header)), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a,b);
}

async function resolveKursinhaPayment(data, saleId, event) {
  const bySale = await sb("payments?select=id,member_id,subscription_id,amount,status,payment_type,payment_reference,provider_reference,metadata,created_at&provider=eq.kursinha&provider_reference=eq."+encodeURIComponent(saleId)+"&limit=1");
  if (bySale[0]) return bySale[0];
  const phone = digits(data?.buyer?.phone);
  let members = [];
  if (/^\d{8,15}$/.test(phone)) {
    members = await sb("members?select=id,phone_e164,phone,email&phone_e164=eq."+encodeURIComponent(phone)+"&limit=2");
  }
  if (!members.length && data?.buyer?.email) {
    members = await sb("members?select=id,phone_e164,phone,email&email=ilike."+encodeURIComponent(String(data.buyer.email).trim())+"&limit=2");
  }
  if (members.length !== 1) throw new Error(members.length ? "Kursinha buyer identity matches multiple Encontre+ members." : "No Encontre+ member matches the Kursinha buyer phone or email.");
  const member = members[0];
  const subs = await sb("subscriptions?select=id,member_id,community_id,plan_id,status,starts_at,expires_at,grace_ends_at&member_id=eq."+member.id+"&order=created_at.desc&limit=100");
  if (!subs.length) throw new Error("No Encontre+ subscription matches the Kursinha buyer.");
  const subIds = new Set(subs.map((sub)=>sub.id));
  const pendingRows = await sb("payments?select=id,member_id,subscription_id,amount,status,payment_type,payment_reference,provider_reference,metadata,created_at&member_id=eq."+member.id+"&provider=eq.kursinha&payment_type=eq.renewal&status=in.(initiated,pending,under_review)&order=created_at.desc&limit=100");
  const pendingMatches = pendingRows.filter((payment)=>subIds.has(payment.subscription_id));
  if (pendingMatches.length === 1) return pendingMatches[0];
  if (pendingMatches.length > 1) throw new Error("Multiple pending community renewals match this phone; refusing to assign the sale to the wrong community.");
  const eligible = subs.filter((sub)=>["active","grace_period","expired","cancelled"].includes(sub.status));
  if (eligible.length !== 1) throw new Error("The buyer has multiple community subscriptions and this Kursinha sale cannot be safely assigned.");
  const sub = eligible[0];
  const created = await sb("payments",{
    method:"POST",
    body:JSON.stringify([{member_id:member.id,subscription_id:sub.id,amount:1000,currency:"AOA",payment_type:"renewal",provider:"kursinha",provider_reference:saleId,payment_reference:"KUR-"+String(saleId).replace(/[^a-zA-Z0-9_-]/g,"").slice(-24),idempotency_key:"kursinha:"+saleId,status:event==="sale.cancelled"?"cancelled":"pending",metadata:{product_id:KURSINHA_PRODUCT_ID,checkout_url:KURSINHA_CHECKOUT_URL,sale_id:saleId,order_id:data?.orderId || null,buyer_id:data?.buyer?.id || null}}]),
    headers:{Prefer:"return=representation"},
  });
  return created[0];
}
async function handleKursinhaWebhook(request) {
  if (!KURSINHA_SECRET) return json(503,{message:"Webhook Kursinha ainda não está configurado no servidor."});
  const raw = await request.text();
  if (!verifyKursinhaSignature(raw,request.headers.get("x-webhook-signature"))) return json(401,{message:"Assinatura do webhook inválida."});
  let payload;
  try { payload=JSON.parse(raw); } catch { return json(400,{message:"JSON inválido."}); }
  const event=String(payload?.event || ""), data=payload?.data || {}, saleId=String(data.saleId || "");
  if (!["sale.pending","sale.approved","sale.cancelled"].includes(event) || !saleId) return json(400,{message:"Evento Kursinha inválido ou sem saleId."});
  if (String(data?.product?.id || "")!==KURSINHA_PRODUCT_ID || Number(data?.product?.price)!==1000 || String(data?.product?.currency || "")!=="AOA") {
    await sb("webhook_events?on_conflict=provider,external_event_id",{method:"POST",body:JSON.stringify([{provider:"kursinha",external_event_id:event+":"+saleId,event_type:event,payload,signature_valid:true,processing_status:"ignored",processed_at:iso(new Date())}]),headers:{Prefer:"resolution=ignore-duplicates,return=minimal"}});
    return json(200,{received:true,ignored:true});
  }
  const externalId=event+":"+saleId;
  const inserted=await sb("webhook_events?on_conflict=provider,external_event_id",{method:"POST",body:JSON.stringify([{provider:"kursinha",external_event_id:externalId,event_type:event,payload,signature_valid:true,processing_status:"processing"}]),headers:{Prefer:"resolution=ignore-duplicates,return=representation"}});
  let eventRow=inserted?.[0];
  if (!eventRow) {
    const rows=await sb("webhook_events?select=id,processing_status&provider=eq.kursinha&external_event_id=eq."+encodeURIComponent(externalId)+"&limit=1");
    eventRow=rows[0];
    if (["processed","ignored","processing"].includes(eventRow?.processing_status)) return json(200,{received:true,duplicate:true});
    if (eventRow?.id) await sb("webhook_events?id=eq."+eventRow.id,{method:"PATCH",body:JSON.stringify({processing_status:"processing",payload,signature_valid:true}),headers:{Prefer:"return=minimal"}});
  }
  try {
    const payment=await resolveKursinhaPayment(data,saleId,event);
    if (!payment) throw new Error("Renewal payment could not be associated with an Encontre+ member.");
    const now=new Date(), nowIso=iso(now);
    const metadata={...(payment.metadata || {}),product_id:data?.product?.id,product_name:data?.product?.name || "Encontre +",sale_id:saleId,order_id:data?.orderId || null,buyer_id:data?.buyer?.id || null,transaction_id:data?.payment?.transactionId || null,payment_method:data?.payment?.method || null,last_event:event,last_event_timestamp:payload.timestamp || nowIso,checkout_url:KURSINHA_CHECKOUT_URL};
    if (event==="sale.pending") {
      if (!["paid","cancelled"].includes(payment.status)) {
        await sb("payments?id=eq."+payment.id,{method:"PATCH",body:JSON.stringify({provider:"kursinha",provider_reference:saleId,status:"pending",payment_method:data?.payment?.method || null,metadata,updated_at:nowIso}),headers:{Prefer:"return=minimal"}});
        await sb("audit_logs",{method:"POST",body:JSON.stringify([{member_id:payment.member_id,action:"renewal.payment_pending",entity_type:"payment",entity_id:payment.id,old_values:{status:payment.status},new_values:{status:"pending",sale_id:saleId,amount:1000,currency:"AOA"}}]),headers:{Prefer:"return=minimal"}});
      }
    } else if (event==="sale.approved") {
      if (payment.status!=="paid") {
        await sb("payments?id=eq."+payment.id,{method:"PATCH",body:JSON.stringify({provider:"kursinha",provider_reference:saleId,payment_method:data?.payment?.method || null,metadata,updated_at:nowIso}),headers:{Prefer:"return=minimal"}});
        const confirmed=await confirmRenewalPayment(payment.id);
        if (confirmed.status>=400) throw new Error(confirmed.body?.message || "Renewal activation failed.");
      }
    } else {
      const wasPaid=payment.status==="paid";
      await sb("payments?id=eq."+payment.id,{method:"PATCH",body:JSON.stringify({provider:"kursinha",provider_reference:saleId,status:"cancelled",payment_method:data?.payment?.method || null,metadata,updated_at:nowIso}),headers:{Prefer:"return=minimal"}});
      await sb("audit_logs",{method:"POST",body:JSON.stringify([{member_id:payment.member_id,action:"renewal.payment_cancelled",entity_type:"payment",entity_id:payment.id,old_values:{status:payment.status},new_values:{status:"cancelled",sale_id:saleId,was_paid:wasPaid}}]),headers:{Prefer:"return=minimal"}});
      if (wasPaid && payment.subscription_id) {
        const newerPaid=await sb("payments?select=id&subscription_id=eq."+payment.subscription_id+"&provider=eq.kursinha&payment_type=eq.renewal&status=eq.paid&created_at=gt."+encodeURIComponent(payment.created_at || nowIso)+"&limit=1");
        const subs=await sb("subscriptions?select=id,status,expires_at&id=eq."+payment.subscription_id+"&limit=1");
        const sub=subs[0];
        if (sub && !newerPaid.length) {
          await sb("subscriptions?id=eq."+sub.id,{method:"PATCH",body:JSON.stringify({status:"cancelled",grace_ends_at:nowIso,ended_at:nowIso,updated_at:nowIso}),headers:{Prefer:"return=minimal"}});
          await sb("audit_logs",{method:"POST",body:JSON.stringify([{member_id:payment.member_id,action:"subscription.cancelled_after_kursinha_refund",entity_type:"subscription",entity_id:sub.id,old_values:{status:sub.status,expires_at:sub.expires_at},new_values:{status:"cancelled",ended_at:nowIso,sale_id:saleId}}]),headers:{Prefer:"return=minimal"}});
        } else if (sub && newerPaid.length) {
          await sb("audit_logs",{method:"POST",body:JSON.stringify([{member_id:payment.member_id,action:"renewal.refund_did_not_revoke_newer_paid_access",entity_type:"subscription",entity_id:sub.id,old_values:{status:sub.status},new_values:{status:sub.status,newer_paid_payment_id:newerPaid[0].id,cancelled_sale_id:saleId}}]),headers:{Prefer:"return=minimal"}});
        }
      }
    }
    if (eventRow?.id) await sb("webhook_events?id=eq."+eventRow.id,{method:"PATCH",body:JSON.stringify({processing_status:"processed",processed_at:nowIso}),headers:{Prefer:"return=minimal"}});
    return json(200,{received:true,processed:true,event});
  } catch (error) {
    if (eventRow?.id) await sb("webhook_events?id=eq."+eventRow.id,{method:"PATCH",body:JSON.stringify({processing_status:"failed"}),headers:{Prefer:"return=minimal"}}).catch(()=>{});
    throw error;
  }
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

    if (path === "/webhooks/kursinha" && method === "POST") return await handleKursinhaWebhook(request);

    const publicRoute = (path === "/public/registrations" && method === "POST") || (path.startsWith("/public/registrations/") && method === "GET") || (path.startsWith("/public/registrations/") && path.endsWith("/renewal") && method === "POST");
    const user = await requireSuperAdmin(request);
    if (!publicRoute && !user) return json(401,{message:"Sessão inválida ou sem permissão de Super Admin."});

    if (path === "/admin/communities" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const result = await adminCreateCommunity(body, user);
      return json(result.status, result.body);
    }
    const communityRestore = path.match(/^\/admin\/communities\/([0-9a-f-]{36})\/restore$/i);
    if (communityRestore && method === "POST") {
      const result = await adminRestoreCommunity(communityRestore[1], user);
      return json(result.status, result.body);
    }
    const communityAction = path.match(/^\/admin\/communities\/([0-9a-f-]{36})$/i);
    if (communityAction && method === "DELETE") {
      const result = await adminArchiveCommunity(communityAction[1], user);
      return json(result.status, result.body);
    }
    if (communityAction && method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const result = await adminUpdateCommunity(communityAction[1], body, user);
      return json(result.status, result.body);
    }
    if (path === "/admin/dashboard" && method === "GET") return json(200,await adminDashboard());
    const resourceMatch = path.match(/^\/admin\/resources\/(subscriptions|audit|communities|access|registrations|notifications|plans|users|reports)$/);
    if (resourceMatch && method === "GET") return json(200,await adminResource(resourceMatch[1]));
    const manualRemove = path.match(/^\/admin\/members\/([0-9a-f-]{36})\/remove$/i);
    if (manualRemove && method === "POST") {
      const memberId = manualRemove[1];
      const [memberRows, subs] = await Promise.all([
        sb("members?select=id,full_name,phone,phone_e164&id=eq." + memberId + "&limit=1"),
        sb("subscriptions?select=id,community_id,status,expires_at,grace_ends_at&member_id=eq." + memberId + "&order=created_at.desc&limit=1"),
      ]);
      const member = memberRows[0];
      const subscription = subs[0];
      if (!member) return json(404,{message:"Membro não encontrado."});
      if (!subscription) return json(409,{message:"Este membro não tem uma subscrição para revogar."});
      const phone = digits(member.phone_e164 || member.phone);
      if (!/^\d{8,15}$/.test(phone)) return json(409,{message:"O número WhatsApp deste membro não é válido. Corrija o contacto antes de revogar o acesso."});
      const now = iso(new Date());
      await sb("subscriptions?id=eq." + subscription.id, {
        method:"PATCH",
        body:JSON.stringify({status:"cancelled",grace_ends_at:now,ended_at:now,updated_at:now}),
        headers:{Prefer:"return=minimal"},
      });
      const groups = await sb("whatsapp_groups?select=id,external_group_id,group_type,is_active&community_id=eq." + subscription.community_id);
      const groupIds = groups.map((group) => group.id);
      const existingMemberships = groupIds.length
        ? await sb("group_memberships?select=id,whatsapp_group_id,status&member_id=eq." + memberId + "&whatsapp_group_id=in.(" + groupIds.join(",") + ")")
        : [];
      const membershipByGroup = new Map(existingMemberships.map((membership) => [membership.whatsapp_group_id, membership]));
      let queued = 0;
      for (const group of groups) {
        let membership = membershipByGroup.get(group.id);
        if (!membership) {
          const inserted = await sb("group_memberships", {
            method:"POST",
            body:JSON.stringify([{
              member_id:memberId,
              whatsapp_group_id:group.id,
              external_participant_id:phone+"@s.whatsapp.net",
              status:"removal_pending",
            }]),
            headers:{Prefer:"return=representation"},
          });
          membership = inserted[0];
        } else {
          await sb("group_memberships?id=eq." + membership.id, {
            method:"PATCH",
            body:JSON.stringify({
              status:"removal_pending",
              external_participant_id:phone+"@s.whatsapp.net",
              removed_at:null,
              updated_at:now,
            }),
            headers:{Prefer:"return=minimal"},
          });
        }
        const key = "manual-remove:" + subscription.id + ":" + group.id;
        const existing = await sb("access_operations?select=id&idempotency_key=eq." + encodeURIComponent(key) + "&limit=1");
        if (existing[0]) {
          await sb("access_operations?id=eq." + existing[0].id, {
            method:"PATCH",
            body:JSON.stringify({status:"queued",attempts:0,last_error:null,next_retry_at:null,updated_at:now}),
            headers:{Prefer:"return=minimal"},
          });
        } else {
          await sb("access_operations", {
            method:"POST",
            body:JSON.stringify([{
              member_id:memberId,
              whatsapp_group_id:group.id,
              operation_type:"remove",
              status:"queued",
              idempotency_key:key,
              attempts:0,
            }]),
            headers:{Prefer:"return=minimal"},
          });
        }
        queued++;
      }
      if (groupIds.length) {
        await sb("access_operations?member_id=eq." + memberId + "&whatsapp_group_id=in.(" + groupIds.join(",") + ")&operation_type=eq.add&status=in.(queued,retry_pending,processing)", {
          method:"PATCH",
          body:JSON.stringify({status:"cancelled",last_error:"Acesso revogado pelo Super Admin.",next_retry_at:null,updated_at:now}),
          headers:{Prefer:"return=minimal"},
        });
      }
      await writeAudit(user,"member.access_revoked_manually","subscription",subscription.id,
        {status:subscription.status,expires_at:subscription.expires_at,grace_ends_at:subscription.grace_ends_at},
        {status:"cancelled",grace_ends_at:now,removal_queued:true,groups_queued:queued},memberId);
      return json(202,{message:queued
        ? "Acesso revogado imediatamente na plataforma. A conta administradora está a remover o membro da Comunidade e dos subgrupos; o painel só marcará a remoção como concluída após confirmação do WhatsApp."
        : "Acesso revogado na plataforma. Não existem grupos activos associados a esta comunidade."});
    }
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
      try {
        const status = await bridge("/status");
        if (!status.connected) {
          whatsappStatusGeneration += 1;
          whatsappCommunityCheckCache = null;
          whatsappCommunityCheckInFlight = null;
          return json(200,status);
        }
        if (whatsappCommunityCheckCache && whatsappCommunityCheckCache.expiresAt > Date.now()) {
          return json(200,{...status,...whatsappCommunityCheckCache.value});
        }
        if (whatsappCommunityCheckInFlight) {
          const cachedValue = await whatsappCommunityCheckInFlight;
          return json(200,{...status,...cachedValue});
        }
        const generation = whatsappStatusGeneration;
        const checkPromise = (async()=>{
          try {
            const community = await bridge("/community");
            return {
              community_is_admin:community.isAdmin===true,
              community_is_owner:community.isOwner===true,
              community_account_role:community.accountRole||(community.isOwner===true?"owner":community.isAdmin===true?"admin":"member"),
              community_name:community.subject||null,
              community_check_error:null,
              community_diagnostics:null,
            };
          } catch (error) {
            let communityDiagnostics = null;
            try { communityDiagnostics = await bridge("/community/diagnostics"); }
            catch (diagnosticError) {
              communityDiagnostics = { diagnostic_error: diagnosticError instanceof Error ? diagnosticError.message : "Não foi possível obter o diagnóstico da comunidade." };
            }
            const candidates = Array.isArray(communityDiagnostics?.communities)
              ? communityDiagnostics.communities.map((item) => ({ id:item.id,subject:item.subject,participants:item.participantCount }))
              : [];
            const discoverySummary = communityDiagnostics
              ? " Diagnóstico WhatsApp: COMMUNITY_JID=" + (communityDiagnostics.configuredJid||"indisponível") +
                "; correspondência exata=" + (communityDiagnostics.exactMatch?.id||"não encontrada") +
                "; comunidades encontradas=" + JSON.stringify(candidates) +
                "; grupos participantes=" + (communityDiagnostics.groupCount??"indisponível") +
                "; comunidades na consulta dedicada=" + (communityDiagnostics.communityFetchCount??"indisponível") +
                "; grupos ligados ao JID configurado=" + (communityDiagnostics.linkedChildren?.length??"indisponível") +
                "; métodos Baileys=" + JSON.stringify(communityDiagnostics.methods||{}) +
                (communityDiagnostics.communityFetchError?"; erro da consulta dedicada="+communityDiagnostics.communityFetchError:"") +
                (communityDiagnostics.groupFetchError?"; erro dos grupos participantes="+communityDiagnostics.groupFetchError:"") +
                (communityDiagnostics.snapshotError?"; erro do snapshot="+communityDiagnostics.snapshotError:"") +
                (communityDiagnostics.diagnostic_error?"; erro do diagnóstico="+communityDiagnostics.diagnostic_error:"")
              : "";
            return {
              community_is_admin:null,
              community_is_owner:null,
              community_account_role:"unknown",
              community_name:null,
              community_check_error:(error instanceof Error?error.message:"Não foi possível validar a administração da comunidade principal.")+discoverySummary,
              community_diagnostics:communityDiagnostics,
            };
          }
        })();
        whatsappCommunityCheckInFlight = checkPromise;
        try {
          const value = await checkPromise;
          // Cache success for 30s and failed discovery for 60s to honour WhatsApp cooldowns.
          if (generation === whatsappStatusGeneration) whatsappCommunityCheckCache = { value, expiresAt:Date.now()+(value.community_check_error?60_000:30_000) };
          return json(200,{...status,...value});
        } finally {
          if (whatsappCommunityCheckInFlight === checkPromise) whatsappCommunityCheckInFlight = null;
        }
      } catch (error) {
        return json(503,{
          state:"unavailable",connected:false,has_qr:false,has_pairing_code:false,
          last_error:error instanceof Error?error.message:"Serviço WhatsApp indisponível.",
          code:"whatsapp_bridge_unavailable",
        });
      }
    }
    if (path === "/admin/whatsapp/groups" && method === "GET") {
      const [groups,memberships,members] = await Promise.all([
        sb("whatsapp_groups?select=id,name,description,external_group_id,group_type,sync_status,is_active,community_id,image_url,linked_parent_id&order=name.asc"),
        sb("group_memberships?select=member_id,whatsapp_group_id,status,external_participant_id"),
        sb("members?select=id,full_name,phone_e164,phone,email"),
      ]);
      const communityGroup = groups.find((group) => group.group_type === "community" && group.is_active && group.external_group_id);
      let communityParticipants = [];
      let communityParticipantsError = null;
      let communityParticipantsCheckedAt = null;
      let communityParticipantsAvailable = false;
      if (communityGroup) {
        // Stored group records remain visible while WhatsApp is waiting for pairing.
        // Only call the live participants endpoint after the service confirms an open session.
        try {
          const session = await bridge("/status");
          communityParticipantsAvailable = session.connected === true;
        } catch {
          communityParticipantsAvailable = false;
        }
      }
      if (communityGroup && communityParticipantsAvailable) {
        try {
          const live = await bridge("/communities/" + encodeURIComponent(communityGroup.external_group_id) + "/participants?fresh=true");
          communityParticipants = (live.participants || []).map((participant) => {
            const jid = String(participant.jid || participant.phoneNumber || participant.id || "");
            const phoneDigits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
            const person = phoneDigits
              ? members.find((member) => digits(member.phone_e164 || member.phone) === phoneDigits)
              : null;
            return {
              id: String(participant.id || jid),
              name: person?.full_name || "Participante WhatsApp",
              phone: phoneDigits ? "+" + phoneDigits : "Número não disponível",
              email: person?.email || null,
              admin: Boolean(participant.admin),
              registered: Boolean(person),
            };
          });
          communityParticipantsCheckedAt = iso(new Date());
        } catch (error) {
          communityParticipantsError = error instanceof Error ? error.message : "Não foi possível consultar os participantes no WhatsApp.";
        }
      }
      return json(200,{
        data:groups.map((g)=>({
          ...g,
          participants:memberships.filter((m)=>m.whatsapp_group_id===g.id && m.status==="joined").map((m)=>{
            const person=members.find((p)=>p.id===m.member_id);
            return person ? {id:person.id,name:person.full_name,phone:person.phone_e164 || person.phone,email:person.email,status:m.status} : null;
          }).filter(Boolean),
          participants_count:g.group_type==="community" && communityParticipantsCheckedAt
            ? communityParticipants.length
            : memberships.filter((m)=>m.whatsapp_group_id===g.id && m.status==="joined").length,
        })),
        community_participants:communityParticipants,
        community_participants_available:communityParticipantsAvailable,
        community_participants_error:communityParticipantsError,
        community_participants_checked_at:communityParticipantsCheckedAt,
      });
    }
    const groupRestore = path.match(/^\/admin\/whatsapp\/groups\/([0-9a-f-]{36})\/restore$/i);
    if (groupRestore && method === "POST") {
      const result = await adminRestoreWhatsAppGroup(groupRestore[1], user);
      return json(result.status, result.body);
    }
    const groupAction = path.match(/^\/admin\/whatsapp\/groups\/([0-9a-f-]{36})$/i);
    if (groupAction && method === "DELETE") {
      const result = await adminRemoveWhatsAppGroup(groupAction[1], user);
      return json(result.status, result.body);
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
      const result = await adminUpdateGroup(groupId, { group_type: body.group_type }, user);
      return json(result.status, result.body);
    }
    if (path === "/admin/whatsapp/connect" && method === "POST") { whatsappStatusGeneration+=1; whatsappCommunityCheckCache=null; whatsappCommunityCheckInFlight=null; return json(202,await bridge("/connect","POST",{})); }
    if (path === "/admin/whatsapp/qr" && method === "GET") return json(200,await bridge("/qr"));
    if (path === "/admin/whatsapp/pairing-code" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const phone = digits(body.phone);
      if (!/^\d{8,15}$/.test(phone)) return json(400,{message:"Introduza o número com indicativo do país."});
      return json(200,await bridge("/pairing-code","POST",{phone}));
    }
    if (path === "/admin/whatsapp/disconnect" && method === "POST") { whatsappStatusGeneration+=1; whatsappCommunityCheckCache=null; whatsappCommunityCheckInFlight=null; return json(200,await bridge("/disconnect","POST",{})); }
    if (path === "/admin/whatsapp/communities" && method === "GET") return json(200,await bridge("/communities"));
    if (path === "/admin/whatsapp/sync" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (!body.community_id && !body.whatsapp_community_id) {
        const result = await syncAllWhatsApp();
        return json(result.status, result.body);
      }
      const communityId = isUuid(body.community_id) ? body.community_id : null;
      const whatsappCommunityId = String(body.whatsapp_community_id || "");
      if (!communityId || !whatsappCommunityId.endsWith("@g.us")) return json(422,{message:"Escolha a comunidade da plataforma e a Comunidade do WhatsApp."});
      const result = await syncWhatsApp(communityId,whatsappCommunityId);
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
        sb("whatsapp_groups?select=id,name,community_id,external_group_id,group_type,is_active,image_url&id=in.("+subgroupIds.join(",")+")&is_active=eq.true&group_type=eq.subgroup"),
        sb("whatsapp_groups?select=id,name,external_group_id,group_type,is_active,image_url&community_id=eq."+body.community_id+"&is_active=eq.true&group_type=eq.community"),
        sb("plans?select=id,initial_price,renewal_price,duration_days,grace_days&community_id=eq."+body.community_id+"&is_active=eq.true&limit=1"),
      ]);
      if (!community.length || subgroups.length !== subgroupIds.length || subgroups.some((g)=>g.community_id !== body.community_id || !g.external_group_id) || !plans.length) return json(422,{message:"Comunidade, subgrupos ou plano indisponíveis. Todos os grupos escolhidos precisam estar sincronizados."});
      if (mainGroups.length !== 1 || !mainGroups[0].external_group_id) return json(409,{message:"Esta comunidade ainda não tem uma Comunidade WhatsApp associada e ativa. Contacte a equipa Encontre +."});
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
      if (previousSubs[0] && (["expired","cancelled","suspended","grace_period"].includes(previousSubs[0].status) || (previousSubs[0].expires_at && new Date(previousSubs[0].expires_at).getTime() <= now.getTime() + 3 * 86400000))) {
        if (Number(plan.renewal_price) !== 1000) return json(409,{message:"O plano de renovação não está configurado para 1.000 Kz."});
        if (!KURSINHA_PRODUCT_ID || !KURSINHA_CHECKOUT_URL) return json(503,{message:"O pagamento Kursinha ainda não está configurado."});
        const renewals = await sb("payments?select=id,status,payment_reference,amount,metadata,provider&subscription_id=eq."+subscriptionId+"&payment_type=eq.renewal&provider=eq.kursinha&order=created_at.desc&limit=50");
        const pendingRenewal = renewals.find((p)=>["initiated","pending","under_review"].includes(p.status));
        if (pendingRenewal) return json(200,{reference:subscriptionId,status:"pending_payment",payment:{reference:pendingRenewal.payment_reference,amount_kz:Number(pendingRenewal.amount),status:"pending",instructions:[],checkout_url:pendingRenewal.metadata?.checkout_url || KURSINHA_CHECKOUT_URL,proof_upload_enabled:false,proof_submitted_at:null}});
        const cycleKey = String(previousSubs[0]?.expires_at || "initial").replace(/[^0-9]/g,"");
        const referenceCode = "EN-R-" + crypto.randomUUID().slice(0,8).toUpperCase();
        const createdPayment = await sb("payments",{
          method:"POST",
          body:JSON.stringify([{member_id:member.id,subscription_id:subscriptionId,amount:1000,currency:"AOA",payment_type:"renewal",provider:"kursinha",status:"pending",payment_reference:referenceCode,idempotency_key:"renewal:"+subscriptionId+":"+cycleKey+":"+String(renewals.length+1),metadata:{product_id:KURSINHA_PRODUCT_ID,checkout_url:KURSINHA_CHECKOUT_URL}}]),
          headers:{Prefer:"return=representation"},
        });
        return json(201,{reference:subscriptionId,status:"pending_payment",payment:{reference:createdPayment[0].payment_reference,amount_kz:Number(createdPayment[0].amount),status:"pending",instructions:[],checkout_url:KURSINHA_CHECKOUT_URL,proof_upload_enabled:false,proof_submitted_at:null}});
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
      // The public registration endpoint never opens, reads or distributes a
      // WhatsApp invite. It only records authorised memberships as pending.
      // The scheduled registration-access worker adds each participant through
      // the linked administrator account and confirms them against WhatsApp.
      for (const target of targets) {
        const found = await sb("group_memberships?select=id,status,external_participant_id&member_id=eq."+member.id+"&whatsapp_group_id=eq."+target.group.id+"&limit=1");
        let membership = found[0];
        if (!membership) {
          const inserted = await sb("group_memberships", {
            method:"POST",
            body:JSON.stringify([{
              member_id:member.id,
              whatsapp_group_id:target.group.id,
              external_participant_id:phone+"@s.whatsapp.net",
              status:"pending_invitation",
            }]),
            headers:{Prefer:"return=representation"},
          });
          membership = inserted[0];
        } else if (membership.status !== "joined") {
          await sb("group_memberships?id=eq."+membership.id, {
            method:"PATCH",
            body:JSON.stringify({
              status:"pending_invitation",
              external_participant_id:phone+"@s.whatsapp.net",
              removed_at:null,
              updated_at:iso(now),
            }),
            headers:{Prefer:"return=minimal"},
          });
          membership.status = "pending_invitation";
        }
        // The database trigger queues the Community; the signed join RPC queues selected subgroups after confirmation.
        accessResults.push({
          id:target.group.id,
          name:target.group.name,
          kind:target.kind,
          status:membership.status === "joined" ? "joined" : "pending_invitation",
        });
      }
      const communityAccess = accessResults.find((item)=>item.kind==="community");
      const subgroupAccess = accessResults.filter((item)=>item.kind==="subgroup");
      const accessState = {
        community: communityAccess?.status || "pending_invitation",
        subgroups: subgroupAccess,
        community_invite_url: null,
        subgroup_invite_url: null,
        subgroup_invite_urls: [],
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
      const expiresAt = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
      if (!["expired","grace_period"].includes(sub.status) && expiresAt > Date.now() + 3 * 86400000) return json(409,{message:"A renovação estará disponível nos últimos 3 dias do acesso."});
      if (!KURSINHA_PRODUCT_ID || !KURSINHA_CHECKOUT_URL) return json(503,{message:"O pagamento Kursinha ainda não está configurado."});
      const renewals = await sb("payments?select=id,payment_reference,amount,status,metadata&subscription_id=eq."+sub.id+"&provider=eq.kursinha&payment_type=eq.renewal&order=created_at.desc&limit=50");
      const pending = renewals.find((p)=>["pending","under_review","initiated"].includes(p.status));
      if (pending) return json(200,{reference:sub.id,status:"pending",payment:{reference:pending.payment_reference,amount_kz:Number(pending.amount),status:"pending",instructions:[],checkout_url:pending.metadata?.checkout_url || KURSINHA_CHECKOUT_URL,proof_upload_enabled:false,proof_submitted_at:null}});
      const cycleKey = String(sub.expires_at || "initial").replace(/[^0-9]/g,"");
      const referenceCode = "EN-R-" + crypto.randomUUID().slice(0,8).toUpperCase();
      const idempotencyKey = "renewal:" + sub.id + ":" + cycleKey + ":" + String(renewals.length+1);
      const created = await sb("payments",{
        method:"POST",
        body:JSON.stringify([{
          member_id:sub.member_id,subscription_id:sub.id,amount:1000,currency:"AOA",payment_type:"renewal",
          provider:"kursinha",status:"pending",payment_reference:referenceCode,idempotency_key:idempotencyKey,
          metadata:{product_id:KURSINHA_PRODUCT_ID,checkout_url:KURSINHA_CHECKOUT_URL},
        }]),
        headers:{Prefer:"return=representation"},
      });
      return json(201,{reference:sub.id,status:"pending",payment:{reference:created[0].payment_reference,amount_kz:Number(created[0].amount),status:"pending",instructions:[],checkout_url:KURSINHA_CHECKOUT_URL,proof_upload_enabled:false,proof_submitted_at:null}});
    }
    if (path.startsWith("/public/registrations/") && method === "GET") {
      const reference = path.slice("/public/registrations/".length);
      const phone = digits(q.whatsapp);
      if (!isUuid(reference) || !/^\d{8,15}$/.test(phone)) return json(404,{message:"Inscrição não encontrada."});
      const subs = await sb("subscriptions?select=id,member_id,community_id,status,expires_at,created_at&id=eq."+reference+"&limit=1");
      const sub = subs[0];
      if (!sub) return json(404,{message:"Inscrição não encontrada."});
      const [members,communities,groups,memberships,payments,accessOperations] = await Promise.all([
        sb("members?select=id,full_name,phone_e164,phone,created_at&id=eq."+sub.member_id+"&limit=1"),
        sb("communities?select=id,name,slug&id=eq."+sub.community_id+"&limit=1"),
        sb("whatsapp_groups?select=id,name,group_type,external_group_id&community_id=eq."+sub.community_id+"&is_active=eq.true"),
        sb("group_memberships?select=whatsapp_group_id,status,joined_at,removed_at&member_id=eq."+sub.member_id+"&order=created_at.desc"),
        sb("payments?select=payment_reference,amount,status,created_at,paid_at,payment_type,provider,metadata&subscription_id=eq."+sub.id+"&order=created_at.desc&limit=1"),
        sb("access_operations?select=id,whatsapp_group_id,operation_type,status,last_error,next_retry_at,created_at&member_id=eq."+sub.member_id+"&operation_type=eq.add&order=created_at.desc&limit=20"),
      ]);
      const member = members[0], community = communities[0];
      if (!member || digits(member.phone_e164 || member.phone) !== phone || !community) return json(404,{message:"Inscrição não encontrada."});
      const selectedSubgroups = memberships
        .filter((m)=>groups.some((g)=>g.id===m.whatsapp_group_id && g.group_type==="subgroup"))
        .map((m)=>groups.find((g)=>g.id===m.whatsapp_group_id))
        .filter(Boolean);
      const mainGroup = groups.find((g)=>g.group_type==="community") || null;
      const communityMembership = mainGroup ? memberships.find((m)=>m.whatsapp_group_id===mainGroup.id) : null;
      const communityJoined = communityMembership?.status === "joined";
      const communityFailed = communityMembership?.status === "failed";
      const communityOperation = mainGroup ? accessOperations.find((op)=>op.whatsapp_group_id===mainGroup.id && op.operation_type==="add") : null;
      const retryError = String(communityOperation?.last_error || "").toLowerCase();
      const communityRetrying = !communityJoined && !communityFailed && (
        retryError.includes("rate-overlimit") || retryError.includes("limite do whatsapp")
      );
      const communityError = communityFailed
        ? (communityOperation?.last_error || "O WhatsApp não conseguiu confirmar a adição deste número.")
        : communityRetrying
          ? "O WhatsApp está a limitar temporariamente os pedidos. A plataforma vai tentar novamente automaticamente; não precisa de fazer outra inscrição."
          : null;
      let communityInviteUrl = null;
      if (communityJoined && mainGroup?.external_group_id) {
        try {
          const invite = await bridge(`/communities/${encodeURIComponent(mainGroup.external_group_id)}/invite-link`);
          communityInviteUrl = invite?.invite_link || null;
        } catch (error) {
          console.warn("[registration-status] community invite link unavailable", error?.message || error);
        }
      }
      const subgroupInviteUrls = [];
      const subgroupAccessReady = selectedSubgroups.length > 0 && selectedSubgroups.every((g)=>memberships.some((m)=>m.whatsapp_group_id===g.id && m.status==="joined"));
      const subgroupInvite = null;
      const subgroup = selectedSubgroups[0] || null;
      const latestPayment = payments[0];
      const payment = latestPayment ? {
        reference:latestPayment.payment_reference,amount_kz:Number(latestPayment.amount),
        status:latestPayment.status==="paid"?"confirmed":latestPayment.status==="rejected"?"rejected":latestPayment.status==="cancelled"?"cancelled":"pending",
        instructions:[],checkout_url:latestPayment.metadata?.checkout_url || null,proof_upload_enabled:false,proof_submitted_at:null,
      } : {reference:sub.id,amount_kz:0,status:"confirmed",instructions:[],checkout_url:null,proof_upload_enabled:false,proof_submitted_at:null};
      const isRenewalPayment = latestPayment?.payment_type === "renewal";
      const registrationStatus = latestPayment && !isRenewalPayment && ["pending","initiated","under_review"].includes(latestPayment.status) ? "pending_payment" : latestPayment?.status === "cancelled" && !isRenewalPayment ? "cancelled" : "approved";
      return json(200,{
        reference:sub.id,status:registrationStatus,full_name:member.full_name,created_at:sub.created_at,
        community:{name:community.name,slug:community.slug},
        subgroup:{name:subgroup?.name || "Subgrupo",slug:subgroup?.id || ""},
        subgroups:selectedSubgroups.map((g)=>({name:g.name,slug:g.id})),
        payment,
        subscription:{status:sub.status,due_at:sub.expires_at},
        access:{
          community:communityJoined ? "active" : communityFailed ? "failed" : communityRetrying ? "retrying" : "pending",
          community_joined_at:communityMembership?.joined_at || null,
          community_retry_at:communityRetrying ? communityOperation?.next_retry_at || null : null,
          community_error:communityError,
          subgroup:subgroupAccessReady ? "active" : "pending",
          community_invite_url:communityInviteUrl,
          subgroup_invite_url:null,
          subgroup_invite_urls:[],
          groups:selectedSubgroups.map((g)=>{
            const membership=memberships.find((m)=>m.whatsapp_group_id===g.id);
            return {id:g.id,name:g.name,status:membership?.status || "pending_invitation",joined_at:membership?.joined_at || null,removed_at:membership?.removed_at || null};
          }),
        },
        rejection_reason:null,
      });
    }
    return json(404,{message:"Endpoint não encontrado."});
  } catch (error) {
    const status = error.statusCode || 500;
    return json(status,{message:error.message || "Erro interno.",code:"integration_error"});
  }
};
