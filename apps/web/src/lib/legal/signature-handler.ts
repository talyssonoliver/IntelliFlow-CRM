import 'server-only';
import { resolve } from 'node:path';
import {
  loadLegalContent,
  formatLegalDate,
  type LegalContentMetadata,
  type LegalContentSection,
  type ParsedLegalContent,
} from './legal-content-parser';

export type DpaMetadata = LegalContentMetadata;
export type DpaSection = LegalContentSection;
export type ParsedDpa = ParsedLegalContent;

export type DpaSignatureRecord = {
  dpaVersion: string;
  signedAt: string;
  signatoryName: string;
  route: '/dpa';
};

const DPA_PATH_CANDIDATES = [
  resolve(process.cwd(), 'docs/shared/dpa-content.md'),
  resolve(process.cwd(), '../../docs/shared/dpa-content.md'),
  resolve(process.cwd(), '../docs/shared/dpa-content.md'),
];

export function getDpa(candidates: string[] = DPA_PATH_CANDIDATES): ParsedDpa {
  return loadLegalContent(candidates, 'Data Processing Addendum');
}

export function formatDpaDate(isoDate: string): string {
  return formatLegalDate(isoDate);
}
