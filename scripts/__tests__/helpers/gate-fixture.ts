/**
 * Shared by the tests that run the real scripts/pre-ship.mjs in a throwaway repo.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Copy every module pre-ship can import (scripts/lib/*.mjs and scripts/ci/*.mjs)
 * from `fromScripts` into `toScripts`.
 */
export function copyGateModules(fromScripts: string, toScripts: string): void {
  for (const sub of ['lib', 'ci']) {
    const from = path.join(fromScripts, sub);
    const to = path.join(toScripts, sub);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      if (f.endsWith('.mjs')) fs.copyFileSync(path.join(from, f), path.join(to, f));
    }
  }
}
