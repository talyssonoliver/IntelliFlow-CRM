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
- [~] **Billing receipt** — brand-matched `buildReceiptEmailHtml` (PR
  feat/brand-customer-emails)
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

## ⏳ Activation (after receipt PR merges)

- [ ] Set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (+ `RESEND_FROM_EMAIL`) on
      the Railway **api** service so receipts (and future API emails) actually
      send via Resend.

## Decisions / notes

- Each remaining item is its own **complete vertical slice** — never scattered
  partials ([[feedback_red_flags_and_complete_not_scattered]]).
- Brand reference: `apps/web/src/components/shared/reset-email.tsx` +
  `supabase/templates/*.html`.
- **Everything that actually sends today is now branded.** Welcome/DSAR don't
  send (stub / text-only) → they're feature work, tracked above.
