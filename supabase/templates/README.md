# Supabase Auth (GoTrue) email templates

Brand-matched HTML for the transactional emails Supabase Auth sends on the
user's behalf (signup confirmation, invite, magic link, password recovery, email
change). These replace GoTrue's bare default templates so auth mail matches the
IntelliFlow CRM brand (dark theme, `#137fec` accent, `INTELLIFLOW` gradient
wordmark — same palette as `apps/web/src/components/shared/reset-email.tsx`).

> These are **Supabase Auth** emails, not the notifications-worker emails. Both
> ultimately send through **Resend** (Zoho is receive-only). Supabase Auth
> reaches Resend via custom SMTP (`smtp.resend.com`); the worker uses the Resend
> HTTP API.

## Files

| File                | GoTrue template     | Subject                                |
| ------------------- | ------------------- | -------------------------------------- |
| `confirmation.html` | signup confirmation | Confirm your IntelliFlow CRM email     |
| `invite.html`       | invite              | You're invited to IntelliFlow CRM      |
| `magic_link.html`   | magic link sign-in  | Your IntelliFlow CRM sign-in link      |
| `recovery.html`     | password recovery   | Reset your IntelliFlow CRM password    |
| `email_change.html` | email change        | Confirm your new IntelliFlow CRM email |

Each template uses the GoTrue variable `{{ .ConfirmationURL }}` for the action
link (button + plain-text fallback). A hidden preheader provides inbox preview
text. Edit the HTML directly — these files are the source of truth.

## Two places they apply

1. **Local dev / `supabase` CLI** — wired in `supabase/config.toml` under the
   `[auth.email.template.*]` blocks
   (`content_path = "./supabase/templates/..."`).
2. **Remote project** — the hosted project's auth config is set via the
   Management API. Re-apply after editing:

   ```bash
   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs
   # preview byte counts + subjects without applying:
   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs --dry-run
   ```

   The script (`tools/scripts/apply-auth-email-templates.mjs`) reads these HTML
   files verbatim and `PATCH`es `mailer_templates_*_content` +
   `mailer_subjects_*` on `/v1/projects/<ref>/config/auth`. Override the target
   with `SUPABASE_PROJECT_REF`.

## Customizing

Keep subjects in sync across three places when you change them: this README, the
`[auth.email.template.*]` blocks in `supabase/config.toml`, and the `SUBJECTS`
map in `tools/scripts/apply-auth-email-templates.mjs`.
