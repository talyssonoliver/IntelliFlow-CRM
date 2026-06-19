/**
 * QA persona provisioning — Supabase-admin auth user + local-DB tenant seed.
 *
 * For each persona we:
 *  1. Ensure a confirmed Supabase auth user exists with a known (per-run, random)
 *     password — created or password-reset via the admin API. Email is autoconfirm.
 *  2. Sign in (anon client) to obtain a REAL access/refresh token.
 *  3. Seed the local test DB so the API resolves this user to a precise
 *     tenant/plan/industry: `User.id` is set to the Supabase user id because the
 *     API looks the user up by `where: { id: supabaseId }` (apps/api context.ts),
 *     so no JIT auto-provisioning happens and the seeded tenant is authoritative.
 *
 * SAFETY: this writes to the LOCAL TEST DB only (DATABASE_URL must be :5433) and
 * creates throwaway users in the prod Supabase *auth* project (Option B). It never
 * prints tokens, passwords or keys.
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';

// The generated Prisma client resolves cleanly via CJS require (works under tsx);
// a bare ESM import of `@intelliflow/db` yields an empty client in this context.
const nodeRequire = createRequire(import.meta.url);
const { PrismaClient } = nodeRequire('@intelliflow/db') as {
  PrismaClient: new (opts: unknown) => any;
};
import {
  QA_PERSONAS,
  personaEmail,
  personaTenantSlug,
  personaWorkspaceSlug,
  type QaPersona,
} from './qa-personas';

export interface ProvisionedSession {
  key: string;
  userId: string;
  tenantId: string;
  /** A marker account owned by this tenant — used for cross-tenant RLS checks. */
  accountId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env ${name} (load $TEMP/api-localb.env)`);
  return v;
}

function assertLocalDb(url: string): void {
  const u = new URL(url);
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new Error(`Refusing to seed: DATABASE_URL host is ${u.hostname}, not localhost`);
  }
  if (u.port !== '5433') {
    throw new Error(`Refusing to seed: DATABASE_URL port is ${u.port}, expected the test DB 5433`);
  }
}

/** Find an existing auth user by email (admin listUsers — fine for a small set). */
async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  // 1000 covers the throwaway-user volume; bump pages if the project grows.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function ensureAuthUser(admin: SupabaseClient, email: string, password: string) {
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  return data.user.id;
}

async function seedTenant(prisma: any, persona: QaPersona, userId: string, email: string) {
  const tenantSlug = personaTenantSlug(persona.key);
  const wsSlug = personaWorkspaceSlug(persona.key);

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: `QA ${persona.label}` },
    create: { name: `QA ${persona.label}`, slug: tenantSlug },
  });

  // Clear any stale user row holding this email under a *different* id (Supabase
  // user re-created), then bind User.id === supabase id.
  await prisma.user.deleteMany({ where: { email, NOT: { id: userId } } });
  await prisma.user.upsert({
    where: { id: userId },
    update: { email, tenantId: tenant.id, emailVerified: true, role: persona.role },
    create: { id: userId, email, tenantId: tenant.id, emailVerified: true, role: persona.role },
  });

  const ws = await prisma.workspace.upsert({
    where: { slug: wsSlug },
    update: { plan: persona.plan, industry: persona.industry },
    create: {
      name: `QA ${persona.label} WS`,
      slug: wsSlug,
      plan: persona.plan,
      industry: persona.industry,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { userId_workspaceId: { userId, workspaceId: ws.id } },
    update: { role: 'owner', isDefault: true },
    create: { userId, workspaceId: ws.id, role: 'owner', isDefault: true },
  });

  // Marker account owned by this tenant — the target for cross-tenant RLS checks.
  const markerName = `QA-MARKER-${persona.key}`;
  await prisma.account.deleteMany({ where: { tenantId: tenant.id, name: markerName } });
  const account = await prisma.account.create({
    data: { name: markerName, tenantId: tenant.id, ownerId: userId },
  });

  return { tenantId: tenant.id, accountId: account.id };
}

/**
 * Provision every persona and return their sessions. Idempotent: safe to re-run.
 */
export async function provisionAllPersonas(): Promise<ProvisionedSession[]> {
  const SUPABASE_URL = requireEnv('SUPABASE_URL');
  const SERVICE_ROLE = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
  const DATABASE_URL = requireEnv('DATABASE_URL');
  assertLocalDb(DATABASE_URL);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

  const sessions: ProvisionedSession[] = [];
  try {
    for (const persona of QA_PERSONAS) {
      const email = personaEmail(persona.key);
      // Per-run RANDOM credential (never persisted/logged); the trailing fixed
      // chars only satisfy Supabase's upper/lower/digit/symbol complexity rule.
      // Built as an expression (no hardcoded-password literal) on purpose.
      const pw = randomBytes(18).toString('base64url') + 'aA1' + '!';

      const userId = await ensureAuthUser(admin, email, pw);
      const { tenantId, accountId } = await seedTenant(prisma, persona, userId, email);

      const { data, error } = await anon.auth.signInWithPassword({ email, password: pw });
      if (error || !data.session) throw error ?? new Error(`sign-in failed for ${email}`);

      sessions.push({
        key: persona.key,
        userId,
        tenantId,
        accountId,
        email,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      });
    }
  } finally {
    await prisma.$disconnect();
  }
  return sessions;
}
