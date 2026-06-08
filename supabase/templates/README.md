# Supabase Auth (GoTrue) email templates

Brand-matched HTML for **every** email Supabase Auth sends on the user's behalf
— account actions and account-security notifications. These replace GoTrue's
bare default templates so auth mail matches the IntelliFlow CRM brand (dark
theme, `#137fec` accent, `INTELLIFLOW` gradient wordmark — same palette as
`apps/web/src/components/shared/reset-email.tsx`).

> These are **Supabase Auth** emails, not the notifications-worker emails. Both
> ultimately send through **Resend** (Zoho is receive-only). Supabase Auth
> reaches Resend via custom SMTP; the worker uses the Resend HTTP API.

## Action emails (6)

| File                    | GoTrue template     | Action var                             |
| ----------------------- | ------------------- | -------------------------------------- |
| `confirmation.html`     | signup confirmation | `{{ .ConfirmationURL }}`               |
| `invite.html`           | invite              | `{{ .ConfirmationURL }}`               |
| `magic_link.html`       | magic link sign-in  | `{{ .ConfirmationURL }}`               |
| `recovery.html`         | password recovery   | `{{ .ConfirmationURL }}`               |
| `email_change.html`     | email change        | `{{ .ConfirmationURL }}`               |
| `reauthentication.html` | reauthentication    | `{{ .Token }}` (6-digit code, no link) |

## Account-security notification emails (7)

The "was this you?" account-takeover tripwires. GoTrue ships these **disabled**
— that was a real security gap (git issue #350 / debt `SEC-AUTH-NOTIF-001`).
They are now branded **and enabled**. Each carries a "Didn't make this change?"
callout + a **Review account security** CTA to `/settings/security`, and
preserves GoTrue's variables.

| File                                  | Notifies on           | Vars                                            |
| ------------------------------------- | --------------------- | ----------------------------------------------- |
| `notification_password_changed.html`  | password change       | `{{ .Email }}`                                  |
| `notification_email_changed.html`     | email change          | `{{ .OldEmail }}` `{{ .Email }}`                |
| `notification_phone_changed.html`     | phone change          | `{{ .Email }}` `{{ .OldPhone }}` `{{ .Phone }}` |
| `notification_mfa_enrolled.html`      | MFA factor enrolled   | `{{ .FactorType }}` `{{ .Email }}`              |
| `notification_mfa_unenrolled.html`    | MFA factor unenrolled | `{{ .FactorType }}` `{{ .Email }}`              |
| `notification_identity_linked.html`   | identity linked       | `{{ .Provider }}` `{{ .Email }}`                |
| `notification_identity_unlinked.html` | identity unlinked     | `{{ .Provider }}` `{{ .Email }}`                |

All templates have a hidden preheader for inbox preview text. Edit the HTML
directly — these files are the source of truth.

## How they apply

1. **Local dev / `supabase` CLI** — the 6 action emails are wired in
   `supabase/config.toml` under `[auth.email.template.*]`. (The security
   notifications are a hosted-only feature, applied via the script below.)
2. **Remote project** — apply everything (templates, subjects, and the 7
   `mailer_notifications_*_enabled` toggles) via the Management API:

   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs
   # preview byte counts without applying:
   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs --dry-run
   ```

   The script reads these HTML files verbatim and `PATCH`es
   `mailer_templates_*`, `mailer_subjects_*`, and
   `mailer_notifications_*_enabled` on `/v1/projects/<ref>/config/auth`.
   Override the target with `SUPABASE_PROJECT_REF`.

## Customizing

Subjects live in the `ACTIONS` / `NOTIFICATIONS` maps in
`tools/scripts/apply-auth-email-templates.mjs` (and `[auth.email.template.*]` in
`supabase/config.toml` for the action set). Keep them in sync when you edit.
