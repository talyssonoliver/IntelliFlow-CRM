/**
 * A queue that builds its own connection from a host and port tends to lose the
 * password, the username or the TLS setting, and against a protected Redis its jobs
 * then fail with nothing to show for it. API code goes through `queue-producer.ts`
 * or `getBullMQConnectionOptions`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiSrc = resolve(__dirname, '../..');

/** Files allowed to build their own options, each with a reason. */
const ALLOWED: Record<string, string> = {
  // Its one queue uses the shared options. The host belongs to separate ioredis clients.
  'container.ts': 'the queue uses getBullMQConnectionOptions',
  // Takes every setting from getDefaultConnectionConfig, and keeps one long-lived queue.
  'modules/lead/lead-scoring-enqueue.ts': 'password, db and TLS come from the shared config',
  // Reads an injected env, so probes can be tested, and sets password, db and TLS.
  'modules/misc/health-probes.ts': 'password, db and TLS are set explicitly',
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path));
    } else if (name.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function withoutComments(source: string): string {
  let code = '';
  let from = 0;
  for (;;) {
    const start = source.indexOf('/*', from);
    if (start < 0) {
      code += source.slice(from);
      break;
    }
    code += source.slice(from, start);
    const end = source.indexOf('*/', start + 2);
    if (end < 0) break;
    from = end + 2;
  }
  return code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** A file that constructs a queue and also spells out a Redis host. */
function buildsOwnConnection(source: string): boolean {
  const code = withoutComments(source);
  return /new\s+\w*Queue\w*\s*[(<]/.test(code) && /REDIS_HOST|\bhost\s*:/.test(code);
}

describe('API queues use the shared Redis connection', () => {
  it('no queue is built from its own host and port', () => {
    const offenders = sourceFiles(apiSrc)
      .map((path) => relative(apiSrc, path).replaceAll('\\', '/'))
      .filter((file) => !(file in ALLOWED))
      .filter((file) => buildsOwnConnection(readFileSync(join(apiSrc, file), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('each allowed file still exists and still needs its exception', () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(buildsOwnConnection(readFileSync(join(apiSrc, file), 'utf8'))).toBe(true);
    }
  });

  it('would catch one, and passes the shared options', () => {
    const own = `const queue = new Queue(name, {
      connection: { host: process.env.REDIS_HOST, port: 6379 },
    });`;
    const viaVariable = `const connection = { host: env.REDIS_HOST, port: 6379 };
      const events = new QueueEvents(name, { connection });`;
    const shared = `const queue = new Queue(name, { connection: getBullMQConnectionOptions() });`;

    expect(buildsOwnConnection(own)).toBe(true);
    expect(buildsOwnConnection(viaVariable)).toBe(true);
    expect(buildsOwnConnection(shared)).toBe(false);
    expect(buildsOwnConnection(`// new Queue(name, { connection: { host: 'x' } })`)).toBe(false);
  });
});
