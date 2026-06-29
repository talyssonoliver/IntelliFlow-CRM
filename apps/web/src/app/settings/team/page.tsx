'use client';

import { Card, Badge, Button, Skeleton, EmptyState, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { AppAvatar } from '@/components/shared/app-avatar';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';

export default function TeamPage() {
  useRequireAuth();

  const teamQuery = trpc.user.list.useQuery({ limit: 50 });
  const users = teamQuery.data?.users ?? [];

  if (teamQuery.isLoading) {
    return (
      <div
        className="pb-10"
        data-testid="team-loading"
        aria-busy="true"
        aria-label="Loading team members"
      >
        <div className="mb-6 space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-3">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-4 space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (teamQuery.isError) {
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
          className="mb-6"
        />
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-muted-foreground mb-4 block">
            error
          </span>
          <p className="text-sm text-muted-foreground mb-4">Failed to load team members.</p>
          <Button variant="outline" onClick={() => void teamQuery.refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

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
            onClick: () => {
              toast({
                title: 'Invite member coming soon',
                description: 'Team invite functionality will be available in a future update.',
                variant: 'default',
              });
            },
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
                {users.length}
              </Badge>
            </div>
          </div>

          {users.length === 0 ? (
            <div className="p-6">
              <EmptyState entity="agents" />
            </div>
          ) : (
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
                      className="text-right px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {users.map((member) => (
                    <tr
                      key={member.id}
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
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" disabled>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

            <div className="grid grid-cols-1 gap-3">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{users.length}</p>
                <p className="text-xs text-muted-foreground">Members loaded</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
