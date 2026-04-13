import 'server-only';
import { resolve } from 'node:path';
import {
  type LegalContentMetadata,
  type LegalContentSection,
  type ParsedLegalContent,
  loadLegalContent,
  formatLegalDate,
} from './legal-content-parser';

export type PrivacyPolicyMetadata = LegalContentMetadata;
export type PrivacyPolicySection = LegalContentSection;
export type ParsedPrivacyPolicy = ParsedLegalContent;

export type ConsentRecord = {
  policyVersion: string;
  reviewedAt: string;
  route: '/privacy';
};

const POLICY_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/privacy-content.md'),
  resolve(process.cwd(), '../../docs/shared/privacy-content.md'),
  resolve(process.cwd(), '../docs/shared/privacy-content.md'),
];

export function getPrivacyPolicy(): ParsedPrivacyPolicy {
  return loadLegalContent(POLICY_PATH_CANDIDATES, 'Privacy Policy');
}

export function formatPolicyDate(isoDate: string): string {
  return formatLegalDate(isoDate);
}

export function buildConsentRecord(reviewedAt = new Date().toISOString()): ConsentRecord {
  const policy = getPrivacyPolicy();

  return {
    policyVersion: policy.metadata.version,
    reviewedAt,
    route: '/privacy',
  };
}
