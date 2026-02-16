'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';

type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED' | 'LOST';

const placeholderLeads = [
  { id: '1', email: 'john@example.com', firstName: 'John', lastName: 'Doe', company: 'Acme Corp', status: 'NEW' as LeadStatus, score: 85 },
  { id: '2', email: 'jane@startup.io', firstName: 'Jane', lastName: 'Smith', company: 'Startup.io', status: 'QUALIFIED' as LeadStatus, score: 92 },
];

export default function LeadsPage() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'ALL'>('ALL');
  const filteredLeads = statusFilter === 'ALL' ? placeholderLeads : placeholderLeads.filter((l) => l.status === statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Manage and score your sales leads with AI"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Leads' }]}
        actions={
          <Link href="/leads/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            + New Lead
          </Link>
        }
      />

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(['ALL', 'NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  statusFilter === status ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Lead</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Company</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">AI Score</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLeads.map((lead) => (
              <tr key={lead.id} className="hover:bg-muted/30">
                <td className="px-6 py-4">
                  <p className="font-medium">{lead.firstName} {lead.lastName}</p>
                  <p className="text-sm text-muted-foreground">{lead.email}</p>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{lead.company}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary">{lead.status}</span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${lead.score >= 80 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${lead.score}%` }} />
                    </div>
                    <span className="text-sm font-medium">{lead.score}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <Link href={`/leads/${lead.id}`} className="text-sm text-primary hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
