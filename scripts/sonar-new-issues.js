#!/usr/bin/env node
/**
 * Fetch SonarQube issues in the "new code" period and print a compact summary.
 *
 * Requires either:
 * - SONAR_TOKEN with browse permissions, or
 * - SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD (local-only).
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

function groupCount(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = item?.[key] ?? 'UNKNOWN';
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function getArgValue(name) {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (!current) continue;
    if (current === name) return args[i + 1];
    if (current.startsWith(`${name}=`)) return current.slice(name.length + 1);
  }
  return undefined;
}

async function main() {
  const repoRoot = process.cwd();
  loadDotenvLocal(repoRoot);

  const props = readSonarProjectProperties(repoRoot);
  const hostUrl = process.env.SONAR_HOST_URL || props['sonar.host.url'] || 'http://localhost:9000';
  const projectKey = props['sonar.projectKey'] || process.env.SONAR_PROJECT_KEY || 'IntelliFlow';
  const branch =
    getArgValue('--branch') || process.env.SONAR_BRANCH || process.env.GITHUB_REF_NAME || undefined;

  const adminUser = process.env.SONARQUBE_ADMIN_USER;
  const adminPass = process.env.SONARQUBE_ADMIN_PASSWORD;
  const token = process.env.SONAR_TOKEN;

  const authUser = adminUser || token;
  const authPass = adminUser ? adminPass : '';

  if (!authUser) {
    console.error(
      'No SonarQube credentials found (set SONAR_TOKEN, or SONARQUBE_ADMIN_USER + SONARQUBE_ADMIN_PASSWORD).'
    );
    process.exit(1);
  }

  const auth = Buffer.from(`${authUser}:${authPass ?? ''}`).toString('base64');

  async function fetchIssues({ inNewCodePeriod }) {
    const url = new URL(`${hostUrl}/api/issues/search`);
    url.searchParams.set('componentKeys', projectKey);
    if (branch) url.searchParams.set('branch', branch);

    // SonarQube 10.7 uses `inNewCodePeriod` to filter issues in "new code".
    // (Older servers used `sinceLeakPeriod`, but that can over-report on modern versions.)
    if (inNewCodePeriod) url.searchParams.set('inNewCodePeriod', 'true');

    url.searchParams.set('ps', '500');
    url.searchParams.set('s', 'SEVERITY');
    url.searchParams.set('asc', 'false');

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'IntelliFlow-Sonar-NewIssues',
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  }

  const allData = await fetchIssues({ inNewCodePeriod: false });
  const data = await fetchIssues({ inNewCodePeriod: true });

  const issues = Array.isArray(data.issues) ? data.issues : [];

  console.log(`Project: ${projectKey}`);
  console.log(`Host: ${hostUrl}`);
  if (branch) console.log(`Branch: ${branch}`);
  console.log(`All issues total: ${allData.total ?? 0}`);
  console.log(`New issues total: ${data.total ?? issues.length} (returned ${issues.length})`);

  console.log('\nBy type:');
  for (const [name, count] of groupCount(issues, 'type')) {
    console.log(`- ${name}: ${count}`);
  }

  console.log('\nBy severity:');
  for (const [name, count] of groupCount(issues, 'severity')) {
    console.log(`- ${name}: ${count}`);
  }

  console.log('\nTop rules:');
  for (const [name, count] of groupCount(issues, 'rule').slice(0, 15)) {
    console.log(`- ${name}: ${count}`);
  }

  const outDir = path.join(repoRoot, 'sonar-reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outPath = path.join(outDir, `sonar-new-issues-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), { encoding: 'utf8' });
  console.log(`\nSaved: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
