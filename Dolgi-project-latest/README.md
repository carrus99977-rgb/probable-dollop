# Долги

Private, mobile-first personal debt ledger. React 19, TypeScript, Vinext (Next.js-compatible), Tailwind, Supabase PostgreSQL/Auth and PWA. Hosted owner-private with Sites/ChatGPT identity; a separate verified email login selects the personal Supabase account. Existing D1 records are retained only as a migration/recovery source.

## Product

The initial screen is the calculator-like debt entry form. Four navigation tabs: Add, Debts, People, Statistics. Supports six independent currencies, partial repayments, same-currency setoffs, event history, due-date changes, notes, tags, editable categories, combinable filters, saved filters, search, grouping, currency-scoped amount sorting, period statistics, CSV export, validated JSON backups, and calendar reminders.

New email accounts start empty. Existing records can be transferred once after verified login and confirmation of the destination email; the old PIN is required when enabled. The complete history and PIN setting transfer atomically; the old D1 ledger remains intact. Settings can clear the active ledger after confirmation. Records are never sent automatically to a counterparty. The debt receipt can be shared explicitly through the operating system's file-sharing menu.

## Supabase connection

Project `sqgqydgtgugwzdsvsvnc` (AvtoCalc) is used through the supplied public/publishable key only. Existing `public.cars` is untouched. The separate `public.dolgi_*` tables have RLS, owner predicates for every operation, composite ownership-preserving foreign keys and no anonymous grants. Read, save and migration RPCs are SECURITY INVOKER, have a fixed empty search path and require `auth.uid()`. The saved state is normalized across people, categories, debts, transactions, notes, tags, debt_tags, reminders and saved_filters. `dolgi_users` stores revision and account security settings. Applied migration snapshots are in `supabase/migrations`.

Email/password login uses Supabase Auth. Registration may require email confirmation according to the existing project's settings; follow the email link, then return to this app and sign in. No unrelated Auth redirect settings are changed. Access and refresh tokens are kept in Secure HttpOnly SameSite cookies, never browser localStorage or response JSON. Every data request verifies the account against Auth; refresh preserves the idle deadline. The app polls every 15 seconds while visible/unlocked, refreshes when returning or reconnecting, and uses revision checks to reject conflicting writes. Draft form fields survive incoming synchronization.

For initial migration, open the app, sign in with the intended email, and choose “Перенести мои записи”. The transfer refuses to overwrite an existing cloud ledger and binds the legacy source to the chosen account. A JSON copy can be downloaded before transfer. CSV/JSON export and JSON restore remain in Settings. Supabase dashboard/plugin authorization does not sign the browser into an app email account.

## Debt detail and receipts

Every nested sheet, action dialog, confirmation and receipt uses the same visible Back button. Debt Back closes only that detail view, restoring its originating person, reminders, list, statistics or entry screen. Sheet headers stay visible while scrolling; long dialogs scroll with their Back controls reachable. Person dropdown and quick contacts use the same atomic selection helper; library input-synchronization notifications cannot reset a selected person.

The receipt action generates a light vertical PNG card locally with restrained green balance emphasis and no retail-receipt perforation or orange header. It includes the exact mottos “Слово дороже расписки” and “Память о долге лучше спора о нём”, direction, currency, original amount, actual repayments, setoffs, remaining balance, dates, purpose and the complete comment. Record creation and snapshot timestamps are distinct. Long comments paginate to keep canvas sizes safe on iPhone. PNGs are prepared before the Share click to preserve browser user activation. Native file sharing requires a supported browser; otherwise save the image and attach it manually. Printing uses a separate print-only card in the same palette. A receipt is an author-generated snapshot, not a counterparty acknowledgement.

## Integrity and persistence

`lib/settlements.ts` replays the full monetary history in operation-date order (creation timestamp and stable event ID break ties). Person cards, person details and statistics share these derived per-currency positions. Every monetary timeline entry shows the person's net position before and after the complete event, including when viewing one debt's history. Setoff allocations across both directions and multiple debts form one atomic event, so they never create a false intermediate net change. Notes and due-date edits do not affect money. Nothing is persisted as an editable settlement balance.

Statistics retain gross amounts in each direction and show the net position for each currency. The “Итоги по людям” section groups people by currency and their net direction; a person can appear on different sides in different currencies. Equal but still-open opposing debts are explicitly distinguished from closed accounts. These current totals always use all dates, independently of the repayment-period controls and debt-list filters.

- Monetary values are integer minor units, with two decimal places; balances are derived from debt principal minus repayment/setoff allocations.
- Immutable principal debt records are retained through settlement. Each setoff has a group ID; balanced allocations can span multiple debts for the same person and currency.
- `lib/model.ts` validates commands and restored data, rejects overpayments and invalid links, and isolates currency balances.
- Supabase save/import RPCs take a row lock and require the expected revision. All changes are atomic, with constraints checking links, overpayment and balanced setoffs. Only the authenticated account's rows can be read or changed.
- `lib/storage.ts`, `db/schema.ts` and Drizzle migrations preserve the old D1 ledger and the one-time migration binding. Supabase migrations own active cloud storage. Runtime code never creates schema objects.
- `app/api/data/route.ts` checks both platform and Supabase identity on all API calls. Production has no development identity fallback. Six-digit PINs use salted PBKDF2 and an HttpOnly HMAC lock cookie; incorrect attempts are rate-limited in the cloud account.
- Authoritative records are never stored in browser localStorage. The service worker does not cache authenticated data. A network connection is required.

## Access protection

The production page requires dispatch-owned ChatGPT sign-in and mounts the ledger only after verified Supabase email login. The current Site remains owner-private. API reads and writes independently require both identities and never accept an owner supplied by the client. POST requests reject foreign origins. Page/API responses disable caching; financial data never appears in public metadata or service-worker caches.

After 15 minutes without trusted user interaction, the app clears visible private state and requests PIN (when enabled), otherwise signs out the email session. PIN cookies are account-bound, HttpOnly, Secure in production and expire after 15 minutes; only authenticated activity or successful writes renew them. Without PIN, a separate signed activity cookie enforces the same deadline on the server. Background polling and automatic token refresh never extend it. Reauthentication clears the inactivity timer. The login/migration gate also masks itself in the background and safely restores visibility after the ledger unmounts.

Visibility/pagehide events synchronously mask the entire document, including sheet/dialog portals and receipt print content. With PIN, backgrounding also clears private UI state and requests cookie removal. Returning without PIN verifies access before unmasking. Request generations prevent a late response from reopening a locally locked view. Device OS snapshots are best-effort in a web app: the OS may capture a frame before notifying the page. No promise is made to prevent screenshots or erase files explicitly exported by the user.

## Reminders and iOS

In-app reminders use the debt's chosen offsets. Calendar export includes individual VALARM events for iPhone calendar import. Push notification delivery with the app closed is not implemented. Calendar exports are snapshots and must be updated after changes. Face ID and a Capacitor wrapper remain future work. Add the PWA to the iPhone Home Screen using Safari's Share menu.

## Verification

- `node --experimental-strip-types tests/settlements.ts`: running positions with repayments in both directions, a setoff allocated across three debts counted once, positive/negative/zero transitions, distinct people and currencies, closed debts, backdated entries, same-day ties, backup reload and reconciliation with existing debt balances.
- `node --experimental-strip-types tests/supabase-http.ts`: verified email identity, rejection of anonymous/unconfirmed accounts, persistent secure cookies, token refresh without idle extension, forged activity cookies and logout clearing.
- `node --experimental-strip-types tests/cloud-api.mjs`: authenticated cloud adapter, no anonymous/platform-bypass access, owner spoof rejection, revision conflicts, server idle expiry, account-bound PIN cookies, rate limits and renewal.
- Live PostgreSQL tests ran inside rollback-only transactions with two temporary identities: full-state saves, RLS isolation, rejected cross-account writes, stale revision rejection, full-history/PIN import, repayment, invalid overpayment rollback and atomic failed-import rollback. Live public-key HTTP checks confirmed email auth enabled and anonymous debt access returning 401.
- Supabase security advisors reported no table/RLS issues; the existing project has leaked-password protection disabled. This project-wide Auth setting was not changed through unavailable management controls.

- `node --experimental-strip-types tests/scenarios.ts`: repayment precision, rejection of overpayment/invalid dates, offsets, preserved originals, due history, long-comment search, combined filters, backup validation, quick person creation.
- `node --experimental-strip-types tests/storage.mjs`: real in-memory SQLite migration and prepared queries, read-back, owner isolation, stale revision rejection, atomic offset, clearing and restore.
- PIN API tested for secure session cookies, server-side blocking, incorrect PIN rejection, throttling, and production authentication rejection.
- Security regression tests also cover anonymous POST, spoofed owner fields, foreign origins, another account's PIN cookie, server-side idle expiry and activity renewal.
- `node --experimental-strip-types tests/privacy-lifecycle.ts`: trusted activity, wall-clock idle expiry, synchronous masking, delayed-resume races, background and back/forward cache events. Native iPhone app-switcher snapshots require device verification.
- WebMCP tools are feature-detected. This preview browser did not expose modelContext, so WebMCP runtime validation was unavailable.
- `node node_modules/typescript/bin/tsc --noEmit`.
- `node --experimental-strip-types tests/receipt-selection.ts`: dropdown/quick-contact selection parity, input synchronization, repayment and setoff receipt amounts, closed balances and long-text wrapping.
- Update browser checks at 390×844: save via dropdown and quick contact, inspect both created records, open debt, generate the receipt PNG, return to debt and back to the list. Actual native WhatsApp delivery and print/download completion are not available for end-to-end verification in the managed browser.
- Browser scenarios checked on the desktop and a 390×844 iframe viewport: debt creation, search, repayment and persistence after reload, person net balances, setoff confirmation and resulting history.
- Navigation update: 25 mobile return checks, including receipt → debt → reminders → entry; person → debt → person; category/PIN dialogs and destructive confirmations → settings; person creation; all debt action forms; saved-filter dialog; statistics → debt/person → statistics. Confirmations were dismissed without changing records. New 900px receipt PNGs were visually checked for USDT and a partially repaid USD debt.

## Development and deployment

Use the Sites-managed setup, build, preview, and publishing workflow. Logical D1 binding is `DB`; Sites provisions and deploys it. Keep `.openai/hosting.json` identity and generated applied migrations intact. Dependencies and lockfile are pnpm-managed. Preview data is separate from deployed data.
