'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Skeleton, Badge } from '@intelliflow/ui';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/pricing/calculator';
import { getAccountTier, TIER_CONFIG, type AccountTier } from './AccountCard';
import { AccountContactsList } from './AccountContactsList';
import { AccountOpportunitiesList } from './AccountOpportunitiesList';
import { RevenueChart } from './RevenueChart';
import { AccountHierarchy } from './AccountHierarchy';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';

interface AccountDetailProps {
  accountId: string;
  isAuthenticated: boolean;
}

type TabId = 'overview' | 'contacts' | 'opportunities' | 'activity' | 'pipeline' | 'hierarchy';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tier gradient colours for the profile card header
const TIER_GRADIENTS: Record<AccountTier, string> = {
  ENTERPRISE: 'from-purple-100 to-indigo-50 dark:from-purple-900/40 dark:to-slate-800',
  MID_MARKET: 'from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-slate-800',
  SMB: 'from-green-100 to-emerald-50 dark:from-green-900/40 dark:to-slate-800',
  STARTUP: 'from-yellow-100 to-amber-50 dark:from-yellow-900/40 dark:to-slate-800',
  UNKNOWN: 'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function resolveWebsite(website: unknown): { href: string; display: string } | null {
  if (!website) return null;
  // API may return WebsiteUrl value object or a plain string
  const raw =
    typeof website === 'string'
      ? website
      : typeof website === 'object' && website !== null && 'normalized' in website
        ? (website as { normalized: string }).normalized
        : typeof website === 'object' && website !== null && 'value' in website
          ? (website as { value: string }).value
          : null;
  if (!raw) return null;
  const href = raw.startsWith('http') ? raw : `https://${raw}`;
  const display = raw.replace(/^https?:\/\//, '');
  return { href, display };
}

function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function AccountDetail({ accountId, isAuthenticated }: AccountDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const isValidId = UUID_RE.test(accountId);

  const { data: account, isLoading, error } = api.account.getById.useQuery(
    { id: accountId },
    { enabled: isValidId && isAuthenticated },
  );

  const activityQuery = api.account.getActivity.useQuery(
    { accountId, limit: 20 },
    { enabled: activeTab === 'activity' && isAuthenticated },
  );

  const oppsQuery = api.account.getOpportunities.useQuery(
    { accountId, limit: 100 },
    { enabled: activeTab === 'pipeline' && isAuthenticated },
  );

  // Derived data
  const tier = useMemo(
    () => getAccountTier(account?.revenue ? Number(account.revenue) : null),
    [account?.revenue],
  );
  const tierConfig = TIER_CONFIG[tier];
  const contactCount = account?._count?.contacts ?? 0;
  const opportunityCount = account?._count?.opportunities ?? 0;
  const website = useMemo(() => resolveWebsite(account?.website), [account?.website]);

  const tabs: Tab[] = useMemo(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts', count: contactCount },
    { id: 'opportunities', label: 'Opportunities', count: opportunityCount },
    { id: 'activity', label: 'Activity' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'hierarchy', label: 'Hierarchy' },
  ], [contactCount, opportunityCount]);

  // ─── Loading skeleton (3-column) ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <div className="mb-6">
          <Skeleton className="h-4 w-48 mb-2" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3">
            <Card className="p-6">
              <Skeleton className="h-24 w-full mb-4" />
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-24" />
            </Card>
          </div>
          <div className="lg:col-span-6">
            <Card className="p-6">
              <Skeleton className="h-10 w-full mb-4" />
              <Skeleton className="h-32 w-full mb-4" />
              <Skeleton className="h-32 w-full" />
            </Card>
          </div>
          <div className="lg:col-span-3">
            <Card className="p-6">
              <Skeleton className="h-6 w-24 mb-4" />
              <Skeleton className="h-20 w-full mb-4" />
              <Skeleton className="h-20 w-full" />
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error / Not found ────────────────────────────────────────────
  if (!isValidId || error || !account) {
    return (
      <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-red-500 mb-4">error</span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Account Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {error?.message ?? 'The account could not be loaded or you don\'t have permission to view it.'}
          </p>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined !text-lg">arrow_back</span>
            Back to Accounts
          </Link>
        </Card>
      </div>
    );
  }

  const initials = getInitials(account.name);

  return (
    <div className="mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      {/* Breadcrumb + Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-1">
            <Link href="/accounts" className="hover:text-[#137fec] transition-colors">Accounts</Link>
            <span className="material-symbols-outlined !text-sm">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">{account.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{account.name}</h1>
        </div>
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            onClick={() => router.push(`/accounts/${accountId}?edit=true`)}
          >
            <span className="material-symbols-outlined !text-[18px]">edit</span>
            Edit
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
            <span className="material-symbols-outlined !text-[18px]">handshake</span>
            Create Deal
          </button>
          <button className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none">
            <span className="material-symbols-outlined !text-[18px]">person_add</span>
            Add Contact
          </button>
          <MoreActionsButton onClick={() => setActionSheetOpen(true)} />
        </div>
      </div>

      <EntityActionSheet
        open={actionSheetOpen}
        onOpenChange={setActionSheetOpen}
        entity={{
          type: 'account',
          id: accountId,
          title: account.name,
          subtitle: account.industry || undefined,
          icon: 'domain',
          url: `/accounts/${accountId}`,
        }}
        extraActions={[
          { label: 'Merge Account', icon: 'merge', onClick: () => {} },
          { label: 'Archive', icon: 'archive', onClick: () => {} },
          { label: 'Delete', icon: 'delete', onClick: () => {}, destructive: true },
        ]}
      />

      {/* ═══ Main 3-column grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── Left Sidebar ─── */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Profile Card */}
          <Card className="overflow-hidden">
            <div className={`h-24 bg-gradient-to-r ${TIER_GRADIENTS[tier]}`} />
            <div className="px-5 pb-6 relative">
              <div className="relative -mt-10 mb-3">
                <div className={`w-20 h-20 rounded-xl border-4 border-white dark:border-slate-900 ${tierConfig.avatarBg} flex items-center justify-center text-2xl font-bold shadow-sm`}>
                  {initials}
                </div>
              </div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{account.name}</h2>
                {account.industry && (
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{account.industry}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <Badge className={tierConfig.color}>{tierConfig.label}</Badge>
                {account.industry && (
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium">
                    {account.industry}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {website && (
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">language</span>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400 uppercase font-semibold">Website</span>
                      <a
                        href={website.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#137fec] hover:underline break-all"
                      >
                        {website.display}
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">groups</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Employees</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {account.employees?.toLocaleString() ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">payments</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Revenue</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">calendar_today</span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Created</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {formatDate(account.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Metric Mini-Grid */}
              <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {account.revenue ? `$${(Number(account.revenue) / 1_000_000).toFixed(1)}M` : '—'}
                  </p>
                  <p className="text-xs text-slate-500">Revenue</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{contactCount}</p>
                  <p className="text-xs text-slate-500">Contacts</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{opportunityCount}</p>
                  <p className="text-xs text-slate-500">Opportunities</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {account.employees?.toLocaleString() ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">Employees</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Account Owner */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">Account Owner</h3>
            {account.ownerId ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                  <span className="material-symbols-outlined !text-[20px]">person</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Owner Assigned</p>
                  <p className="text-xs text-slate-500">Account Manager</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-2">No owner assigned</p>
            )}
          </Card>
        </aside>

        {/* ─── Center Content ─── */}
        <section className="lg:col-span-6 flex flex-col gap-6">
          {/* Tabs Card */}
          <Card>
            <div className="flex border-b border-slate-200 dark:border-slate-800 px-2 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-4 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-[#137fec] border-[#137fec]'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border-transparent'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="ml-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <Card className="p-6">
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Account Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Name</p>
                  <p className="text-sm text-slate-900 dark:text-white">{account.name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Website</p>
                  {website ? (
                    <a
                      href={website.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#137fec] hover:underline"
                    >
                      {website.display}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Industry</p>
                  <p className="text-sm text-slate-900 dark:text-white">{account.industry ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Employees</p>
                  <p className="text-sm text-slate-900 dark:text-white">{account.employees?.toLocaleString() ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Revenue</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Tier</p>
                  <Badge className={tierConfig.color}>{tierConfig.label}</Badge>
                </div>
                {account.description && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Description</p>
                    <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{account.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Created</p>
                  <p className="text-sm text-slate-900 dark:text-white">{formatDate(account.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Last Updated</p>
                  <p className="text-sm text-slate-900 dark:text-white">{formatDate(account.updatedAt)}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <AccountContactsList accountId={accountId} />
          )}

          {/* Opportunities Tab */}
          {activeTab === 'opportunities' && (
            <AccountOpportunitiesList accountId={accountId} />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <Card className="p-6">
              {activityQuery.isLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              )}
              {activityQuery.error && (
                <div className="text-center py-8 text-destructive">
                  <p className="text-sm">Failed to load activity</p>
                </div>
              )}
              {activityQuery.data?.activities && activityQuery.data.activities.length === 0 && (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3">history</span>
                  <p className="text-slate-500 dark:text-slate-400">No activity recorded yet</p>
                </div>
              )}
              {activityQuery.data?.activities && activityQuery.data.activities.length > 0 && (
                <div className="space-y-4">
                  {activityQuery.data.activities.map((activity: any) => (
                    <div key={activity.id} className="flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                        <span className="material-symbols-outlined !text-[18px]">
                          {activity.entityType === 'CONTACT' ? 'person' : 'trending_up'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 dark:text-white">{activity.description}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {new Date(activity.createdAt).toLocaleString()}
                          {activity.performedBy && ` by ${activity.performedBy.name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Pipeline Tab */}
          {activeTab === 'pipeline' && (
            <RevenueChart
              accountId={accountId}
              stageBreakdown={oppsQuery.data?.summary?.stageBreakdown}
              opportunities={oppsQuery.data?.opportunities?.map((o: any) => ({
                value: o.value,
                expectedCloseDate: o.expectedCloseDate,
                stage: o.stage,
              }))}
            />
          )}

          {/* Hierarchy Tab */}
          {activeTab === 'hierarchy' && (
            <AccountHierarchy accountId={accountId} />
          )}
        </section>

        {/* ─── Right Sidebar ─── */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Quick Stats */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#137fec]">insights</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Account Health</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Contacts</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{contactCount}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-[#137fec] h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(contactCount * 10, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Opportunities</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{opportunityCount}</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(opportunityCount * 20, 100)}%` }}
                  />
                </div>
              </div>
              <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />
              <div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Tier</span>
                  <Badge className={tierConfig.color}>{tierConfig.label}</Badge>
                </div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Revenue</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('contacts')}
                className="w-full text-left p-2 rounded border bg-blue-50 dark:bg-slate-800/50 border-blue-100 dark:border-slate-700 hover:border-[#137fec]/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-[#137fec]">person_add</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-[#137fec]">
                    View Contacts
                  </span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('opportunities')}
                className="w-full text-left p-2 rounded border bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700 hover:border-slate-300 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-slate-500">trending_up</span>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900">
                    View Opportunities
                  </span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('hierarchy')}
                className="w-full text-left p-2 rounded border bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700 hover:border-slate-300 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-slate-500">account_tree</span>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900">
                    View Hierarchy
                  </span>
                </div>
              </button>
            </div>
          </Card>

          {/* Next Steps */}
          <RelatedTasksCard
            entityType="account"
            entityId={accountId}
            title="Next Steps"
            maxItems={3}
          />

          {/* Hierarchy Preview */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Hierarchy</h3>
              <button
                onClick={() => setActiveTab('hierarchy')}
                className="w-6 h-6 rounded hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <span className="material-symbols-outlined !text-[20px]">open_in_new</span>
              </button>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
              <div className={`w-10 h-10 rounded-lg ${tierConfig.avatarBg} flex items-center justify-center text-sm font-bold shrink-0`}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{account.name}</p>
                <p className="text-xs text-slate-500">{tierConfig.label} Account</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
