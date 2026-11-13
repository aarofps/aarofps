import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, createSession, verifySession } from "@/lib/auth";

describe("auth", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const h = await hashPassword("correct horse");
    expect(await verifyPassword(h, "correct horse")).toBe(true);
    expect(await verifyPassword(h, "wrong horse")).toBe(false);
  });
  it("accepts a session signed with the same secret only", async () => {
    const t = await createSession("s".repeat(32));
    expect(await verifySession(t, "s".repeat(32))).toBe(true);
    expect(await verifySession(t, "z".repeat(32))).toBe(false);
    expect(await verifySession("garbage", "s".repeat(32))).toBe(false);
  });
});
