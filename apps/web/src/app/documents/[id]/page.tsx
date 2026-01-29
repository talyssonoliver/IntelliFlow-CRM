'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

// Tab types
type TabId = 'overview' | 'versions' | 'access-control' | 'signatures' | 'comments';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

type DocumentStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'SIGNED' | 'ARCHIVED' | 'SUPERSEDED';
type AccessLevel = 'NONE' | 'VIEW' | 'COMMENT' | 'EDIT' | 'ADMIN';

interface ACLEntry {
  id: string;
  principalType: string;
  principalId: string;
  principalName: string;
  level: AccessLevel;
  grantedAt: string;
  grantedBy: string;
  expiresAt?: string | null;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [newComment, setNewComment] = useState('');

  // Fetch document data
  const { data: documentData, isLoading, error } = trpc.documents.getById.useQuery({
    id: documentId,
  });

  // Fetch audit trail for version history
  const { data: rawAuditTrail } = trpc.documents.getAuditTrail.useQuery({
    documentId,
  });

  // Map audit trail to UI-friendly format
  // Prisma CaseDocumentAudit has: id, document_id, tenant_id, event_type, user_id, ip_address, user_agent, changes, metadata, created_at
  // UI expects: versionMajor, versionMinor, versionPatch, action, timestamp, performedBy, changes, metadata

  // Define simplified types to avoid deep type instantiation issues with Prisma's complex Json type
  interface RawAuditEntry {
    id: string;
    document_id: string;
    tenant_id: string;
    event_type: string;
    user_id: string;
    ip_address: string | null;
    user_agent: string | null;
    changes: unknown;
    metadata: unknown;
    created_at: string | Date;
  }

  interface AuditEntry {
    id: string;
    versionMajor: number;
    versionMinor: number;
    versionPatch: number;
    action: string;
    timestamp: string;
    performedBy: string;
    changes: string | null;
    metadata: { sizeBytes?: number } | null;
  }

  // Cast to simplified type to avoid deep type instantiation issues with Prisma's Json type
  // The tRPC return type for caseDocumentAudit is complex; using explicit cast is safe since
  // we're only accessing documented Prisma model fields
  const auditEntries: RawAuditEntry[] = rawAuditTrail
    ? (rawAuditTrail as unknown as RawAuditEntry[])
    : [];
  const auditTrail: AuditEntry[] = [];
  for (let index = 0; index < auditEntries.length; index++) {
    const entry = auditEntries[index];
    // Extract version from metadata if available, otherwise use index as fallback
    const metadata = entry.metadata as { version?: { major?: number; minor?: number; patch?: number }; sizeBytes?: number } | null;
    const version = metadata?.version;
    // created_at comes as string from tRPC serialization
    const createdAt = typeof entry.created_at === 'string' ? entry.created_at : String(entry.created_at);
    // changes field can be JSON object or null from Prisma
    const changesStr = entry.changes != null ? JSON.stringify(entry.changes) : null;

    auditTrail.push({
      id: entry.id,
      versionMajor: version?.major ?? 1,
      versionMinor: version?.minor ?? 0,
      versionPatch: version?.patch ?? (auditEntries.length - index - 1),
      action: entry.event_type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      timestamp: createdAt,
      performedBy: entry.user_id,
      changes: changesStr,
      metadata: metadata ? { sizeBytes: metadata.sizeBytes } : null,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <span className="material-symbols-outlined text-[64px] text-slate-400 animate-spin">progress_activity</span>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !documentData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <span className="material-symbols-outlined text-[64px] text-red-500">error</span>
          <p className="mt-4 text-red-600 dark:text-red-400">Failed to load document</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error?.message || 'Document not found'}</p>
          <Link href="/documents" className="mt-4 inline-block px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600">
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  // Map API response to component data
  const document = {
    id: documentData.id,
    title: documentData.metadata.title,
    description: documentData.metadata.description || '',
    documentType: documentData.metadata.documentType,
    status: documentData.status,
    classification: documentData.metadata.classification,
    version: `${documentData.version.major}.${documentData.version.minor}.${documentData.version.patch}`,
    sizeBytes: Number(documentData.sizeBytes),
    createdAt: documentData.createdAt,
    createdBy: documentData.createdBy,
    lastModifiedAt: documentData.updatedAt,
    lastModifiedBy: documentData.updatedBy,
    isLegalHold: documentData.retentionUntil ? new Date(documentData.retentionUntil) > new Date() : false,
    signatureCount: documentData.eSignature ? 1 : 0,
    relatedCase: documentData.metadata.relatedCaseId || null,
    relatedContact: documentData.metadata.relatedContactId || null,
    tags: documentData.metadata.tags || [],
    fileUrl: documentData.storageKey,
    thumbnailUrl: null,
  };

  // Map ACL entries from API response
  // ACL structure from domain: { principalId, principalType, accessLevel, grantedBy, grantedAt, expiresAt }
  interface DomainACLEntry {
    principalId: string;
    principalType: 'USER' | 'ROLE' | 'TENANT';
    accessLevel: string;
    grantedBy: string;
    grantedAt: string | Date;
    expiresAt?: string | Date | null;
  }
  const accessControlList: ACLEntry[] = (documentData.acl || []).map((acl: DomainACLEntry, index: number) => ({
    id: `acl-${index}`, // Generate ID since domain ACL doesn't have a separate ID
    principalType: acl.principalType,
    principalId: acl.principalId,
    principalName: acl.principalId, // In real app, this would be looked up
    level: acl.accessLevel as AccessLevel,
    grantedAt: typeof acl.grantedAt === 'string' ? acl.grantedAt : String(acl.grantedAt),
    grantedBy: acl.grantedBy,
    expiresAt: acl.expiresAt ? (typeof acl.expiresAt === 'string' ? acl.expiresAt : String(acl.expiresAt)) : null,
  }));

  // Map e-signature data from API response
  // Note: Domain model's eSignature object has: signedBy, signedAt, signatureHash, ipAddress, userAgent
  // UI component needs an 'id' for React key, using document ID as fallback
  const signatures = documentData.eSignature ? [{
    id: documentData.id, // Use document ID since eSignature schema doesn't include separate ID
    signerName: documentData.eSignature.signedBy,
    signerEmail: 'user@company.com', // TODO: Fetch user email from signedBy userId
    signedAt: documentData.eSignature.signedAt || '',
    ipAddress: documentData.eSignature.ipAddress || '',
    userAgent: documentData.eSignature.userAgent || '',
  }] : [];

  // Comments are not yet implemented in backend
  interface Comment {
    id: string;
    author: string;
    authorAvatar?: string;
    content: string;
    createdAt: string;
    isResolved?: boolean;
  }
  const comments: Comment[] = [];

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'versions', label: 'Version History', count: auditTrail?.length || 0 },
    { id: 'access-control', label: 'Access Control', count: accessControlList.length },
    { id: 'signatures', label: 'Signatures', count: signatures.length },
    { id: 'comments', label: 'Comments', count: comments.length },
  ];

  const formatFileSize = (bytes: number) => {
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateString);
  };

  const getStatusConfig = (status: DocumentStatus) => {
    const configs = {
      DRAFT: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', icon: 'edit_note' },
      UNDER_REVIEW: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: 'rate_review' },
      APPROVED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: 'check_circle' },
      SIGNED: { bg: 'bg-[#137fec]/10', text: 'text-[#137fec]', icon: 'verified' },
      ARCHIVED: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-600 dark:text-gray-400', icon: 'archive' },
      SUPERSEDED: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: 'history' },
    };
    return configs[status] || configs.DRAFT;
  };

  const getAccessLevelBadge = (level: AccessLevel) => {
    const configs = {
      NONE: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
      VIEW: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
      COMMENT: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
      EDIT: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
      ADMIN: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
    };
    return configs[level] || configs.NONE;
  };

  const statusConfig = getStatusConfig(document.status);

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      {/* Header with breadcrumb and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/documents" className="hover:text-[#137fec]">Documents</Link>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">{document.title}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{document.title}</h1>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined text-[18px]">download</span>
            Download
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined text-[18px]">share</span>
            Share
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none">
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Edit
          </button>
        </div>
      </div>

      {/* Main 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar - Document Info */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Document Info Card */}
          <Card className="overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-blue-100 to-blue-50 dark:from-slate-800 dark:to-slate-800 flex items-center justify-center">
              <span className="material-symbols-outlined text-[64px] text-[#137fec]">description</span>
            </div>
            <div className="px-5 py-6">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                    <span className="material-symbols-outlined text-sm">{statusConfig.icon}</span>
                    {document.status.replace('_', ' ')}
                  </span>
                  {document.isLegalHold && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <span className="material-symbols-outlined text-sm">shield</span>
                      Legal Hold
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {document.documentType}
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">folder</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Classification</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{document.classification}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">bookmark</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Version</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">v{document.version}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">insert_drive_file</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">File Size</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{formatFileSize(document.sizeBytes)}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">calendar_today</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Created</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{formatDate(document.createdAt)}</span>
                    <span className="text-xs text-slate-500">by {document.createdBy}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">update</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Last Modified</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{formatRelativeTime(document.lastModifiedAt)}</span>
                    <span className="text-xs text-slate-500">by {document.lastModifiedBy}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag: string) => (
                    <span key={tag} className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Related Items */}
              {(document.relatedCase || document.relatedContact) && (
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-3">Related</p>
                  <div className="space-y-2">
                    {document.relatedCase && (
                      <Link href={`/cases/${document.relatedCase}`} className="flex items-center gap-2 text-sm text-[#137fec] hover:underline">
                        <span className="material-symbols-outlined text-[16px]">gavel</span>
                        {document.relatedCase}
                      </Link>
                    )}
                    {document.relatedContact && (
                      <Link href={`/contacts/${document.relatedContact}`} className="flex items-center gap-2 text-sm text-[#137fec] hover:underline">
                        <span className="material-symbols-outlined text-[16px]">person</span>
                        {document.relatedContact}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </aside>

        {/* Center Content - Tabs and Content */}
        <section className="lg:col-span-9 flex flex-col gap-6">
          <Card>
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-[#137fec] border-[#137fec]'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Description</h3>
                    <p className="text-slate-600 dark:text-slate-400">{document.description}</p>
                  </div>

                  {/* Document Preview */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Document Preview</h3>
                    <div className="aspect-[8.5/11] bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <div className="text-center">
                        <span className="material-symbols-outlined text-[80px] text-slate-400">description</span>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">PDF Preview</p>
                        <button className="mt-4 px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                          Open Full View
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-[32px] text-[#137fec]">draw</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Sign</span>
                      </button>
                      <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-[32px] text-[#137fec]">check_circle</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Approve</span>
                      </button>
                      <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-[32px] text-[#137fec]">content_copy</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Duplicate</span>
                      </button>
                      <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined text-[32px] text-[#137fec]">print</span>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Print</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Version History Tab */}
              {activeTab === 'versions' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Version History</h3>
                    <button className="px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                      Create New Version
                    </button>
                  </div>

                  {auditTrail && auditTrail.length > 0 ? (
                    auditTrail.map((event, index) => {
                      const isCurrent = index === 0; // Most recent event is current
                      return (
                        <div key={event.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-[#137fec] transition-colors">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded ${isCurrent ? 'bg-[#137fec]/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                <span className={`material-symbols-outlined text-[24px] ${isCurrent ? 'text-[#137fec]' : 'text-slate-400'}`}>
                                  {isCurrent ? 'verified' : 'history'}
                                </span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                                    v{event.versionMajor}.{event.versionMinor}.{event.versionPatch}
                                  </span>
                                  {isCurrent && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                                  {event.action} - {event.changes || 'No change log'}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                  <span>{formatDate(event.timestamp)}</span>
                                  <span>•</span>
                                  <span>by {event.performedBy}</span>
                                  {event.metadata?.sizeBytes && (
                                    <>
                                      <span>•</span>
                                      <span>{formatFileSize(Number(event.metadata.sizeBytes))}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button className="p-1.5 text-slate-400 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                                <span className="material-symbols-outlined text-[20px]">download</span>
                              </button>
                              <button className="p-1.5 text-slate-400 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                              </button>
                              {!isCurrent && (
                                <button className="p-1.5 text-slate-400 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                                  <span className="material-symbols-outlined text-[20px]">restore</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12">
                      <span className="material-symbols-outlined text-[48px] text-slate-400">history</span>
                      <p className="mt-4 text-slate-600 dark:text-slate-400">No version history available</p>
                    </div>
                  )}
                </div>
              )}

              {/* Access Control Tab */}
              {activeTab === 'access-control' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Access Control List</h3>
                    <button className="px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                      Grant Access
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Principal</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Access Level</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Granted</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Expires</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accessControlList.length > 0 ? (
                          accessControlList.map((acl: ACLEntry) => {
                            const levelBadge = getAccessLevelBadge(acl.level);
                            return (
                              <tr key={acl.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px] text-slate-400">
                                      {acl.principalType === 'USER' ? 'person' : acl.principalType === 'ROLE' ? 'group' : 'business'}
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 dark:text-white">{acl.principalName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-slate-600 dark:text-slate-400">{acl.principalType}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${levelBadge.bg} ${levelBadge.text}`}>
                                    {acl.level}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-xs text-slate-600 dark:text-slate-400">
                                    <div>{formatDate(acl.grantedAt)}</div>
                                    <div className="text-slate-500">by {acl.grantedBy}</div>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs text-slate-600 dark:text-slate-400">
                                    {acl.expiresAt ? formatDate(acl.expiresAt) : 'Never'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <button className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-12 text-center">
                              <span className="material-symbols-outlined text-[48px] text-slate-400">lock</span>
                              <p className="mt-4 text-slate-600 dark:text-slate-400">No access control entries</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Signatures Tab */}
              {activeTab === 'signatures' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">E-Signatures</h3>
                    <button className="px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
                      Request Signature
                    </button>
                  </div>

                  {signatures.length > 0 ? (
                    <>
                      <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg mb-4">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-green-600 dark:text-green-400">check_circle</span>
                          <span className="text-sm font-medium text-green-800 dark:text-green-300">
                            Document fully signed by {signatures.length} {signatures.length === 1 ? 'party' : 'parties'}
                          </span>
                        </div>
                      </div>

                      {signatures.map((signature) => (
                        <div key={signature.id} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded bg-green-100 dark:bg-green-900/30">
                              <span className="material-symbols-outlined text-[24px] text-green-600 dark:text-green-400">draw</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-slate-900 dark:text-white">{signature.signerName}</span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Signed
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{signature.signerEmail}</p>
                              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                                <div>
                                  <span className="font-semibold">Signed at:</span> {formatDate(signature.signedAt)}
                                </div>
                                <div>
                                  <span className="font-semibold">IP Address:</span> {signature.ipAddress}
                                </div>
                              </div>
                            </div>
                            <button className="p-1.5 text-slate-400 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                              <span className="material-symbols-outlined text-[20px]">more_vert</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <span className="material-symbols-outlined text-[48px] text-slate-400">draw</span>
                      <p className="mt-4 text-slate-600 dark:text-slate-400">No signatures yet</p>
                      <p className="text-sm text-slate-500">Request a signature to get started</p>
                    </div>
                  )}
                </div>
              )}

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Comments & Annotations</h3>

                    {/* Add Comment */}
                    <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg mb-6">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm focus:border-[#137fec] focus:ring-1 focus:ring-[#137fec] min-h-[80px] p-3 placeholder:text-slate-400"
                        placeholder="Add a comment or annotation..."
                      />
                      <div className="flex justify-between items-center mt-2">
                        <div className="flex gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                            <span className="material-symbols-outlined text-[20px]">attach_file</span>
                          </button>
                          <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                            <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                          </button>
                        </div>
                        <button className="bg-[#137fec] text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-blue-600 transition-colors">
                          Add Comment
                        </button>
                      </div>
                    </div>

                    {/* Comments List */}
                    <div className="space-y-4">
                      {comments.length > 0 ? (
                        comments.map((comment) => (
                          <div key={comment.id} className="flex gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                              <img src={comment.authorAvatar} alt={comment.author} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1">
                              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-slate-900 dark:text-white">{comment.author}</span>
                                  <span className="text-xs text-slate-500">{formatRelativeTime(comment.createdAt)}</span>
                                </div>
                                <p className="text-sm text-slate-700 dark:text-slate-300">{comment.content}</p>
                              </div>
                              <div className="flex items-center gap-4 mt-2 px-3">
                                <button className="text-xs text-slate-500 hover:text-[#137fec] font-medium">Reply</button>
                                {comment.isResolved ? (
                                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                    Resolved
                                  </span>
                                ) : (
                                  <button className="text-xs text-slate-500 hover:text-[#137fec] font-medium">Mark as Resolved</button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12">
                          <span className="material-symbols-outlined text-[48px] text-slate-400">comment</span>
                          <p className="mt-4 text-slate-600 dark:text-slate-400">No comments yet</p>
                          <p className="text-sm text-slate-500">Be the first to add a comment</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
