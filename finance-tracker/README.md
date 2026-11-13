# Ledger: personal finance tracker

A private money app that runs on your own computer. It shows your **net worth** and whether it went up or down, and it also covers transactions, budgets, spending, recurring charges, goals, credit score, and an AI chat for questions about your money.

Your data stays in one file on your machine (`data/finance.db`). Bank data comes from **SimpleFIN Bridge**. AI questions go to Anthropic, and only when you use the chat.

## Try it with fake data first

```bash
npm install
cp .env.example .env.local      # then fill in the two keys (see below)
npm run demo                     # seeds data/demo.db and opens it
```

Go to http://localhost:3000 and log in with password `demo-password`. The demo uses a separate database, so your real data is never touched.

## Setup

You need **Node.js 22 or newer**.

1. `npm install`
2. `cp .env.example .env.local`
3. Generate two secrets and paste them into `.env.local` as `ENCRYPTION_KEY` and `SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Keep `ENCRYPTION_KEY` safe. It encrypts your SimpleFIN access, so if you lose it you'll need to paste a new SimpleFIN token.
4. `npm run dev` and open http://localhost:3000. The first visit asks you to set a password.

The app only listens on `127.0.0.1`, so other devices on your network can't reach it.

## Connect your banks (SimpleFIN)

1. Sign up at the SimpleFIN Bridge site (https://beta-bridge.simplefin.org). It costs about $1.50/month.
2. Before you pay, check that it supports Capital One, Discover, Bank of America and Schwab.
3. Link your banks on the SimpleFIN site.
4. Create a **setup token** there, then paste it into **Settings → Bank connection** in the app.

The first sync pulls about a year of history. After that, the app syncs on its own when you open it, at most every 12 hours. You can also press **Sync now**, which is limited to once per hour. SimpleFIN allows about 24 requests a day, and going over can disable your token.

**Banks SimpleFIN can't reach:** in Settings, use **Import a CSV** with a file downloaded from the bank's website, or **Add a manual account** and update its balance now and then. A Roth IRA works well as a manual account.

## AI chat (optional)

Add `ANTHROPIC_API_KEY=...` to `.env.local` (create a key at console.anthropic.com) and restart. Chat uses Claude Opus 5.5 at low effort. If the model declines a question, the API retries it on a fallback model. Each question usually costs a few cents or less.

## Everyday use

- **Net worth**: total, change this month, and a chart (1M / 3M / 1Y / ALL). Before your first sync, earlier history is estimated from your transactions.
- **Transactions**: change a category and choose "Always for this merchant" to teach the app.
- **Budget**: "Fill from last 3 months" starts every category at your usual spending, rounded up to the nearest $10.
- **Credit**: SimpleFIN can't fetch credit scores. Copy your score from CreditWise or Discover once a month.

## Backup

Copy `data/finance.db` (and `.env.local`) somewhere safe.

## Development

```bash
npm test          # unit tests (money logic, sync, import, chat tools)
npm run build     # production build
npm start         # run the production build
```

The code lives in `src/lib/money` (pure money rules), `src/lib/simplefin` (sync), `src/app` (pages and API routes) and `src/db` (SQLite schema).
