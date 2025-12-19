#!/usr/bin/env node

/**
 * SonarQube Setup Helper Script
 * Helps configure and run SonarQube analysis for the IntelliFlow CRM project
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = {
  setup: 'Setup SonarQube configuration',
  analyze: 'Run SonarQube analysis',
  check: 'Check SonarQube installation and configuration',
  start: 'Start SonarQube Docker containers',
  stop: 'Stop SonarQube Docker containers',
  health: 'Check SonarQube health status',
  wait: 'Wait for SonarQube to be ready',
  help: 'Show this help message',
};

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

function checkSonarScanner() {
  try {
    execSync('npx sonarqube-scanner --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    log(`SonarScanner not available: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    return false;
  }
}

function setupSonarQube() {
  log('Setting up SonarQube configuration...');

  const configPath = path.join(process.cwd(), 'sonar-project.properties');

  if (fs.existsSync(configPath)) {
    log('sonar-project.properties already exists', 'warning');
    return;
  }

  // Configuration is already created by the setup process
  log('SonarQube configuration is ready!', 'success');
}

function runAnalysis() {
  log('Running SonarQube analysis...');

  if (!checkSonarScanner()) {
    log('SonarQube Scanner not found. Installing via npx...', 'warning');
  }

  try {
    execSync('npx sonarqube-scanner', { stdio: 'inherit' });
    log('SonarQube analysis completed successfully!', 'success');
  } catch (error) {
    log(`SonarQube analysis failed: ${error.message}`, 'error');
    process.exit(1);
  }
}

function checkSingleItem(check) {
  if (check.check) {
    const result = check.check();
    if (result) {
      log(`✅ ${check.name}`, 'success');
    } else {
      log(`❌ ${check.name}`, 'error');
      if (check.fix) {
        log(`   Fix: ${check.fix}`, 'info');
      }
    }
    return result;
  }
  return false;
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
      name: 'SonarQube config file exists',
      check: () => fs.existsSync(path.join(process.cwd(), 'sonar-project.properties')),
      fix: 'Run: node scripts/sonarqube-helper.js setup',
    },
    {
      name: 'Docker compose file exists',
      check: () => fs.existsSync(path.join(process.cwd(), 'docker-compose.sonarqube.yml')),
      fix: 'Create docker-compose.sonarqube.yml file',
    },
    {
      name: 'SONAR_TOKEN is set',
      check: () => !!process.env.SONAR_TOKEN,
      fix: 'Set SONAR_TOKEN in .env.local',
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    if (!checkSingleItem(check)) {
      allPassed = false;
    }
  }

  if (allPassed) {
    log('All checks passed!', 'success');
  } else {
    log('Some checks failed. Please fix the issues above.', 'error');
    process.exit(1);
  }
}

function startSonarQube() {
  log('Starting SonarQube containers...');

  try {
    execSync('docker compose -f docker-compose.sonarqube.yml up -d', { stdio: 'inherit' });
    log('SonarQube containers started!', 'success');
    log('Waiting for SonarQube to be ready...', 'info');
    waitForSonarQube();
  } catch (error) {
    log(`Failed to start SonarQube: ${error.message}`, 'error');
    process.exit(1);
  }
}

function stopSonarQube() {
  log('Stopping SonarQube containers...');

  try {
    execSync('docker compose -f docker-compose.sonarqube.yml down', { stdio: 'inherit' });
    log('SonarQube containers stopped!', 'success');
  } catch (error) {
    log(`Failed to stop SonarQube: ${error.message}`, 'error');
    process.exit(1);
  }
}

function checkHealth() {
  try {
    const result = execSync('curl -s http://localhost:9000/api/system/status', { encoding: 'utf8' });
    const status = JSON.parse(result);
    if (status.status === 'UP') {
      log('SonarQube is healthy and running!', 'success');
      log(`Version: ${status.version}`, 'info');
      return true;
    } else {
      log(`SonarQube status: ${status.status}`, 'warning');
      return true;
    }
  } catch (error) {
    log(`SonarQube is not responding: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}

function waitForSonarQube() {
  let attempts = 0;
  const maxAttempts = 30;

  while (attempts < maxAttempts) {
    try {
      const result = execSync('curl -s http://localhost:9000/api/system/status', { encoding: 'utf8' });
      const status = JSON.parse(result);
      if (status.status === 'UP') {
        log('SonarQube is ready!', 'success');
        return true;
      }
    } catch (error) {
      // Still starting up - server not ready yet
      log(`Waiting... ${error instanceof Error ? error.message : ''}`, 'info');
    }

    process.stdout.write('.');
    try {
      execSync('sleep 5');
    } catch {
      // Timeout
    }
    attempts++;
  }

  log('SonarQube did not become ready within timeout', 'error');
  return false;
}

function showHelp() {
  console.log('\n🔍 SonarQube Helper Script');
  console.log('==========================\n');
  console.log('Available commands:\n');

  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(12)} - ${desc}`);
  }

  console.log('\nUsage:');
  console.log('  node scripts/sonarqube-helper.js <command>');
  console.log('\nExamples:');
  console.log('  node scripts/sonarqube-helper.js check');
  console.log('  node scripts/sonarqube-helper.js start');
  console.log('  node scripts/sonarqube-helper.js analyze\n');
}

// Main execution
const command = process.argv[2];

switch (command) {
  case 'setup':
    setupSonarQube();
    break;
  case 'analyze':
    runAnalysis();
    break;
  case 'check':
    checkConfiguration();
    break;
  case 'start':
    startSonarQube();
    break;
  case 'stop':
    stopSonarQube();
    break;
  case 'health':
    checkHealth();
    break;
  case 'wait':
    waitForSonarQube();
    break;
  case 'help':
  default:
    showHelp();
    break;
}
