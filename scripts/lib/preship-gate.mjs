/**
 * The pre-ship gate's step tracking and cleanup, kept out of scripts/pre-ship.mjs
 * so it can be unit-tested in-process (that script runs its whole gate on import,
 * and the coverage report Sonar and diff-coverage read cannot see a spawned child).
 *
 * `createGate` owns the state of one gate run: the step process now running and
 * the state file the detached watchdog reads. It guarantees no step is orphaned:
 * the step's whole process tree is stopped on success, failure, a signal and an
 * uncaught exception, and the watchdog covers a hard kill of the gate or the death
 * of anything above it. Machine-wide test slots are not taken here; they come from
 * the shared wrapper ops/test-slots/with-slot.mjs, which runs the whole gate.
 *
 * Every side effect (filesystem, spawning, killing, the clock) comes in through
 * `deps`, defaulting to the real thing.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  gateStatePath,
  installExitHandlers,
  killTree,
  watchTargets,
  writeGateState,
} from '../preship-process.mjs';

const DEFAULT_WATCHDOG = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'preship-watchdog.mjs'
);

/**
 * The [file, args] to spawn for a step. With shell:true (Windows) Node wants one
 * command string (DEP0190 otherwise); the argv is all literals, so quoting is only
 * for arguments with spaces.
 */
export function commandFor(cmd, platform = process.platform) {
  return platform === 'win32'
    ? [cmd.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' '), []]
    : [cmd[0], cmd.slice(1)];
}

/**
 * @param {object} cfg
 * @param {string} cfg.repoRoot
 * @param {number} [cfg.gatePid]
 * @param {string} [cfg.platform]
 * @param {string} [cfg.stateFile]
 * @param {string} [cfg.watchdogScript]
 * @param {(text: string) => void} [cfg.write]  where progress lines go (stdout)
 * @param {object} [cfg.deps]  any of the imports above, swapped for tests
 */
export function createGate(cfg) {
  const {
    repoRoot,
    gatePid = process.pid,
    platform = process.platform,
    write = (t) => process.stdout.write(t),
    watchdogScript = DEFAULT_WATCHDOG,
  } = cfg;
  const deps = {
    watchTargets,
    killTree,
    writeGateState,
    installExitHandlers,
    spawn,
    unlink: (f) => fs.unlinkSync(f),
    createWriteStream: (f) => fs.createWriteStream(f),
    now: () => Date.now(),
    execPath: process.execPath,
    tmpdir: () => os.tmpdir(),
    ...cfg.deps,
  };
  const stateFile = cfg.stateFile ?? gateStatePath(gatePid);

  const gate = {
    stateFile,
    currentChild: null,
    watchdogStarted: false,
    state: {
      gate_pid: gatePid,
      gate_start_ms: deps.now(),
      repo_root: repoRoot,
      child_pid: null,
      child_step: null,
      child_start_ms: null,
    },
  };

  const say = (m) => write(`\n${m}\n`);

  gate.persistState = () => {
    try {
      deps.writeGateState(gate.state);
    } catch {
      // Only the watchdog's view is lost; the gate's own handlers still clean up.
    }
  };

  /** Start the detached watchdog once, the first time there is a step process to watch. */
  gate.ensureWatchdog = () => {
    if (gate.watchdogStarted) return;
    gate.watchdogStarted = true;
    gate.persistState();
    try {
      // PIDs above the gate (the `git push`, the husky hook shell): if one of them
      // dies, nothing is waiting for this gate's verdict any more. What is watched,
      // and how the push was found, goes in the state file so a watchdog that did
      // not fire can be explained afterwards.
      const targets = deps.watchTargets(gatePid, repoRoot);
      gate.state.watch = {
        pids: targets.pids,
        how: targets.how,
        chain: targets.chain.map((a) => `${a.pid}|${a.name}`),
      };
      gate.persistState();
      const above = targets.pids.join(',');
      const w = deps.spawn(deps.execPath, [watchdogScript, String(gatePid), stateFile, above], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        // Not the repo: on Windows a process's working directory cannot be deleted,
        // and a watchdog started inside the repo held a handle on preship-attest's
        // scratch dir (EPERM on cleanup). It can outlive the gate by a poll interval.
        cwd: deps.tmpdir(),
      });
      w.unref();
    } catch {
      // Without it a hard kill leaves the step running; the gate's own handlers still cover the rest.
    }
  };

  gate.recordChild = (pid, stepId) => {
    gate.state.child_pid = pid ?? null;
    gate.state.child_step = pid ? stepId : null;
    gate.state.child_start_ms = pid ? deps.now() : null;
    gate.persistState();
  };

  /** Stop the running step's whole tree and drop the state file. Synchronous. */
  gate.shutdown = () => {
    if (gate.currentChild?.pid) deps.killTree(gate.currentChild.pid);
    gate.currentChild = null;
    try {
      deps.unlink(stateFile);
    } catch {
      /* never written, or already gone */
    }
  };

  /**
   * Run one step's command to completion, streaming stdout to `logPath` and
   * appending stderr after it. Async (not spawnSync) so the gate can still react
   * to a signal while a step runs, and so the step's PID is known to the watchdog;
   * streaming means there is no maxBuffer to blow (unit-tests emits >5MB).
   * @returns {Promise<{status: number|null}>}
   */
  gate.runStepProcess = (step, { logPath, env, cwd }) => {
    gate.ensureWatchdog();
    return new Promise((resolve) => {
      const out = deps.createWriteStream(logPath);
      let stderr = '';
      let child;
      try {
        const [file, args] = commandFor(step.cmd, platform);
        child = deps.spawn(file, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
          cwd,
          shell: platform === 'win32',
          detached: platform !== 'win32',
          windowsHide: true,
        });
      } catch (err) {
        out.end(String(err));
        resolve({ status: null });
        return;
      }
      gate.currentChild = child;
      gate.recordChild(child.pid ?? null, step.id);
      child.stdout.pipe(out, { end: false });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (d) => {
        stderr += d;
      });
      child.on('error', (err) => {
        stderr += `\n${String(err)}`;
      });
      child.on('close', (code) => {
        // The step's own process is done; stop anything it left behind.
        if (child.pid && platform !== 'win32') deps.killTree(child.pid);
        gate.currentChild = null;
        gate.recordChild(null, null);
        out.end(stderr ? '\n--- stderr ---\n' + stderr : '', () => resolve({ status: code }));
      });
    });
  };

  /** Stop the step tree on every exit path the gate gets to run. */
  gate.installExit = () => deps.installExitHandlers(gate.shutdown, { log: say });

  /** The gate itself threw: say so, clean up. The caller exits non-zero. */
  gate.fatal = (err, stderrWrite = (t) => process.stderr.write(t)) => {
    stderrWrite(`pre-ship: ${err?.stack || err}\n`);
    gate.shutdown();
  };

  return gate;
}
