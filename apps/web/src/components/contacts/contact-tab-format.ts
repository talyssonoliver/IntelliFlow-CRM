// IFC-256: pure formatters + view-model transforms for the Contact 360
// Tickets/Documents tabs.
//
// These live here (not inline in `contacts/[id]/page.tsx`) on purpose: Next.js
// route `page.tsx` files are excluded from the merged coverage report, so logic
// kept inline there shows as uncovered to SonarCloud's new-code gate even when
// it is fully exercised. Extracting to a unit-tested module keeps the logic
// covered and counted. (Mirrors audit finding F-14 — thin pages, tested units.)

export interface ContactTicketInput {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string | Date;
  resolvedAt?: string | Date | null;
}

export interface ContactDocumentInput {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  category: string;
  createdAt: string | Date;
}

export interface TicketViewModel {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface DocumentViewModel {
  id: string;
  name: string;
  fileType: string;
  fileSize: number;
  category: string;
  createdAt: string;
}

const toIso = (value: string | Date): string =>
  typeof value === 'string' ? value : value.toISOString();

/** Format a byte count into a human-readable size (e.g. 2400000 → "2.3 MB"). */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const rounded = exponent === 0 || value >= 10 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[exponent]}`;
}

/** Humanise an enum-ish label (e.g. "IN_PROGRESS" → "In progress"). */
export function titleCaseLabel(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Ticket subtext line, e.g. "T-00001 • Resolved • Medium Priority". */
export function formatTicketMeta(ticketNumber: string, status: string, priority: string): string {
  return `${ticketNumber} • ${titleCaseLabel(status)} • ${titleCaseLabel(priority)} Priority`;
}

/** Status colour for the ticket marker (resolved/closed = green, else blue). */
export function getTicketStatusColor(status: string): string {
  const normalized = status?.toUpperCase();
  if (normalized === 'RESOLVED' || normalized === 'CLOSED') {
    return 'bg-green-100 dark:bg-green-900/30 text-green-600';
  }
  return 'bg-[#137fec]/10 text-[#137fec]';
}

/** Normalise raw contact tickets (from the API) into render-ready view models. */
export function toTicketViewModels(
  tickets: ContactTicketInput[] | undefined | null
): TicketViewModel[] {
  if (!tickets) return [];
  return tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: toIso(ticket.createdAt),
  }));
}

/** Normalise raw contact documents (from the API) into render-ready view models. */
export function toDocumentViewModels(
  documents: ContactDocumentInput[] | undefined | null
): DocumentViewModel[] {
  if (!documents) return [];
  return documents.map((doc) => ({
    id: doc.id,
    name: doc.name,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    category: doc.category,
    createdAt: toIso(doc.createdAt),
  }));
}
