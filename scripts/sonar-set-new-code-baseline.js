#!/usr/bin/env node
/**
 * Set SonarQube "New Code" definition to a specific (baseline) analysis.
 *
 * Why: When New Code is set to PREVIOUS_VERSION and project versions don't change,
 * SonarQube can treat the whole project as "new", causing quality gates to fail.
 * Baselineing to a known analysis restores Clean-as-You-Code behavior.
 *
 * Usage:
 *   node scripts/sonar-set-new-code-baseline.js
 *   node scripts/sonar-set-new-code-baseline.js --project IntelliFlow --branch main
 *   node scripts/sonar-set-new-code-baseline.js --analysis <analysisUuid>
 *
 * Env:
 * - SONAR_HOST_URL
 * - SONAR_PROJECT_KEY
 * - SONAR_BRANCH
 * - SONAR_TOKEN (optional if admin creds are present)
 * - SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD (preferred; local-only)
 */

const fs = require('node:fs');
const path = require('node:path');

function loadDotenvLocal(repoRoot) {
  const envPath = path.join(repoRoot, '.env.local');
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

function readSonarProjectProperties(repoRoot) {
  const propsPath = path.join(repoRoot, 'sonar-project.properties');
  if (!fs.existsSync(propsPath)) return {};

  const props = {};
  const content = fs.readFileSync(propsPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    props[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  }
  return props;
}

function getArgValue(names) {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current) continue;
    for (const name of names) {
      if (current === name) return args[index + 1];
      if (current.startsWith(`${name}=`)) return current.slice(name.length + 1);
    }
  }
  return undefined;
}

function getAuth() {
  const adminUser = process.env.SONARQUBE_ADMIN_USER;
  const adminPass = process.env.SONARQUBE_ADMIN_PASSWORD;
  const token = process.env.SONAR_TOKEN;

  const authUser = adminUser || token;
  const authPass = adminUser ? adminPass : '';

  if (!authUser) {
    throw new Error(
      'No SonarQube credentials found (set SONAR_TOKEN, or SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD).'
    );
  }

  return `Basic ${Buffer.from(`${authUser}:${authPass ?? ''}`).toString('base64')}`;
}

async function fetchJson(url, authHeader) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'User-Agent': 'IntelliFlow-Sonar-NewCodeBaseline',
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function postForm(url, authHeader, form) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'IntelliFlow-Sonar-NewCodeBaseline',
    },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

async function main() {
  const repoRoot = process.cwd();
  loadDotenvLocal(repoRoot);

  const props = readSonarProjectProperties(repoRoot);

  const hostUrl = getArgValue(['--host']) || process.env.SONAR_HOST_URL || props['sonar.host.url'] || 'http://localhost:9000';
  const projectKey =
    getArgValue(['--project', '--projectKey']) ||
    process.env.SONAR_PROJECT_KEY ||
    props['sonar.projectKey'] ||
    'IntelliFlow';
  const branch = getArgValue(['--branch']) || process.env.SONAR_BRANCH || process.env.GITHUB_REF_NAME || 'main';
  const analysisOverride = getArgValue(['--analysis']);

  const authHeader = getAuth();

  let analysisKey = analysisOverride;
  if (!analysisKey) {
    const analysesUrl = new URL(`${hostUrl}/api/project_analyses/search`);
    analysesUrl.searchParams.set('project', projectKey);
    analysesUrl.searchParams.set('branch', branch);
    analysesUrl.searchParams.set('ps', '1');

    const data = await fetchJson(analysesUrl.toString(), authHeader);
    const latest = Array.isArray(data.analyses) ? data.analyses[0] : null;
    if (!latest?.key) {
      throw new Error(`No analyses found for project=${projectKey} branch=${branch}`);
    }
    analysisKey = latest.key;
  }

  const form = new URLSearchParams();
  form.set('project', projectKey);
  form.set('branch', branch);
  form.set('type', 'SPECIFIC_ANALYSIS');
  form.set('value', analysisKey);

  await postForm(`${hostUrl}/api/new_code_periods/set`, authHeader, form);

  const showUrl = new URL(`${hostUrl}/api/new_code_periods/show`);
  showUrl.searchParams.set('project', projectKey);
  showUrl.searchParams.set('branch', branch);
  const result = await fetchJson(showUrl.toString(), authHeader);

  console.log(`Updated new code definition:`);
  console.log(`- Project: ${result.projectKey ?? projectKey}`);
  console.log(`- Branch: ${result.branchKey ?? branch}`);
  console.log(`- Type: ${result.type ?? 'SPECIFIC_ANALYSIS'}`);
  console.log(`- Value: ${result.value ?? analysisKey}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

