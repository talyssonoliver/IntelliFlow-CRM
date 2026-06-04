// Client-only DPA signature tracking (localStorage). Must only be imported from 'use client' components.
export type { DpaSignatureRecord } from './signature-handler';

export const DPA_SIGNATURE_KEY = 'intelliflow_dpa_signature';

function isValidRecord(value: unknown): value is import('./signature-handler').DpaSignatureRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.dpaVersion === 'string' &&
    typeof r.signedAt === 'string' &&
    typeof r.signatoryName === 'string' &&
    typeof r.route === 'string'
  );
}

export function hasSigned(currentVersion: string): boolean {
  try {
    const raw = localStorage.getItem(DPA_SIGNATURE_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as unknown;
    if (!isValidRecord(record)) return false;
    return record.dpaVersion === currentVersion;
  } catch {
    return false;
  }
}

export function recordDpaSignature(version: string, signatoryName: string): void {
  const record: import('./signature-handler').DpaSignatureRecord = {
    dpaVersion: version,
    signedAt: new Date().toISOString(),
    signatoryName,
    route: '/dpa',
  };
  try {
    localStorage.setItem(DPA_SIGNATURE_KEY, JSON.stringify(record));
  } catch {
    // Storage may be disabled or quota-exceeded; degrade gracefully.
  }
}

export function getStoredDpaSignature(): import('./signature-handler').DpaSignatureRecord | null {
  try {
    const raw = localStorage.getItem(DPA_SIGNATURE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
