#!/usr/bin/env node
// At most three full test runs at once on the owner's machine (owner ruling
// 2026-10-05: ten gates at once ran it out of memory). This hands the command
// to the shared semaphore, which queues it for a free slot:
//
//   node scripts/with-test-slot.mjs [--label <name>] [--base <n>] -- <command...>
//
// The semaphore lives outside every repository, at
// C:/Users/talys/ops/test-slots/with-slot.mjs (TEST_SLOTS_DIR overrides), so
// all repos share one count; its README says how slots are taken and reaped.
// Where it does not exist (another machine, a hosted CI runner) the command
// runs directly. CI, nested runs and filtered runs (--base) are exempted by
// the semaphore itself.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const shared = join(process.env.TEST_SLOTS_DIR || 'C:/Users/talys/ops/test-slots', 'with-slot.mjs');
const sep = argv.indexOf('--');
if (sep === -1 || sep === argv.length - 1) {
  console.error('usage: with-test-slot.mjs [--label <name>] [--base <n>] -- <command...>');
  process.exit(2);
}

let child;
if (existsSync(shared)) {
  child = spawn(process.execPath, [shared, ...argv], { stdio: 'inherit' });
} else {
  // npm/pnpm are .cmd shims on Windows and only run through a shell.
  const words = argv.slice(sep + 1);
  const quote = (a) =>
    /^[A-Za-z0-9_@:=.,/\\+-]+$/.test(a) ? a : `"${a.replace(/(["\\])/g, '\\$1')}"`;
  child =
    process.platform === 'win32'
      ? spawn(words.map(quote).join(' '), { stdio: 'inherit', shell: true })
      : spawn(words[0], words.slice(1), { stdio: 'inherit' });
}
// Forward Ctrl-C and kill so the semaphore releases its slot.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
child.on('error', (err) => {
  console.error(`with-test-slot: could not start: ${err.message}`);
  process.exit(1);
});
