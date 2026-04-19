'use client';

import { useState } from 'react';
import { Button, EmptyState, toast } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

export interface TicketSLAPolicyRow {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  criticalResponseMinutes?: number;
  highResponseMinutes?: number;
}

interface Props {
  policies: TicketSLAPolicyRow[];
  defaultSlaPolicyId: string | null;
  onSetDefault: (policyId: string) => void;
}

export function TicketSLAPoliciesCard({ policies, defaultSlaPolicyId, onSetDefault }: Props) {
  const utils = trpc.useUtils();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const setDefault = trpc.ticketConfig.slaPolicy.setDefault.useMutation();

  const effectiveDefaultId = defaultSlaPolicyId ?? policies.find((p) => p.isDefault)?.id ?? null;

  const handleSetDefault = async (id: string) => {
    setWorkingId(id);
    try {
      await setDefault.mutateAsync({ id });
      onSetDefault(id);
      await utils.ticketConfig.slaPolicy.list.invalidate();
      toast({ title: 'Default SLA updated' });
    } catch (err) {
      toast({
        title: 'Failed to set default SLA',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        icon="timer"
        iconBg="bg-sky-100 dark:bg-sky-900/30"
        iconFg="text-sky-600 dark:text-sky-400"
        title="SLA Policies"
        description="Response and resolution targets per priority. Pick one policy as the tenant default — new tickets without an explicit SLA inherit it."
      />

      {policies.length === 0 ? (
        <EmptyState
          entity="notes"
          phase="passive"
          size="sm"
          className="py-4 px-3 gap-2"
          title="No SLA policies yet"
          description="Create a policy to set response and resolution targets."
        />
      ) : (
        <ul className="space-y-2">
          {policies.map((policy) => {
            const isDefault = effectiveDefaultId === policy.id;
            return (
              <li
                key={policy.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <input
                  type="radio"
                  name="default-sla"
                  id={`sla-${policy.id}`}
                  checked={isDefault}
                  disabled={workingId === policy.id}
                  onChange={() => handleSetDefault(policy.id)}
                  aria-label={`Set ${policy.name} as default SLA policy`}
                  className="h-4 w-4"
                />
                <label htmlFor={`sla-${policy.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{policy.name}</span>
                    {isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                        Default
                      </span>
                    )}
                    {!policy.isActive && (
                      <span className="text-xs text-muted-foreground">(inactive)</span>
                    )}
                  </div>
                  {policy.description && (
                    <p className="text-xs text-muted-foreground truncate">{policy.description}</p>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="outline" aria-label="Manage SLA policies">
          Manage Policies
        </Button>
      </div>
    </div>
  );
}

// Local SectionHeader (avoids cross-card import cycles).
function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
}: {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
