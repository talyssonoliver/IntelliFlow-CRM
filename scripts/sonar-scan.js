#!/usr/bin/env node
/**
 * Run SonarQube scanner with a token from the environment.
 *
 * Why: the JS sonarqube-scanner wrapper does not expand `${env.*}` from
 * `sonar-project.properties`, and we must not hardcode tokens in git.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function loadDotenvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) continue;
      const normalized = raw.startsWith('export ') ? raw.slice('export '.length).trim() : raw;
      const idx = normalized.indexOf('=');
      if (idx <= 0) continue;
      const key = normalized.slice(0, idx).trim();
      let value = normalized.slice(idx + 1).trim();
      if (!key || key.includes(' ')) continue;
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

loadDotenvLocal();

const token = process.env.SONAR_TOKEN;
if (!token) {
  console.error('SONAR_TOKEN not found. Set it in your environment or .env.local (do not commit tokens).');
  process.exit(1);
}

const npxCmd = 'npx';
const args = ['sonarqube-scanner', `-Dsonar.token=${token}`];

const result = spawnSync(npxCmd, args, {
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error('Failed to run sonarqube-scanner:', result.error.message);
  process.exit(1);
}

process.exit(typeof result.status === 'number' ? result.status : 1);
