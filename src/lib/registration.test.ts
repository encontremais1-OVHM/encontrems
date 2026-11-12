import { describe, expect, it } from "vitest";

import type { RegistrationStatusResponse } from "./api/types";
import { normalizeAngolaWhatsapp } from "./phone";
import { inviteLinks } from "./registration";

function status(overrides: Partial<RegistrationStatusResponse> = {}): RegistrationStatusResponse {
  return {
    reference: "ENC-0001",
    status: "approved",
    full_name: "Teste",
    created_at: "2026-11-05T10:00:00+01:00",
    community: { name: "Negócios", slug: "negocios" },
    subgroup: { name: "Imobiliário", slug: "imobiliario" },
    payment: {
      reference: "PAY-1",
      amount_kz: 1000,
      status: "confirmed",
      instructions: [],
      checkout_url: null,
      proof_upload_enabled: false,
      proof_submitted_at: null,
    },
    subscription: { status: "active", due_at: null },
    access: {
      community: "active",
      subgroup: "active",
      community_invite_url: "https://chat.whatsapp.com/main",
      subgroup_invite_url: "https://chat.whatsapp.com/sub",
    },
    rejection_reason: null,
    ...overrides,
  };
}

describe("WhatsApp invite links", () => {
  it("hides links after WhatsApp confirms membership", () => {
    expect(inviteLinks(status())).toEqual({ community: null, subgroup: null, subgroups: [] });
  });

  it("shows invitations while both WhatsApp memberships are pending", () => {
    const links = inviteLinks(status({ access: {
      community: "pending",
      subgroup: "pending",
      community_invite_url: "https://chat.whatsapp.com/main",
      subgroup_invite_url: "https://chat.whatsapp.com/sub",
    } }));
    expect(links).toEqual({
      community: "https://chat.whatsapp.com/main",
      subgroup: "https://chat.whatsapp.com/sub",
      subgroups: [{ id: "subgroup", name: "Subgrupo", url: "https://chat.whatsapp.com/sub" }],
    });
  });

  it("hides links while the payment is not confirmed, even if the API sent them", () => {
    const s = status();
    s.payment!.status = "pending";
    expect(inviteLinks(s)).toEqual({ community: null, subgroup: null, subgroups: [] });
  });

  it("hides links when the subscription has expired", () => {
    expect(inviteLinks(status({ subscription: { status: "expired", due_at: null } }))).toEqual({
      community: null,
      subgroup: null,
      subgroups: [],
    });
  });

  it("keeps pending invitations available during the 5-day grace period", () => {
    const links = inviteLinks(status({
      subscription: { status: "grace_period", due_at: null },
      access: {
        community: "pending",
        subgroup: "pending",
        community_invite_url: "https://chat.whatsapp.com/main",
        subgroup_invite_url: "https://chat.whatsapp.com/sub",
      },
    }));
    expect(links.community).toBe("https://chat.whatsapp.com/main");
    expect(links.subgroup).toBe("https://chat.whatsapp.com/sub");
  });
});

describe("Angolan WhatsApp numbers", () => {
  it("accepts a local 9-digit mobile and returns 244 + number", () => {
    expect(normalizeAngolaWhatsapp("923 000 000")).toBe("244923000000");
  });

  it("accepts the +244 prefix", () => {
    expect(normalizeAngolaWhatsapp("+244 923 000 000")).toBe("244923000000");
  });

  it("rejects numbers that are not Angolan mobiles", () => {
    expect(normalizeAngolaWhatsapp("222 000 000")).toBeNull();
    expect(normalizeAngolaWhatsapp("92300")).toBeNull();
  });
});
