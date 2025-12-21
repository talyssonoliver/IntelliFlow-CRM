#!/usr/bin/env node

/**
 * SonarQube Quality Gate Status Checker (local)
 *
 * - Loads `.env.local` because Node scripts do not automatically load it.
 * - Uses `fetch` (no curl dependency).
 *
 * Env:
 * - SONAR_HOST_URL (default: http://localhost:9000)
 * - SONAR_PROJECT_KEY (default: IntelliFlow)
 * - SONAR_TOKEN (optional if admin creds are set)
 * - SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD (local-only; optional)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

function loadDotenvFile(filename) {
  const envPath = path.join(REPO_ROOT, filename);
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
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

loadDotenvFile('.env.local');

function readSonarProjectProperties() {
  const propsPath = path.join(REPO_ROOT, 'sonar-project.properties');
  if (!fs.existsSync(propsPath)) return {};

  const props = {};
  const content = fs.readFileSync(propsPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    props[key] = value;
  }
  return props;
}

const sonarProps = readSonarProjectProperties();
const hostUrlFallback = sonarProps['sonar.host.url'] || 'http://localhost:9000';
const projectKeyFallback = sonarProps['sonar.projectKey'] || 'IntelliFlow';

const hostUrlEnv = process.env.SONAR_HOST_URL;
const projectKeyEnv = process.env.SONAR_PROJECT_KEY;

const SONAR_HOST_URL = hostUrlEnv || hostUrlFallback;
const SONAR_PROJECT_KEY = projectKeyEnv || projectKeyFallback;
const SONAR_TOKEN = process.env.SONAR_TOKEN;
const SONARQUBE_ADMIN_USER = process.env.SONARQUBE_ADMIN_USER;
const SONARQUBE_ADMIN_PASSWORD = process.env.SONARQUBE_ADMIN_PASSWORD;

const authUser = SONARQUBE_ADMIN_USER || SONAR_TOKEN;
const authPass = SONARQUBE_ADMIN_USER ? SONARQUBE_ADMIN_PASSWORD : '';

if (!authUser) {
  console.error(
    'No SonarQube credentials found (set SONAR_TOKEN, or SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD).'
  );
  process.exit(1);
}

async function fetchJson(endpointPath) {
  const url = `${SONAR_HOST_URL}/api${endpointPath}`;
  const auth = Buffer.from(`${authUser}:${authPass ?? ''}`).toString('base64');

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'IntelliFlow-Sonar-Status-Checker',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  return await res.json();
}

function statusLabel(status) {
  if (status === 'OK') return 'OK';
  if (status === 'WARN') return 'WARN';
  return 'ERROR';
}

async function checkQualityGate(projectKey) {
  const qg = await fetchJson(`/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`);
  const projectStatus = qg?.projectStatus;
  if (!projectStatus) {
    console.error(`Project not found: ${projectKey}`);
    process.exit(1);
  }

  const overall = projectStatus.status;
  console.log(`Quality Gate: ${statusLabel(overall)} (${overall})`);

  const conditions = Array.isArray(projectStatus.conditions) ? projectStatus.conditions : [];
  for (const c of conditions) {
    const s = c.status;
    const actual = c.actualValue ?? 'N/A';
    console.log(`- ${statusLabel(s)} ${c.metricKey}: ${actual}`);
  }

  process.exit(overall === 'OK' ? 0 : 1);
}

try {
  try {
    await checkQualityGate(SONAR_PROJECT_KEY);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const shouldFallback =
      projectKeyEnv && projectKeyEnv !== projectKeyFallback && (msg.includes('not found') || msg.includes('HTTP 404'));
    if (!shouldFallback) throw error;

    console.warn(
      `Warning: SONAR_PROJECT_KEY=${projectKeyEnv} not found. Falling back to sonar-project.properties projectKey=${projectKeyFallback}.`
    );

    // Retry using the repo's sonar-project.properties key.
    await checkQualityGate(projectKeyFallback);
  }
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Tip: start SonarQube with `pnpm run sonar:start` (or `node scripts/sonarqube-helper.js start`).');
  process.exit(1);
}
