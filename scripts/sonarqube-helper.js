#!/usr/bin/env node

/**
 * SonarQube Helper Script (local)
 *
 * - Loads `.env.local` because Node scripts do not automatically load it.
 * - Starts/stops the local SonarQube Docker Compose stack on demand.
 * - Uses Node `fetch` for health checks (cross-platform; no `curl`/`sleep`).
 *
 * Commands:
 *   node scripts/sonarqube-helper.js check
 *   node scripts/sonarqube-helper.js start
 *   node scripts/sonarqube-helper.js stop
 *   node scripts/sonarqube-helper.js health
 *   node scripts/sonarqube-helper.js wait
 *   node scripts/sonarqube-helper.js analyze [--stop]
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const COMMANDS = {
  setup: 'Setup SonarQube configuration',
  analyze: 'Run SonarQube analysis (scanner)',
  check: 'Check local prerequisites',
  start: 'Start SonarQube Docker containers',
  stop: 'Stop SonarQube Docker containers',
  health: 'Check SonarQube health status',
  wait: 'Wait for SonarQube to be ready',
  help: 'Show this help message',
};

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

function loadDotenv() {
  loadDotenvFile('.env.local');
}

loadDotenv();

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

function exec(command, options = {}) {
  return execSync(command, { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf-8', ...options });
}

function checkSonarScannerAvailable() {
  try {
    exec('npx sonarqube-scanner --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function setupSonarQube() {
  log('Setting up SonarQube configuration...');
  const configPath = path.join(REPO_ROOT, 'sonar-project.properties');
  if (fs.existsSync(configPath)) {
    log('sonar-project.properties already exists', 'warning');
    return;
  }
  log('sonar-project.properties is expected to be committed in this repo.', 'success');
}

async function fetchSonarStatus() {
  const hostUrl = process.env.SONAR_HOST_URL || 'http://localhost:9000';
  try {
    const res = await fetch(`${hostUrl}/api/system/status`, { method: 'GET' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function checkHealth() {
  const status = await fetchSonarStatus();
  if (!status || typeof status !== 'object') {
    log('SonarQube is not responding', 'error');
    return false;
  }
  if (status.status === 'UP') {
    log('SonarQube is healthy and running!', 'success');
    if (status.version) log(`Version: ${status.version}`, 'info');
    return true;
  }
  log(`SonarQube status: ${status.status}`, 'warning');
  return true;
}

async function waitForSonarQube() {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await fetchSonarStatus();
    if (status && typeof status === 'object' && status.status === 'UP') {
      log('SonarQube is ready!', 'success');
      return true;
    }
    process.stdout.write('.');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  log('SonarQube did not become ready within timeout', 'error');
  return false;
}

async function startSonarQube() {
  log('Starting SonarQube containers...');
  try {
    execSync('docker compose -f docker-compose.sonarqube.yml up -d', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    log('SonarQube containers started!', 'success');
    log('Waiting for SonarQube to be ready...', 'info');
    await waitForSonarQube();
  } catch (error) {
    log(`Failed to start SonarQube: ${error instanceof Error ? error.message : String(error)}`, 'error');
    process.exit(1);
  }
}

function stopSonarQube() {
  log('Stopping SonarQube containers...');
  try {
    execSync('docker compose -f docker-compose.sonarqube.yml down', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
    log('SonarQube containers stopped!', 'success');
  } catch (error) {
    log(`Failed to stop SonarQube: ${error instanceof Error ? error.message : String(error)}`, 'error');
    process.exit(1);
  }
}

function checkSingleItem(check) {
  if (!check.check) return false;
  const result = Boolean(check.check());
  if (result) {
    log(`[OK] ${check.name}`, 'success');
  } else {
    log(`[FAIL] ${check.name}`, 'error');
    if (check.fix) log(`  Fix: ${check.fix}`, 'info');
  }
  return result;
}

function checkConfiguration() {
  log('Checking SonarQube configuration...');

  const checks = [
    {
      name: 'Docker is installed',
      check: () => {
        try {
          execSync('docker --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Install Docker Desktop from https://www.docker.com/products/docker-desktop',
    },
    {
      name: 'Docker Compose is available',
      check: () => {
        try {
          execSync('docker compose version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Docker Compose comes with Docker Desktop',
    },
    {
      name: 'sonar-project.properties exists',
      check: () => fs.existsSync(path.join(REPO_ROOT, 'sonar-project.properties')),
      fix: 'Ensure sonar-project.properties exists at repo root',
    },
    {
      name: 'docker-compose.sonarqube.yml exists',
      check: () => fs.existsSync(path.join(REPO_ROOT, 'docker-compose.sonarqube.yml')),
      fix: 'Ensure docker-compose.sonarqube.yml exists at repo root',
    },
    {
      name: 'SONAR_TOKEN is set (env or .env.local)',
      check: () => Boolean(process.env.SONAR_TOKEN),
      fix: 'Set SONAR_TOKEN in .env.local or environment variables',
    },
    {
      name: 'sonarqube-scanner is available (npx)',
      check: () => checkSonarScannerAvailable(),
      fix: 'Run `pnpm install` (scanner is a devDependency)',
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    if (!checkSingleItem(check)) allPassed = false;
  }

  if (allPassed) {
    log('All checks passed!', 'success');
    return;
  }

  log('Some checks failed. Please fix the issues above.', 'error');
  process.exit(1);
}

function runAnalysis() {
  log('Running SonarQube analysis (sonarqube-scanner)...');
  if (!checkSonarScannerAvailable()) {
    log('sonarqube-scanner not available via npx', 'error');
    process.exit(1);
  }

  try {
    execSync('npx sonarqube-scanner', { stdio: 'inherit', cwd: REPO_ROOT });
    log('SonarQube analysis completed successfully!', 'success');
  } catch (error) {
    log(`SonarQube analysis failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
    process.exit(1);
  }
}

function showHelp() {
  console.log('\nSonarQube Helper Script');
  console.log('======================\n');
  console.log('Available commands:\n');
  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(12)} - ${desc}`);
  }
  console.log('\nUsage:');
  console.log('  node scripts/sonarqube-helper.js <command> [--stop]');
  console.log('\nExamples:');
  console.log('  node scripts/sonarqube-helper.js check');
  console.log('  node scripts/sonarqube-helper.js start');
  console.log('  node scripts/sonarqube-helper.js analyze');
  console.log('  node scripts/sonarqube-helper.js analyze --stop\n');
}

const command = process.argv[2] || 'help';
const args = new Set(process.argv.slice(3));
const stopAfter = args.has('--stop');

async function main() {
  switch (command) {
    case 'setup':
      setupSonarQube();
      return;
    case 'analyze': {
      const ok = await checkHealth();
      if (!ok) await startSonarQube();
      runAnalysis();
      if (stopAfter) stopSonarQube();
      return;
    }
    case 'check':
      checkConfiguration();
      return;
    case 'start':
      await startSonarQube();
      return;
    case 'stop':
      stopSonarQube();
      return;
    case 'health':
      await checkHealth();
      return;
    case 'wait':
      await waitForSonarQube();
      return;
    case 'help':
    default:
      showHelp();
      return;
  }
}

try {
  await main();
} catch (error) {
  log(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`, 'error');
  process.exit(1);
}

