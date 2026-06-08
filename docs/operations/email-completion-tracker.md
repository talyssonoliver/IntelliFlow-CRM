# Email Branding & Security — Completion Tracker

> **Temporary tracker.** Goal: every email IntelliFlow CRM sends — to CRM users
> AND end customers — is brand-consistent (matches the GoTrue auth set) and
> security-complete. **Delete this file only when every box below is checked.**
> Formal tracking lives in debt-ledger `EMAIL-BRAND-001` + git issue #350 +
> PG-085; this file is the working checklist for the active goal.

Legend: `[x]` done & merged · `[~]` in progress (PR open) · `[ ]` not started

## ✅ Done (live in prod + merged)

- [x] GoTrue auth **action** emails ×6 — confirmation, invite, magic_link,
      recovery, email_change (PR #346), reauthentication (PR #353)
- [x] GoTrue **security notification** emails ×7 — password/email/phone changed,
      MFA enrolled/unenrolled, identity linked/unlinked — **branded + ENABLED**
      (PR #353, issue #350, debt `SEC-AUTH-NOTIF-001` resolved)

## ⏳ Remaining (this goal)

### 1. Notifications-worker email shell (~54 notification types) `[~]`

The single generic HTML shell the notifications-worker sends for all
`NOTIFICATION_TYPES` (`packages/validators/src/notifications.ts`). One shell →
brand once, covers all 54. To CRM users.

- [x] Locate where the worker builds the email HTML body (main.ts payload
      assembly)
- [x] Apply the brand shell (`src/templates/notification-email.ts`: dark theme,
      INTELLIFLOW badge, #137fec, footer, priority pill, escaping) — wired in
      main.ts
- [x] Unit tests (9 cases: brand markers, escaping, htmlBody passthrough,
      priority, preheader) — all 106 worker tests green
- [~] Full pre-ship + CI green + merge (PR open)

### 2. Customer-facing / app-sent transactional emails `[ ]`

To end customers (leads/contacts) and account-level. Brand to match; finish
provider wiring where still mock (ADR-041 residual).

- [ ] Auto-response replies (`AutoResponseService`)
- [ ] Appointment confirmation / reminder (ICS — IFC-158)
- [ ] Case / SLA reminders (`apps/web/src/lib/cases/reminders-service.ts`)
- [ ] Welcome email (`apps/web/src/lib/shared/welcome-email.ts`)
- [ ] Billing / receipts (`apps/api/src/modules/billing/billing.router.ts`)

### 3. Security hardening `[ ]`

- [ ] Enable `password_hibp` (HaveIBeenPwned leaked-password check; currently
      `false`). **NOTE:** this is a password-POLICY/security setting — needs
      explicit user go-ahead before flipping live (per safety rules).

## Decisions / notes

- Each item above is its own **complete vertical slice** (one cohesive PR),
  never scattered partials — see memory
  `feedback_red_flags_and_complete_not_scattered`.
- Brand reference: `apps/web/src/components/shared/reset-email.tsx` +
  `supabase/templates/*.html`.
- Apply order: (1) notification shell → (2) customer-facing → (3) password_hibp.
