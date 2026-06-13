'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';
import { AppAvatar } from '@/components/shared/app-avatar';
import { formatEstimatedValue } from '@/lib/leads/lead-format';

/**
 * Lead 360 details — identity, contact info, status/source/temperature badges,
 * key metrics and owner card. Extracted verbatim from
 * `app/leads/[id]/page.tsx` (PG-061), mirroring the `accounts/AccountDetail.tsx`
 * sibling convention. Pure presentational; behaviour-preserving.
 */

// ─── Lead enums (UI-facing) ────────────────────────────────────────────────
// Mirrors the Prisma `LeadStatus` enum (packages/db/prisma/schema.prisma) — the
// lead.getById endpoint returns the raw row without response-schema narrowing,
// so every persisted status must have a badge (incl. DISQUALIFIED / ARCHIVED).
export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'NEGOTIATING'
  | 'UNQUALIFIED'
  | 'DISQUALIFIED'
  | 'CONVERTED'
  | 'LOST'
  | 'ARCHIVED';
export type LeadSource =
  | 'WEBSITE'
  | 'REFERRAL'
  | 'SOCIAL'
  | 'EMAIL'
  | 'COLD_CALL'
  | 'EVENT'
  | 'OTHER';
export type LeadTemperature = 'hot' | 'warm' | 'cold';

// ─── Badges ─────────────────────────────────────────────────────────────────

// Lead Status Badge Component
export function LeadStatusBadge({ status }: Readonly<{ status: LeadStatus }>) {
  const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
    NEW: {
      label: 'New Lead',
      className:
        'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
    },
    CONTACTED: {
      label: 'Contacted',
      className:
        'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
    },
    QUALIFIED: {
      label: 'Qualified',
      className:
        'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    },
    NEGOTIATING: {
      label: 'Negotiating',
      className:
        'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
    },
    UNQUALIFIED: {
      label: 'Unqualified',
      className:
        'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    },
    DISQUALIFIED: {
      label: 'Disqualified',
      className:
        'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
    },
    CONVERTED: {
      label: 'Converted',
      className:
        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    },
    LOST: {
      label: 'Lost',
      className:
        'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    },
    ARCHIVED: {
      label: 'Archived',
      className:
        'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    },
  };

  const config = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// Temperature Badge Component
export function TemperatureBadge({ temperature }: Readonly<{ temperature: LeadTemperature }>) {
  const config: Record<LeadTemperature, { label: string; className: string }> = {
    hot: {
      label: 'Hot',
      className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400',
    },
    warm: {
      label: 'Warm',
      className:
        'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400',
    },
    cold: {
      label: 'Cold',
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-400',
    },
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded border text-xs font-semibold ${config[temperature].className}`}
    >
      {config[temperature].label}
    </span>
  );
}

// Source Badge Component
export function SourceBadge({ source }: Readonly<{ source: LeadSource }>) {
  const sourceConfig: Record<LeadSource, { label: string; className: string }> = {
    WEBSITE: { label: 'Website', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    REFERRAL: { label: 'Referral', className: 'bg-green-50 text-green-700 border-green-200' },
    SOCIAL: { label: 'Social', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    EMAIL: { label: 'Email', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    COLD_CALL: { label: 'Cold Call', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    EVENT: { label: 'Event', className: 'bg-pink-50 text-pink-700 border-pink-200' },
    OTHER: { label: 'Other', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  };

  const config = sourceConfig[source];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

// ─── Profile data types ──────────────────────────────────────────────────────

export interface LeadProfileData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  location: string;
  website: string;
  status: LeadStatus;
  source: LeadSource;
  score: number;
  temperature: LeadTemperature;
  createdAt: string | Date;
  lastContactedAt: string | Date;
  avatarUrl: string;
  estimatedValue: number;
  tags: string[];
  owner: { name: string; title: string; avatarUrl: string };
  accountId?: string | null;
  account?: { id: string; name: string } | null;
}

export interface LeadMetrics {
  estimatedValue: number;
  emailsSent: number;
  emailsOpened: number;
  meetings: number;
  touchpoints: number;
}

// ─── Profile / owner cards ───────────────────────────────────────────────────

export function LeadProfileCard({
  lead,
  leadMetrics,
}: {
  lead: LeadProfileData;
  leadMetrics: LeadMetrics;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-24 bg-gradient-to-r from-blue-100 to-indigo-50 dark:from-slate-800 dark:to-slate-800" />
      <div className="px-5 pb-6 relative">
        <div className="relative -mt-10 mb-3">
          <AppAvatar
            name={`${lead.firstName} ${lead.lastName}`}
            src={lead.avatarUrl}
            className="w-20 h-20 border-4 border-white dark:border-slate-900 shadow-sm"
            fallbackClassName="text-2xl font-bold text-slate-500 bg-slate-200 dark:bg-slate-700"
          />
        </div>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {lead.firstName} {lead.lastName}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{lead.title}</p>
          <div className="flex items-center gap-1 text-[#137fec] text-sm font-medium mt-1">
            <span aria-hidden="true" className="material-symbols-outlined !text-sm">
              domain
            </span>
            {lead.accountId && lead.account ? (
              <Link href={`/accounts/${lead.accountId}`} className="hover:underline">
                {lead.company}
              </Link>
            ) : (
              <span>{lead.company}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <LeadStatusBadge status={lead.status} />
          <TemperatureBadge temperature={lead.temperature} />
          {lead.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5"
            >
              mail
            </span>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 uppercase font-semibold">Email</span>
              <EntityHoverCard
                email={lead.email}
                displayName={`${lead.firstName} ${lead.lastName}`.trim()}
              >
                <Link
                  href={`/email/compose?to=${encodeURIComponent(lead.email)}`}
                  className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec] break-all"
                >
                  {lead.email}
                </Link>
              </EntityHoverCard>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5"
            >
              call
            </span>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 uppercase font-semibold">Phone</span>
              <a
                href={`tel:${lead.phone.replaceAll(/\D/g, '')}`}
                className="text-sm text-slate-700 dark:text-slate-300 hover:text-[#137fec]"
              >
                {lead.phone}
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5"
            >
              location_on
            </span>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 uppercase font-semibold">Location</span>
              <span className="text-sm text-slate-700 dark:text-slate-300">{lead.location}</span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5"
            >
              language
            </span>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 uppercase font-semibold">Website</span>
              <a
                href={`https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${lead.website} (opens in new tab)`}
                className="text-sm text-[#137fec] hover:underline"
              >
                {lead.website}
              </a>
            </div>
          </div>
        </div>
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {formatEstimatedValue(leadMetrics.estimatedValue)}
            </p>
            <p className="text-xs text-slate-500">Est. Value</p>
          </div>
          <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{lead.score}</p>
            <p className="text-xs text-slate-500">Lead Score</p>
          </div>
          <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {leadMetrics.emailsSent > 0
                ? Math.round((leadMetrics.emailsOpened / leadMetrics.emailsSent) * 100)
                : 0}
              %
            </p>
            <p className="text-xs text-slate-500">Open Rate</p>
          </div>
          <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {leadMetrics.touchpoints}
            </p>
            <p className="text-xs text-slate-500">Touchpoints</p>
          </div>
        </div>
      </div>
      {/* Map placeholder */}
      <div className="h-32 w-full bg-cover bg-center border-t border-slate-200 dark:border-slate-800 relative">
        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
          <div className="text-center">
            <span
              aria-hidden="true"
              className="material-symbols-outlined text-[#137fec] !text-3xl mb-1"
            >
              location_on
            </span>
            <button
              type="button"
              className="bg-white/90 text-slate-900 text-xs font-bold px-3 py-1.5 rounded shadow-sm hover:bg-white transition"
            >
              View Map
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function LeadOwnerCard({
  owner,
}: {
  owner: { name: string; title: string; avatarUrl: string };
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">
        Lead Owner
      </h3>
      <div className="flex items-center gap-3">
        <AppAvatar
          name={owner.name}
          src={owner.avatarUrl}
          className="w-10 h-10"
          fallbackClassName="text-sm font-bold bg-slate-200 dark:bg-slate-700"
        />
        <div>
          <p className="text-sm font-bold text-slate-900 dark:text-white">{owner.name}</p>
          <p className="text-xs text-slate-500">{owner.title}</p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Lead 360 left sidebar — profile card + owner card. Named `LeadDetail` per the
 * PG-061 artifact contract (was `LeadLeftSidebar` inline in the page).
 */
export function LeadDetail({
  lead,
  leadMetrics,
}: {
  lead: LeadProfileData;
  leadMetrics: LeadMetrics;
}) {
  return (
    <aside aria-label="Lead profile" className="lg:col-span-3 flex flex-col gap-6">
      <LeadProfileCard lead={lead} leadMetrics={leadMetrics} />
      <LeadOwnerCard owner={lead.owner} />
    </aside>
  );
}
