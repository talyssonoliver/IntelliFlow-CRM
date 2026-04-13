'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, EmptyState } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { AppAvatar } from '@/components/shared/app-avatar';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { formatFileSize } from '@/components/documents';
import type { AccessLevel, DocumentStatus } from '@/components/documents';

// Tab types
type TabId = 'overview' | 'versions' | 'access-control' | 'signatures' | 'activity' | 'comments';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

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

// Audit trail types (simplified to avoid deep Prisma Json type instantiation)
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

// Map a raw audit entry to the UI-friendly AuditEntry shape
function mapAuditEntry(entry: RawAuditEntry, index: number, total: number): AuditEntry {
  const metadata = entry.metadata as {
    version?: { major?: number; minor?: number; patch?: number };
    sizeBytes?: number;
  } | null;
  const version = metadata?.version;
  const createdAt =
    typeof entry.created_at === 'string' ? entry.created_at : String(entry.created_at);
  const changesStr = entry.changes == null ? null : JSON.stringify(entry.changes);
  return {
    id: entry.id,
    versionMajor: version?.major ?? 1,
    versionMinor: version?.minor ?? 0,
    versionPatch: version?.patch ?? total - index - 1,
    action: entry.event_type
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase()),
    timestamp: createdAt,
    performedBy: entry.user_id,
    changes: changesStr,
    metadata: metadata ? { sizeBytes: metadata.sizeBytes } : null,
  };
}

function formatDateTime(dateString: string, timezone: string = 'Europe/London'): string {
  return new Date(dateString).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

function formatRelativeTime(dateString: string, timezone: string = 'Europe/London'): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDateTime(dateString, timezone);
}

function getStatusConfig(status: DocumentStatus) {
  const configs = {
    DRAFT: {
      bg: 'bg-slate-100 dark:bg-slate-800',
      text: 'text-slate-700 dark:text-slate-300',
      icon: 'edit_note',
    },
    UNDER_REVIEW: {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      icon: 'rate_review',
    },
    APPROVED: {
      bg: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      icon: 'check_circle',
    },
    SIGNED: { bg: 'bg-[#137fec]/10', text: 'text-[#137fec]', icon: 'verified' },
    ARCHIVED: {
      bg: 'bg-gray-100 dark:bg-gray-900/30',
      text: 'text-gray-600 dark:text-gray-400',
      icon: 'archive',
    },
    SUPERSEDED: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-400',
      icon: 'history',
    },
  };
  return configs[status] || configs.DRAFT;
}

function getAccessLevelBadge(level: AccessLevel) {
  const configs = {
    NONE: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
    VIEW: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
    COMMENT: {
      bg: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-700 dark:text-purple-400',
    },
    EDIT: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
    ADMIN: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  };
  return configs[level] || configs.NONE;
}

// ─── Sub-components extracted to reduce cognitive complexity ─────────────────

function DocumentLoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <span className="material-symbols-outlined text-[64px] text-slate-400 animate-spin">
          progress_activity
        </span>
        <p className="mt-4 text-slate-600 dark:text-slate-400">Loading document...</p>
      </div>
    </div>
  );
}

function DocumentRedirectingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <span className="material-symbols-outlined text-[64px] text-slate-400 animate-spin">
          progress_activity
        </span>
        <p className="mt-4 text-slate-600 dark:text-slate-400">Redirecting to login...</p>
      </div>
    </div>
  );
}

function DocumentErrorView({ error }: { error: { message?: string } | null }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <span className="material-symbols-outlined text-[64px] text-red-500">error</span>
        <p className="mt-4 text-red-600 dark:text-red-400">Failed to load document</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {error?.message || 'Document not found'}
        </p>
        <Link
          href="/documents"
          className="mt-4 inline-block px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600"
        >
          Back to Documents
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// Types shared between sub-components (defined here to avoid scope issues)
interface DocumentPageSignature {
  id: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
}

interface DocumentPageComment {
  id: string;
  author: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  isResolved?: boolean;
}

interface DocumentPageDoc {
  id: string;
  title: string;
  description: string;
  documentType: string;
  status: import('@/components/documents').DocumentStatus;
  classification: string;
  version: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
  isLegalHold: boolean;
  signatureCount: number;
  relatedCase: string | null;
  relatedContact: string | null;
  tags: string[];
  fileUrl: string;
  thumbnailUrl: null;
}

function DocumentOverviewTab({
  document,
  signedUrlData,
  signMutation,
  approveMutation,
  documentId,
}: {
  document: DocumentPageDoc;
  signedUrlData: { url?: string } | undefined;
  signMutation: { isPending: boolean; mutate: (args: { documentId: string }) => void };
  approveMutation: { isPending: boolean; mutate: (args: { documentId: string }) => void };
  documentId: string;
}) {
  return (
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
            <span className="material-symbols-outlined text-[80px] text-slate-400">
              description
            </span>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">PDF Preview</p>
            {signedUrlData?.url ? (
              <a
                href={signedUrlData.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors"
              >
                Open Full View
              </a>
            ) : (
              <button
                className="mt-4 px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors opacity-50 cursor-not-allowed"
                disabled
              >
                Open Full View
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={document.status !== 'APPROVED' || signMutation.isPending}
            onClick={() => signMutation.mutate({ documentId })}
          >
            <span className="material-symbols-outlined text-[32px] text-[#137fec]">draw</span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {signMutation.isPending ? 'Signing...' : 'Sign'}
            </span>
          </button>
          <button
            className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={document.status !== 'UNDER_REVIEW' || approveMutation.isPending}
            onClick={() => approveMutation.mutate({ documentId })}
          >
            <span className="material-symbols-outlined text-[32px] text-[#137fec]">
              check_circle
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {approveMutation.isPending ? 'Approving...' : 'Approve'}
            </span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined text-[32px] text-[#137fec]">
              content_copy
            </span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Duplicate
            </span>
          </button>
          <button className="flex flex-col items-center gap-2 p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <span className="material-symbols-outlined text-[32px] text-[#137fec]">print</span>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Print</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentVersionsTab({ auditTrail }: { auditTrail: AuditEntry[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Version History</h3>
        <button className="px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors">
          Create New Version
        </button>
      </div>

      {auditTrail && auditTrail.length > 0 ? (
        auditTrail.map((event, index) => {
          const isCurrent = index === 0;
          return (
            <div
              key={event.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-[#137fec] transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded ${isCurrent ? 'bg-[#137fec]/10' : 'bg-slate-100 dark:bg-slate-800'}`}
                  >
                    <span
                      className={`material-symbols-outlined text-[24px] ${isCurrent ? 'text-[#137fec]' : 'text-slate-400'}`}
                    >
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
                      <span>{formatDateTime(event.timestamp)}</span>
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
  );
}

function DocumentAccessControlTab({ accessControlList }: { accessControlList: ACLEntry[] }) {
  return (
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Principal
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Access Level
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Granted
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Expires
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {accessControlList.length > 0 ? (
              accessControlList.map((acl: ACLEntry) => {
                const levelBadge = getAccessLevelBadge(acl.level);
                return (
                  <tr
                    key={acl.id}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-slate-400">
                          {getPrincipalTypeIcon(acl.principalType)}
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">
                          {acl.principalName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {acl.principalType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${levelBadge.bg} ${levelBadge.text}`}
                      >
                        {acl.level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <div>{formatDateTime(acl.grantedAt)}</div>
                        <div className="text-slate-500">by {acl.grantedBy}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {acl.expiresAt ? formatDateTime(acl.expiresAt) : 'Never'}
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
                  <p className="mt-4 text-slate-600 dark:text-slate-400">
                    No access control entries
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocumentSignaturesTab({ signatures }: { signatures: DocumentPageSignature[] }) {
  return (
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
              <span className="material-symbols-outlined text-green-600 dark:text-green-400">
                check_circle
              </span>
              <span className="text-sm font-medium text-green-800 dark:text-green-300">
                Document fully signed by {signatures.length}{' '}
                {signatures.length === 1 ? 'party' : 'parties'}
              </span>
            </div>
          </div>

          {signatures.map((signature) => (
            <div
              key={signature.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded bg-green-100 dark:bg-green-900/30">
                  <span className="material-symbols-outlined text-[24px] text-green-600 dark:text-green-400">
                    draw
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {signature.signerName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Signed
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    {signature.signerEmail}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div>
                      <span className="font-semibold">Signed at:</span>{' '}
                      {formatDateTime(signature.signedAt)}
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
        <EmptyState entity="signatures" phase="passive" />
      )}
    </div>
  );
}

function DocumentCommentsTab({
  comments,
  newComment,
  setNewComment,
}: {
  comments: DocumentPageComment[];
  newComment: string;
  setNewComment: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
          Comments & Annotations
        </h3>

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
                <AppAvatar
                  name={comment.author}
                  src={comment.authorAvatar ?? null}
                  maxInitials={2}
                  className="w-10 h-10 flex-shrink-0"
                  fallbackClassName="text-sm font-semibold bg-slate-200 dark:bg-slate-700"
                />
                <div className="flex-1">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {comment.author}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{comment.content}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-2 px-3">
                    <button className="text-xs text-slate-500 hover:text-[#137fec] font-medium">
                      Reply
                    </button>
                    {comment.isResolved ? (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span>{' '}
                        Resolved
                      </span>
                    ) : (
                      <button className="text-xs text-slate-500 hover:text-[#137fec] font-medium">
                        Mark as Resolved
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <EmptyState entity="comments" phase="passive" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function isDocumentAuthError(
  error: { data?: { code?: string } | null; message?: string } | null
): boolean {
  if (!error) return false;
  return (
    error.data?.code === 'UNAUTHORIZED' ||
    (error.message?.toLowerCase().includes('authentication') ?? false) ||
    (error.message?.toLowerCase().includes('unauthorized') ?? false)
  );
}

function normalizeExpiresAt(expiresAt: string | Date | null | undefined): string | null {
  if (!expiresAt) return null;
  if (typeof expiresAt === 'string') return expiresAt;
  return String(expiresAt);
}

function getPrincipalTypeIcon(principalType: string): string {
  if (principalType === 'USER') return 'person';
  if (principalType === 'ROLE') return 'group';
  return 'business';
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [newComment, setNewComment] = useState('');

  // Require authentication - redirects to login if not authenticated
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();

  // Fetch document data
  const {
    data: documentData,
    isLoading,
    error,
  } = trpc.documents.getById.useQuery(
    { id: documentId },
    { enabled: isAuthenticated && !authLoading && !!documentId }
  );

  // Fetch audit trail for version history
  const { data: rawAuditTrail } = trpc.documents.getAuditTrail.useQuery(
    { documentId },
    { enabled: isAuthenticated && !authLoading && !!documentId }
  );

  // Fetch signed URL for document preview/download (AC-004)
  const { data: signedUrlData } = trpc.documents.getSignedUrl.useQuery(
    { documentId },
    { enabled: isAuthenticated && !authLoading && !!documentId }
  );

  const utils = trpc.useUtils();

  // Sign mutation (AC-003) — server extracts IP/UA from headers
  const signMutation = trpc.documents.sign.useMutation({
    onSuccess: () => {
      utils.documents.getById.invalidate({ id: documentId });
    },
  });

  // Approve mutation
  const approveMutation = trpc.documents.approve.useMutation({
    onSuccess: () => {
      utils.documents.getById.invalidate({ id: documentId });
    },
  });

  // Map audit trail to UI-friendly format using module-level mapAuditEntry helper
  // tRPC serializes dates as strings; the type mismatch is expected at the wire boundary
  const auditEntries: RawAuditEntry[] = rawAuditTrail
    ? (rawAuditTrail as unknown as RawAuditEntry[])
    : [];
  const auditTrail: AuditEntry[] = auditEntries.map((entry, index) =>
    mapAuditEntry(entry, index, auditEntries.length)
  );

  // Check for auth errors
  const isAuthError = isDocumentAuthError(error);

  // Redirect to login for auth errors
  useEffect(() => {
    if (error && isAuthError && !isLoading && !authLoading) {
      router.replace('/login');
    }
  }, [error, isAuthError, isLoading, authLoading, router]);

  if (isLoading || authLoading) {
    return <DocumentLoadingSpinner />;
  }

  // Show redirecting state for auth errors
  if (error && isAuthError) {
    return <DocumentRedirectingSpinner />;
  }

  if (error || !documentData) {
    return <DocumentErrorView error={error} />;
  }

  // Map API response to component data
  const document: DocumentPageDoc = {
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
    isLegalHold: documentData.retentionUntil
      ? new Date(documentData.retentionUntil) > new Date()
      : false,
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
  const accessControlList: ACLEntry[] = (documentData.acl || []).map(
    (acl: DomainACLEntry, index: number) => ({
      id: `acl-${index}`, // Generate ID since domain ACL doesn't have a separate ID
      principalType: acl.principalType,
      principalId: acl.principalId,
      principalName: acl.principalId, // In real app, this would be looked up
      level: acl.accessLevel as AccessLevel,
      grantedAt: typeof acl.grantedAt === 'string' ? acl.grantedAt : String(acl.grantedAt),
      grantedBy: acl.grantedBy,
      expiresAt: normalizeExpiresAt(acl.expiresAt),
    })
  );

  // Map e-signature data from API response
  // Note: Domain model's eSignature object has: signedBy, signedAt, signatureHash, ipAddress, userAgent
  // UI component needs an 'id' for React key, using document ID as fallback
  const signatures = documentData.eSignature
    ? [
        {
          id: documentData.id, // Use document ID since eSignature schema doesn't include separate ID
          signerName: documentData.eSignature.signedBy,
          // signerEmail: no user-by-id tRPC endpoint yet; use userId as identifier.
          // Real lookup: trpc.auth.getUserById or Supabase admin.getUserById(signedBy).
          // Tracked in IFC-152: user profile resolution for document signatures.
          signerEmail: `${documentData.eSignature.signedBy}@intelliflow.local`,
          signedAt: documentData.eSignature.signedAt || '',
          ipAddress: documentData.eSignature.ipAddress || '',
          userAgent: documentData.eSignature.userAgent || '',
        },
      ]
    : [];

  // Comments are not yet implemented in backend
  const comments: DocumentPageComment[] = [];

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'versions', label: 'Version History', count: auditTrail?.length || 0 },
    { id: 'access-control', label: 'Access Control', count: accessControlList.length },
    { id: 'signatures', label: 'Signatures', count: signatures.length },
    { id: 'activity', label: 'Activity' },
    { id: 'comments', label: 'Comments', count: comments.length },
  ];

  const statusConfig = getStatusConfig(document.status);

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      {/* Header with breadcrumb and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/documents" className="hover:text-[#137fec]">
              Documents
            </Link>
            <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">{document.title}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{document.title}</h1>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined text-[18px]">download</span> Download
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined text-[18px]">share</span> Share
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none">
            <span className="material-symbols-outlined text-[18px]">edit</span> Edit
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
              <span className="material-symbols-outlined text-[64px] text-[#137fec]">
                description
              </span>
            </div>
            <div className="px-5 py-6">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                  >
                    <span className="material-symbols-outlined text-sm">{statusConfig.icon}</span>{' '}
                    {document.status.replaceAll('_', ' ')}
                  </span>
                  {document.isLegalHold && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <span className="material-symbols-outlined text-sm">shield</span> Legal Hold
                    </span>
                  )}
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {document.documentType}
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">
                    folder
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">
                      Classification
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                      {document.classification}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">
                    bookmark
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Version</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">
                      v{document.version}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">
                    insert_drive_file
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">
                      File Size
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {formatFileSize(document.sizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">
                    calendar_today
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Created</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {formatDateTime(document.createdAt)}
                    </span>
                    <span className="text-xs text-slate-500">by {document.createdBy}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[20px] text-slate-400 mt-0.5">
                    update
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">
                      Last Modified
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {formatRelativeTime(document.lastModifiedAt)}
                    </span>
                    <span className="text-xs text-slate-500">by {document.lastModifiedBy}</span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-3">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium"
                    >
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
                      <Link
                        href={`/cases/${document.relatedCase}`}
                        className="flex items-center gap-2 text-sm text-[#137fec] hover:underline"
                      >
                        <span className="material-symbols-outlined text-[16px]">gavel</span>
                        {document.relatedCase}
                      </Link>
                    )}
                    {document.relatedContact && (
                      <Link
                        href={`/contacts/${document.relatedContact}`}
                        className="flex items-center gap-2 text-sm text-[#137fec] hover:underline"
                      >
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
                    <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <DocumentOverviewTab
                  document={document}
                  signedUrlData={signedUrlData}
                  signMutation={signMutation}
                  approveMutation={approveMutation}
                  documentId={documentId}
                />
              )}

              {/* Version History Tab */}
              {activeTab === 'versions' && <DocumentVersionsTab auditTrail={auditTrail} />}

              {/* Access Control Tab */}
              {activeTab === 'access-control' && (
                <DocumentAccessControlTab accessControlList={accessControlList} />
              )}

              {/* Signatures Tab */}
              {activeTab === 'signatures' && <DocumentSignaturesTab signatures={signatures} />}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <ActivityFeed entityType="DOCUMENT" entityId={documentId} height={500} />
              )}

              {/* Comments Tab */}
              {activeTab === 'comments' && (
                <DocumentCommentsTab
                  comments={comments}
                  newComment={newComment}
                  setNewComment={setNewComment}
                />
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
