import type { Kind } from "../money/networth";

export type SfTxn = {
  id: string; posted: number; amount: string;
  description?: string; payee?: string; pending?: boolean; transacted_at?: number;
};
export type SfAccount = {
  id: string; name: string; currency: string; balance: string; "balance-date": number;
  org?: { domain?: string; name?: string }; transactions?: SfTxn[];
};
export type SfResponse = { accounts: SfAccount[]; errors: string[] };

export class SimplefinForbidden extends Error {
  constructor() {
    super("SimpleFIN token disabled or invalid. Create a new setup token on the SimpleFIN Bridge site and paste it in Settings.");
    this.name = "SimplefinForbidden";
  }
}

export async function claimSetupToken(token: string, fetchFn: typeof fetch = fetch): Promise<string> {
  let claimUrl = "";
  try { claimUrl = Buffer.from(token.trim(), "base64").toString("utf8").trim(); } catch { /* handled below */ }
  if (!/^https:\/\/\S+$/.test(claimUrl)) throw new Error("That's not a SimpleFIN setup token. Copy the whole token from the SimpleFIN Bridge site.");
  const res = await fetchFn(claimUrl, { method: "POST", headers: { "Content-Length": "0" } });
  if (res.status === 403) throw new Error("This setup token was already claimed. Make a new one on the SimpleFIN Bridge site.");
  if (!res.ok) throw new Error(`SimpleFIN claim failed (${res.status}).`);
  const accessUrl = (await res.text()).trim();
  if (!/^https:\/\/[^\s:@\/]+:[^\s@\/]+@\S+$/.test(accessUrl)) throw new Error("SimpleFIN returned something unexpected. Try a new setup token.");
  return accessUrl;
}

export function redactUrl(u: string): string {
  return u.replace(/\/\/[^@\/]+@/, "//***@");
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
}

export async function fetchAccounts(accessUrl: string, startUnix: number, endUnix?: number, fetchFn: typeof fetch = fetch): Promise<SfResponse> {
  const url = new URL(accessUrl.replace(/\/+$/, "") + "/accounts");
  const user = decodeURIComponent(url.username), pass = decodeURIComponent(url.password);
  url.username = ""; url.password = "";
  url.searchParams.set("start-date", String(startUnix));
  if (endUnix !== undefined) url.searchParams.set("end-date", String(endUnix));
  url.searchParams.set("pending", "1");
  const res = await fetchFn(url.toString(), {
    headers: { Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"), Accept: "application/json" },
  });
  if (res.status === 403) throw new SimplefinForbidden();
  if (!res.ok) throw new Error(`SimpleFIN returned ${res.status}.`);
  const body = (await res.json()) as Record<string, unknown>;
  const errors: string[] = [];
  for (const e of Array.isArray(body.errors) ? body.errors : []) {
    if (typeof e === "string") errors.push(e);
    else if (e && typeof e === "object" && "msg" in e) errors.push(String((e as { msg: unknown }).msg));
  }
  for (const e of Array.isArray(body.errlist) ? body.errlist : []) {
    if (e && typeof e === "object" && "msg" in e) errors.push(String((e as { msg: unknown }).msg));
  }
  const accounts: SfAccount[] = [];
  for (const raw of Array.isArray(body.accounts) ? body.accounts : []) {
    const a = raw as Record<string, unknown>;
    const id = str(a.id), balance = str(a.balance), bd = a["balance-date"];
    if (!id || balance === undefined || typeof bd !== "number") continue;
    const txns: SfTxn[] = [];
    for (const rt of Array.isArray(a.transactions) ? a.transactions : []) {
      const t = rt as Record<string, unknown>;
      const tid = str(t.id), amount = str(t.amount);
      if (!tid || amount === undefined || typeof t.posted !== "number") continue;
      txns.push({
        id: tid, posted: t.posted, amount,
        description: str(t.description), payee: str(t.payee),
        pending: t.pending === true || t.posted === 0,
        transacted_at: typeof t.transacted_at === "number" ? t.transacted_at : undefined,
      });
    }
    accounts.push({
      id, name: str(a.name) ?? id, currency: str(a.currency) ?? "USD", balance, "balance-date": bd,
      org: (a.org as SfAccount["org"]) ?? undefined, transactions: txns,
    });
  }
  return { accounts, errors };
}

/** Exact decimal string → integer cents (no float drift). */
export function toCents(s: string): number {
  const t = s.trim();
  const neg = t.startsWith("-");
  const [whole, frac = ""] = t.replace(/^[-+]/, "").split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

export function guessKind(name: string): Kind {
  const n = name.toLowerCase();
  if (/credit|card|visa|mastercard|discover|amex|quicksilver|savor|venture|customized cash/.test(n)) return "credit";
  if (/\bira\b|roth|brokerage|401k|invest|schwab one/.test(n)) return "investment";
  return "cash";
}
