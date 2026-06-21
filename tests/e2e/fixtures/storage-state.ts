/**
 * Build + persist Playwright `storageState` from a provisioned session.
 *
 * Reproduces what a real login writes (apps/web token-exchange + session-cleanup):
 * `accessToken`/`refreshToken` in localStorage and a matching `accessToken` cookie
 * for SSR/middleware. The fingerprint lives in sessionStorage and
 * `verifySessionFingerprint()` passes when none is stored, so the injected state
 * is accepted as authenticated.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { personaStatePath } from './qa-personas';
import type { ProvisionedSession } from './provision';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';

export function buildStorageState(accessToken: string, refreshToken: string, expiresAt: number) {
  const origin = new URL(BASE_URL);
  return {
    cookies: [
      {
        name: 'accessToken',
        value: accessToken,
        domain: origin.hostname,
        path: '/',
        expires: expiresAt,
        httpOnly: false,
        secure: origin.protocol === 'https:',
        sameSite: 'Lax' as const,
      },
    ],
    origins: [
      {
        origin: origin.origin,
        localStorage: [
          { name: 'accessToken', value: accessToken },
          { name: 'refreshToken', value: refreshToken },
        ],
      },
    ],
  };
}

/** Write one persona's storageState file and return its repo-relative path. */
export function writePersonaState(session: ProvisionedSession): string {
  const rel = personaStatePath(session.key);
  const outPath = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      buildStorageState(session.accessToken, session.refreshToken, session.expiresAt),
      null,
      2
    )
  );
  return rel;
}

export function writeAllPersonaStates(sessions: ProvisionedSession[]): string[] {
  return sessions.map(writePersonaState);
}

export interface PersonaMeta {
  tenantId: string;
  accountId: string;
  email: string;
}

const META_PATH = 'tests/e2e/.auth/_meta.json';

/** Write the non-token persona metadata (tenant/account ids) for matrix specs. */
export function writeMeta(sessions: ProvisionedSession[]): void {
  const meta: Record<string, PersonaMeta> = {};
  for (const s of sessions) {
    meta[s.key] = { tenantId: s.tenantId, accountId: s.accountId, email: s.email };
  }
  const outPath = path.join(process.cwd(), META_PATH);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(meta, null, 2));
}

export function readMeta(): Record<string, PersonaMeta> {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), META_PATH), 'utf8'));
}

/** Read a persona's access token back out of its written storageState. */
export function readPersonaToken(key: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), personaStatePath(key)), 'utf8');
  const state = JSON.parse(raw) as {
    origins?: { localStorage?: { name: string; value: string }[] }[];
  };
  const token = state.origins?.[0]?.localStorage?.find((e) => e.name === 'accessToken')?.value;
  if (!token) throw new Error(`No accessToken in storageState for persona ${key}`);
  return token;
}
