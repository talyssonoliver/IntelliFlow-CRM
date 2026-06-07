# Leangency Account Bootstrap Checklist

Date: 2026-06-07

Purpose: create and wire Leangency's own agency account in IntelliFlow CRM while
the CAO dashboard and portal are still being built.

> NOTE: Internal identifiers (personal emails, DB row IDs/UUIDs, deployment IDs,
> client tenant hosts) are redacted as `<placeholders>` because this repo is
> public. The real values live in the production env / `.env.local` and the
> private ops record — never commit them here.

## Current state

| Area                   | Current finding                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live web app           | Vercel project `intelli-flow-crm-web`; public signup responded at `https://intelli-flow-crm-web.vercel.app/signup`.                                                                                                                       |
| Legacy/fallback domain | `https://intelliflow-crm.com/signup` did not resolve from local DNS during the 2026-06-07 check.                                                                                                                                          |
| Signup behaviour       | `auth.signup` creates a Supabase Auth user. The app user is created on first authenticated session.                                                                                                                                       |
| Tenant assignment      | First session auto-provisions users into the `default` tenant (`Default Organization`) unless the user already exists in another tenant.                                                                                                  |
| Bootstrap admin        | `<bootstrap-admin-email>` is hardcoded as bootstrap admin. Other emails require `BOOTSTRAP_ADMIN_EMAILS`, `INITIAL_ADMIN_EMAILS`, or `OWNER_EMAIL` to be configured.                                                                      |
| Resend                 | IntelliFlow CRM local env files do not currently set `RESEND_API_KEY`. The portal/CAO Resend key is send-capable, but restricted from read/list endpoints such as domains or email history. This is acceptable for production sending.    |
| Leangency inbound mail | Zoho Mail is verified for `leangency.com` as of 2026-06-07. The operational groups `hello@`, `support@`, `billing@`, and `crm@` deliver to the owner mailbox. Keep Resend for application-generated sends and Zoho for receiving/replies. |

## Production state as of 2026-06-07

| Area                        | Status                                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRM tenant                  | Created in production DB: `Leangency` / `leangency` / `<leangency-tenant-id>`.                                                                                                                                                   |
| CRM owner user              | Created in production DB: `<owner-email>` / `ADMIN` / `<leangency-system-user-id>`.                                                                                                                                              |
| Owner email verification    | Pending. Supabase invite was sent to `<owner-email>`; owner must accept the invite/verification link.                                                                                                                            |
| Fallback admin              | Existing production admin remains `<bootstrap-admin-email>` on the `default` tenant.                                                                                                                                             |
| CRM Vercel env              | Production now has `BOOTSTRAP_ADMIN_EMAILS`, `APP_URL`, `PORTAL_INTERNAL_SECRET`, `LEANGENCY_TENANT_ID`, and `LEANGENCY_SYSTEM_USER_ID`.                                                                                         |
| Portal Vercel env           | Production now has `CAO_INBOUND_URL` and `INTELLIFLOW_INBOUND_URL` in addition to Resend/contact/internal-secret vars.                                                                                                           |
| Redeploy status             | CRM redeploy `<crm-deployment-id>` is `READY`. Clean portal deployment `<portal-deployment-id>` is `READY` and aliased to `*.leangency.com`.                                                                                     |
| Direct CRM smoke test       | `POST https://intelli-flow-crm-web.vercel.app/api/trpc/inbound.createLead` returned `200` and created lead `<smoke-test-lead-id>` under tenant `<leangency-tenant-id>`.                                                          |
| Portal E2E status           | Green on 2026-06-07 using tenant host `https://<portal-tenant-host>/api/discover`: portal row `<portal-row-id>`, CAO lead `<cao-lead-id>`, IntelliFlow lead `<intelliflow-lead-id>`, IntelliFlow tenant `<leangency-tenant-id>`. |
| CAO DB migrations           | Production CAO had four pending Prisma migrations and returned `P2022` during portal fan-out. `prisma migrate deploy` applied the pending migrations on 2026-06-07; CAO handoff then returned `ok`.                              |
| Portal DB compatibility fix | `src/app/api/discover/route.ts` now writes both `answers` and legacy `payload` because production `discover_submissions.payload` remains `NOT NULL`.                                                                             |

## Recommended Leangency account

| Field                      | Value                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Tenant name                | `Leangency`                                                                               |
| Tenant slug                | `leangency`                                                                               |
| Owner/admin email          | `talysson@leangency.com`                                                                  |
| Fallback first-login email | `<bootstrap-admin-email>` if production still only promotes the hardcoded bootstrap admin |
| Sender email               | `talysson@leangency.com`                                                                  |
| General portal/team inbox  | `hello@leangency.com`                                                                     |
| CRM operational inbox      | `crm@leangency.com`                                                                       |
| Client support inbox       | `support@leangency.com`                                                                   |
| Billing inbox              | `billing@leangency.com`                                                                   |

Do not use `onboarding@resend.dev` in production.

## Required production env

Set these on the API service that serves tRPC:

```bash
PORTAL_INTERNAL_SECRET=<same 32+ char value as leangency-portal and CAO>
LEANGENCY_TENANT_ID=<leangency-tenant-id>
LEANGENCY_SYSTEM_USER_ID=<leangency-system-user-id>
BOOTSTRAP_ADMIN_EMAILS=talysson@leangency.com,<bootstrap-admin-email>
APP_URL=https://intelli-flow-crm-web.vercel.app
NEXT_PUBLIC_CONTACT_EMAIL=crm@leangency.com
NEXT_PUBLIC_SENDER_EMAIL=crm@leangency.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@leangency.com
```

Set these on the portal:

```bash
PORTAL_INTERNAL_SECRET=<same value>
CAO_INBOUND_URL=https://<cao-host>/api/internal/inbound-leads
INTELLIFLOW_INBOUND_URL=https://<crm-api-host>/api/trpc/inbound.createLead
RESEND_FROM_EMAIL=talysson@leangency.com
CONTACT_EMAIL=hello@leangency.com
NEXT_PUBLIC_SUPPORT_EMAIL=support@leangency.com
```

Set these on CAO:

```bash
PORTAL_INTERNAL_SECRET=<same value>
LEANGENCY_PORTAL_INTERNAL_URL=https://admin.leangency.com
RESEND_FROM_EMAIL=talysson@leangency.com
OUTREACH_SEND_DRY_RUN=true
```

Keep `OUTREACH_SEND_DRY_RUN=true` until a dry-run proves recipient resolution
and rendered emails are correct.

## Bootstrap sequence

1. Confirm the live CRM URL and API URL. Do not assume `intelliflow-crm.com`
   until DNS resolves.
2. Ensure `BOOTSTRAP_ADMIN_EMAILS` includes `talysson@leangency.com`.
3. Create or update a `Tenant` row named `Leangency` with slug `leangency`.
   Status: done in production DB.
4. Sign up with `talysson@leangency.com` or create the user through the approved
   admin path. Status: invite sent through Supabase admin flow.
5. Verify email and complete first login so `ensureAppUserSession` creates the
   app user. Status: pending owner email verification.
6. Confirm the user is `ADMIN` and belongs to the `Leangency` tenant, not the
   shared `default` tenant. Status: done in production DB.
7. Set `LEANGENCY_TENANT_ID` and `LEANGENCY_SYSTEM_USER_ID` to the actual row
   IDs. Status: done in Vercel production env and active after CRM redeploy.
8. Submit a portal `/discover` test with an internal test email. Status: done on
   2026-06-07 using `<portal-tenant-host>`; do not use the apex host for API
   smoke tests because the portal proxy rewrites apex requests to `/apex`.
9. Verify two downstream records:
   - CAO creates/returns a `portal_discover` lead.
   - IntelliFlow `inbound.createLead` returns a lead under
     `LEANGENCY_TENANT_ID`. Status: done on 2026-06-07; see IDs above.
10. Only after the dry-run checks pass, decide whether to enable live CAO sends
    by setting `OUTREACH_SEND_DRY_RUN=false`.

## Account creation note

Do not create the live account with a generated password and then paste the
password into chat. The safer path is:

1. Configure bootstrap/admin env first.
2. Use the live signup form with the owner present to enter the password.
3. Verify via the mailbox link.
4. Use a password manager-owned credential from the start.

If the owner cannot be present, use an approved admin invite/password-reset flow
so the owner sets the password directly.
