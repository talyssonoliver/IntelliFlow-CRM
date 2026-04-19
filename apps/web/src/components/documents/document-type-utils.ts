'use client';

import { DOCUMENT_TYPES, type DocumentType } from '@intelliflow/domain';

export const SYSTEM_DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CONTRACT: 'Contract',
  AGREEMENT: 'Agreement',
  EVIDENCE: 'Evidence',
  CORRESPONDENCE: 'Correspondence',
  COURT_FILING: 'Court Filing',
  MEMO: 'Memo',
  REPORT: 'Report',
  OTHER: 'Other',
};

export const SYSTEM_DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((value) => ({
  value,
  label: SYSTEM_DOCUMENT_TYPE_LABELS[value],
}));

export function getDocumentTypeDisplayLabel(input: {
  documentType: string;
  documentTypeLabel?: string | null;
}): string {
  const customLabel = input.documentTypeLabel?.trim();
  if (customLabel) {
    return customLabel;
  }

  if ((DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) {
    return SYSTEM_DOCUMENT_TYPE_LABELS[input.documentType as DocumentType];
  }

  return input.documentType.replaceAll('_', ' ');
}
