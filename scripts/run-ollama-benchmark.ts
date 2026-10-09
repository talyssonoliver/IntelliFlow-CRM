/**
 * Ollama Real Benchmark Script (IFC-174)
 *
 * Runs ACTUAL benchmarks against a local Ollama instance.
 * Measures real latency, accuracy, and cost metrics.
 *
 * Usage:
 *   npx tsx scripts/run-ollama-benchmark.ts
 *
 * Prerequisites:
 *   - Ollama running at http://localhost:11434
 *   - mistral model pulled: ollama pull mistral
 *
 * Output:
 *   - artifacts/benchmarks/accuracy-benchmarks.json (replaces simulated data)
 *   - artifacts/benchmarks/ollama-real-benchmark-report.json (detailed report)
 *
 * The benchmark logic lives in ./lib/ollama-benchmark.ts (tested in-process); this
 * file only wires in the environment, the network, the filesystem and the exit code.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyEnvContent,
  checkOllamaAvailable,
  getOllamaVersion,
  runBenchmark,
  type ScoringChain,
} from './lib/ollama-benchmark';

function findProjectRoot(): string {
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const projectRoot = findProjectRoot();

function loadEnvFiles(): void {
  for (const name of ['.env', '.env.local', '.env.development']) {
    const envFile = path.join(projectRoot, name);
    if (fs.existsSync(envFile)) {
      applyEnvContent(fs.readFileSync(envFile, 'utf-8'), process.env);
    }
  }
}

loadEnvFiles();

// Force Ollama provider BEFORE importing scoring chain
// Override .env.development default (llama2) — benchmark targets mistral:7b
process.env.AI_PROVIDER = 'ollama';
process.env.OLLAMA_MODEL = 'mistral';

async function loadScoringChain(): Promise<ScoringChain> {
  // On Windows, dynamic import needs file:// URL for absolute paths
  const scoringChainPath = path.join(projectRoot, 'apps/ai-worker/src/chains/scoring.chain');
  const importPath =
    process.platform === 'win32'
      ? `file:///${scoringChainPath.replaceAll(/\\/g, '/')}`
      : scoringChainPath;
  const scoringModule = await import(importPath);
  return scoringModule.leadScoringChain;
}

runBenchmark({
  checkAvailable: () =>
    checkOllamaAvailable(fetch, process.env.OLLAMA_BASE_URL || 'http://localhost:11434'),
  getVersion: () =>
    getOllamaVersion(fetch, process.env.OLLAMA_BASE_URL || 'http://localhost:11434'),
  loadChain: loadScoringChain,
  writeJson: (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2)),
  benchmarkPath: path.join(projectRoot, 'artifacts/benchmarks/accuracy-benchmarks.json'),
  reportPath: path.join(projectRoot, 'artifacts/benchmarks/ollama-real-benchmark-report.json'),
  model: process.env.OLLAMA_MODEL || 'mistral',
  log: console.log,
  write: (text) => process.stdout.write(text),
  exit: (code) => process.exit(code),
}).catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
