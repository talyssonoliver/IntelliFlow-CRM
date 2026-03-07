'use client';

import { useMemo, useState } from 'react';
import type { ActivityFeedType } from '@intelliflow/domain';

export type ActivityFeedTypeFilterValue = 'all' | ActivityFeedType;

export const ACTIVITY_FEED_TYPE_FILTER_OPTIONS: Array<{
  value: ActivityFeedTypeFilterValue;
  label: string;
  icon: string;
}> = [
  { value: 'all', label: 'All Activity', icon: 'list' },
  { value: 'CALL', label: 'Calls', icon: 'call_received' },
  { value: 'EMAIL', label: 'Emails', icon: 'mail' },
  { value: 'MEETING', label: 'Meetings', icon: 'event' },
  { value: 'TASK', label: 'Tasks', icon: 'task_alt' },
  { value: 'DEAL', label: 'Deals', icon: 'handshake' },
  { value: 'NOTE', label: 'Notes', icon: 'sticky_note_2' },
  { value: 'TICKET', label: 'Tickets', icon: 'confirmation_number' },
  { value: 'CHAT', label: 'Chat', icon: 'chat' },
  { value: 'DOCUMENT', label: 'Documents', icon: 'description' },
  { value: 'STAGE_CHANGE', label: 'Stage Changes', icon: 'swap_horiz' },
  { value: 'STATUS_CHANGE', label: 'Status Changes', icon: 'published_with_changes' },
  { value: 'SCORE_UPDATE', label: 'Score Updates', icon: 'trending_up' },
  { value: 'QUALIFICATION', label: 'Qualifications', icon: 'verified' },
  { value: 'AGENT_ACTION', label: 'AI Actions', icon: 'smart_toy' },
  { value: 'SLA_ALERT', label: 'SLA Alerts', icon: 'warning' },
  { value: 'ASSIGNMENT', label: 'Assignments', icon: 'person_add' },
  { value: 'SYSTEM', label: 'System', icon: 'settings' },
];

interface ActivityFeedTypeFilterProps {
  value: ActivityFeedTypeFilterValue;
  onChange: (value: ActivityFeedTypeFilterValue) => void;
}

export function ActivityFeedTypeFilter({ value, onChange }: Readonly<ActivityFeedTypeFilterProps>) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(
    () => ACTIVITY_FEED_TYPE_FILTER_OPTIONS.find((o) => o.value === value)?.label,
    [value]
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={value === 'all' ? 'Filter activity feed' : `Filter: ${selectedLabel}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`p-1 transition-colors rounded flex items-center gap-1 ${
          value === 'all' ? 'text-slate-400 hover:text-[#137fec]' : 'text-[#137fec]'
        }`}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          filter_list
        </span>
        {value !== 'all' && <span className="text-xs font-medium">{selectedLabel}</span>}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label="Close filter menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-[#1e2936] border border-[#e2e8f0] dark:border-[#334155] rounded-lg shadow-lg py-1 min-w-[180px] max-h-[320px] overflow-y-auto">
            {ACTIVITY_FEED_TYPE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  value === option.value
                    ? 'text-[#137fec] font-medium'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  {option.icon}
                </span>
                {option.label}
                {value === option.value && (
                  <span className="material-symbols-outlined text-sm ml-auto" aria-hidden="true">
                    check
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
