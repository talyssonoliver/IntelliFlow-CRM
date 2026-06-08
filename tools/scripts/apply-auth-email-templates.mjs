#!/usr/bin/env node
// Apply the brand-matched Supabase Auth (GoTrue) email templates in
// `supabase/templates/` to a remote Supabase project via the Management API.
//
// The committed HTML files are the single source of truth; this script pushes
// them (plus their subjects) to the project's auth config. Local dev picks the
// same files up through the [auth.email.template.*] blocks in supabase/config.toml.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node tools/scripts/apply-auth-email-templates.mjs [--dry-run]
//
// Env:
//   SUPABASE_ACCESS_TOKEN  (required) personal access token (sbp_...)
//   SUPABASE_PROJECT_REF   (optional) project ref; defaults to the prod ref below.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', '..', 'supabase', 'templates');
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gpirtcvwmssxhwcwwucq';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

// GoTrue template key -> subject line. Keep in sync with supabase/config.toml.
const SUBJECTS = {
  confirmation: 'Confirm your IntelliFlow CRM email',
  invite: "You're invited to IntelliFlow CRM",
  magic_link: 'Your IntelliFlow CRM sign-in link',
  recovery: 'Reset your IntelliFlow CRM password',
  email_change: 'Confirm your new IntelliFlow CRM email',
};

function buildPayload() {
  const payload = {};
  for (const [key, subject] of Object.entries(SUBJECTS)) {
    const html = readFileSync(join(TEMPLATES_DIR, `${key}.html`), 'utf8');
    payload[`mailer_templates_${key}_content`] = html;
    payload[`mailer_subjects_${key}`] = subject;
  }
  return payload;
}

async function main() {
  const payload = buildPayload();
  if (DRY_RUN) {
    for (const key of Object.keys(SUBJECTS)) {
      console.log(`${key.padEnd(13)} ${payload[`mailer_templates_${key}_content`].length} bytes  subject="${payload[`mailer_subjects_${key}`]}"`);
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
  console.log(`HTTP ${res.status} — applied ${Object.keys(SUBJECTS).length} templates to project ${PROJECT_REF}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
