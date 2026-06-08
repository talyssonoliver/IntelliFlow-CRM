#!/usr/bin/env node
// Apply the complete IntelliFlow CRM Supabase Auth (GoTrue) email set in
// `supabase/templates/` to a remote Supabase project via the Management API.
//
// Covers EVERY email GoTrue sends on the user's behalf:
//   - 6 action emails  (confirmation, invite, magic_link, recovery, email_change,
//     reauthentication)
//   - 7 account-security NOTIFICATIONS (password/email/phone changed, MFA
//     enrolled/unenrolled, identity linked/unlinked) — branded AND ENABLED. These
//     are the "was this you?" account-takeover tripwires; GoTrue ships them OFF.
//     See git issue #350 / debt SEC-AUTH-NOTIF-001.
//
// The committed HTML files are the single source of truth. Local dev picks up the
// action templates via the [auth.email.template.*] blocks in supabase/config.toml.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs [--dry-run]
// Env: SUPABASE_ACCESS_TOKEN (required, sbp_...), SUPABASE_PROJECT_REF (optional).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', 'supabase', 'templates');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gpirtcvwmssxhwcwwucq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

// Action emails: file -> { subject }. API keys: mailer_templates_<k>_content + mailer_subjects_<k>.
const ACTIONS = {
  confirmation: { file: 'confirmation.html', subject: 'Confirm your IntelliFlow CRM email' },
  invite: { file: 'invite.html', subject: "You're invited to IntelliFlow CRM" },
  magic_link: { file: 'magic_link.html', subject: 'Your IntelliFlow CRM sign-in link' },
  recovery: { file: 'recovery.html', subject: 'Reset your IntelliFlow CRM password' },
  email_change: { file: 'email_change.html', subject: 'Confirm your new IntelliFlow CRM email' },
  reauthentication: { file: 'reauthentication.html', subject: "Confirm it's you — IntelliFlow CRM" },
};

// Security notifications: API keys mailer_templates_<k>_notification_content +
// mailer_subjects_<k>_notification + mailer_notifications_<k>_enabled (we enable all).
const NOTIFICATIONS = {
  password_changed: { file: 'notification_password_changed.html', subject: 'Your IntelliFlow CRM password was changed' },
  email_changed: { file: 'notification_email_changed.html', subject: 'Your IntelliFlow CRM email address was changed' },
  phone_changed: { file: 'notification_phone_changed.html', subject: 'Your IntelliFlow CRM phone number was changed' },
  mfa_factor_enrolled: { file: 'notification_mfa_enrolled.html', subject: 'A new MFA method was added to your IntelliFlow CRM account' },
  mfa_factor_unenrolled: { file: 'notification_mfa_unenrolled.html', subject: 'An MFA method was removed from your IntelliFlow CRM account' },
  identity_linked: { file: 'notification_identity_linked.html', subject: 'A sign-in method was linked to your IntelliFlow CRM account' },
  identity_unlinked: { file: 'notification_identity_unlinked.html', subject: 'A sign-in method was unlinked from your IntelliFlow CRM account' },
};

function read(file) {
  return readFileSync(join(TEMPLATES_DIR, file), 'utf8');
}

function buildPayload() {
  const payload = {};
  for (const [key, { file, subject }] of Object.entries(ACTIONS)) {
    payload[`mailer_templates_${key}_content`] = read(file);
    payload[`mailer_subjects_${key}`] = subject;
  }
  for (const [key, { file, subject }] of Object.entries(NOTIFICATIONS)) {
    payload[`mailer_templates_${key}_notification_content`] = read(file);
    payload[`mailer_subjects_${key}_notification`] = subject;
    payload[`mailer_notifications_${key}_enabled`] = true;
  }
  return payload;
}

async function main() {
  const payload = buildPayload();
  if (DRY_RUN) {
    for (const key of Object.keys(ACTIONS)) {
      console.log(`action       ${key.padEnd(22)} ${payload[`mailer_templates_${key}_content`].length} bytes`);
    }
    for (const key of Object.keys(NOTIFICATIONS)) {
      console.log(`notification ${key.padEnd(22)} ${payload[`mailer_templates_${key}_notification_content`].length} bytes  enabled=true`);
    }
    console.log('--dry-run: nothing applied.');
    return;
  }
  if (!TOKEN) {
    console.error('ERROR: SUPABASE_ACCESS_TOKEN is required (sbp_... personal access token).');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'intelliflow-crm-admin/1.0',
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`ERROR ${res.status}: ${body.slice(0, 400)}`);
    process.exit(1);
  }
  const n = Object.keys(ACTIONS).length + Object.keys(NOTIFICATIONS).length;
  console.log(`HTTP ${res.status} — applied ${n} templates (+enabled ${Object.keys(NOTIFICATIONS).length} security notifications) to project ${PROJECT_REF}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
