// Client-only acceptance tracking (localStorage).
// This module MUST only be imported from 'use client' components.

export type { TermsAcceptanceRecord } from './acceptance-tracker';

export const TERMS_ACCEPTANCE_KEY = 'intelliflow_terms_acceptance';

function isValidRecord(
  value: unknown
): value is { termsVersion: string; acceptedAt: string; route: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).termsVersion === 'string' &&
    typeof (value as Record<string, unknown>).acceptedAt === 'string' &&
    typeof (value as Record<string, unknown>).route === 'string'
  );
}

/**
 * Returns true if the stored acceptance record matches the current terms version.
 * @client-only
 */
export function hasAcceptedTerms(currentVersion: string): boolean {
  const record = getStoredAcceptanceRecord();
  return record !== null && record.termsVersion === currentVersion;
}

/**
 * Writes a terms acceptance record to localStorage for the given version.
 * @client-only
 */
export function recordTermsAcceptance(version: string): void {
  const record = {
    termsVersion: version,
    acceptedAt: new Date().toISOString(),
    route: '/terms',
  };
  localStorage.setItem(TERMS_ACCEPTANCE_KEY, JSON.stringify(record));
}

/**
 * Reads the stored acceptance record from localStorage.
 * Returns null if no record exists, the JSON is invalid, or the shape doesn't match.
 * @client-only
 */
export function getStoredAcceptanceRecord(): {
  termsVersion: string;
  acceptedAt: string;
  route: string;
} | null {
  try {
    const raw = localStorage.getItem(TERMS_ACCEPTANCE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidRecord(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
