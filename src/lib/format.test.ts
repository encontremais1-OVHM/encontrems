import { describe, expect, it } from "vitest";

import { formatKz } from "./format";

describe("formatKz", () => {
  it("formats the 1.000 Kz membership price as whole Kwanza", () => {
    expect(formatKz(1000)).toBe("1.000 Kz");
  });

  it("never shows fractional Kwanza", () => {
    expect(formatKz(1000.75)).toBe("1.000 Kz");
  });

  it("shows a dash when the amount is unknown instead of inventing zero", () => {
    expect(formatKz(null)).toBe("—");
  });
});
