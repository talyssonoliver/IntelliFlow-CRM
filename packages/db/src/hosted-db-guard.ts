/**
 * Hosted-database boot guard (ENG-OPS-002, register row 65).
 *
 * Incident 2026-11-27: a local combined-worker boot loaded a worktree `.env.local` whose
 * DATABASE_URL named the production Supabase database, and ran about 40 seconds against it.
 *
 * Rule: a DB client refuses to start when its connection string names a hosted Supabase database
 * (host ending in `.supabase.co` or `pooler.supabase.com`) and the process is NOT a real deployed
 * runtime. This is the ONE shared check; every DB client creation site calls it.
 *
 * Deployed runtimes that pass:
 *   - Railway: `RAILWAY_ENVIRONMENT` is present.
 *   - Vercel: `VERCEL_ENV` is `production` or `preview` (apps/web has no server-side DB client today;
 *     if one is added, a Vercel deployment passes and `vercel dev` / local builds do not).
 * Deliberate ops tools (not the Prisma CLI, which never creates a client) set `ALLOW_HOSTED_DB=1`;
 * that is logged loudly.
 *
 * The error names the variable and never prints the URL or its host. This file holds no project
 * ref and no real host: matching is by generic suffix only.
 */

/** Env shape the guard reads; `process.env` satisfies it. */
export type HostedDbGuardEnv = Readonly<Record<string, string | undefined>>;

export interface HostedDbGuardOptions {
  /** Name of the env var the connection string came from, e.g. `DATABASE_URL`. */
  variableName: string;
  /** Override for tests; defaults to `process.env`. */
  env?: HostedDbGuardEnv;
  /** Override for tests; defaults to `console.warn`. */
  warn?: (message: string) => void;
}

const HOSTED_SUFFIXES = ['.supabase.co', 'pooler.supabase.com'] as const;
const HOSTED_AFTER_AT = /@[^@/?#\s]*(?:\.supabase\.co|pooler\.supabase\.com)(?::\d+)?(?:[/?#]|$)/i;

/** Host part of a Postgres connection string, lower-cased, or null when none can be read. */
function hostOf(connectionString: string): string | null {
  // Do not rely on `new URL`: passwords may hold characters that make it throw. The authority is
  // everything between `://` and the next `/`, `?` or `#`; the host follows the LAST `@`.
  const afterScheme = connectionString.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = afterScheme.split(/[/?#]/, 1)[0] ?? '';
  const hostPort = authority.slice(authority.lastIndexOf('@') + 1);
  const host = hostPort.startsWith('[')
    ? hostPort.slice(0, hostPort.indexOf(']') + 1)
    : (hostPort.split(':', 1)[0] ?? '');
  return host ? host.toLowerCase() : null;
}

/** True when the connection string names a hosted Supabase database. */
export function isHostedSupabaseUrl(connectionString: string | undefined | null): boolean {
  if (!connectionString) return false;
  const host = hostOf(connectionString);
  if (host && HOSTED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // Fail closed on a malformed URL (an unencoded `/`, `?` or `#` in the password breaks the
  // authority split above): a hosted host that follows an `@` and ends at a port, path, query,
  // fragment or the end of the string is still a hosted database.
  return HOSTED_AFTER_AT.test(connectionString);
}

/** True when the process is a real deployed Railway or Vercel (production/preview) runtime. */
export function isDeployedRuntime(env: HostedDbGuardEnv = process.env): boolean {
  if (env['RAILWAY_ENVIRONMENT']) return true;
  const vercelEnv = env['VERCEL_ENV'];
  return vercelEnv === 'production' || vercelEnv === 'preview';
}

/**
 * Throws when `connectionString` names a hosted database and the process is not a deployed runtime.
 * Returns normally for local databases, deployed runtimes, and `ALLOW_HOSTED_DB=1` (which warns).
 * A missing connection string passes: the caller's own config check owns that error.
 */
export function assertHostedDbAllowed(
  connectionString: string | undefined | null,
  options: HostedDbGuardOptions
): void {
  if (!isHostedSupabaseUrl(connectionString)) return;
  const env = options.env ?? process.env;
  if (isDeployedRuntime(env)) return;

  if (env['ALLOW_HOSTED_DB'] === '1') {
    (options.warn ?? console.warn)(
      `[hosted-db-guard] WARNING: ALLOW_HOSTED_DB=1 is set. ${options.variableName} names a ` +
        'hosted database and this process is not a deployed runtime. Every query goes to the ' +
        'hosted database. Use this only for a deliberate ops task.'
    );
    return;
  }

  throw new Error(
    `[hosted-db-guard] ${options.variableName} names a hosted database outside a deployed ` +
      'runtime (no RAILWAY_ENVIRONMENT, and VERCEL_ENV is not production or preview). ' +
      'Refusing to start. Point it at the local database, or set ALLOW_HOSTED_DB=1 for a ' +
      'deliberate ops task.'
  );
}
