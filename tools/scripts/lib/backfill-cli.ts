/**
 * The command-line pieces the one-off backfill scripts share (MVP-001): where the database comes
 * from, how it is opened, the line that says what a run will do, and the guard that runs a script's
 * `main()` only when the file is run (never when a test imports it). A backfill is a dry run unless
 * `--apply` is given.
 */
import { PrismaClient } from '../../../packages/db/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export type BackfillPrisma = InstanceType<typeof PrismaClient>;

/** What a backfill run was asked to do: write or only report, and the scope it was narrowed to. */
export interface BackfillMode {
  isApply: boolean;
  tenantFilter?: string | undefined;
  leadFilter?: string | undefined;
}

export function modeOf(args: Pick<BackfillMode, 'isApply'>): 'APPLY' | 'DRY-RUN' {
  return args.isApply ? 'APPLY' : 'DRY-RUN';
}

/** The database to use (DATABASE_URL); null, after saying so, when it is not set. */
export function databaseUrl(tag: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const url = env['DATABASE_URL'];
  if (!url) console.error(`${tag} ERROR: DATABASE_URL is not set.`);
  return url || null;
}

export function connect(url: string): BackfillPrisma {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** The first line a run prints: its mode and the scope it covers. */
export function modeLine(tag: string, args: BackfillMode): string {
  const scope = args.tenantFilter ? ` tenant=${args.tenantFilter}` : ' (all tenants)';
  const lead = args.leadFilter ? ` lead=${args.leadFilter}` : '';
  return `${tag} mode=${modeOf(args)}${scope}${lead}`;
}

/**
 * Runs `main` when this file is the script being run (`node`/`tsx <file>`), and logs a failure and
 * exits 1 if it rejects. Importing the module (a test) runs nothing. True when it ran.
 */
export function runWhenInvoked(
  importMetaUrl: string,
  scriptFile: string,
  main: () => Promise<void>,
  tag: string,
  argv1: string | undefined = process.argv[1]
): boolean {
  const invoked = importMetaUrl === `file://${argv1}` || Boolean(argv1?.endsWith(scriptFile));
  if (!invoked) return false;
  main().catch((err: unknown) => {
    console.error(`${tag} FAILED:`, err);
    process.exit(1);
  });
  return true;
}
