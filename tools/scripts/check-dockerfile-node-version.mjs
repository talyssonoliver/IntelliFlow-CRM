#!/usr/bin/env node
/**
 * Dockerfile Node-version drift guard (D3).
 *
 * Asserts every `FROM node:<major>` across the production Dockerfiles matches the
 * repo's canonical Node major in `.nvmrc`. This prevents the class of prod boot
 * outage seen on 2026-06-03, where supabase-js >=2.106 required Node 22 native
 * WebSocket but the Dockerfiles still pinned `node:20-alpine` — a drift that
 * passed tsc + unit + `docker build` and only crashed at container runtime.
 *
 * Run locally: `node tools/scripts/check-dockerfile-node-version.mjs`
 * Wired into CI (lint job) and the pre-ship gate.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const DOCKERFILES = [
  'infra/docker/Dockerfile.api',
  'infra/docker/Dockerfile.ai-worker',
  'infra/docker/Dockerfile.web',
  'apps/workers/events-worker/Dockerfile',
  'apps/workers/ingestion-worker/Dockerfile',
  'apps/workers/notifications-worker/Dockerfile',
];

function readNvmrcMajor() {
  const nvmrcPath = join(repoRoot, '.nvmrc');
  if (!existsSync(nvmrcPath)) {
    console.error('[dockerfile-node-guard] FAIL: .nvmrc not found at repo root.');
    process.exit(1);
  }
  const raw = readFileSync(nvmrcPath, 'utf8').trim();
  const major = raw.replace(/^v/, '').split('.')[0];
  if (!/^\d+$/.test(major)) {
    console.error(
      `[dockerfile-node-guard] FAIL: cannot parse a Node major from .nvmrc ("${raw}").`
    );
    process.exit(1);
  }
  return major;
}

// Matches `FROM node:22-alpine`, `FROM node:22`, `FROM node:22.1.0-bookworm`,
// optionally with a build stage alias (` AS builder`). Captures the major.
const FROM_NODE_RE = /^FROM\s+node:(\d+)(?:\.\d+){0,2}[^\s]*/gim;

const expectedMajor = readNvmrcMajor();
const problems = [];
let checkedDockerfiles = 0;
let checkedFromLines = 0;

for (const rel of DOCKERFILES) {
  const abs = join(repoRoot, rel);
  if (!existsSync(abs)) {
    // Not every service has a Dockerfile in every checkout; skip silently but
    // note it so a renamed/removed Dockerfile doesn't create a false pass.
    console.warn(`[dockerfile-node-guard] note: ${rel} not present, skipping.`);
    continue;
  }
  checkedDockerfiles += 1;
  const content = readFileSync(abs, 'utf8');
  const matches = [...content.matchAll(FROM_NODE_RE)];
  if (matches.length === 0) {
    problems.push(
      `${rel}: no \`FROM node:<major>\` lines found (unexpected — base image may have drifted off node).`
    );
    continue;
  }
  for (const m of matches) {
    checkedFromLines += 1;
    const major = m[1];
    if (major !== expectedMajor) {
      problems.push(
        `${rel}: \`${m[0].trim()}\` uses Node ${major}, but .nvmrc pins ${expectedMajor}.`
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `[dockerfile-node-guard] FAIL: Dockerfile Node version drifted from .nvmrc (${expectedMajor}):`
  );
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Fix: align every `FROM node:<major>` with .nvmrc, or update .nvmrc deliberately.');
  process.exit(1);
}

console.log(
  `[dockerfile-node-guard] OK: ${checkedFromLines} \`FROM node:\` line(s) across ${checkedDockerfiles} Dockerfile(s) all match .nvmrc (${expectedMajor}).`
);
