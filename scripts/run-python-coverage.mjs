#!/usr/bin/env node
/**
 * Run the Python tooling suites under coverage and write
 * artifacts/coverage/python-coverage.xml (#755). The logic lives in
 * ./lib/python-coverage.mjs; this entry point only wires in processes, the
 * filesystem and the exit code.
 *
 * Exit: 0 report written · 1 Python/modules missing or a suite failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runPythonCoverage } from './lib/python-coverage.mjs';

fs.mkdirSync('artifacts/coverage', { recursive: true });

process.exit(
  runPythonCoverage({
    run: (cmd, args, env) =>
      spawnSync(cmd, args, {
        stdio: args[0] === '-m' ? 'inherit' : 'ignore',
        env: env ?? process.env,
        shell: false,
      }),
    env: process.env,
    pathSep: path.delimiter,
    removeFile: (p) => fs.rmSync(p, { force: true }),
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    writeFile: (p, text) => fs.writeFileSync(p, text),
    exists: (p) => fs.existsSync(p),
    log: console.log,
    error: console.error,
  })
);
