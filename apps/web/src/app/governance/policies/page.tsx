'use client';

import { Card } from '@intelliflow/ui';

const policies = [
  {
    title: 'Information Security Policy',
    version: 'v2.1',
    lastUpdated: '2025-12-15',
    status: 'Active',
    owner: 'Security Team',
  },
  {
    title: 'Data Protection Policy',
    version: 'v2.4',
    lastUpdated: '2025-12-20',
    status: 'Active',
    owner: 'Legal Team',
  },
  {
    title: 'AI Ethics Policy',
    version: 'v1.0',
    lastUpdated: '2025-12-10',
    status: 'Draft',
    owner: 'AI Ethics Team',
  },
  {
    title: 'Incident Response Plan',
    version: 'v1.2',
    lastUpdated: '2025-12-08',
    status: 'Active',
    owner: 'Security Team',
  },
  {
    title: 'Access Control Policy',
    version: 'v1.1',
    lastUpdated: '2025-12-05',
    status: 'Active',
    owner: 'IT Team',
  },
];

export default function PoliciesPage() {
  return (
    <div className="p-8">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Policies</h1>
              <p className="text-muted-foreground mt-1">
                Security policies, data protection guidelines, and procedures
              </p>
            </div>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium">
              <span className="material-symbols-outlined text-lg">upload</span>
              Upload Policy
            </button>
          </div>
        </div>

        {/* Policies List */}
        <div className="space-y-4">
          {policies.map((policy, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">
                      description
                    </span>
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{policy.title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{policy.version}</span>
                      <span>-</span>
                      <span>Updated {policy.lastUpdated}</span>
                      <span>-</span>
                      <span>{policy.owner}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      policy.status === 'Active'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {policy.status}
                  </span>
                  <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
