import { Card, EmptyState } from '@intelliflow/ui';

import { formatFileSize, type DocumentViewModel } from './contact-tab-format';

export interface ContactDocumentsTabProps {
  /** Documents for this contact (already normalised to view models). */
  documents: DocumentViewModel[];
  /** Formats an ISO date into a display date (e.g. "Jan 9, 2025"). */
  formatDate: (isoDate: string) => string;
}

/**
 * IFC-256: Contact 360 → Documents tab. Renders the contact's real documents
 * (or a proper empty state) with working download links. Extracted from the
 * route page so it is unit-tested and counted by coverage. The "Upload" action
 * is wired separately (IFC-257).
 */
export function ContactDocumentsTab({ documents, formatDate }: ContactDocumentsTabProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Documents</h3>
        <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
          </svg>{' '}
          Upload
        </button>
      </div>
      <div className="space-y-3" data-testid="contact-documents-tab">
        {documents.length === 0 ? (
          <div data-testid="contact-documents-empty">
            <EmptyState entity="documents" phase="passive" className="py-2" />
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
            >
              <svg
                className="w-8 h-8 text-[#137fec] shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm0 2h7v5h5v11H6V4Zm2 8v2h8v-2H8Zm0 4v2h5v-2H8Z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900 dark:text-white truncate">{doc.name}</p>
                <p className="text-sm text-slate-500">
                  {formatDate(doc.createdAt)} • {formatFileSize(doc.fileSize)}
                </p>
              </div>
              <a
                href={doc.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                aria-label={`Download ${doc.name}`}
                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7Z" />
                </svg>
              </a>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
