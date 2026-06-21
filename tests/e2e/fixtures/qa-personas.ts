/**
 * QA persona matrix — tiers × tenants × industries.
 *
 * Each persona is a real Supabase auth user (created via admin) paired with a
 * seeded local-DB tenant/workspace whose `plan` + `industry` give precise
 * tier/tenant control. The auth setup project (`auth.setup.ts`) provisions each
 * one and saves an authenticated `storageState` so specs can run as that user.
 *
 * Distinct tenants per persona enable cross-tenant RLS-denial checks (≥2 tenants).
 * `default` is the all-modules ENTERPRISE user used to unlock the existing authed
 * specs; the others exercise the gating/isolation matrix.
 */
export type PlanTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface QaPersona {
  /** Stable key — used for the email, slugs and the storageState filename. */
  readonly key: string;
  readonly plan: PlanTier;
  /** Free-text workspace industry; drives any industry-specific behaviour. */
  readonly industry: string;
  /** Human label for test titles. */
  readonly label: string;
  /** Tenant DDD role seeded on the user. */
  readonly role: 'ADMIN' | 'USER';
}

/** Domain reserved for throwaway QA users (clearly namespaced + cleanable). */
export const QA_EMAIL_DOMAIN = 'qa.intelliflow.test';

export const QA_PERSONAS: readonly QaPersona[] = [
  {
    key: 'enterprise',
    plan: 'ENTERPRISE',
    industry: 'saas',
    label: 'Enterprise (all modules)',
    role: 'ADMIN',
  },
  {
    key: 'professional',
    plan: 'PROFESSIONAL',
    industry: 'legal',
    label: 'Professional (legal industry, LEGAL enabled)',
    role: 'ADMIN',
  },
  {
    key: 'starter',
    plan: 'STARTER',
    industry: 'legal',
    label: 'Starter (legal industry, LEGAL still gated)',
    role: 'ADMIN',
  },
  {
    key: 'tenantB',
    plan: 'STARTER',
    industry: 'finance',
    label: 'Second tenant (cross-tenant RLS control)',
    role: 'ADMIN',
  },
] as const;

/** The default authenticated persona for existing authed specs (all modules). */
export const DEFAULT_PERSONA_KEY = 'enterprise';

export function personaEmail(key: string): string {
  return `qa.${key}@${QA_EMAIL_DOMAIN}`;
}

export function personaTenantSlug(key: string): string {
  return `qa-tenant-${key}`;
}

export function personaWorkspaceSlug(key: string): string {
  return `qa-ws-${key}`;
}

/** Where each persona's authenticated storageState is written (gitignored). */
export function personaStatePath(key: string): string {
  return `tests/e2e/.auth/${key}.json`;
}

export function getPersona(key: string): QaPersona {
  const p = QA_PERSONAS.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown QA persona: ${key}`);
  return p;
}
