'use client';

/**
 * LeadQueueView
 *
 * PG-132: Smart Lead Routing UI
 *
 * Shows unassigned leads with sorting, filtering, and bulk assignment.
 */

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@intelliflow/ui';
import { useLeadQueue, useRouting } from '@/app/settings/routing/hooks/useRouting';

export function LeadQueueView() {
  const [scoreMin, setScoreMin] = useState<number | undefined>();
  const [source, setSource] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: leads, isLoading } = useLeadQueue({ scoreMin, source });
  const { assignLead, agentWorkload } = useRouting();

  const sortedLeads = useMemo(() => {
    if (!leads) return [];
    return [...leads].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [leads]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === sortedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedLeads.map((l) => l.id)));
    }
  };

  const handleBulkAssign = (userId: string) => {
    for (const leadId of selectedIds) {
      assignLead.mutate({ leadId, userId, reason: 'manual' });
    }
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CardTitle className="text-lg">Lead Queue</CardTitle>
        <div className="flex gap-2 flex-wrap">
          <Input
            type="number"
            placeholder="Min score"
            className="w-28"
            value={scoreMin ?? ''}
            onChange={(e) => setScoreMin(e.target.value ? Number(e.target.value) : undefined)}
            aria-label="Minimum score filter"
          />
          <Select value={source || 'all'} onValueChange={(v) => setSource(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-[140px]" aria-label="Source filter">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
              <SelectItem value="REFERRAL">Referral</SelectItem>
              <SelectItem value="COLD_CALL">Cold Call</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-primary/5 rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Select onValueChange={handleBulkAssign}>
              <SelectTrigger className="w-[200px]" aria-label="Assign to agent">
                <SelectValue placeholder="Assign to..." />
              </SelectTrigger>
              <SelectContent>
                {(agentWorkload ?? []).map((agent: any) => (
                  <SelectItem key={agent.userId} value={agent.userId}>
                    {agent.user?.name ?? agent.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {sortedLeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <span className="material-symbols-outlined text-[36px] mb-2 block">group_off</span>
            <p>No unassigned leads</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 w-10">
                    <Checkbox
                      checked={selectedIds.size === sortedLeads.length && sortedLeads.length > 0}
                      onCheckedChange={toggleAll}
                      aria-label="Select all leads"
                    />
                  </th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Score</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0 hover:bg-accent/50">
                    <td className="py-2">
                      <Checkbox
                        checked={selectedIds.has(lead.id)}
                        onCheckedChange={() => toggleSelect(lead.id)}
                        aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                      />
                    </td>
                    <td className="py-2 font-medium">{lead.firstName} {lead.lastName}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                        {lead.score ?? 0}
                      </span>
                    </td>
                    <td className="py-2">{lead.source}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {lead.status}
                      </span>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
