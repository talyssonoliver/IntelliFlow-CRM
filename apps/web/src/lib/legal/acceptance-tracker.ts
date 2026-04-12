import 'server-only';
import { resolve } from 'node:path';
import {
  type LegalContentMetadata,
  type LegalContentSection,
  type ParsedLegalContent,
  loadLegalContent,
  formatLegalDate,
} from './legal-content-parser';

export type TermsMetadata = LegalContentMetadata;
export type TermsSection = LegalContentSection;
export type ParsedTerms = ParsedLegalContent;

export type TermsAcceptanceRecord = {
  termsVersion: string;
  acceptedAt: string;
  route: '/terms';
};

const TERMS_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/terms-content.md'),
  resolve(process.cwd(), '../../docs/shared/terms-content.md'),
  resolve(process.cwd(), '../docs/shared/terms-content.md'),
];

export function getTermsOfService(): ParsedTerms {
  return loadLegalContent(TERMS_PATH_CANDIDATES, 'Terms of Service');
}

export function formatTermsDate(isoDate: string): string {
  return formatLegalDate(isoDate);
}

export function buildTermsAcceptanceRecord(
  acceptedAt = new Date().toISOString()
): TermsAcceptanceRecord {
  const terms = getTermsOfService();
  return {
    termsVersion: terms.metadata.version,
    acceptedAt,
    route: '/terms',
  };
}
