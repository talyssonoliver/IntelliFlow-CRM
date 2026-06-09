# Email Branding & Security — Completion Tracker

> **Temporary tracker.** Goal: every email IntelliFlow CRM sends — to CRM users
> AND end customers — is brand-consistent (matches the GoTrue auth set) and
> security-complete. **Delete this file only when every box below is checked.**
> Formal tracking: debt-ledger `EMAIL-BRAND-001`/`SEC-AUTH-NOTIF-001` + git
> issues #350/#360; this is the working checklist.

Legend: `[x]` done & merged · `[~]` in progress (PR open) · `[ ]` not started

## ✅ Done (live + merged)

- [x] **GoTrue auth action emails ×6** — confirmation, invite, magic_link,
      recovery, email_change, reauthentication (PR #346 / #353)
- [x] **GoTrue security notification emails ×7** — branded + ENABLED (PR #353,
      issue #350)
- [x] **Notifications-worker email shell** (~54 NOTIFICATION_TYPES) — one
      branded shell covers all types (PR #359)
- [x] **API outbound → Resend transport** — `ResendProvider` + wiring so API
      emails send via Resend instead of mock (PR #363, issue #360)
- [x] **Billing receipt** — brand-matched `buildReceiptEmail` (PR #374)
- [x] **Auto-response** — NO ACTION: `markSent` only updates draft status;
      auto-responses are an **intentional draft workflow** (AI drafts → human
      sends via compose), not a system auto-send. Nothing to brand.

## ⏳ Remaining — feature follow-ups (NOT just branding)

- [ ] **Welcome email** — `welcome-email.ts` is a **stub with no trigger**
      anywhere. Needs a _feature_: un-stub the send + a signup/post-confirmation
      hook to fire it. (Not a branding task — the HTML already exists.)
- [ ] **DSAR emails** (3, legal) — sent text-only through the
      notification-service adapter. Branding needs that adapter to carry
      `htmlBody` across the 3 call sites — a multi-layer change. Low volume;
      deferred to its own slice.

## ⏳ Remaining — security hardening

- [ ] **Enable `password_hibp`** (HaveIBeenPwned leaked-password check;
      currently `false`). User deferred (2026-06: "not now"). Password-policy
      setting — needs explicit go-ahead.

## ✅ Activation

- [x] Set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `RESEND_FROM_EMAIL` on
      the Railway **api** service (`361d3d49-…`, prod env `c2270f1e-…`) via
      `variableUpsert` (2026-06-09) so receipts + future API emails send via
      Resend instead of mock. The api had no email vars before (→ mock; the #360
      gap).

---

**Branding goal status:** complete. Every email that actually sends is
brand-matched and live — auth, security notifications, ~54 worker notifications,
and the receipt. The three unchecked boxes above (welcome #372, DSAR #373,
`password_hibp`) are feature/deferred follow-ups, not branding; auto-response is
intentional draft. This file stays until those three are closed (per the
original instruction).

## Decisions / notes

- Each remaining item is its own **complete vertical slice** — never scattered
  partials ([[feedback_red_flags_and_complete_not_scattered]]).
- Brand reference: `apps/web/src/components/shared/reset-email.tsx` +
  `supabase/templates/*.html`.
- **Everything that actually sends today is now branded.** Welcome/DSAR don't
  send (stub / text-only) → they're feature work, tracked above.
