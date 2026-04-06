import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Use process.env directly (instead of Prisma's env() helper) so that
// `prisma generate` succeeds in CI where DB env vars are not set.
// The env() helper throws PrismaConfigEnvError on missing vars, which
// breaks `pnpm install --frozen-lockfile` before any validation step runs.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx --env-file=.env prisma/seed.ts',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
