/** Parse "$1,234.56", "(45.00)", "-3" into integer cents. */
export function parseMoney(s: string): number {
  let str = s.trim().replace(/[$,\s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1); }
  if (str.startsWith("-")) { neg = !neg; str = str.slice(1); }
  else if (str.startsWith("+")) str = str.slice(1);
  if (!/^\d*\.?\d*$/.test(str) || str === "" || str === ".") throw new Error(`Not a money amount: "${s}"`);
  const [whole, frac = ""] = str.split(".");
  let cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  return neg ? -cents : cents;
}

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(c: number): string {
  return fmt.format(c / 100);
}
