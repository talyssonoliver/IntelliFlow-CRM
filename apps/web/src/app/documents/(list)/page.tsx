'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

type DocumentStatus = 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'SIGNED' | 'ARCHIVED' | 'SUPERSEDED';

export default function DocumentsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch documents from API
  const { data, isLoading, error } = trpc.documents.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const documents = data?.data || [];

  // Filter documents based on search query
  const filteredDocuments = documents.filter(
    (doc: any) =>
      searchQuery === '' ||
      doc.metadata.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.metadata.description && doc.metadata.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      doc.metadata.documentType.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    const kb = bytes / 1024;
    return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/dashboard" className="hover:text-[#137fec]">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white font-medium">Documents</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Document Library
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            Manage legal documents with versioning, e-signatures, and access control.
          </p>
        </div>
        <Link
          href="/documents/new"
          className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
        >
          <span
            className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
            aria-hidden="true"
          >
            upload_file
          </span>
          <span>Upload Document</span>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-outlined">search</span>
            </span>
            <input
              type="search"
              placeholder="Search documents by title, type, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="">Document Type</option>
              <option value="contract">Contract</option>
              <option value="motion">Motion</option>
              <option value="evidence">Evidence</option>
              <option value="agreement">Agreement</option>
            </select>
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="">Status</option>
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
              <option value="signed">Signed</option>
            </select>
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
        {isLoading ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-slate-400 animate-spin">progress_activity</span>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading documents...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-red-500">error</span>
            <p className="mt-4 text-red-600 dark:text-red-400">Failed to load documents</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{error.message}</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="p-12 text-center">
            <span className="material-symbols-outlined text-[48px] text-slate-400">description</span>
            <p className="mt-4 text-slate-600 dark:text-slate-400">
              {searchQuery ? 'No documents match your search' : 'No documents found'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e2e8f0] dark:border-[#334155]">
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Document Title
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                {filteredDocuments.map((doc: any) => {
                  const version = `${doc.versionMajor}.${doc.versionMinor}.${doc.versionPatch}`;
                  const hasLegalHold = doc.retentionUntil && new Date(doc.retentionUntil) > new Date();
                  const signatureCount = doc.eSignature ? 1 : 0;

                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-slate-50 dark:hover:bg-[#2d3a4a]/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 group">
                          <div className="p-2 rounded bg-slate-100 dark:bg-[#334155]">
                            <span className="material-symbols-outlined text-[20px] text-[#137fec]">
                              description
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white group-hover:text-[#137fec] transition-colors">
                              {doc.metadata.title}
                            </p>
                            {doc.metadata.description && (
                              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                                {doc.metadata.description}
                              </p>
                            )}
                            {hasLegalHold && (
                              <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                                <span className="material-symbols-outlined text-sm">shield</span>
                                Legal Hold
                              </span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {doc.metadata.documentType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <DocumentStatusBadge status={doc.status} signatureCount={signatureCount} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-slate-600 dark:text-slate-400">
                          v{version}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {formatFileSize(Number(doc.sizeBytes))}
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm text-slate-900 dark:text-white">
                            {formatDate(doc.createdAt)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            by {doc.createdBy}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !error && filteredDocuments.length > 0 && (
          <div className="px-6 py-4 border-t border-[#e2e8f0] dark:border-[#334155] flex items-center justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing <span className="font-medium">1-{filteredDocuments.length}</span> of{' '}
              <span className="font-medium">{data?.total || 0}</span> documents
            </p>
          <div className="flex items-center gap-1">
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded bg-[#137fec] text-white text-sm font-medium">
              1
            </button>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              2
            </button>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              3
            </button>
            <span className="text-slate-400">...</span>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              12
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
        )}
      </Card>
    </div>
  );
}

function DocumentStatusBadge({
  status,
  signatureCount,
}: {
  status: string;
  signatureCount: number;
}) {
  const statusConfig = {
    DRAFT: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', icon: 'edit_note' },
    UNDER_REVIEW: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: 'rate_review' },
    APPROVED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: 'check_circle' },
    SIGNED: { bg: 'bg-[#137fec]/10', text: 'text-[#137fec]', icon: 'verified' },
    ARCHIVED: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-600 dark:text-gray-400', icon: 'archive' },
    SUPERSEDED: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: 'history' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className="material-symbols-outlined text-sm">{config.icon}</span>
      {status.replace('_', ' ')}
      {status === 'SIGNED' && signatureCount > 0 && (
        <span className="ml-0.5">({signatureCount})</span>
      )}
    </span>
  );
}
