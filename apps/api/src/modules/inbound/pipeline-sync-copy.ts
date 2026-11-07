/**
 * Human copy for the COA pipeline-sync audit note (#1223, UI-003).
 *
 * The feed used to show "COA pipeline: CONTACTED → CONTACTED" with an internal
 * COA id and a raw ISO time in the body. This module turns the same facts into
 * "Lead contacted — Bakery Ltd" / "Moved from New to Contacted by the COA sync
 * · 3 Nov, 10:28". The ids and raw values stay in the row's metadata.
 *
 * Pure and dependency-free so the one-off backfill script can rewrite rows that
 * were written before this change with exactly the same wording.
 */

export interface PipelineSyncLeadNames {
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly company?: string | null;
  readonly email?: string | null;
}

export interface PipelineSyncCopyInput extends PipelineSyncLeadNames {
  /** Raw COA crmStage, e.g. MEETING_BOOKED. */
  readonly coaStage: string;
  /** When COA moved the lead (ISO datetime). */
  readonly stageChangedAt: string;
  /** CRM status before the sync. */
  readonly from: string;
  /** CRM status after the sync. */
  readonly to: string;
  /** COA reported a win the sync does not apply (capped, tagged coa-won). */
  readonly conversionPending?: boolean;
  /** The CRM score gate refused COA's qualification. */
  readonly refusal?: { readonly score?: number; readonly minScore?: number } | null;
  readonly wonTag?: string;
  readonly qualifiedTag?: string;
  /** IANA zone for the time in the body. Defaults to the app default. */
  readonly timeZone?: string;
}

export interface PipelineSyncCopy {
  readonly title: string;
  readonly description: string;
}

const DEFAULT_TIME_ZONE = 'Europe/London';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NEGOTIATING: 'Negotiating',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

const MOVE_TITLES: Record<string, string> = {
  CONTACTED: 'Lead contacted',
  QUALIFIED: 'Lead qualified',
  NEGOTIATING: 'Lead in negotiation',
  UNQUALIFIED: 'Lead unqualified',
  CONVERTED: 'Lead converted',
  LOST: 'Lead lost',
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Person, then company, then email: every COA lead has a company, few have a name. */
export function leadDisplayLabel(names: PipelineSyncLeadNames): string {
  const person = [clean(names.firstName), clean(names.lastName)].filter(Boolean).join(' ');
  return person || clean(names.company) || clean(names.email) || 'Unnamed lead';
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? humanizeStage(status);
}

/** MEETING_BOOKED -> "Meeting booked". */
export function humanizeStage(stage: string): string {
  const words = stage
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return stage;
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "3 Nov, 10:28" in the given zone; the raw value if it is not a date. */
export function formatSyncTime(iso: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  return `${day}, ${time}`;
}

export function describePipelineSyncCopy(input: PipelineSyncCopyInput): PipelineSyncCopy {
  const label = leadDisplayLabel(input);
  const moved = input.from !== input.to;
  const when = formatSyncTime(input.stageChangedAt, input.timeZone);
  const stage = humanizeStage(input.coaStage);

  const headline = moved
    ? (MOVE_TITLES[input.to] ?? `Lead moved to ${statusLabel(input.to)}`)
    : `COA stage: ${stage}`;

  const sentences: string[] = [
    moved
      ? `Moved from ${statusLabel(input.from)} to ${statusLabel(input.to)} by the COA sync`
      : `COA marked it ${stage}; status stays ${statusLabel(input.to)}`,
  ];

  if (input.conversionPending) {
    sentences.push(
      `COA reported it WON. The sync does not convert leads, so it stays ${statusLabel(input.to)}` +
        (input.wonTag ? ` and is tagged ${input.wonTag}` : '') +
        ': convert it in the CRM'
    );
  }

  if (input.refusal) {
    const r = input.refusal;
    const numbers =
      r.score !== undefined && r.minScore !== undefined
        ? ` (score ${r.score}, minimum ${r.minScore})`
        : '';
    sentences.push(
      `COA reported it qualified, but the score gate refused the qualification${numbers}` +
        (input.qualifiedTag ? `. Tagged ${input.qualifiedTag}` : '') +
        ': qualify it once it scores high enough'
    );
  }

  return {
    title: `${headline} — ${label}`,
    description: `${sentences.join('. ')} · ${when}`,
  };
}
