# Personal Finance Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local, single-user Next.js app that syncs Aaron's accounts via SimpleFIN Bridge and shows net worth, transactions, budget, spending, recurring charges, goals, credit score, in-app alerts and an AI chat.

**Architecture:** One Next.js (App Router) app in `finance-tracker/`. Server-side code talks to SQLite (Drizzle) and the SimpleFIN Bridge HTTP API (plain `fetch`, no SDK); all money rules live as pure, unit-tested functions in `src/lib/money/`. UI pages are server components that read via `src/lib/queries.ts`; mutations go through route handlers / server actions.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind CSS, Recharts, better-sqlite3 + drizzle-orm, @anthropic-ai/sdk, papaparse, @node-rs/argon2, jose (session JWT), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-finance-tracker-design.md`

## Global Constraints

- All app code lives under `finance-tracker/`; repo-root `README.md` is not touched.
- Server binds to `127.0.0.1` only: `"dev": "next dev -H 127.0.0.1"`, `"start": "next start -H 127.0.0.1"`.
- **Money is integer cents** everywhere in DB and logic. Format only in UI.
- **App sign convention:** transaction `amountCents > 0` = money out, `< 0` = money in. Credit account `balanceCents > 0` = owed. SimpleFIN uses the opposite (amount `< 0` = money out; card balance `< 0` = owed), so the sync layer negates: `amountCents = -toCents(t.amount)`; credit `balanceCents = -toCents(a.balance)`.
- Secrets only in `finance-tracker/.env.local` (gitignored): `ENCRYPTION_KEY` (64 hex chars), `SESSION_SECRET`, `ANTHROPIC_API_KEY` (optional). `.env.example` committed. `data/` gitignored.
- SimpleFIN Access URL (contains credentials) stored encrypted (AES-256-GCM) in `settings` key `simplefin_access_url_enc`; never logged (redact `user:pass@`).
- SimpleFIN limits: ~24 requests/day (exceeding can disable the token) and max 90-day window per request. Never make more than one sync request per app open; manual "Sync now" disabled for 60 minutes after a sync.
- Chart ranges exactly: `1M`, `3M`, `1Y`, `ALL`.
- Default alert thresholds: budget 90% and 100%; large transaction $250 (25000 cents); low checking $500 (50000 cents).
- Auto-sync when app opened and last sync > 12 hours ago.
- Budget prefill = average of last 3 full months per category, rounded **up** to nearest $10 (1000 cents).
- Recurring = same normalized merchant, amount within ±10%, ≥3 occurrences, interval weekly (7±2 d), monthly (30±4 d) or yearly (365±10 d).
- Transfer match window: equal-and-opposite amount in another own account within 3 days.
- Default categories (exact names): Groceries, Dining, Transport, Shopping, Subscriptions, Bills & Utilities, Rent, Entertainment, Health, Travel, Education, Income, Transfer, Fees, Other.
- No background jobs, no desktop/email notifications.

## Review Focus

1. **Credit-card payment** appears as outflow in checking and inflow on the card → both flagged transfer, neither counted as spending. (Task 3 test `cardPaymentNotSpending`.)
2. **Pending → posted** transaction: SimpleFIN may give the posted txn a new id → after sync, local pending rows for that account inside the fetched window that are absent from the response are deleted, so exactly one row remains. (Task 6 test `pendingReplacedOnPost`.)
3. **Empty database** (fresh install, nothing connected) → home page renders `$0.00`, no chart crash, shows "Connect an account" link. (Task 4 test `emptyNetWorthSeries`, Task 8 manual check.)
4. **One bank connection broken** (SimpleFIN `errlist`/`errors` entry naming an institution, e.g. needs re-login on the Bridge site) → other accounts still update, a `reauth` alert names the institution with a link to the SimpleFIN Bridge site; a 403 on the whole request → `sync_error` alert "SimpleFIN token disabled or invalid" and no crash. (Task 6 tests `bankErrorDoesNotBlockOthers`, `forbiddenIsReported`.)
5. **Messy CSV**: `$1,234.56`, `(45.00)` as negative, separate Debit/Credit columns, re-importing same file → parsed correctly, zero duplicates on re-import. (Task 7 tests.)

---

## File Structure

```
finance-tracker/
  package.json, next.config.ts, tsconfig.json, vitest.config.ts, drizzle.config.ts
  .env.example, .gitignore, README.md
  src/
    db/schema.ts            Drizzle tables
    db/client.ts            getDb(path?) singleton, runs migrations, seeds categories
    lib/crypto.ts           encrypt/decrypt
    lib/auth.ts             password hash + session
    lib/money/cents.ts      formatCents, parseMoney
    lib/money/categorize.ts categorize + keyword map
    lib/money/transfers.ts  detectTransfers, isSpending
    lib/money/networth.ts   netWorthSeries, changeOverRange, reconstructHistory
    lib/money/budget.ts     prefillBudgets, budgetStatus
    lib/money/recurring.ts  detectRecurring
    lib/alerts.ts           generateAlerts
    lib/csv.ts              parseCsv
    lib/simplefin/client.ts claim token, fetch accounts
    lib/simplefin/sync.ts   syncAll(db, fetcher)
    lib/queries.ts          read helpers for pages
    lib/chat/tools.ts       Claude tool defs + executors
    middleware.ts           auth gate
    app/(auth)/setup, login pages
    app/(app)/layout.tsx    nav shell
    app/(app)/page.tsx      Home
    app/(app)/transactions, budget, spending, recurring, goals, credit, chat, settings
    app/api/...             route handlers
  tests/                    mirrors src/lib
```

---

### Task 1: Scaffold, database schema, client

**Files:**
- Create: `finance-tracker/` via `create-next-app` (TypeScript, Tailwind, App Router, src dir, no ESLint prompt changes), `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `vitest.config.ts`, `.env.example`
- Modify: `finance-tracker/.gitignore` (add `data/`, `.env.local`), `package.json` scripts
- Test: `tests/db/client.test.ts`

**Interfaces:**
- Produces: `getDb(path?: string): DB` (`":memory:"` allowed for tests; default `data/finance.db`); table exports `connections, accounts, balanceSnapshots, transactions, categories, categoryRules, budgets, goals, creditScores, alerts, settings`.

Schema (column → type):
- `connections`: id text pk (SimpleFIN `org.domain` or `org.name`), institutionName text, status text (`ok`|`error`), lastError text null, updatedAt text
- `accounts`: id text pk (SimpleFIN account id, or `manual:<uuid>`), connectionId text null, name, kind text (`cash`|`credit`|`investment`|`other`), kindUserSet int default 0, source text (`simplefin`|`manual`|`csv`), balanceCents int, hidden int default 0, updatedAt
- `balanceSnapshots`: accountId, date text `YYYY-MM-DD`, balanceCents int, estimated int default 0; unique(accountId, date)
- `transactions`: id text pk, accountId, date, amountCents int, merchant text, description text, categoryId int null, pending int, isTransfer int default 0, source text, externalId text unique
- `categories`: id int pk, name unique
- `categoryRules`: id, pattern text (lowercase merchant substring), categoryId
- `budgets`: categoryId, month text `YYYY-MM`, limitCents; unique(categoryId, month)
- `goals`: id, name, targetCents, targetDate null, accountId null, earmarkedCents int default 0, manualCents int default 0
- `creditScores`: id, date, score int, source text
- `alerts`: id, type text, message text, createdAt, dismissed int default 0, dedupeKey text unique
- `settings`: key text pk, value text

- [ ] **Step 1:** Scaffold: `npx create-next-app@16 finance-tracker --ts --tailwind --app --src-dir --use-npm --no-eslint --import-alias "@/*"`; install `better-sqlite3 drizzle-orm @anthropic-ai/sdk papaparse @node-rs/argon2 jose recharts` and dev `drizzle-kit vitest @types/better-sqlite3 @types/papaparse`. Set dev/start scripts to `-H 127.0.0.1`, add `"test": "vitest run"`.
- [ ] **Step 2: Failing test** `tests/db/client.test.ts`:
  - `getDb(":memory:")` creates all tables; `select from categories` returns the 15 default names in Global Constraints order.
  - calling seed twice does not duplicate categories.
- [ ] **Step 3:** Run `npm test` → FAIL (module missing).
- [ ] **Step 4:** Write schema; `getDb` creates tables via `drizzle-kit generate` migrations in `drizzle/` applied with `migrate()` on open, then seeds categories with `INSERT OR IGNORE`.
- [ ] **Step 5:** `npm test` → PASS. `npm run build` → succeeds.
- [ ] **Step 6:** Commit `feat(finance): scaffold app and database schema`.

### Task 2: Crypto, password auth, session gate

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/auth.ts`, `src/middleware.ts`, `src/app/(auth)/setup/page.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/api/auth/route.ts`
- Test: `tests/lib/crypto.test.ts`, `tests/lib/auth.test.ts`

**Interfaces:**
- Produces: `encrypt(plain: string, keyHex: string): string` (base64 `iv|tag|ciphertext`), `decrypt(blob: string, keyHex: string): string`; `hashPassword(p): Promise<string>`, `verifyPassword(hash, p): Promise<boolean>`, `createSession(secret): Promise<string>` (JWT, 30-day exp), `verifySession(token, secret): Promise<boolean>`. Password hash stored in `settings` key `password_hash`. Cookie name `ft_session`, httpOnly, sameSite=strict.

- [ ] **Step 1: Failing tests:** encrypt→decrypt roundtrip; two encrypts of same text differ; decrypt with wrong key throws; tampered blob throws. hash/verify true for right password, false for wrong; session verifies with right secret, fails with wrong secret.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `node:crypto` AES-256-GCM (12-byte IV), `@node-rs/argon2`, `jose` HS256.
- [ ] **Step 4:** Middleware: if no `password_hash` → redirect to `/setup`; if no valid cookie → `/login`; allow `/setup`, `/login`, `/api/auth`, static assets. Setup page sets password (min 8 chars, confirm field); login page checks it. Middleware runs on Node runtime (`export const config = { runtime: "nodejs" }`) since it reads SQLite.
- [ ] **Step 5:** `npm test` → PASS. Manual: `npm run dev`, visit `/` → redirected to `/setup`; set password → land on `/`; clear cookie → `/login`.
- [ ] **Step 6:** Commit `feat(finance): password lock and token encryption`.

### Task 3: Money logic — cents, categorization, transfers

**Files:**
- Create: `src/lib/money/cents.ts`, `src/lib/money/categorize.ts`, `src/lib/money/transfers.ts`
- Test: `tests/lib/money/cents.test.ts`, `categorize.test.ts`, `transfers.test.ts`

**Interfaces:**
- Produces:
  - `formatCents(c: number): string` → `"$1,234.56"`, negatives `"-$5.00"`
  - `parseMoney(s: string): number` → cents; handles `$`, commas, `(x)` negative, leading `-`
  - `type Txn = { id: string; accountId: string; date: string; amountCents: number; merchant: string; categoryId?: number | null; isTransfer?: boolean; pending?: boolean }`
  - `type Rule = { pattern: string; categoryId: number }`
  - `normalizeMerchant(s: string): string` (lowercase, strip digits/`#`/store numbers, collapse spaces)
  - `categorize(t: Txn, rules: Rule[], catIdByName: Record<string, number>): number` — rule (substring of normalized merchant) → first `KEYWORD_MAP` entry whose keyword is a substring of the normalized merchant → `Other`
  - `KEYWORD_MAP: [string, string][]` (ordered; keyword → category name). Starter set: Transfer: `payment thank you`, `autopay`, `online payment`, `transfer`, `zelle`, `venmo`, `capital one mobile pmt`, `discover e-payment`, `bank of america online`; Income: `payroll`, `direct dep`, `salary`; Groceries: `trader joe`, `whole foods`, `safeway`, `kroger`, `costco`, `aldi`, `h mart`, `99 ranch`, `grocery`; Dining: `starbucks`, `chipotle`, `mcdonald`, `doordash`, `uber eats`, `grubhub`, `restaurant`, `cafe`, `boba`, `tea`; Transport: `uber`, `lyft`, `shell`, `chevron`, `exxon`, `arco`, `parking`, `transit`; Subscriptions: `netflix`, `spotify`, `hulu`, `disney`, `youtube`, `apple.com/bill`, `icloud`, `chatgpt`, `claude`, `xbox`, `playstation`, `steam`; Shopping: `amazon`, `target`, `walmart`, `best buy`; Health: `gym`, `fitness`, `cvs`, `walgreens`; Bills & Utilities: `verizon`, `t-mobile`, `at&t`, `comcast`, `xfinity`, `electric`, `water`; Fees: `fee`, `interest charge`. Order matters: `uber eats` before `uber`.
  - `detectTransfers(txns: Txn[], transferCategoryId: number): Set<string>` — ids that are transfers: category is Transfer, OR an opposite-sign equal-magnitude txn in a different account within 3 days (each txn pairs at most once).
  - `spendingByCategory(txns: Txn[], from: string, to: string, incomeCategoryId: number): Map<number, number>` — sums `amountCents` of txns that are not transfers, not pending, and not Income; refunds (negative) reduce their category. Pending txns are shown in lists but excluded from totals.

- [ ] **Step 1: Failing tests:**
  - `parseMoney("$1,234.56") === 123456`, `parseMoney("(45.00)") === -4500`, `parseMoney("-3") === -300`; `formatCents(-500) === "-$5.00"`.
  - `normalizeMerchant("STARBUCKS #1234 SEATTLE")` contains `starbucks`, no digits.
  - rule beats keyword; `"UBER EATS 123"` → Dining (not Transport); `"TRADER JOE'S #552"` → Groceries; `"CAPITAL ONE MOBILE PMT"` → Transfer; unknown → Other.
  - `cardPaymentNotSpending`: checking +50000 on 11-01 and card −50000 on 11-02 → both ids flagged; `spendingByCategory` excludes them.
  - two −2000/+2000 txns 5 days apart in different accounts → not flagged.
  - refund −1500 in Dining reduces Dining total by 1500.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(finance): categorization and transfer detection`.

### Task 4: Money logic — net worth, history, budget, recurring

**Files:**
- Create: `src/lib/money/networth.ts`, `src/lib/money/budget.ts`, `src/lib/money/recurring.ts`
- Test: matching files in `tests/lib/money/`

**Interfaces:**
- Consumes: `Txn`, `normalizeMerchant`, `spendingByCategory` (Task 3)
- Produces:
  - `type Acct = { id: string; kind: "cash"|"credit"|"investment"|"other"; balanceCents: number }`
  - `type Snapshot = { accountId: string; date: string; balanceCents: number; estimated?: boolean }`
  - `netWorthOf(accts: Acct[]): number` — assets minus credit
  - `netWorthSeries(accts: Acct[], snaps: Snapshot[], from: string, to: string): { date: string; cents: number; estimated: boolean }[]` — one point per day; each account carries its last known balance forward; accounts with no snapshot yet contribute 0 until first one. Empty input → `[]`.
  - `changeOverRange(series): { deltaCents: number; pct: number | null }` (pct null when start is 0)
  - `rangeStart(range: "1M"|"3M"|"1Y"|"ALL", today: string, earliest: string): string`
  - `reconstructHistory(acct: Acct, txns: Txn[], today: string): Snapshot[]` — cash/credit only; walk back day by day from current balance: for cash, prior = current + amountCents of that day; for credit, prior = current − amountCents. Marked `estimated: true`. Investment → `[]`.
  - `prefillBudgets(txns: Txn[], today: string): Map<number, number>` — last 3 full calendar months, avg per category, ceil to 1000.
  - `budgetStatus(limits: Map<number, number>, spent: Map<number, number>): { categoryId: number; limitCents: number; spentCents: number; pct: number }[]`
  - `type Recurring = { merchant: string; avgCents: number; cadence: "weekly"|"monthly"|"yearly"; lastDate: string; nextDate: string; accountId: string }`
  - `detectRecurring(txns: Txn[]): Recurring[]`

- [ ] **Step 1: Failing tests:**
  - `emptyNetWorthSeries`: `netWorthSeries([], [], …)` → `[]`; `changeOverRange([])` → `{deltaCents:0,pct:null}`.
  - cash 100000 + investment 200000 − credit 30000 → `netWorthOf` = 270000.
  - series carries forward: snapshot day 1 = 1000, day 3 = 3000 → day 2 = 1000.
  - `reconstructHistory` cash 10000 today with a 2000 purchase today → yesterday 12000; credit owed 5000 with 2000 purchase today → yesterday 3000.
  - prefill: Dining spent 12300, 8000, 10000 in last 3 full months → 11000 (avg 10100 ceil to 11000); current partial month ignored.
  - recurring: Netflix 1549 on 08-05, 09-05, 10-05 → monthly, next 11-05; two occurrences → not recurring; amounts 1000/1500/1000 (±50%) → not recurring.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Dates via plain `YYYY-MM-DD` string helpers in `src/lib/money/dates.ts` (`addDays`, `daysBetween`, `monthKey`) — UTC only.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(finance): net worth, budget and recurring logic`.

### Task 5: Alerts

**Files:**
- Create: `src/lib/alerts.ts`
- Test: `tests/lib/alerts.test.ts`

**Interfaces:**
- Consumes: `budgetStatus` output, `Txn`, `Acct`, `Recurring`
- Produces: `type AlertInput = { budget: ReturnType<typeof budgetStatus>; newTxns: Txn[]; accts: Acct[]; newRecurring: Recurring[]; reauthItems: string[]; thresholds: { largeTxnCents: number; lowCashCents: number }; month: string; catNames: Record<number,string> }`; `generateAlerts(i: AlertInput): { type: string; message: string; dedupeKey: string }[]`. Types: `budget_90`, `budget_100`, `large_txn`, `low_balance`, `new_recurring`, `reauth`. Dedupe keys e.g. `budget_90:<catId>:<month>`, `large_txn:<txnId>`, `low_balance:<acctId>:<date>`.

- [ ] **Step 1: Failing tests:** 92% → one `budget_90` "Dining is at 92% of budget"; 105% → `budget_100` only; txn 30000 → `large_txn`; pending excluded; cash 40000 → `low_balance`; credit account never triggers low balance; reauth item → `reauth`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(finance): in-app alert rules`.

### Task 6: SimpleFIN client and sync

**Files:**
- Create: `src/lib/simplefin/client.ts`, `src/lib/simplefin/sync.ts`, `src/app/api/simplefin/connect/route.ts`, `src/app/api/sync/route.ts`
- Test: `tests/lib/simplefin/client.test.ts`, `tests/lib/simplefin/sync.test.ts` (fake fetcher, in-memory DB)

**Interfaces:**
- Consumes: `getDb`, `encrypt/decrypt`, Task 3–5 functions
- Produces:
  - `claimSetupToken(token: string, fetchFn = fetch): Promise<string>` — base64-decode → must be `https://` claim URL → `POST` with empty body → response text must match `^https://.+:.+@` → Access URL. Errors: "not a SimpleFIN setup token", "already claimed — make a new one on the SimpleFIN site".
  - `type SfTxn = { id: string; posted: number; amount: string; description?: string; payee?: string; pending?: boolean; transacted_at?: number }`
  - `type SfAccount = { id: string; name: string; currency: string; balance: string; "balance-date": number; org?: { domain?: string; name?: string }; transactions?: SfTxn[] }`
  - `type SfResponse = { accounts: SfAccount[]; errors: string[] }` (merge `errors` strings and `errlist[].msg` into `errors`)
  - `fetchAccounts(accessUrl: string, startUnix: number, fetchFn = fetch): Promise<SfResponse>` — strips `user:pass` from URL into `Authorization: Basic`, `GET {base}/accounts?start-date=<unix>&pending=1`; 403 → throws `SimplefinForbidden`.
  - `guessKind(name: string, balanceCents: number): Kind` — name has `credit|card|visa|mastercard|discover|amex|quicksilver|savor|venture|customized cash` → credit; `ira|roth|brokerage|401k|invest|schwab one` → investment; else cash.
  - `toCents(s: string): number` (string decimal → integer cents, no float drift: split on `.`)
  - `syncAll(db: DB, fetcher: (startUnix: number) => Promise<SfResponse>, opts: { today: string }): Promise<{ accounts: number; added: number; errors: string[] }>`
  - `maybeAutoSync(db, opts): Promise<void>` — runs if Access URL saved and settings `last_sync` older than 12h.
  - Routes: `POST /api/simplefin/connect` `{ setupToken }` → claims, stores encrypted Access URL, runs first sync with backfill; `POST /api/sync` → `syncAll` result, returns 429 if last sync < 60 min ago.

Sync algorithm: window start = `last_sync − 7 days` (or 90 days back on first sync). First sync backfills: up to 3 extra requests for the previous 90-day windows (≈1 year total), stopping early when a window returns zero transactions; total requests per sync ≤ 4. For each account: upsert `connections` from `org`; upsert account (keep `kind` if `kindUserSet`, else `guessKind`); balance with sign rule (credit negated); upsert today's snapshot (`date` from `balance-date`). Transactions: `externalId = "sf:" + id`, `date` = UTC date of `transacted_at ?? posted` (`posted === 0` → today, pending), `amountCents = -toCents(amount)`, `merchant = payee ?? description`, upsert by externalId. Then delete local pending rows for that account dated inside the fetched window whose externalId wasn't in the response. Each `errors` entry → `reauth` alert (message = the error text + "Fix it on the SimpleFIN Bridge site"), connection status `error` when the text names its institution. After all: categorize uncategorized, `detectTransfers` over last 90 days, `detectRecurring`, `generateAlerts` (`INSERT OR IGNORE` on dedupeKey), first-sync `reconstructHistory` for cash/credit accounts, set `last_sync`.

- [ ] **Step 1: Failing tests:**
  - `claimSetupToken`: base64 of `https://bridge.example/claim/abc` → POSTs there, returns access URL; non-https decode → throws; response without credentials → throws.
  - `fetchAccounts`: sends `Authorization: Basic base64(user:pass)` and URL without credentials; includes `start-date` and `pending=1`; 403 → `SimplefinForbidden`.
  - `toCents("-12.5") === -1250`, `toCents("1234.56") === 123456`, `toCents("0.1") === 10`.
  - sign: SimpleFIN `amount "-45.00"` on checking → stored `amountCents 4500`; credit account balance `"-320.10"` → `balanceCents 32010`.
  - `pendingReplacedOnPost`: sync 1 returns pending P (id p1); sync 2 returns posted T (id t1), no p1 → one row, T.
  - `bankErrorDoesNotBlockOthers`: response with 2 accounts and `errors: ["Connection to Discover may need attention"]` → both accounts updated, one `reauth` alert.
  - `forbiddenIsReported`: fetcher throws `SimplefinForbidden` → `sync_error` alert, `last_sync` unchanged, no throw.
  - same-day second sync updates snapshot, doesn't duplicate; user-set kind survives sync.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(finance): simplefin connect and sync`.

### Task 7: CSV import and manual accounts

**Files:**
- Create: `src/lib/csv.ts`, `src/app/api/import/route.ts`, `src/app/api/accounts/manual/route.ts`
- Test: `tests/lib/csv.test.ts`

**Interfaces:**
- Produces: `type CsvMapping = { date: string; description: string; amount?: string; debit?: string; credit?: string; invert?: boolean }`; `parseCsv(text: string, m: CsvMapping): { date: string; description: string; amountCents: number }[]` (dates accepted `MM/DD/YYYY`, `YYYY-MM-DD`, `M/D/YY`; output app sign: debit positive; `invert` flips single amount column); `csvExternalId(accountId, row): string` = `csv:` + sha1(accountId|date|amountCents|description). `POST /api/import` multipart `{ file, accountId, mapping }` → `{ inserted, skipped }`. `POST /api/accounts/manual` `{ name, kind, balanceCents }` creates/updates manual account and today's snapshot.

- [ ] **Step 1: Failing tests:** amount column with `$1,234.56` and `(45.00)`; Debit/Credit columns (debit 20.00 → 2000, credit 100.00 → −10000); `invert` flips; `M/D/YY` → `20YY-MM-DD`; blank rows skipped; same row → same `csvExternalId`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (papaparse header mode). Import route inserts with `INSERT OR IGNORE` on externalId so re-import skips. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(finance): csv import and manual accounts`.

### Task 8: App shell and Home (net worth)

**Files:**
- Create: `src/lib/queries.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/components/NetWorthChart.tsx` (client, Recharts area chart), `src/components/AlertsList.tsx`, `src/components/SyncButton.tsx`
- Test: `tests/lib/queries.test.ts`

**Interfaces:**
- Consumes: Task 4 functions, `maybeAutoSync`
- Produces: `getHomeData(db, today, range): { netWorthCents; change: {deltaCents; pct}; series; groups: { cash: AcctRow[]; investment: AcctRow[]; credit: AcctRow[]; other: AcctRow[] }; budget: { spentCents; limitCents }; alerts: AlertRow[]; reauthItems: {id; institutionName; lastError}[]; lastSync: string | null }`. "This month" change on headline = change from first day of current month.

Layout: left nav (Home, Transactions, Budget, Spending, Recurring, Goals, Credit, Chat, Settings); dark-mode friendly Tailwind. Home matches spec sketch: headline net worth + ▲/▼ month change (green/red), range tabs `1M 3M 1Y ALL` via `?range=`, chart (estimated segment dashed or lighter), account groups with totals, budget summary line, alerts with dismiss, reconnect banner, "Sync now" with last-synced time. Home server component calls `maybeAutoSync` before reading.

- [ ] **Step 1: Failing test:** `getHomeData` on seeded in-memory DB (2 accounts, 3 snapshots, 1 budget, 1 alert) returns expected net worth, groups and month change; on empty DB returns `netWorthCents: 0`, empty series, empty groups.
- [ ] **Step 2:** FAIL. **Step 3:** Implement query + UI. **Step 4:** PASS.
- [ ] **Step 5:** Manual: `npm run dev` on empty DB → `$0.00` and "Connect an account" link to Settings; no console errors. Screenshot with Playwright at 1280×800.
- [ ] **Step 6:** Commit `feat(finance): home net worth screen`.

### Task 9: Transactions screen

**Files:**
- Create: `src/app/(app)/transactions/page.tsx`, `src/components/CategorySelect.tsx`, `src/app/api/transactions/[id]/route.ts`
- Modify: `src/lib/queries.ts`
- Test: `tests/lib/queries.test.ts` (add)

**Interfaces:**
- Produces: `listTransactions(db, f: { q?: string; accountId?: string; categoryId?: number; from?: string; to?: string; page?: number }): { rows: TxnRow[]; total: number }` (50 per page, newest first; `q` matches merchant/description case-insensitively); `PATCH /api/transactions/[id]` `{ categoryId, applyToMerchant?: boolean }` → updates txn; when `applyToMerchant` inserts rule with `normalizeMerchant` pattern and recategorizes all matching txns.

- [ ] **Step 1: Failing tests:** filter by q/account/date; recategorize with `applyToMerchant` updates 3 matching Chipotle txns and creates 1 rule.
- [ ] **Step 2:** FAIL. **Step 3:** Implement page: filters via query string, table (date, merchant, account, category select, amount; pending badge; transfers greyed). On category change, ask "Always for <merchant>?" checkbox. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(finance): transactions screen`.

### Task 10: Budget and Spending screens

**Files:**
- Create: `src/app/(app)/budget/page.tsx`, `src/app/(app)/spending/page.tsx`, `src/app/api/budgets/route.ts`
- Modify: `src/lib/queries.ts`

**Interfaces:**
- Produces: `getBudgetPage(db, month)`, `getSpendingPage(db, month)` → `{ rows: { categoryId; name; thisMonthCents; lastMonthCents }[] }`; `PUT /api/budgets` `{ month, limits: {categoryId, limitCents}[] }`; `POST /api/budgets/prefill` `{ month }` → writes `prefillBudgets` result for categories without a limit.

- [ ] **Step 1: Failing tests** for both queries on seeded DB (month change rolls correctly across year boundary: `2026-01` last month = `2025-12`).
- [ ] **Step 2:** FAIL. **Step 3:** Budget page: per-category bars (green < 90%, amber 90–100%, red > 100%), inline editable limits, "Fill from last 3 months" button, month picker. Spending page: horizontal bar chart by category, this vs last month, total. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(finance): budget and spending screens`.

### Task 11: Recurring, Goals, Credit screens

**Files:**
- Create: `src/app/(app)/recurring/page.tsx`, `src/app/(app)/goals/page.tsx`, `src/app/(app)/credit/page.tsx`, `src/app/api/goals/route.ts`, `src/app/api/credit/route.ts`, `src/app/api/recurring/ignore/route.ts`
- Modify: `src/lib/queries.ts`, `src/lib/money/recurring.ts` (accept ignored merchant set)

**Interfaces:**
- Produces: `detectRecurring(txns, ignored?: Set<string>)`; ignored merchants stored in settings `recurring_ignored` (JSON array). `goalProgress(goal, acctBalanceCents | null): { currentCents; pct }` — linked: `min(earmarkedCents, balance)`; unlinked: `manualCents`. Goals CRUD at `/api/goals` (POST/PATCH/DELETE). `POST /api/credit` `{ date, score (300–850), source }`.

- [ ] **Step 1: Failing tests:** ignored merchant excluded; `goalProgress` linked caps at balance; score 900 rejected by validator `validScore(n)`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement pages: recurring list with monthly total and "Not recurring" button; goals cards with progress bar and target date; credit form + line chart. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(finance): recurring, goals and credit screens`.

### Task 12: Settings screen

**Files:**
- Create: `src/app/(app)/settings/page.tsx`, `src/components/SimplefinConnect.tsx` (client), `src/components/CsvImport.tsx`, `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: Task 6 connect/sync routes, Task 7 import/manual routes, Task 2 `hashPassword`
- Produces: `PUT /api/settings` `{ largeTxnCents?, lowCashCents?, newPassword?, currentPassword? }`.

- [ ] **Step 1:** Sections: SimpleFIN (not connected → steps: sign up at the SimpleFIN Bridge site, link banks there, create a setup token, paste here; connected → institutions with status and last error, \"Replace token\", \"Disconnect\" which deletes the stored Access URL); Accounts (hide toggle, kind select — sets `kindUserSet`); Manual account form; CSV import (file → preview first 5 rows → pick columns → account → import, shows inserted/skipped); Alert thresholds; Change password (requires current).
- [ ] **Step 2:** Manual check: paste a bad token → readable error; CSV import of a sample file in `tests/fixtures/sample.csv` twice → second shows 0 inserted.
- [ ] **Step 3:** Commit `feat(finance): settings screen`.

### Task 13: AI chat

**Files:**
- Create: `src/lib/chat/tools.ts`, `src/app/api/chat/route.ts`, `src/app/(app)/chat/page.tsx`
- Test: `tests/lib/chat/tools.test.ts`

**Interfaces:**
- Consumes: queries and money functions
- Produces: `chatTools: Anthropic.Tool[]` and `runTool(db, name, input): unknown` for `spending_by_category {from,to}`, `search_transactions {query?, from?, to?, categoryName?, limit≤50}`, `account_balances {}`, `net_worth_history {range}`, `budget_status {month}`, `goals {}`. Amounts returned as dollar strings. `POST /api/chat` `{ messages }` → streams text; runs tool-use loop server-side (max 8 tool rounds). Model: `claude-sonnet-5-5`. System prompt: today's date, "answer only from tool results; amounts in USD".

- [ ] **Step 1: Failing tests:** `runTool(db,"spending_by_category",…)` returns names + dollar strings; unknown tool throws; `search_transactions` caps limit at 50.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (use claude-api skill for SDK usage). Page: message list + input; no key → card explaining how to add `ANTHROPIC_API_KEY`. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(finance): ai chat over local data`.

### Task 14: README and final verification

**Files:**
- Create: `finance-tracker/README.md`

- [ ] **Step 1:** README: what it is; prerequisites (Node 22); `npm install`; copy `.env.example` → `.env.local`; generate `ENCRYPTION_KEY`/`SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); SimpleFIN Bridge signup (≈$1.50/mo), link banks, create setup token, paste in Settings; note ~24 requests/day limit and CSV fallback for unsupported banks; optional Anthropic key; `npm run dev`; backup = copy `data/finance.db`.
- [ ] **Step 2:** Run `npm test` → all pass; `npm run build` → success.
- [ ] **Step 3:** Seed script `npm run seed:demo` (`scripts/seed-demo.ts`) filling fake accounts/transactions so the app can be viewed without SimpleFIN; Playwright screenshots of each page — no console errors.
- [ ] **Step 4:** Commit `docs(finance): setup guide and demo seed`; push branch.
