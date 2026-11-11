# Friends Pharmacy POS

A multi-branch pharmacy point-of-sale and inventory application. The browser UI is served by Vercel; authentication, branch permissions, sales, stock, and payment verification are handled by Vercel API routes backed by Supabase.

## Current capabilities

- Staff sign-in, password recovery, branch selection, and role-aware branch/staff administration.
- Organization-wide medicine catalogue with branch-specific batch inventory and expiry dates.
- FEFO stock allocation, expiry/low-stock warnings, server-validated sales, and branch activity history.
- Cash checkout and Paystack card/mobile-money checkout. Online payments reserve stock and are only completed after server-side gateway verification.
- All-time/today sales summaries, printable receipts, and CSV export of the latest 500 sales.
- Admin-created staff accounts with role and branch access; temporary passwords must be changed before workspace access.
- Responsive layouts, visible request loading feedback, and a persistent light/dark mode switch.

## Requirements

- A Supabase project with the SQL Editor and Auth enabled.
- A Vercel account connected to this GitHub repository for automatic deployments.
- A Paystack account for online payments. Begin with test keys.
- Node.js 20 or newer for local checks and local development.

## Supabase setup

1. Keep the Supabase database password private. Apply the migration only to the fresh project confirmed for this app.
2. Open `supabase/migrations/202611110001_initial_schema.sql` in VS Code, copy its contents, and paste/run it in the project's **SQL Editor**. Confirm that the query completes successfully before continuing.
3. In **Authentication → Providers → Email**, enable email/password sign-in. After the first Vercel preview is created, add its URL to the Auth redirect allow-list. Set the production site URL and redirect allow-list after choosing the production domain.
4. In **Authentication → Users**, create the first user with the initial admin email configured as `INITIAL_ADMIN_EMAIL`. The first login will create the pharmacy organization and branch.
5. In **Project Settings → API Keys**, note the project URL and public anon/publishable key. Configure those and the service-role/secret key directly in Vercel's environment settings. Never put the service-role key in `app.js`, share it in chat, or commit it to source control.
6. Configure Supabase database backups and retention appropriate to the pharmacy's data and operational requirements.

The migration disables direct table access for browser roles and enables row-level security. The application API uses the service key only on the server and checks the signed-in user's branch membership before protected operations. Do not expose the service key or grant it to client code.

## Run locally

1. To run locally, copy `.env.example` to `.env.local`, fill in the values on your machine, and never share or commit `.env.local`.
2. Run `vercel dev` from this folder. This serves the static app and `/api` functions together; opening `index.html` directly will not work because the app needs its API.
3. Run `npm run check` for JavaScript syntax validation and `npm test` for API boundary smoke tests.

For the first administrator, create the Auth user in Supabase before signing in. The first successful login is shown the organization/branch setup form. The API only allows bootstrap for `INITIAL_ADMIN_EMAIL`, and setup can only be completed once.

Owners and admins can create staff accounts by email and assign roles/branches. The server generates a one-time temporary password and shows it to the administrator once; share it with the staff member through a secure channel. The first successful login is restricted to setting a new password. The API enforces that restriction until the password is changed. Staff creation does not depend on Supabase email delivery.

## Vercel deployment

1. Connect the Vercel project to `gvafram3/friends_pharmacy` under **Project → Settings → Git** and set `main` as the Production Branch. Vercel will create Preview deployments for other branches and deploy Production on each push to `main`.
2. In **Project → Settings → Environment Variables**, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `INITIAL_ADMIN_EMAIL` to **Preview** and **Production**. Add `APP_URL` and `CRON_SECRET` to **Production**. Enter secrets directly in Vercel; never send them in chat or commit them. Keep `PAYSTACK_SECRET_KEY` unset until ready to test Paystack.
3. Apply `supabase/migrations/202611110002_create_staff_membership.sql` in the Supabase SQL Editor before using staff account creation. The initial schema migration must already be applied.
4. Configure Supabase Auth's site URL and redirect allow-list for the production domain. Recovery links use `APP_URL`.
5. Push changes to a branch to get a Preview deployment; merge or push to `main` for Production. Verify the Vercel deployment is Ready, then test login, staff password setup, inventory, cash checkout, and receipts using test data.
6. For Paystack, add a test secret key only to Vercel's server environment, then configure the test webhook at `https://your-domain/api/payments/webhook`. Keep live credentials unset until test-mode and compliance reviews are complete.

`vercel.json` sets baseline security headers and schedules daily cleanup of expired payment reservations (midnight UTC), compatible with Vercel Hobby. Pending reservations are also expired when a new sale is created, but abandoned reservations can hold stock until the scheduled cleanup. Use a plan and schedule that support more frequent cleanup before relying on this for production operations.

## Environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public/anon key used for Auth requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for API database operations |
| `PAYSTACK_SECRET_KEY` | Server-only Paystack test or live secret |
| `APP_URL` | Canonical app origin, used for Auth and payment callbacks |
| `INITIAL_ADMIN_EMAIL` | Email allowed to bootstrap the first pharmacy organization |
| `CRON_SECRET` | Bearer secret used by the scheduled reservation cleanup |

## Before using real pharmacy or patient data

This application is an implementation starting point, not a certified pharmacy or accounting system. The database migration, payment integration, deployment configuration, and role/privacy rules have not been verified against a live Supabase or Paystack project. Do not enter real patient information or process live payments until the responsible pharmacy, security, privacy, and compliance stakeholders have reviewed and tested the complete deployment.

At minimum, test role restrictions across branches, concurrent checkout and stock reservations, duplicate/retried Paystack webhooks, payment cancellation/expiry, recovery emails, database restoration, and audit-log retention. Confirm applicable Ghanaian pharmacy, data protection, tax, payment, and record-retention requirements with qualified professionals. Use test data in non-production environments.

The current UI provides CSV export, not a database backup/restore facility. Use Supabase's managed backups or a separately tested database export/restore process; CSV exports are not a substitute for backups.
