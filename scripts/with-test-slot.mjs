#!/usr/bin/env node
// Runs a full test command through the machine-wide test-slot semaphore:
//
//   node scripts/with-test-slot.mjs [--label <name>] [--base <n>] -- <command...>
//
// See scripts/lib/test-slot.mjs for the rules and the fallback when this
// machine has no semaphore.
import { runForwarding, shimLaunch } from './lib/test-slot.mjs';

const launch = shimLaunch(process.argv.slice(2), { env: process.env });
if (!launch) {
  console.error('usage: with-test-slot.mjs [--label <name>] [--base <n>] -- <command...>');
  process.exit(2);
}
process.exit(await runForwarding(launch.cmd, launch.args, launch.options));
