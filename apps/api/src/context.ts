/**
 * tRPC Context
 *
 * This defines the context available to all tRPC procedures.
 * The context includes:
 * - Prisma database client (for backward compatibility and direct queries)
 * - Application services (following hexagonal architecture)
 * - User authentication info (extracted from JWT token)
 * - Request metadata
 *
 * IFC-007: Fixed to extract and verify JWT tokens from Authorization header
 */

import type { PrismaClient } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';
import { container, containerReady, type Container, apiPrisma } from './container';
import { supabaseAdmin, verifyToken } from './lib/supabase';

/**
 * User session interface (will be replaced with actual auth implementation)
 */
export interface UserSession {
  userId: string;
  email: string;
  name?: string;
  role: string;
  tenantId: string;
  stripeCustomerId?: string;
  timezone?: string;
  // Avatar resolved once during context creation (DB `avatarUrl`, lazily
  // backfilled from the OAuth provider's metadata). Carrying it on the session
  // lets `auth.getStatus` reuse `ctx.user` instead of issuing its own
  // `prisma.user.findUnique` per request (N+1 elimination).
  avatarUrl?: string;
  // Email verification status. Always a boolean (never undefined).
  // Google-OAuth users arrive with emailVerified=true from Supabase.
  // Email/password sign-up users start false until they confirm.
  // Used by assertEmailVerified() to gate sensitive mutations.
  emailVerified: boolean;
}

/**
 * Services type from container
 * Note: Some services (experiment, feedback) are optional
 * as they are planned for future implementation
 */
export type Services = {
  lead: Container['leadService'];
  contact: Container['contactService'];
  account: Container['accountService'];
  opportunity: Container['opportunityService'];
  task: Container['taskService'];
  ticket: Container['ticketService'];
  ticketRouting: Container['ticketRoutingService'];
  leadRouting: Container['leadRoutingService'];
  analytics: Container['analyticsService'];
  chainVersion: Container['chainVersionService'];
  convertLeadToDeal: Container['convertLeadToDealUseCase'];
  closeDealWon: Container['closeDealWonUseCase'];
  closeDealLost: Container['closeDealLostUseCase'];
  feedbackSurvey: Container['feedbackSurveyService'];
  // PG-126: Anonymous Public Feedback Widget
  publicFeedback: Container['publicFeedbackService'];
  // IFC-025: Experiment Service
  experiment: Container['experimentService'];
  // IFC-157: Notification Orchestrator (unified service with preferences + audit)
  notificationOrchestrator: Container['notificationOrchestrator'];
  // IFC-297: AI Monitoring persistence service
  aiMonitoringService: Container['aiMonitoringService'];
  // IFC-214: Redis-backed live snapshot store (DB-tier fall-through built in)
  aiMonitoringStore: Container['aiMonitoringStore'];
  // IFC-196: Home Page Response Caching (Redis read-through + event-driven invalidation)
  homeCache: Container['homeCacheService'];
  // IFC-310: Duplicate-detection runtime (contact + account)
  contactDuplicateDetection: Container['contactDuplicateDetectionService'];
  accountDuplicateDetection: Container['accountDuplicateDetectionService'];
  // Optional future services
  feedback?: unknown;
};

/**
 * Security services type from container
 * IFC-098: RBAC/ABAC & Audit Trail
 * IFC-113: Secrets Management & Encryption
 * IFC-127: Tenant Isolation
 */
export type SecurityServices = Container['security'];

/**
 * Adapters type from container
 */
export type Adapters = Container['adapters'];

/**
 * Base context interface for production use
 */
export interface BaseContext {
  prisma: PrismaClient;
  container: Container;
  services: Services;
  security: SecurityServices;
  adapters: Adapters;
  user: UserSession | null | undefined;
  req?: Request;
  res?: Response;
  [key: string]: unknown;
}

/**
 * Context type for routers - uses Partial to allow testing flexibility
 * In production, createContext always provides full context
 * In tests, services/adapters/security can be omitted for backward compatibility
 *
 * Note: When using services in routers, check for their existence first
 * or use the full BaseContext type when you need guaranteed access.
 */
export interface Context {
  prisma: PrismaClient;
  prismaWithTenant?: PrismaClient;
  container?: Container;
  services?: Partial<Services>;
  security?: Partial<SecurityServices>;
  adapters?: Partial<Adapters>;
  user: UserSession | null | undefined;
  req?: Request;
  res?: Response;
  [key: string]: unknown;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req?: Request): string | null {
  if (!req) return null;

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;

  return parts[1];
}

/**
 * Default fallback user for development when no valid token is provided
 * Uses Sarah Johnson from seed data
 */
const FALLBACK_USER: UserSession = {
  userId: '00000000-0000-4000-8000-000000000103', // Sarah Johnson from SEED_IDS.users.sarahJohnson
  email: 'sarah.johnson@intelliflow.dev',
  name: 'Sarah Johnson',
  role: 'SALES_REP',
  tenantId: '00000000-0000-4000-8000-000000000001', // Default tenant from database
  // Dev fallback is always considered verified to avoid blocking local diagnostics.
  emailVerified: true,
};

/**
 * Dev-only escape hatch for local diagnostics.
 *
 * Disabled by default because it bypasses real authentication and can expose
 * tenant-scoped data in the UI when route guards are missing.
 */
function isDevAuthFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_FALLBACK === 'true';
}

/**
 * Create context for tRPC requests
 *
 * IFC-007: Now properly extracts and verifies JWT tokens from Authorization header
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify token with Supabase Auth
 * 3. Look up user in database to get role and tenant
 * 4. Return authenticated user session
 *
 * Falls back to mock user only when explicitly enabled for development diagnostics
 */
/**
 * Build the shared services object from the container
 */
function buildServicesFromContainer(): Services {
  return {
    lead: container.leadService,
    contact: container.contactService,
    account: container.accountService,
    opportunity: container.opportunityService,
    task: container.taskService,
    ticket: container.ticketService,
    ticketRouting: container.ticketRoutingService,
    leadRouting: container.leadRoutingService,
    analytics: container.analyticsService,
    chainVersion: container.chainVersionService,
    convertLeadToDeal: container.convertLeadToDealUseCase,
    closeDealWon: container.closeDealWonUseCase,
    closeDealLost: container.closeDealLostUseCase,
    feedbackSurvey: container.feedbackSurveyService,
    publicFeedback: container.publicFeedbackService,
    experiment: container.experimentService,
    notificationOrchestrator: container.notificationOrchestrator,
    aiMonitoringService: container.aiMonitoringService,
    aiMonitoringStore: container.aiMonitoringStore,
    homeCache: container.homeCacheService,
    // IFC-310: Duplicate-detection runtime services
    contactDuplicateDetection: container.contactDuplicateDetectionService,
    accountDuplicateDetection: container.accountDuplicateDetectionService,
  };
}

/**
 * Attempt to resolve a UserSession from a verified Supabase user ID.
 * Returns null when the DB user does not exist.
 */
type UserProvisioningPrisma = Pick<PrismaClient, 'tenant' | 'user'>;

const DEFAULT_BOOTSTRAP_ADMIN_EMAILS = ['talyssondasilvaoliveira@gmail.com'];

function normalizeEmail(email: string | undefined): string | null {
  return email?.trim().toLowerCase() || null;
}

function getBootstrapAdminEmails(): Set<string> {
  const configured = [
    process.env.BOOTSTRAP_ADMIN_EMAILS,
    process.env.INITIAL_ADMIN_EMAILS,
    process.env.OWNER_EMAIL,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) =>
      value
        .split(',')
        .map((entry) => normalizeEmail(entry))
        .filter((entry): entry is string => Boolean(entry))
    );

  return new Set([...DEFAULT_BOOTSTRAP_ADMIN_EMAILS, ...configured]);
}

function resolveProvisionedRole(email: string | undefined): 'ADMIN' | 'USER' {
  const normalized = normalizeEmail(email);
  return normalized && getBootstrapAdminEmails().has(normalized) ? 'ADMIN' : 'USER';
}

async function syncSupabaseUserRole(
  userId: string,
  userMetadata: Record<string, unknown>,
  role: UserSession['role']
): Promise<void> {
  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...userMetadata,
        role,
      },
    });
  } catch (error) {
    console.warn('[Auth] Failed to sync Supabase user role metadata:', error);
  }
}

async function resolveDbUserWith(
  prisma: UserProvisioningPrisma,
  supabaseId: string
): Promise<UserSession | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: supabaseId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      stripeCustomerId: true,
      timezone: true,
      avatarUrl: true,
      emailVerified: true,
    },
  });

  if (!dbUser) return null;

  return {
    userId: dbUser.id,
    email: dbUser.email,
    name: dbUser.name ?? undefined,
    role: dbUser.role,
    tenantId: dbUser.tenantId,
    stripeCustomerId: dbUser.stripeCustomerId ?? undefined,
    timezone: dbUser.timezone ?? 'Europe/London',
    avatarUrl: dbUser.avatarUrl ?? undefined,
    // Prefer the DB value (updated on each sign-in); guaranteed boolean via schema default.
    emailVerified: dbUser.emailVerified,
  };
}

async function maybePromoteBootstrapAdmin(
  prisma: UserProvisioningPrisma,
  session: UserSession,
  supabaseUser?: {
    user_metadata?: Record<string, unknown>;
  }
): Promise<UserSession> {
  if (resolveProvisionedRole(session.email) !== 'ADMIN' || session.role === 'ADMIN') {
    return session;
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: { role: 'ADMIN' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      stripeCustomerId: true,
      timezone: true,
      avatarUrl: true,
      emailVerified: true,
    },
  });

  await syncSupabaseUserRole(updated.id, supabaseUser?.user_metadata ?? {}, updated.role);

  return {
    userId: updated.id,
    email: updated.email,
    name: updated.name ?? undefined,
    role: updated.role,
    tenantId: updated.tenantId,
    stripeCustomerId: updated.stripeCustomerId ?? undefined,
    timezone: updated.timezone ?? 'Europe/London',
    avatarUrl: updated.avatarUrl ?? undefined,
    // Monotonic: preserve an emailVerified upgrade already applied in-memory by the
    // caller. The caller's verification write is fire-and-forget and may not have landed
    // before this promotion read, so trust the in-memory `session.emailVerified` too
    // (never demote a just-verified user when they're also promoted to bootstrap admin).
    emailVerified: session.emailVerified || updated.emailVerified,
  };
}

/**
 * Auto-provision a new user (JIT — Just In Time user creation for OAuth).
 * Returns a minimal UserSession on failure.
 */
function extractUserName(meta: Record<string, unknown>, email: string | undefined): string {
  return (
    (meta.name as string | undefined) ||
    (meta.full_name as string | undefined) ||
    email?.split('@')[0] ||
    'User'
  );
}

function extractAvatarUrl(meta: Record<string, unknown>): string | null {
  return (meta.avatar_url as string | undefined) || (meta.picture as string | undefined) || null;
}

function extractGivenName(meta: Record<string, unknown>): string | null {
  return (meta.given_name as string | undefined) || (meta.first_name as string | undefined) || null;
}

function extractFamilyName(meta: Record<string, unknown>): string | null {
  return (meta.family_name as string | undefined) || (meta.last_name as string | undefined) || null;
}

function extractLocale(meta: Record<string, unknown>): string | null {
  const locale = (meta.locale as string | undefined) || (meta.language as string | undefined);
  return locale || null;
}

function extractProvider(supabaseUser: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const appMeta = supabaseUser.app_metadata ?? {};
  const userMeta = supabaseUser.user_metadata ?? {};
  return (
    (appMeta.provider as string | undefined) ||
    (userMeta.provider as string | undefined) ||
    (userMeta.iss as string | undefined) ||
    null
  );
}

function extractEmailVerified(supabaseUser: {
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}): boolean {
  if (supabaseUser.email_confirmed_at) return true;
  const meta = supabaseUser.user_metadata ?? {};
  return Boolean(meta.email_verified);
}

async function provisionNewUserWith(
  prisma: UserProvisioningPrisma,
  supabaseUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    email_confirmed_at?: string | null;
  }
): Promise<UserSession> {
  try {
    const meta = supabaseUser.user_metadata ?? {};
    const userName = extractUserName(meta, supabaseUser.email);
    const avatarUrl = extractAvatarUrl(meta);
    const givenName = extractGivenName(meta);
    const familyName = extractFamilyName(meta);
    const locale = extractLocale(meta);
    const provider = extractProvider(supabaseUser);
    const emailVerified = extractEmailVerified(supabaseUser);

    // SECURITY — tenant isolation (incident 2026-06-16): every JIT sign-up gets its
    // OWN organization. Assigning new users to a shared/'default' tenant co-mingles
    // unrelated companies in one tenant — a cross-tenant data exposure (the prior bug
    // sent every sign-up into the seed tenant, so each user saw the others + demo data).
    // Joining an EXISTING org is invite-only (handled by invite acceptance), never by
    // auto-provisioning.
    const orgName =
      (typeof meta.organization === 'string' && meta.organization.trim()) ||
      (typeof meta.company === 'string' && meta.company.trim()) ||
      `${userName}'s Organization`;
    // Collapse non-alphanumerics to single hyphens, then trim edge hyphens with
    // string ops (avoids a backtracking-prone regex / sonarjs slow-regex).
    let baseSlug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (baseSlug.startsWith('-')) baseSlug = baseSlug.slice(1);
    if (baseSlug.endsWith('-')) baseSlug = baseSlug.slice(0, -1);
    if (!baseSlug) baseSlug = 'org';
    // Suffix with the FULL globally-unique Supabase user id (a UUID — already
    // slug-safe) so the slug is deterministic and unique per user. A truncated
    // prefix would reintroduce collision risk across DIFFERENT users.
    const tenantSlug = `${baseSlug}-${supabaseUser.id}`;

    // Upsert (not create) keeps provisioning idempotent. tenant + user are two
    // separate, non-transactional writes; if user.create below fails AFTER the
    // tenant row exists, the deterministic slug would collide on every retry and
    // lock the user out permanently. Upserting by that slug makes a retry reuse
    // the user's OWN org instead of colliding. The slug embeds this user's id, so
    // it can never reuse another user's tenant (the cross-tenant guarantee holds).
    const newTenant = await prisma.tenant.upsert({
      where: { slug: tenantSlug },
      create: { name: orgName, slug: tenantSlug, status: 'ACTIVE' },
      update: {},
    });

    // The creator of a brand-new organization is its admin/owner.
    const role = 'ADMIN' as const;

    const newUser = await prisma.user.create({
      data: {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: userName,
        givenName,
        familyName,
        avatarUrl,
        locale,
        provider,
        emailVerified,
        lastSignInAt: new Date(),
        signInCount: 1,
        role,
        tenantId: newTenant.id,
      },
    });

    await syncSupabaseUserRole(newUser.id, meta, newUser.role);

    console.log('[Auth] Auto-provisioned new user:', {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      tenantId: newUser.tenantId,
    });

    return {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name ?? undefined,
      role: newUser.role,
      tenantId: newUser.tenantId,
      avatarUrl: newUser.avatarUrl ?? undefined,
      // emailVerified was persisted to the DB row above; read it back from there
      // (not from the local variable) so the value is authoritative and consistent
      // with what resolveDbUserWith would return on subsequent requests.
      emailVerified: newUser.emailVerified,
    };
  } catch (provisionError) {
    console.error('[Auth] Failed to auto-provision user:', provisionError);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'JIT user provisioning failed',
      cause: provisionError,
    });
  }
}

export async function ensureAppUserSession(
  prisma: UserProvisioningPrisma,
  supabaseUser: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    email_confirmed_at?: string | null;
  }
): Promise<UserSession> {
  const existing = await resolveDbUserWith(prisma, supabaseUser.id);
  if (existing) {
    // Lazily backfill the avatar from the OAuth provider's metadata when the DB
    // value is missing. Makes the DB the single source of truth for the avatar so
    // `auth.getStatus` can reuse `ctx.user.avatarUrl` with no extra query, and it
    // self-heals for users provisioned before avatar persistence existed.
    const metaAvatar = extractAvatarUrl(supabaseUser.user_metadata ?? {});
    const shouldBackfillAvatar = !existing.avatarUrl && Boolean(metaAvatar);

    // emailVerified is MONOTONIC: a token can CONFIRM verification (false -> true)
    // but must never DEMOTE a persisted true. The fast-path JWT verifier
    // (lib/supabase verifyToken) builds the user object from JWT claims WITHOUT an
    // `email_confirmed_at` field, so extractEmailVerified falls back to
    // user_metadata.email_verified and can return false for an already-verified user
    // (including OAuth). Unconditionally writing that back would persist false and lock
    // the user out of every verifiedTenantProcedure (billing, sendEmail). So we only
    // upgrade — never overwrite the persisted value with a token-derived false.
    const tokenSaysVerified = extractEmailVerified(supabaseUser);
    const shouldUpgradeVerified = tokenSaysVerified && !existing.emailVerified;

    // Track sign-in for existing user (fire-and-forget — no need to await)
    void prisma.user
      .update({
        where: { id: existing.userId },
        data: {
          lastSignInAt: new Date(),
          signInCount: { increment: 1 },
          ...(shouldUpgradeVerified ? { emailVerified: true } : {}),
          ...(shouldBackfillAvatar ? { avatarUrl: metaAvatar } : {}),
        },
      })
      .catch((err) => console.warn('[Auth] Failed to update sign-in metadata:', err));

    // Reflect backfills in-memory so values are correct on THIS request too. Only an
    // upgrade is applied; a stale/partial token can never demote a verified account.
    if (shouldBackfillAvatar) existing.avatarUrl = metaAvatar ?? undefined;
    if (tokenSaysVerified) existing.emailVerified = true;

    return maybePromoteBootstrapAdmin(prisma, existing, supabaseUser);
  }

  return provisionNewUserWith(prisma, supabaseUser);
}

// ============================================
// USER SESSION CACHE (performance fix)
// ============================================
// Cache resolved UserSession objects in-process to avoid a DB round-trip
// (prisma.user.findUnique) on every request from the same user.
// TTL: 60 seconds. Eviction: on size limit (1000 entries).

const USER_SESSION_CACHE = new Map<string, { session: UserSession; expiresAt: number }>();
const USER_CACHE_TTL_MS = 60_000; // 60 seconds
const USER_CACHE_MAX_SIZE = 1_000;

function getCachedSession(userId: string): UserSession | null {
  const entry = USER_SESSION_CACHE.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    USER_SESSION_CACHE.delete(userId);
    return null;
  }
  return entry.session;
}

function cacheSession(userId: string, session: UserSession): void {
  // Simple size eviction: clear oldest entries when at limit
  if (USER_SESSION_CACHE.size >= USER_CACHE_MAX_SIZE) {
    const firstKey = USER_SESSION_CACHE.keys().next().value;
    if (firstKey) USER_SESSION_CACHE.delete(firstKey);
  }
  USER_SESSION_CACHE.set(userId, { session, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

/**
 * Resolve a UserSession from a raw JWT token.
 * Uses local JWT verification + in-process session cache to minimize latency.
 * Returns null when the token is invalid or the Supabase user cannot be verified.
 */
async function resolveUserFromToken(token: string): Promise<UserSession | null> {
  const { user: supabaseUser, error } = await verifyToken(token);

  if (error) {
    console.warn('[Auth] Token verification failed:', error.message);
    return null;
  }

  if (!supabaseUser) return null;

  // Check session cache before hitting the database
  const cached = getCachedSession(supabaseUser.id);
  if (cached) return cached;

  const session = await ensureAppUserSession(apiPrisma, supabaseUser);

  // Cache the resolved session
  if (session) {
    cacheSession(supabaseUser.id, session);
  }

  return session;
}

/**
 * Extract a raw bearer token from an Authorization header string.
 * Returns null if the header is absent or not a valid Bearer scheme.
 */
function extractWsBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] ?? null;
}

/**
 * Resolve a UserSession for a WebSocket connection from a raw JWT.
 * Returns null when the token is invalid or the DB user is absent.
 */
async function resolveWsUser(token: string): Promise<UserSession | null> {
  const { user: supabaseUser, error } = await verifyToken(token);
  if (error || !supabaseUser) return null;

  return ensureAppUserSession(apiPrisma, supabaseUser);
}

/**
 * Create context for WebSocket connections
 *
 * Simplified context creation that takes auth header directly,
 * avoiding the need to convert IncomingMessage to Request.
 */
export const createWSContext = async (authHeader?: string): Promise<BaseContext> => {
  // Mirror createContext: the container is lazily/async-initialised, so a cold
  // WebSocket connection must await readiness before touching the container Proxy
  // below (container/services/security/adapters), or it can throw while the
  // proxy's `_resolved` is still null. Instant once resolved.
  await containerReady;

  let user: UserSession | null = null;
  const hadBearerToken = Boolean(authHeader?.startsWith('Bearer '));
  const token = extractWsBearerToken(authHeader);

  if (token) {
    try {
      user = await resolveWsUser(token);
    } catch (err) {
      console.error('[WS Auth] Error verifying token:', err);
    }
  }

  // Explicit opt-in only: never auto-authenticate by default in development.
  if (!user && !hadBearerToken && isDevAuthFallbackEnabled()) {
    user = FALLBACK_USER;
  }

  return {
    prisma: apiPrisma,
    container,
    services: buildServicesFromContainer(),
    security: container.security,
    adapters: container.adapters,
    user,
  };
};

export const createContext = async (opts?: {
  req?: Request;
  res?: Response;
}): Promise<BaseContext> => {
  // The container is now lazily/asynchronously initialised (heavy AI SDKs are
  // dynamic-imported only when used). On serverless (the Next.js /api/trpc route
  // calls createContext directly and does NOT await containerReady at startup the
  // way http-server.ts does), the FIRST cold request could otherwise access the
  // container Proxy before `_resolved` is populated. Awaiting here makes every
  // entrypoint safe — it's instant once resolved, and the first cold request pays
  // the init cost it would pay anyway.
  await containerReady;

  let user: UserSession | null = null;
  const hadBearerToken = Boolean(opts?.req && extractBearerToken(opts?.req));

  // Extract and verify token from Authorization header
  const token = extractBearerToken(opts?.req);

  if (token) {
    try {
      user = await resolveUserFromToken(token);
    } catch (err) {
      console.error('[Auth] Error verifying token:', err);
    }
  }

  // Explicit opt-in only: never auto-authenticate by default in development.
  if (!user && !hadBearerToken && isDevAuthFallbackEnabled()) {
    user = FALLBACK_USER;
  }

  return {
    // Database client (for backward compatibility and complex queries)
    // Uses same fresh instance as container to avoid multiple connections
    prisma: apiPrisma,
    // Dependency injection container (for advanced use cases)
    container,
    // Application services (hexagonal architecture)
    services: buildServicesFromContainer(),
    // Security services (IFC-098, IFC-113, IFC-127)
    security: container.security,
    // Adapters for direct access when needed
    adapters: container.adapters,
    // User session (null in production if no valid token)
    user,
    req: opts?.req,
    res: opts?.res,
  };
};
