import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

describe("crypto", () => {
  it("roundtrips", () => {
    expect(decrypt(encrypt("https://u:p@bridge/simplefin", KEY), KEY)).toBe("https://u:p@bridge/simplefin");
  });
  it("produces different ciphertext each time", () => {
    expect(encrypt("same", KEY)).not.toBe(encrypt("same", KEY));
  });
  it("throws with the wrong key", () => {
    expect(() => decrypt(encrypt("x", KEY), OTHER)).toThrow();
  });
  it("throws on a tampered blob", () => {
    const blob = Buffer.from(encrypt("secret", KEY), "base64");
    blob[blob.length - 1] ^= 1;
    expect(() => decrypt(blob.toString("base64"), KEY)).toThrow();
  });
  it("rejects a key that is not 64 hex chars", () => {
    expect(() => encrypt("x", "abc")).toThrow(/ENCRYPTION_KEY/);
  });
});
