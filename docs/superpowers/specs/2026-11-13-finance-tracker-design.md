# Personal Finance Tracker — Design

Date: 2026-11-13
Status: Draft, awaiting approval

## Intent

A private, single-user money app in the spirit of Origin / Copilot, built for
Aaron only. It pulls in every account automatically, shows **total net worth and
whether it went up or down** as the first thing on screen, and covers the core
of budgeting and spending tracking — without the extras a commercial app needs
(multi-user, sharing, mobile apps, bill pay).

## Accounts to support

| Institution | Accounts | Notes |
|---|---|---|
| Capital One | Checking (main bank), credit card | Check on SimpleFIN Bridge before paying |
| Discover | Credit card | Being absorbed into Capital One |
| Bank of America | Credit card | Check on SimpleFIN Bridge |
| Charles Schwab | Roth IRA | Balance only; CSV/manual fallback if unsupported |

Any bank SimpleFIN can't reach falls back to CSV import or manual balance.

## Goals

1. **Net worth home screen** — total, change this month ($ and %), chart with
   ranges 1M / 3M / 1Y / ALL, accounts grouped Cash / Investments / Credit.
2. **Automatic account sync** via SimpleFIN Bridge (≈$1.50/month; Aaron links banks on the Bridge site and pastes a one-time setup token into the app).
3. **Transactions** — one list across all accounts; search, filter by
   account/category/date; auto-categorized (SimpleFIN gives no categories, so: your rules → built-in merchant keyword list → Other); editing a category can create a
   merchant rule applied to future transactions.
4. **Budget** — monthly limit per category, spent-vs-limit bars; limits
   pre-filled from the last 3 months' average spending.
5. **Spending breakdown** — this month by category vs last month.
6. **Recurring charges** — detected subscriptions/bills with amount, cadence,
   next expected date.
7. **Goals & buckets** — a goal has a name, target amount, optional target
   date, and either a linked account (progress = earmarked share of that
   account's balance) or manual contributions.
8. **Credit score** — manual entry (score, source, date), charted over time.
9. **AI chat** — ask questions about your own money in plain English, answered
   by Claude using tools that query the local database.
10. **In-app alerts** — a small list on the home screen (no desktop/email
    notifications).
11. **CSV import** — fallback for any account SimpleFIN can't connect; plus manual
    balance updates for accounts like the Roth IRA.

## Non-goals

- Multiple users, sign-up, sharing, partner access
- Hosting online / phone access / mobile app
- Push, desktop, or email notifications
- Bill pay, money movement, trading
- Automatic credit score pulls (no API available to a personal project)

## Anti-goals (would be a failure even if it "works")

- Financial data leaving the machine other than from SimpleFIN (to fetch it) and to
  Anthropic (only when the chat is used).
- Double-counting: credit-card payments and transfers between own accounts must
  not count as spending or income.
- The SimpleFIN Access URL or API keys committed to git or stored in plain text.
- Feature bloat — every screen should earn its place.

## Constraints

- Runs locally only: server binds to `127.0.0.1`, opened at `http://localhost:3000`.
- SimpleFIN Bridge: ~24 requests/day (going over can disable the token), max
  90 days per request, data refreshed about daily, no categories, no account
  types, balances only for investment accounts (no holdings), no balance history.
- AI chat needs an Anthropic API key and costs a small amount per use.
- Lives in this repo (`aarofps/aarofps`, the GitHub profile repo) in a
  `finance-tracker/` subfolder so the profile README is untouched. Can be moved
  to its own repo later.

## Approaches considered

1. **Next.js (TypeScript) full-stack + SQLite** — one language, one process,
   one command to run. **Chosen.**
2. **Python (FastAPI) backend + React frontend** — money logic in a language
   Aaron already knows, but two languages, two processes, more setup. Not chosen.
3. **Desktop app (Electron/Tauri)** — packaging overhead with no benefit over a
   localhost web app. Ruled out.

Data source: **SimpleFIN Bridge** (Aaron's choice, 2026-11-13) over Plaid (needs a
developer account and production approval) and CSV-only (manual every month).
Coverage of Aaron's banks is unconfirmed until he checks the Bridge site. CSV
and manual balances kept as a fallback.

## Design

### Stack (builder's calls, stated)
- Next.js (App Router) + TypeScript, Tailwind CSS, Recharts for charts
- SQLite via `better-sqlite3` + Drizzle ORM; DB file in `finance-tracker/data/`
  (gitignored)
- SimpleFIN via plain `fetch` (no SDK); `@anthropic-ai/sdk` for chat
- Vitest for unit tests

### Security
- Single app password set on first launch, stored as a bcrypt/argon2 hash;
  signed session cookie.
- The SimpleFIN Access URL (it embeds credentials) is encrypted at rest
  (AES-256-GCM) with a key from `.env`, and redacted from logs.
- Secrets (`ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`) live in `.env.local`, gitignored;
  `.env.example` committed.

### Data model
- `connections` — institution (from SimpleFIN `org`), status, last error
- `accounts` — connection, name, kind (cash / credit / investment / other —
  guessed from the name, editable), source (simplefin / manual / csv), current
  balance, hidden flag
- `balance_snapshots` — account, date, balance (one per account per day)
- `transactions` — account, date, amount, merchant, raw description, category,
  pending, is_transfer, source, external id (for dedupe)
- `categories` — ~15 defaults (Groceries, Dining, Transport, Shopping,
  Subscriptions, Bills & Utilities, Rent, Entertainment, Health, Travel,
  Education, Income, Transfer, Fees, Other); user can add
- `category_rules` — merchant pattern → category
- `budgets` — category, month, limit
- `goals` — name, target, target date, linked account + earmarked amount, or
  manual contributions
- `credit_scores` — date, score, source
- `alerts` — type, message, created, dismissed
- `settings` — alert thresholds, last sync time

### Sync
- Triggered when the app is opened and the last sync is > 12 h old, plus a
  "Sync now" button (disabled for 60 minutes after a sync to respect the quota). No background jobs.
- One `GET /accounts` request per sync covering last sync − 7 days (≤90 days).
  First sync backfills up to ~1 year in 90-day windows (≤4 requests).
- SimpleFIN sign convention is flipped into the app's (amount > 0 = money out;
  card balance > 0 = owed).
- After sync: write today's balance snapshot, apply category rules, flag
  transfers, run recurring detection, generate alerts.
- Connection errors reported by SimpleFIN show a banner telling Aaron to fix
  that bank on the SimpleFIN Bridge site; other accounts keep updating.

### Money logic
- **Net worth** = sum(cash + investment + other assets) − sum(credit balances
  owed), per day from `balance_snapshots`.
- **History before first sync** (builder's call): reconstruct approximate daily
  balances for cash and credit accounts by walking transactions backward from
  the current balance, so the chart isn't empty on day one. Investment history
  starts at first sync. Reconstructed points are marked as estimated.
- **Spending** = outflows excluding transfers and card payments. A transaction
  is a transfer if it's categorized Transfer (e.g. "payment thank you"), or it matches an equal-and-opposite
  amount in another own account within 3 days.
- **Refunds** reduce spending in their category; **pending** transactions are
  shown (marked) and replaced when they post (stale pending rows missing from the next sync are removed).
- **Categorization** order: user rule → built-in merchant keyword list
  (e.g. "trader joe" → Groceries, "netflix" → Subscriptions) → Other.
- **Budget prefill**: average monthly spend per category over the last 3 full
  months, rounded up to the nearest $10.
- **Recurring detection**: same normalized merchant, amount within ±10%,
  ≥3 occurrences at a regular interval (weekly / monthly / yearly ± a few days).

### Alerts (in-app only)
- Category reaches 90% and 100% of budget
- Single transaction over a threshold (default $250)
- Checking balance under a threshold (default $500)
- New recurring charge detected
- An account needs reconnecting

### AI chat
- Chat page; Claude is given read-only tools over the local DB:
  spending by category/period, search transactions, account balances,
  net worth history, budget status, goals.
- Only tool results are sent, not the whole database.
- If no `ANTHROPIC_API_KEY` is set, the chat tab shows how to enable it.

### Screens
1. **Home** — net worth, change, chart (1M/3M/1Y/ALL), account groups, budget
   summary line, alerts list
2. **Transactions** — list, search, filters, edit category (offer "always for
   this merchant")
3. **Budget** — per-category bars, edit limits, prefill button
4. **Spending** — by category this month vs last month
5. **Recurring** — detected charges, mark as not recurring
6. **Goals** — progress bars, create/edit
7. **Credit** — enter score, chart
8. **Chat**
9. **Settings** — paste SimpleFIN setup token / replace / disconnect, set account kinds, CSV import with
   column mapping, manual balance update, alert thresholds, change password

### CSV import
- Upload a file, map columns (date, description, amount or debit/credit),
  choose the account; dedupe on date + amount + description.

### Testing
- Unit tests for the money logic: net worth, transfer detection, budget prefill,
  recurring detection, categorization rules, CSV parsing, history reconstruction.
- SimpleFIN client tested against a fake HTTP layer; a demo-data seed lets the
  app be viewed before connecting real banks.

## What Aaron has to do himself
- Check the SimpleFIN Bridge site supports Capital One, Discover, BofA and Schwab.
- Sign up for SimpleFIN Bridge (≈$1.50/month), link banks there, create a setup
  token, paste it into the app's Settings.
- Optionally create an Anthropic API key for the chat.

## Left to the builder
- Visual styling details (clean, dark-mode friendly), exact category mapping
  table, component structure, Claude model choice for chat (default to a current
  cost-efficient model).
