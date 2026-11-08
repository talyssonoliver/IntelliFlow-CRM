/**
 * The integration suites truncate and seed the database they connect to, so they must never
 * reach a real one. setup.ts connects with DATABASE_URL first (then TEST_DATABASE_URL), and the
 * old guard in db.test.ts only checked TEST_DATABASE_URL: a production DATABASE_URL with
 * TEST_DATABASE_URL unset passed it, and setup would have used production.
 *
 * Every URL setup.ts connects with goes through assertTestDatabaseUrl, which allows only hosts
 * on this machine and the docker-compose test service. Anything else throws before a client is
 * built. The error names the host, never the credentials.
 */

/** Hosts an integration suite may connect to: this machine, and the compose test service. */
export const TEST_DATABASE_HOSTS: readonly string[] = Object.freeze([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres-test', // docker-compose.yml service `postgres-test`
]);

export class NonTestDatabaseError extends Error {
  constructor(reason: string) {
    super(
      `Refusing to run integration tests against ${reason}. They truncate and seed the ` +
        'database they connect to. Point DATABASE_URL at the local test database ' +
        '(scripts/test-db.mjs, or docker-compose up -d postgres-test).'
    );
    this.name = 'NonTestDatabaseError';
  }
}

/** Returns `url` when it points at a test database host; throws NonTestDatabaseError otherwise. */
export function assertTestDatabaseUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new NonTestDatabaseError('a database URL that cannot be parsed');
  }
  if (!TEST_DATABASE_HOSTS.includes(host)) {
    throw new NonTestDatabaseError(`host "${host}", which is not a local test database`);
  }
  return url;
}

/**
 * The URL setup.ts connects with, checked: the container URL setup started, else DATABASE_URL,
 * else TEST_DATABASE_URL. Null when none is set.
 */
export function resolveTestDatabaseUrl(
  containerUrl: string | null,
  env: Record<string, string | undefined> = process.env
): string | null {
  const url = containerUrl || env.DATABASE_URL || env.TEST_DATABASE_URL;
  return url ? assertTestDatabaseUrl(url) : null;
}
