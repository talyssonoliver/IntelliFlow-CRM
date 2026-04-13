import 'server-only';
import { resolve } from 'node:path';
import {
  type LegalContentMetadata,
  type LegalContentSection,
  type ParsedLegalContent,
  formatLegalDate,
  loadLegalContent,
  slugify,
} from './legal-content-parser';

export type AupMetadata = LegalContentMetadata;
export type AupSection = LegalContentSection;
export type ParsedAup = ParsedLegalContent;

const AUP_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/aup-content.md'),
  resolve(process.cwd(), '../../docs/shared/aup-content.md'),
  resolve(process.cwd(), '../docs/shared/aup-content.md'),
];

export function getAup(candidates: string[] = AUP_PATH_CANDIDATES): ParsedAup {
  return loadLegalContent(candidates, 'Acceptable Use Policy');
}

export function formatAupDate(isoDate: string): string {
  return formatLegalDate(isoDate);
}

export const VIOLATION_REPORT_MAILTO_SUBJECT = 'AUP%20violation%20report';

export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ViolationCategory =
  | 'abuse'
  | 'security'
  | 'content'
  | 'api_misuse'
  | 'ai_misuse'
  | 'other';

export interface ViolationRecord {
  id: string;
  sectionId: string;
  category: ViolationCategory;
  severity: ViolationSeverity;
  reportedAt: string;
  reporterEmail: string;
  subjectAccountId?: string;
  notes: string;
  route: '/aup';
}

export interface ViolationRecordInput {
  id: string;
  sectionHeading: string;
  category: ViolationCategory;
  severity: ViolationSeverity;
  reporterEmail: string;
  subjectAccountId?: string;
  notes: string;
  now?: () => string;
}

export class ViolationRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViolationRecordError';
  }
}

// MVP scope (PG-054): builder is consumed by the violation-tracker test suite
// only. Sprint 18+ enforcement work will wire ViolationRecord into a server-
// side ViolationLogRepository and an admin UI; the type surface ships now so
// that wiring does not require reshaping callers.
export function buildViolationRecord(input: ViolationRecordInput): ViolationRecord {
  if (input.notes.trim().length === 0) {
    throw new ViolationRecordError('violation-tracker:notes-required');
  }
  if (input.reporterEmail.trim().length === 0) {
    throw new ViolationRecordError('violation-tracker:reporter-email-required');
  }

  const now = input.now ?? (() => new Date().toISOString());

  const record: ViolationRecord = {
    id: input.id,
    sectionId: slugify(input.sectionHeading),
    category: input.category,
    severity: input.severity,
    reportedAt: now(),
    reporterEmail: input.reporterEmail,
    notes: input.notes,
    route: '/aup',
  };

  if (input.subjectAccountId !== undefined) {
    record.subjectAccountId = input.subjectAccountId;
  }

  return Object.freeze(record);
}
