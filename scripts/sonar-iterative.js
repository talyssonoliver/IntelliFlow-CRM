#!/usr/bin/env node

/**
 * Iterative SonarQube Analysis Runner
 * Runs SonarQube analysis repeatedly with options for manual or automatic triggering
 */

import { execSync } from 'node:child_process';
import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env.local');
try {
  if (readFileSync(envPath, 'utf8').includes('SONAR_TOKEN')) {
    config({ path: envPath });
  }
} catch (error) {
  // .env.local doesn't exist or can't be read - this is acceptable
  const message = error instanceof Error ? error.message : String(error);
  console.log(`.env.local not found (${message}), using environment variables`);
}

const MODES = {
  manual: 'Manual mode - press Enter to run analysis',
  auto: 'Auto mode - runs analysis on file changes',
  watch: 'Watch mode - monitors files and runs analysis on changes',
};

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warning: '\x1b[33m',
    error: '\x1b[31m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

function checkSonarQubeHealth() {
  try {
    // Just check if the web interface is responding
    execSync('curl -s --max-time 5 http://localhost:9000 > /dev/null', { stdio: 'pipe' });
    return true;
  } catch (error) {
    log(`Health check failed: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    return false;
  }
}

function startSonarQube() {
  log('Checking if SonarQube is already running...');
  try {
    // Check if containers are already running
    const result = execSync('docker compose -f docker-compose.sonarqube.yml ps --quiet', { encoding: 'utf8' });
    if (result.trim()) {
      log('SonarQube containers are already running', 'success');
      return waitForSonarQube();
    }
  } catch (error) {
    // Containers not running, start them
    const message = error instanceof Error ? error.message : String(error);
    log(`Containers not running (${message}), will start them`, 'info');
  }

  log('Starting SonarQube...');
  try {
    execSync('docker compose -f docker-compose.sonarqube.yml up -d', { stdio: 'inherit' });
    return waitForSonarQube();
  } catch (error) {
    log(`Failed to start SonarQube: ${error.message}`, 'error');
    return false;
  }
}

function waitForSonarQube() {
  log('Waiting for SonarQube to be ready...');

  // Wait for SonarQube to be healthy
  let attempts = 0;
  const maxAttempts = 30; // 2.5 minutes

  while (attempts < maxAttempts) {
    if (checkSonarQubeHealth()) {
      log('SonarQube is ready!', 'success');
      return true;
    }
    process.stdout.write('.');
    try {
      execSync('sleep 5');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Timeout waiting for SonarQube: ${message}`, 'error');
      break; // Timeout reached
    }
    attempts++;
  }

  log('SonarQube failed to respond within timeout period', 'error');
  return false;
}

function runAnalysis() {
  const startTime = Date.now();
  log('Starting SonarQube analysis...');

  try {
    // Run analysis using npx
    execSync('npx sonarqube-scanner', {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Analysis completed in ${duration}s`, 'success');

    // Show status
    try {
      execSync('node scripts/sonar-status.js', { stdio: 'inherit' });
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : String(statusError);
      log(`Could not get status (${message}), but analysis completed`, 'warning');
    }

    return true;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Analysis failed after ${duration}s: ${error.message}`, 'error');
    return false;
  }
}

function showMenu() {
  console.log('\n🔍 SonarQube Iterative Analysis');
  console.log('==============================');
  console.log('Choose a mode:');
  console.log('1. Manual mode - Press Enter to run analysis each time');
  console.log('2. Auto mode - Automatically run analysis on file changes');
  console.log('3. Watch mode - Monitor files and show changes (no analysis)');
  console.log('4. Quick analysis - Run once and exit');
  console.log('5. Exit');
  console.log('');
  process.stdout.write('Enter choice (1-5): ');
}

function manualMode() {
  log('Starting manual mode', 'info');
  console.log('\nPress Enter to run analysis, or "q" to quit\n');

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', (key) => {
    if (key === '\r' || key === '\n') {
      runAnalysis();
      console.log('\nPress Enter to run again, or "q" to quit');
    } else if (key === 'q' || key === '\u0003') { // Ctrl+C
      log('Exiting manual mode', 'info');
      process.exit(0);
    }
  });
}

function autoMode() {
  log('Starting auto mode - watching for file changes', 'info');

  let analysisRunning = false;
  let pendingAnalysis = false;

  globalWatchers = watchFiles((filePath) => {
    log(`📝 Changed: ${filePath}`, 'warning');

    if (analysisRunning) {
      pendingAnalysis = true;
      log('Analysis already running, will run again after completion', 'warning');
    } else {
      runAnalysisAndHandlePending();
    }
  });

  function runAnalysisAndHandlePending() {
    analysisRunning = true;
    const success = runAnalysis();
    analysisRunning = false;

    if (pendingAnalysis && success) {
      pendingAnalysis = false;
      log('Running pending analysis...', 'info');
      setTimeout(runAnalysisAndHandlePending, 1000); // Brief delay
    }
  }

  // Initial analysis
  runAnalysisAndHandlePending();

  console.log('\nWatching for file changes... Press Ctrl+C to stop\n');

  // Cleanup watchers on exit
  process.on('SIGINT', () => {
    log('Stopping watchers...', 'info');
    for (const watcher of watchers) {
      watcher.close();
    }
    process.exit(0);
  });
}

function watchMode() {
  log('Starting watch mode - monitoring files only', 'info');

  watchFiles((filePath) => {
    log(`📝 Changed: ${filePath}`, 'warning');
  });

  console.log('\nWatching for file changes... Press Ctrl+C to stop\n');
  
  // Keep process running
  process.stdin.resume();
}

function quickAnalysis() {
  log('Running quick analysis', 'info');
  runAnalysis();
  process.exit(0);
}

// Simple file watcher using fs.watch (fallback when chokidar not available)
function watchFiles(callback) {
  const watchDirs = [
    'apps/web/src',
    'apps/api/src',
    'apps/ai-worker/src',
    'apps/project-tracker/app',
    'apps/project-tracker/components',
    'packages'
  ];

  const watchers = [];

  for (const dir of watchDirs) {
    const dirPath = path.resolve(__dirname, '..', dir);
    if (fs.existsSync(dirPath)) {
      try {
        const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
          if (filename && (filename.endsWith('.ts') || filename.endsWith('.tsx') || filename.endsWith('.js') || filename.endsWith('.jsx'))) {
            // Debounce to avoid multiple triggers
            clearTimeout(watcher._timeout);
            watcher._timeout = setTimeout(() => {
              callback(path.join(dir, filename));
            }, 500);
          }
        });
        watchers.push(watcher);
      } catch (error) {
        log(`Failed to watch ${dir}: ${error.message}`, 'warning');
      }
    }
  }

  return watchers;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const skipStart = args.includes('--no-start') || process.env.SKIP_SONAR_START === 'true';

  // Check if SonarQube is running
  if (!checkSonarQubeHealth()) {
    if (skipStart) {
      log('SonarQube is not running, skipping auto-start', 'warning');
      log('Please start SonarQube manually: docker compose -f docker-compose.sonarqube.yml up -d', 'info');
      process.exit(1);
    } else {
      log('SonarQube is not running', 'warning');
      if (!startSonarQube()) {
        process.exit(1);
      }
    }
  }

  // Direct mode selection
  if (mode === 'manual') {
    manualMode();
  } else if (mode === 'auto') {
    autoMode();
  } else if (mode === 'watch') {
    watchMode();
  } else if (mode === 'quick') {
    quickAnalysis();
  } else {
    // Interactive menu
    showMenu();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();

      switch (key) {
        case '1':
          console.log('');
          manualMode();
          break;
        case '2':
          console.log('');
          autoMode();
          break;
        case '3':
          console.log('');
          watchMode();
          break;
        case '4':
          console.log('');
          quickAnalysis();
          break;
        case '5':
          console.log('\nExiting...');
          process.exit(0);
          break;
        default:
          console.log('\nInvalid choice. Please select 1-5.');
          showMenu();
          return;
      }
    });
  }
}

// Handle graceful shutdown
let globalWatchers = [];

process.on('SIGINT', () => {
  log('Shutting down...', 'warning');
  for (const watcher of globalWatchers) {
    try {
      watcher.close();
    } catch (error) {
      // Ignore close errors during shutdown - watchers may already be closed
      log(`Watcher close warning: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    }
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down...', 'warning');
  for (const watcher of globalWatchers) {
    try {
      watcher.close();
    } catch (error) {
      // Ignore close errors during shutdown - watchers may already be closed
      log(`Watcher close warning: ${error instanceof Error ? error.message : String(error)}`, 'warning');
    }
  }
  process.exit(0);
});

try {
  await main();
} catch (error) {
  log(`Fatal error: ${error instanceof Error ? error.message : String(error)}`, 'error');
  process.exit(1);
}
