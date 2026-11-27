'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@intelliflow/ui';
import { PinButton } from '@/components/home/PinButton';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import type { ExtraAction } from '@/components/shared/entity-action-sheet';
import { QualifyLeadButton } from '@/components/leads/QualifyLeadDialog';
import { canQualifyLead } from '@/lib/leads/lead-conversion';
import { leadCompanyIfDistinct, leadDisplayName } from '@/lib/leads/lead-format';

import { Breadcrumbs } from '@/components/shared/page-header';
/** What the header needs of a lead: the name parts, its status and what the pin card shows. */
export interface LeadHeaderLead {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  status: string;
}

const CONVERT_BLOCKED_REASON: Record<string, string> = {
  LOST: 'Lost leads cannot be converted. Reopen the lead first.',
  UNQUALIFIED: 'Disqualified leads cannot be converted.',
  NEGOTIATING: 'Lead is in negotiation. Qualify the lead first to convert.',
};

/** Why a lead cannot be converted yet, or null when it can (it is QUALIFIED). */
export function convertBlockedReason(status: string): string | null {
  if (status === 'QUALIFIED') return null;
  return CONVERT_BLOCKED_REASON[status] ?? 'Lead must be qualified before conversion.';
}

function LeadConvertButton({
  lead,
  onOpenConvert,
}: Readonly<{ lead: LeadHeaderLead; onOpenConvert: () => void }>) {
  if (lead.status === 'CONVERTED') return null;
  const blocked = convertBlockedReason(lead.status);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={blocked ? 0 : undefined} aria-label={blocked ?? undefined}>
            <button
              onClick={onOpenConvert}
              disabled={blocked !== null}
              className="flex items-center gap-2 px-3 sm:px-4 h-11 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
                transform
              </span>{' '}
              Convert to deal
            </button>
          </span>
        </TooltipTrigger>
        {blocked && (
          <TooltipContent>
            <p>{blocked}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The actions the header leaves out on a phone, for the three-dots sheet: Qualify and Convert to
 * deal (Convert stays listed but disabled, with its reason, until the lead is qualified). Edit,
 * Pin, Archive and Delete are already in the sheet.
 */
export function leadHeaderSheetActions(
  lead: LeadHeaderLead,
  handlers: { onOpenQualify: () => void; onOpenConvert: () => void }
): ExtraAction[] {
  const actions: ExtraAction[] = [];
  if (canQualifyLead(lead.status as Parameters<typeof canQualifyLead>[0])) {
    actions.push({ label: 'Qualify', icon: 'verified', onClick: handlers.onOpenQualify });
  }
  if (lead.status !== 'CONVERTED') {
    const blocked = convertBlockedReason(lead.status);
    actions.push({
      label: 'Convert to deal',
      icon: 'transform',
      onClick: handlers.onOpenConvert,
      disabled: blocked !== null,
      hint: blocked ?? undefined,
    });
  }
  return actions;
}

interface LeadPageHeaderProps {
  lead: LeadHeaderLead & { company?: string | null };
  onOpenConvert: () => void;
  onOpenQualify: () => void;
  onEdit: () => void;
  onLogCall: () => void;
  onOpenActionSheet: () => void;
}

/**
 * The lead page header. On a phone it is one line: the lead's name as the title (it truncates) and
 * ONE primary action, Log call, plus the three-dots button; Qualify, Convert to deal, Edit and Pin
 * live in the three-dots sheet. From `sm` up the buttons are all in the header, as before.
 */
export function LeadPageHeader({
  lead,
  onOpenConvert,
  onOpenQualify,
  onEdit,
  onLogCall,
  onOpenActionSheet,
}: Readonly<LeadPageHeaderProps>) {
  const name = leadDisplayName(lead);
  return (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="min-w-0 flex-1">
        <Breadcrumbs
          endsWithCurrentPage={false}
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Leads', href: '/leads' },
          ]}
        />
        <h1 className="truncate text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          {name}
        </h1>
      </div>
      <div className="flex shrink-0 gap-2 sm:gap-3">
        <div className="hidden sm:contents">
          {canQualifyLead(lead.status as Parameters<typeof canQualifyLead>[0]) && (
            <QualifyLeadButton onClick={onOpenQualify} />
          )}
          <LeadConvertButton lead={lead} onOpenConvert={onOpenConvert} />
          <button
            onClick={onEdit}
            aria-label="Edit lead"
            className="flex items-center gap-2 px-4 h-11 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
              edit
            </span>{' '}
            Edit
          </button>
        </div>
        <button
          onClick={onLogCall}
          className="flex items-center gap-2 px-4 h-11 rounded-lg bg-[#2a78f6] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
        >
          <span aria-hidden="true" className="material-symbols-outlined !text-[18px]">
            call
          </span>{' '}
          Log call
        </button>
        <PinButton
          entityType="lead"
          entityId={lead.id}
          title={name}
          subtitle={leadCompanyIfDistinct(lead)}
          icon="person"
          url={`/leads/${lead.id}`}
          className="hidden sm:inline-flex"
        />
        <MoreActionsButton onClick={onOpenActionSheet} />
      </div>
    </div>
  );
}
