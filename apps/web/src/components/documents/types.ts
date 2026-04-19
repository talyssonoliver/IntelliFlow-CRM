// =============================================================================
// Document Manager — Shared Types
// =============================================================================

// ─── Domain Enums ───────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SIGNED'
  | 'ARCHIVED'
  | 'SUPERSEDED';

export type DocumentClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'PRIVILEGED';

export type AccessLevel = 'NONE' | 'VIEW' | 'COMMENT' | 'EDIT' | 'ADMIN';

// ─── Data Interfaces ────────────────────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  metadata: {
    title: string;
    description?: string;
    documentType: string;
    documentTypeLabel?: string | null;
  };
  status: DocumentStatus;
  classification?: DocumentClassification;
  version?: {
    major: number;
    minor: number;
    patch: number;
  };
  mimeType?: string;
  sizeBytes?: string | number;
  createdAt: string;
  createdBy?: string;
  retentionUntil?: string;
  eSignature?: {
    signedBy: string;
    signedAt: string;
    signatureHash: string;
    ipAddress: string;
    userAgent: string;
  } | null;
  tags?: string[];
}

export interface AccessControlEntry {
  principalId: string;
  principalType: 'USER' | 'ROLE' | 'TENANT';
  userName: string;
  email: string;
  accessLevel: AccessLevel;
  grantedAt: string;
  grantedBy: string;
}

export interface DocumentVersion {
  id: string;
  versionNumber: string;
  changeType: 'major' | 'minor' | 'patch';
  createdAt: string;
  createdBy: string;
  sizeBytes: number;
  changelog?: string;
}

export type BulkAction = 'download' | 'share' | 'archive' | 'delete';

export interface DocumentFilters {
  status?: DocumentStatus[];
  classification?: DocumentClassification[];
  dateRange?: { from: Date; to: Date };
  fileType?: string[];
  author?: string;
  query?: string;
}

// ─── Component Props ────────────────────────────────────────────────────────

export interface DocumentListProps {
  tenantId: string;
  userId: string;
  initialFilters?: DocumentFilters;
  initialDocuments?: DocumentRecord[];
  onDocumentSelect?: (documentId: string) => void;
  onBulkAction?: (action: BulkAction, documentIds: string[]) => void;
}

export interface DocumentUploadProps {
  tenantId: string;
  userId: string;
  relatedCaseId?: string;
  relatedContactId?: string;
  onUploadComplete?: (documentId: string) => void;
  onCancel?: () => void;
  maxFileSizeMB?: number;
}

export interface DocumentViewerProps {
  documentId: string;
  storageUrl: string;
  mimeType: string;
  fileName: string;
  onClose?: () => void;
  className?: string;
}

export interface VersionHistoryProps {
  documentId: string;
  versions: DocumentVersion[];
  currentVersionId: string;
  onVersionSelect?: (versionId: string) => void;
  onRestoreVersion?: (versionId: string) => void;
}

export interface ACLManagerProps {
  documentId: string;
  currentACL: AccessControlEntry[];
  currentUserAccessLevel: AccessLevel;
  onGrantAccess: (userId: string, level: AccessLevel) => void;
  onRevokeAccess: (userId: string) => void;
  isLegalHold?: boolean;
}

export interface DocumentSearchProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: DocumentFilters) => void;
  activeFilters: DocumentFilters;
  resultCount?: number;
}
