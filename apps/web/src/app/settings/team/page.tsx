'use client';

import { Card, Badge, Button } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { AppAvatar } from '@/components/shared/app-avatar';

const teamMembers = [
  { name: 'Alex Johnson', email: 'alex@intelliflow.ai', role: 'Admin', status: 'Active' },
  {
    name: 'Jane Anderson',
    email: 'jane@intelliflow.ai',
    role: 'Compliance Officer',
    status: 'Active',
  },
  { name: 'Mike Chen', email: 'mike@intelliflow.ai', role: 'Developer', status: 'Active' },
  { name: 'Sarah Wilson', email: 'sarah@intelliflow.ai', role: 'Sales', status: 'Active' },
];

export default function TeamPage() {
  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Team' },
        ]}
        title="Team"
        description="Manage team members and roles."
        actions={[
          {
            label: 'Invite Member',
            icon: 'person_add',
            variant: 'primary',
            onClick: () => {},
          },
        ]}
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ─── Team Members Table ────────────────────────────────────── */}
        <Card className="lg:col-span-8 overflow-hidden">
          <div className="p-6 pb-0">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">
                  group
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Members</h3>
              <Badge variant="secondary" className="ml-1">
                {teamMembers.length}
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/30">
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    Member
                  </th>
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    Role
                  </th>
                  <th
                    scope="col"
                    className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {teamMembers.map((member) => (
                  <tr
                    key={member.email}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <AppAvatar name={member.name} className="w-10 h-10 text-sm" />
                        <div>
                          <p className="font-medium text-foreground">{member.name}</p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{member.role}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="secondary"
                        className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                      >
                        {member.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─── Team Stats Sidebar ────────────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">
                  analytics
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Overview
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{teamMembers.length}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {teamMembers.filter((m) => m.status === 'Active').length}
                </p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {new Set(teamMembers.map((m) => m.role)).size}
                </p>
                <p className="text-xs text-muted-foreground">Roles</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">0</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">
                  shield
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Roles
              </h3>
            </div>

            <div className="space-y-3">
              {['Admin', 'Compliance Officer', 'Developer', 'Sales'].map((role) => (
                <div key={role} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{role}</span>
                  <Badge variant="secondary">
                    {teamMembers.filter((m) => m.role === role).length}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
