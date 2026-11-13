# Build decisions log — finance tracker

Calls made during the build that the plan didn't fix, with what each costs if wrong. Copied from the build ledger.

## Rulings
- - T3→T4: spendingByCategory(txns,from,to,incomeCategoryId) vs prefillBudgets(txns,today) — Ruling: prefillBudgets(txns, today, incomeCategoryId) — needs to skip Income — cost if wrong: trivial signature change.
- Task 1: Ruling: create-next-app has no --no-eslint in v16; kept its default ESLint config — harmless — cost: none.
- Task 1: Ruling: @types/node bumped ^20→22 to satisfy vitest peer; tsx added for seed script later — cost: none.
- Task 1: Ruling: Next 16 renamed middleware→proxy (src/proxy.ts, export `proxy`, Node runtime by default, `runtime` config forbidden); request APIs (cookies, params, searchParams) are async — applies to Tasks 2+ — cost if wrong: build errors caught immediately.
- Task 1: Ruling: removed scaffold README (Task 14 writes one); AGENTS.md from Next kept.
- Task 2: Ruling: proxy only verifies the session cookie (no DB access — Next docs say proxy shouldn't rely on shared modules); "no password yet → /setup" is done by the login page — same behavior — cost: none.
- Task 2: Ruling: setup/login use server actions (src/app/(auth)/actions.ts) instead of /api/auth route — less code — cost: none. Added logoutAction.
- Task 2: Ruling: turned off cacheComponents/partialPrefetching in next.config (scaffold default) — every page reads local DB per request, force-dynamic pages — cost: none for single local user.
- Task 2: Ruling: settings helpers in src/lib/settings.ts (getSetting/setSetting/deleteSetting) — used by later tasks.
- Task 3: Ruling: dates.ts helpers created here (plan put them in Task 4) — needed by transfers — cost: none.
- Task 3: Ruling: keywords match at word start (so "tea" doesn't hit "steam", "fee" in "coffee" does not match) — cost if wrong: a few miscategorized merchants, fixable by user rules.
- Task 3: Ruling: added "matcha" keyword → Dining; "99 ranch" replaced by "ranch market" because digits are stripped by normalizeMerchant.
- Task 4: Ruling: prefillBudgets(txns, today, incomeCategoryId) per pre-flight; Recurring gains `key` (normalized merchant) for the ignore list; detectRecurring(txns, ignored?) implemented now (Task 11 consumes) — cost: none.
- Task 4: Ruling: an account contributes to the net-worth series only from its first snapshot onward (spec silent) — avoids fake drops — cost if wrong: chart start slightly off.
- Task 5: Ruling: AlertInput uses connectionErrors: string[] (SimpleFIN error texts) instead of reauthItems, plus today and account names — matches SimpleFIN design — cost: none.
- Task 6: Ruling: Fetcher takes (startUnix, endUnix?) and fetchAccounts sends end-date — needed for 90-day backfill windows — cost: none.
- Task 6: Ruling: added last_sync_attempt + shouldAutoSync (no auto retry within 60 min of any attempt) — a failing sync would otherwise retry on every page load and burn the ~24/day quota (token gets disabled) — tested.
- Task 6: Ruling: first sync is "quiet": no new-recurring alerts; large-charge alerts only for txns dated within last 7 days — avoids a flood of alerts from a year of backfill — cost: none.
- Task 6: Ruling: postProcess() exported for reuse by CSV import (categorize/transfers/alerts).
- Task 6: Ruling: user-changed categoryId preserved on re-sync (update doesn't touch categoryId).
- Task 7: Ruling: single amount column defaults to bank sign (negative = spent) and `invert` means positive = spent (card exports) — matches most bank CSVs — cost if wrong: user ticks "invert".
- Task 7: Ruling: csvExternalId includes occurrence index so identical rows in one file (two same coffees) are both kept while re-import stays idempotent — tested.
- Task 7: Ruling: import/manual logic in src/lib/imports.ts (importCsvRows, upsertManualAccount), tested with DB; routes are thin. Imports run postProcess quietly.
- Task 8: Ruling: demo seed (scripts/seed-demo.ts, `npm run demo`) moved up from Task 14 to verify UI with data; it writes to a separate data/demo.db selected via FINANCE_DB env, never the real DB — cost: none.
- Task 8: Ruling: default chart range 3M (spec lists ranges, no default); headline change = since end of last month.
- Task 8: Ruling: hidden accounts excluded from net worth, groups and chart.
- Task 9: Ruling: recategorize sets isTransfer from the chosen category (Transfer → 1, else 0) so spending totals update immediately — cost if wrong: next sync's pair detection may re-flag a paired txn the user moved out of Transfer.
- Task 10: Ruling: spending comparison is plain HTML bars (this month vs last, legend + visible values + title tooltip) instead of a Recharts bar chart — lighter, accessible — cost: none. Budget limit 0 deletes the limit.
- Task 11: Ruling: found via screenshot — recurring list included card payments/transfers (older ones outside 90-day transfer window) and stopped charges. detectRecurring gains opts {excludeCategoryIds, today}: Transfer/Income excluded, and a charge more than half a cycle (+tol) past its next date is dropped as stopped. getRecurring(db, today). Tested.
- Task 11: Ruling: goals/credit logic in src/lib/goals.ts (goalProgress, validScore); credit scores deletable via DELETE /api/credit (no UI yet).
- Task 12: Ruling: settings logic in src/lib/settingsOps.ts (updateAccount, get/saveThresholds, changePassword) with tests; PATCH /api/accounts/[id] added for kind/hidden; manual accounts get an inline "new balance" field. CSV column picker auto-guesses columns from header names.
- Task 13: Ruling: model claude-opus-5-5 (not sonnet as plan said) at effort "low", with server-side refusal fallbacks ("default") — the claude-api skill mandates the default model unless the user names one; low effort keeps chat cheap — cost if wrong: slightly higher per-question cost than Sonnet; one-line change in src/lib/chat/run.ts.
- Task 13: Ruling: non-streaming JSON reply instead of streamed text — simpler; answers are short — cost: a short wait with a "Looking that up…" indicator.
- Task 13: Ruling: tools not marked strict (several have optional fields); runTool validates/sanitizes every input itself — tested.

## Review
- Final review: self-review (no subagent tool — session policy forbids spawning agents unless the user asks)
- Final: checked Review Focus 1-5 (all covered by tests); API routes return 401 without session (curl-verified); no secret logging; phone width 390px no horizontal overflow; light + dark render; prod build OK.
- Final: fixed dates computed in UTC (US evening purchases dated next day; month boundary off) — dates.test.ts "dates an evening purchase in Pacific time..." RED→GREEN, suite 100/100
- Final: minor (deferred): low-balance alert applies to every cash account incl. savings (one alert per account per day).
- Final: minor (deferred): importing a CSV into a SimpleFIN-synced account can duplicate transactions SimpleFIN already has.
- Final: minor (deferred): spending page compares a partial current month to a full previous month.
- Final: minor (deferred): the first sync (with backfill) runs during page render, so the first load after connecting can be slow.
- Final: minor (deferred): no UI to delete a credit score entry (API exists).
