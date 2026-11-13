import { describe, it, expect } from "vitest";
import { claimSetupToken, fetchAccounts, toCents, guessKind, SimplefinForbidden } from "@/lib/simplefin/client";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("claimSetupToken", () => {
  it("POSTs to the decoded claim URL and returns the access URL", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const f = (async (u: string, init?: RequestInit) => {
      calls.push([u, init]);
      return new Response("https://user:pass@bridge.example/simplefin\n");
    }) as typeof fetch;
    expect(await claimSetupToken(b64("https://bridge.example/claim/abc"), f)).toBe("https://user:pass@bridge.example/simplefin");
    expect(calls[0][0]).toBe("https://bridge.example/claim/abc");
    expect(calls[0][1]?.method).toBe("POST");
  });
  it("rejects tokens that don't decode to an https URL", async () => {
    await expect(claimSetupToken(b64("hello"), fetch)).rejects.toThrow(/not a SimpleFIN setup token/);
  });
  it("rejects a claim response without credentials", async () => {
    const f = (async () => new Response("nope")) as unknown as typeof fetch;
    await expect(claimSetupToken(b64("https://bridge.example/claim/abc"), f)).rejects.toThrow();
  });
  it("explains an already-claimed token", async () => {
    const f = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(claimSetupToken(b64("https://bridge.example/claim/abc"), f)).rejects.toThrow(/already claimed/);
  });
});

describe("fetchAccounts", () => {
  it("moves credentials into a Basic header and sends start-date, end-date and pending", async () => {
    let url = "", auth = "";
    const f = (async (u: string | URL, init?: RequestInit) => {
      url = String(u); auth = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ errors: ["e1"], errlist: [{ msg: "e2" }], accounts: [] });
    }) as typeof fetch;
    const r = await fetchAccounts("https://user:p%40ss@bridge.example/simplefin", 1000, 2000, f);
    expect(url).toBe("https://bridge.example/simplefin/accounts?start-date=1000&end-date=2000&pending=1");
    expect(auth).toBe("Basic " + b64("user:p@ss"));
    expect(r.errors).toEqual(["e1", "e2"]);
  });
  it("throws SimplefinForbidden on 403", async () => {
    const f = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
    await expect(fetchAccounts("https://u:p@b.example/simplefin", 1, undefined, f)).rejects.toBeInstanceOf(SimplefinForbidden);
  });
});

describe("helpers", () => {
  it("converts decimal strings to cents exactly", () => {
    expect(toCents("-12.5")).toBe(-1250);
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.1")).toBe(10);
    expect(toCents("-0.07")).toBe(-7);
  });
  it("guesses account kinds from names", () => {
    expect(guessKind("Quicksilver Rewards")).toBe("credit");
    expect(guessKind("Discover It Card")).toBe("credit");
    expect(guessKind("Roth Contributory IRA")).toBe("investment");
    expect(guessKind("360 Checking")).toBe("cash");
  });
});
