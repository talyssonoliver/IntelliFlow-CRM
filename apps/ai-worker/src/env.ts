/**
 * Environment loader — MUST be the first import in index.ts.
 *
 * ES import hoisting causes all module-level code (chain singletons, aiConfig)
 * to run before loadEnvFiles() in index.ts. By extracting env loading into its
 * own module and importing it first, we guarantee process.env is populated
 * before any config or chain modules evaluate.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

// Find monorepo root (has pnpm-workspace.yaml)
let root = process.cwd();
while (root !== path.dirname(root)) {
  if (fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))) break;
  root = path.dirname(root);
}

// Load env files — override:true so .env.local and .env.development
// take precedence over .env (matching dotenv convention: later wins)
for (const name of ['.env', '.env.local', '.env.development']) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: true });
  }
}
