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
