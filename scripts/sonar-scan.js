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

function stripQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value.at(-1);
  if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  return value;
}

function parseDotenvLine(line) {
  const raw = line.trim();
  if (!raw || raw.startsWith('#')) return null;
  const normalized = raw.startsWith('export ') ? raw.slice('export '.length).trim() : raw;
  const idx = normalized.indexOf('=');
  if (idx <= 0) return null;
  const key = normalized.slice(0, idx).trim();
  if (!key || key.includes(' ')) return null;
  const value = stripQuotes(normalized.slice(idx + 1).trim());
  return { key, value };
}

function loadDotenvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const entry = parseDotenvLine(line);
      if (entry && process.env[entry.key] === undefined) {
        process.env[entry.key] = entry.value;
      }
    }
  } catch {
    // ignore
  }
}

loadDotenvLocal();

const token = process.env.SONAR_TOKEN;
if (!token) {
  console.error(
    'SONAR_TOKEN not found. Set it in your environment or .env.local (do not commit tokens).'
  );
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
