export type Txn = {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  merchant: string;
  categoryId?: number | null;
  isTransfer?: boolean;
  pending?: boolean;
};

export type Rule = { pattern: string; categoryId: number };

export function normalizeMerchant(s: string): string {
  return s
    .toLowerCase()
    .replace(/#\s*\d+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z&'.\/\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ordered: first match wins, so specific keywords come before general ones. */
export const KEYWORD_MAP: [string, string][] = [
  ["payment thank you", "Transfer"], ["autopay", "Transfer"], ["online payment", "Transfer"],
  ["capital one mobile pmt", "Transfer"], ["discover e-payment", "Transfer"],
  ["bank of america online", "Transfer"], ["transfer", "Transfer"], ["zelle", "Transfer"],
  ["venmo", "Transfer"],
  ["payroll", "Income"], ["direct dep", "Income"], ["salary", "Income"],
  ["uber eats", "Dining"],
  ["trader joe", "Groceries"], ["whole foods", "Groceries"], ["safeway", "Groceries"],
  ["kroger", "Groceries"], ["costco", "Groceries"], ["aldi", "Groceries"], ["h mart", "Groceries"],
  ["ranch market", "Groceries"], ["grocery", "Groceries"],
  ["starbucks", "Dining"], ["chipotle", "Dining"], ["mcdonald", "Dining"], ["doordash", "Dining"],
  ["grubhub", "Dining"], ["restaurant", "Dining"], ["cafe", "Dining"], ["boba", "Dining"],
  ["matcha", "Dining"], ["tea", "Dining"],
  ["uber", "Transport"], ["lyft", "Transport"], ["shell", "Transport"], ["chevron", "Transport"],
  ["exxon", "Transport"], ["arco", "Transport"], ["parking", "Transport"], ["transit", "Transport"],
  ["netflix", "Subscriptions"], ["spotify", "Subscriptions"], ["hulu", "Subscriptions"],
  ["disney", "Subscriptions"], ["youtube", "Subscriptions"], ["apple.com/bill", "Subscriptions"],
  ["icloud", "Subscriptions"], ["chatgpt", "Subscriptions"], ["claude", "Subscriptions"],
  ["xbox", "Subscriptions"], ["playstation", "Subscriptions"], ["steam", "Subscriptions"],
  ["amazon", "Shopping"], ["target", "Shopping"], ["walmart", "Shopping"], ["best buy", "Shopping"],
  ["gym", "Health"], ["fitness", "Health"], ["cvs", "Health"], ["walgreens", "Health"],
  ["verizon", "Bills & Utilities"], ["t-mobile", "Bills & Utilities"], ["at&t", "Bills & Utilities"],
  ["comcast", "Bills & Utilities"], ["xfinity", "Bills & Utilities"], ["electric", "Bills & Utilities"],
  ["water", "Bills & Utilities"],
  ["interest charge", "Fees"], ["fee", "Fees"],
];

const wordMatch = (hay: string, needle: string) =>
  new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}`).test(hay);

export function categorize(t: Txn, rules: Rule[], catIdByName: Record<string, number>): number {
  const m = normalizeMerchant(t.merchant);
  for (const r of rules) if (m.includes(r.pattern)) return r.categoryId;
  for (const [kw, name] of KEYWORD_MAP) {
    if (wordMatch(m, kw) && catIdByName[name] !== undefined) return catIdByName[name];
  }
  return catIdByName.Other;
}
