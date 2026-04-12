import 'server-only';
import { resolve } from 'node:path';
import {
  type LegalContentMetadata,
  type LegalContentSection,
  type ParsedLegalContent,
  loadLegalContent,
  formatLegalDate,
} from './legal-content-parser';

export type CookiePolicyMetadata = LegalContentMetadata;
export type CookiePolicySection = LegalContentSection;
export type ParsedCookiePolicy = ParsedLegalContent;

const COOKIE_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/cookie-content.md'),
  resolve(process.cwd(), '../../docs/shared/cookie-content.md'),
  resolve(process.cwd(), '../docs/shared/cookie-content.md'),
];

export function getCookiePolicy(): ParsedCookiePolicy {
  return loadLegalContent(COOKIE_PATH_CANDIDATES, 'Cookie Policy');
}

export function formatCookieDate(isoDate: string): string {
  return formatLegalDate(isoDate);
}
