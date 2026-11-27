'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  Skeleton,
  Badge,
  toast,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@intelliflow/ui';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/pricing/calculator';
import { useAccountTiers } from '@/hooks/useAccountTiers';
import { countryLabel } from '@/components/shared/country-select';
import { AccountContactsList } from './AccountContactsList';
import { AccountOpportunitiesList } from './AccountOpportunitiesList';
import { RevenueChart } from './RevenueChart';
import { AccountHierarchy } from './AccountHierarchy';
import { EntityActionSheet } from '@/components/shared/entity-action-sheet';
import { MoreActionsButton } from '@/components/shared/more-actions-button';
import { PinButton } from '@/components/home/PinButton';
import { RelatedTasksCard } from '@/components/tasks/RelatedTasksCard';
import { ActivityFeed } from '@/components/shared/activity-feed';
import { OpportunityCreateSheet } from './OpportunityCreateSheet';
import { ContactAddSheet } from './ContactAddSheet';
import { AssignSheet } from '@/components/shared/assign-sheet';
import { AppAvatar } from '@/components/shared/app-avatar';
import { useAuth } from '@/lib/auth';
// IFC-312 — AI chain UI surfaces
import { AccountScoreBadge } from '@/components/accounts/AccountScoreBadge';
import { InferredFieldBadge } from '@/components/shared/InferredFieldBadge';
import { SuggestedTagsRow } from '@/components/shared/SuggestedTagsRow';
import { isRecordId } from '@/lib/shared/record-id';
import { websiteDisplay } from '@/lib/shared/website-display';

interface AccountDetailProps {
  accountId: string;
  isAuthenticated: boolean;
}

type TabId =
  | 'overview'
  | 'contacts'
  | 'opportunities'
  | 'activity'
  | 'pipeline'
  | 'hierarchy'
  | 'ai-insights';

interface Tab {
  id: TabId;
  label: string;
  count?: number;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** PG-197: join the optional geography fields; null when none is set. */
export function formatAccountLocation(
  account:
    | { country?: string | null; region?: string | null; postalCode?: string | null }
    | null
    | undefined
): string | null {
  if (!account) return null;
  const country = account.country ? countryLabel(account.country) : null;
  const parts = [account.region, account.postalCode, country].filter(
    (part): part is string => !!part
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

const REVENUE_UNITS: ReadonlyArray<readonly [number, string]> = [
  [1_000, 'K'],
  [1_000_000, 'M'],
  [1_000_000_000, 'B'],
];

/**
 * Revenue in pounds, compact for the small metric tile: "£1.3M", "£850K". Built by hand
 * rather than with Intl's compact notation, whose output differs between Node/ICU
 * versions (CI and local disagreed).
 */
export function formatRevenueCompact(revenue: unknown): string {
  const amount = Number(revenue);
  if (revenue === null || revenue === undefined || !Number.isFinite(amount) || amount <= 0) {
    return '—';
  }
  // Units smallest first. Move up a unit only while the current one would read 1000
  // or more once rounded, so 999_950 reads "£1M" rather than "£1000K".
  let shown = Math.round(amount);
  let text = `£${shown}`;
  for (const [size, unit] of REVENUE_UNITS) {
    if (shown < 1000) break;
    // One decimal, dropped when it is zero: 5_000_000 -> "5", 1_250_000 -> "1.3".
    shown = Math.round((amount / size) * 10) / 10;
    text = `£${Number.isInteger(shown) ? shown : shown.toFixed(1)}${unit}`;
  }
  return text;
}

const CHURN_RISK_LABELS: Record<string, string> = {
  MINIMAL: 'Minimal',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

interface InsightSignal {
  label: string;
  impact?: string;
}

/**
 * Key signals as the insight chain stores them. Malformed items are dropped, and a
 * label the model repeats is shown once (the first one wins), so list keys stay unique.
 */
export function readSignals(value: unknown): InsightSignal[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { label, impact } = item as { label?: unknown; impact?: unknown };
    if (typeof label !== 'string' || !label.trim() || seen.has(label)) return [];
    seen.add(label);
    return [{ label, impact: typeof impact === 'string' ? impact : undefined }];
  });
}

/** Non-empty strings, each once, so a repeated recommendation is not listed twice. */
export function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const strings = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return [...new Set(strings)];
}

/**
 * The account's score as the model wrote it, or null. When the model call fails
 * the scoring job still writes a score of 0, with a single provenance factor
 * named `fallback`: that 0 is not a score and is shown as "Not scored".
 */
export function modelScore(score: unknown, provenance: unknown): number | null {
  if (typeof score !== 'number') return null;
  const isFallback =
    Array.isArray(provenance) &&
    provenance.some(
      (f) => f && typeof f === 'object' && (f as { name?: unknown }).name === 'fallback'
    );
  return isFallback ? null : score;
}

/** The factors behind a model-written score; none for a missing or fallback score. */
function scoreFactors(
  score: number | null,
  provenance: unknown
): Array<{ name: string; impact: number }> | null {
  if (score === null || !Array.isArray(provenance)) return null;
  return provenance as Array<{ name: string; impact: number }>;
}

/** Says so when the account has never been scored (the score badge then shows nothing). */
function NotScoredNote({ score }: Readonly<{ score: number | null | undefined }>) {
  if (typeof score === 'number') return null;
  return (
    <p className="text-sm text-slate-500" data-testid="account-not-scored">
      Not scored
    </p>
  );
}

interface AccountInsight {
  healthSummary: string | null;
  nextBestAction: string | null;
  keySignals?: unknown;
  churnRisk: string;
  sentimentTrend: string | null;
  recommendations?: unknown;
  generatedAt: Date | string;
  source: string;
}

/**
 * The stored AI insight, shown only when a model wrote it. When the model call
 * fails the insight chain stores a fallback row (churn risk LOW, engagement 0)
 * that was never analysed, so that row reads as "no analysis yet".
 */
export function AccountInsightPanel({
  isLoading,
  isError = false,
  insight,
}: Readonly<{ isLoading: boolean; isError?: boolean; insight: AccountInsight | null }>) {
  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }
  // A failed lookup says nothing about whether an analysis exists, so it is not "none".
  if (isError && !insight) {
    return (
      <Card className="p-5" data-testid="account-insight-error">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          The AI analysis could not be loaded. Try again later.
        </p>
      </Card>
    );
  }
  if (!insight || insight.source !== 'llm') {
    return (
      <Card className="p-5" data-testid="account-insight-none">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          No AI analysis for this account yet.
        </p>
        <Link
          href="/accounts/account-settings"
          className="mt-2 inline-block text-sm text-[#2a78f6] hover:underline"
        >
          AI settings for accounts
        </Link>
      </Card>
    );
  }
  const signals = readSignals(insight.keySignals);
  const recommendations = readStrings(insight.recommendations);
  return (
    <Card className="p-5 space-y-4" data-testid="account-insight">
      {insight.healthSummary && (
        <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
          {insight.healthSummary}
        </p>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-slate-400 uppercase font-semibold mb-1">Churn risk</dt>
          <dd className="text-sm text-slate-900 dark:text-white">
            {CHURN_RISK_LABELS[insight.churnRisk] ?? insight.churnRisk}
          </dd>
        </div>
        {insight.sentimentTrend && (
          <div>
            <dt className="text-xs text-slate-400 uppercase font-semibold mb-1">Sentiment</dt>
            <dd className="text-sm text-slate-900 dark:text-white">{insight.sentimentTrend}</dd>
          </div>
        )}
      </dl>
      {insight.nextBestAction && (
        <div>
          <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Next best action</p>
          <p className="text-sm text-slate-900 dark:text-white">{insight.nextBestAction}</p>
        </div>
      )}
      {signals.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Key signals</p>
          <ul className="space-y-1">
            {signals.map((signal) => (
              <li key={signal.label} className="text-sm text-slate-700 dark:text-slate-300">
                {signal.label}
                {signal.impact && signal.impact !== 'neutral' ? ` (${signal.impact})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recommendations.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Recommendations</p>
          <ul className="list-disc pl-5 space-y-1">
            {recommendations.map((rec) => (
              <li key={rec} className="text-sm text-slate-700 dark:text-slate-300">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-500">Analysed {formatDate(insight.generatedAt)}</p>
    </Card>
  );
}

function formatDate(date: string | Date, timezone: string = 'Europe/London'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function AccountDetail({ accountId, isAuthenticated }: Readonly<AccountDetailProps>) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [createDealOpen, setCreateDealOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [assignOwnerOpen, setAssignOwnerOpen] = useState(false);
  const { user } = useAuth();
  const isValidId = isRecordId(accountId);

  const {
    data: account,
    isLoading,
    error,
  } = api.account.getById.useQuery({ id: accountId }, { enabled: isValidId && isAuthenticated });

  const oppsQuery = api.account.getOpportunities.useQuery(
    { accountId, limit: 100 },
    { enabled: activeTab === 'pipeline' && isAuthenticated }
  );

  const insightQuery = api.account.getAiInsight.useQuery(
    { accountId },
    { enabled: activeTab === 'ai-insights' && isValidId && isAuthenticated }
  );

  const utils = api.useUtils();
  const deleteMutation = api.account.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Account Deleted',
        description: 'The account has been permanently deleted.',
      });
      router.push('/accounts');
      return Promise.all([utils.account.list.invalidate(), utils.account.stats.invalidate()]);
    },
    onError: (error: { message: string }) => {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    },
  });

  const { data: assigneeOptions = [], isLoading: isAssigneesLoading } =
    api.account.assignees.useQuery(undefined, { enabled: isAuthenticated });

  const assignOwnerMutation = api.account.assignOwner.useMutation({
    onSuccess: () => {
      toast({ title: 'Owner Assigned', description: 'Account owner has been updated.' });
      return Promise.all([
        utils.account.getById.invalidate({ id: accountId }),
        utils.account.list.invalidate(),
      ]);
    },
    onError: (error: { message: string }) => {
      toast({ title: 'Assignment failed', description: error.message, variant: 'destructive' });
    },
  });

  // Derived data
  const { resolveTier } = useAccountTiers();
  const tier = resolveTier(account?.revenue);
  const contactCount = account?._count?.contacts ?? 0;
  const opportunityCount = account?._count?.opportunities ?? 0;
  const shownScore = modelScore(account?.score, account?.scoreProvenance);
  const website = useMemo(() => websiteDisplay(account?.website), [account?.website]);
  // PG-197: optional geography — "Region, POSTCODE, Country" when present.
  const location = formatAccountLocation(account);

  const tabs: Tab[] = useMemo(
    () => [
      { id: 'overview', label: 'Overview' },
      { id: 'contacts', label: 'Contacts', count: contactCount },
      { id: 'opportunities', label: 'Opportunities', count: opportunityCount },
      { id: 'activity', label: 'Activity' },
      { id: 'pipeline', label: 'Pipeline' },
      { id: 'hierarchy', label: 'Hierarchy' },
      // IFC-312 — AI insights tab (hidden when no insight row exists downstream).
      { id: 'ai-insights', label: 'AI Insights' },
    ],
    [contactCount, opportunityCount]
  );

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
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Account Not Found
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {error?.message ??
              "The account could not be loaded or you don't have permission to view it."}
          </p>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2a78f6] text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <span className="material-symbols-outlined !text-lg">arrow_back</span> Back to Accounts
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
            <Link href="/accounts" className="hover:text-[#2a78f6] transition-colors">
              Accounts
            </Link>
            <span className="material-symbols-outlined !text-sm">chevron_right</span>
            <span className="font-medium text-slate-900 dark:text-white">{account.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{account.name}</h1>
        </div>
        <div className="flex gap-3">
          <button
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            onClick={() => router.push(`/accounts/${accountId}/edit`)}
          >
            <span className="material-symbols-outlined !text-[18px]">edit</span> Edit
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            onClick={() => setCreateDealOpen(true)}
          >
            <span className="material-symbols-outlined !text-[18px]">handshake</span> Create Deal
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#2a78f6] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
            onClick={() => setAddContactOpen(true)}
          >
            <span className="material-symbols-outlined !text-[18px]">person_add</span> Add Contact
          </button>
          <PinButton
            entityType="account"
            entityId={accountId}
            title={account.name}
            subtitle={account.industry || undefined}
            icon="domain"
            url={`/accounts/${accountId}`}
          />
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
          {
            label: 'Delete',
            icon: 'delete',
            onClick: () => {
              setActionSheetOpen(false);
              setDeleteConfirmOpen(true);
            },
            destructive: true,
          },
        ]}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the account &ldquo;{account.name}&rdquo; along with all
              associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                setDeleteConfirmOpen(false);
                deleteMutation.mutate({ id: accountId });
              }}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OpportunityCreateSheet
        open={createDealOpen}
        onOpenChange={setCreateDealOpen}
        accountId={accountId}
        accountName={account.name}
      />
      <ContactAddSheet
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        accountId={accountId}
        accountName={account.name}
      />

      {/* ═══ Main 3-column grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ─── Left Sidebar ─── */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Profile Card */}
          <Card className="overflow-hidden">
            <div className={`h-24 bg-gradient-to-r ${tier.colors.gradient}`} />
            <div className="px-5 pb-6 relative">
              <div className="relative -mt-10 mb-3">
                <div
                  className={`w-20 h-20 rounded-xl border-4 border-white dark:border-slate-900 ${tier.colors.avatarBg} flex items-center justify-center text-2xl font-bold shadow-sm`}
                >
                  {initials}
                </div>
              </div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{account.name}</h2>
                {account.industry && (
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    {account.industry}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-6">
                <Badge className={tier.colors.badge}>{tier.label}</Badge>
                {account.industry && (
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium">
                    {account.industry}
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {website && (
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                      language
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-400 uppercase font-semibold">
                        Website
                      </span>
                      <a
                        href={website.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#2a78f6] hover:underline break-all"
                      >
                        {website.domain}
                      </a>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    groups
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">
                      Employees
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {account.employees?.toLocaleString('en-GB') ?? '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    payments
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Revenue</span>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-slate-400 !text-[20px] mt-0.5">
                    calendar_today
                  </span>
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
                    {formatRevenueCompact(account.revenue)}
                  </p>
                  <p className="text-xs text-slate-500">Revenue</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{contactCount}</p>
                  <p className="text-xs text-slate-500">Contacts</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {opportunityCount}
                  </p>
                  <p className="text-xs text-slate-500">Opportunities</p>
                </div>
                <div className="text-center p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {account.employees?.toLocaleString('en-GB') ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">Employees</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Account Owner */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">
              Account Owner
            </h3>
            {account.owner ? (
              <div className="flex items-center gap-3 mb-3">
                <AppAvatar
                  name={account.owner.name ?? account.owner.email}
                  className="size-10"
                  fallbackClassName="text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-700"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {account.owner.name ?? account.owner.email}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{account.owner.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-2 mb-3">No owner assigned</p>
            )}
            <button
              type="button"
              onClick={() => setAssignOwnerOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-symbols-outlined !text-[18px]">person_add</span>
              {account.owner ? 'Reassign Owner' : 'Assign Owner'}
            </button>
          </Card>
          <AssignSheet
            open={assignOwnerOpen}
            onOpenChange={setAssignOwnerOpen}
            title="Assign Account Owner"
            description={`Select an owner for "${account.name}"`}
            currentUserId={user?.id ?? null}
            currentUserName={user?.name ?? null}
            assignees={assigneeOptions}
            isAssigning={assignOwnerMutation.isPending}
            isLoadingOptions={isAssigneesLoading}
            onAssign={async (userId) => {
              await assignOwnerMutation.mutateAsync({ id: accountId, ownerId: userId });
            }}
          />
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
                      ? 'text-[#2a78f6] border-[#2a78f6]'
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
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
                Account Details
              </h3>
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
                      className="text-sm text-[#2a78f6] hover:underline"
                    >
                      {website.domain}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Industry</p>
                  <p className="text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    {account.industry ?? '—'}
                    {/* IFC-312 — show AI-inferred badge when industry came from LLM classifier. */}
                    <InferredFieldBadge
                      inferredAt={account.industryInferredAt}
                      modelVersion={account.industryModelVersion}
                      label="AI"
                    />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Employees</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {account.employees?.toLocaleString('en-GB') ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Revenue</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Tier</p>
                  <Badge className={tier.colors.badge}>{tier.label}</Badge>
                  {tier.benefits.length > 0 && (
                    <ul className="mt-2 space-y-1" aria-label={`${tier.label} tier benefits`}>
                      {tier.benefits.map((benefit) => (
                        <li
                          key={benefit}
                          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
                        >
                          <span
                            className="material-symbols-outlined !text-[14px] text-green-600"
                            aria-hidden="true"
                          >
                            check
                          </span>
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {location && (
                  <div data-testid="account-location">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Location</p>
                    <p className="text-sm text-slate-900 dark:text-white">{location}</p>
                  </div>
                )}
                {account.description && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">
                      Description
                    </p>
                    <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">
                      {account.description}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Created</p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {formatDate(account.createdAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-1">
                    Last Updated
                  </p>
                  <p className="text-sm text-slate-900 dark:text-white">
                    {formatDate(account.updatedAt)}
                  </p>
                </div>
              </div>
              {/* IFC-312 audit fix F3: AI-suggested tags panel (generalized). */}
              <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Tags</p>
                {Array.isArray(account.tags) && account.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {account.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-2">No tags yet</p>
                )}
                <SuggestedTagsRow entity="account" entityId={accountId} enabled={true} />
              </div>
            </Card>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <AccountContactsList
              accountId={accountId}
              onAddContact={() => setAddContactOpen(true)}
            />
          )}

          {/* Opportunities Tab */}
          {activeTab === 'opportunities' && (
            <AccountOpportunitiesList
              accountId={accountId}
              onCreateOpportunity={() => setCreateDealOpen(true)}
            />
          )}

          {/* Activity Tab */}
          {activeTab === 'activity' && (
            <Card className="p-0 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Unified Activity
                </h3>
              </div>
              <div className="p-4 sm:p-5">
                <ActivityFeed
                  entityType="ACCOUNT"
                  entityId={accountId}
                  limit={20}
                  height={500}
                  emptyMessage="No activity recorded yet"
                />
              </div>
            </Card>
          )}

          {/* Pipeline Tab */}
          {activeTab === 'pipeline' && (
            <RevenueChart
              accountId={accountId}
              stageBreakdown={oppsQuery.data?.summary?.stageBreakdown}
              opportunities={oppsQuery.data?.opportunities?.flatMap((o) =>
                o.expectedCloseDate
                  ? [{ value: o.value, expectedCloseDate: o.expectedCloseDate, stage: o.stage }]
                  : []
              )}
            />
          )}

          {/* Hierarchy Tab */}
          {activeTab === 'hierarchy' && <AccountHierarchy accountId={accountId} />}

          {/* IFC-312 — AI Insights Tab */}
          {activeTab === 'ai-insights' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Account AI Insights</h3>
                <AccountScoreBadge
                  score={shownScore}
                  modelVersion={account.scoreModelVersion}
                  scoredAt={account.scoredAt}
                  factors={scoreFactors(shownScore, account.scoreProvenance)}
                />
              </div>
              <NotScoredNote score={shownScore} />
              <AccountInsightPanel
                isLoading={insightQuery.isLoading}
                isError={insightQuery.isError}
                insight={insightQuery.data?.insight ?? null}
              />
            </div>
          )}
        </section>

        {/* ─── Right Sidebar ─── */}
        <aside className="lg:col-span-3 flex flex-col gap-6">
          {/* Quick Stats */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#2a78f6]">insights</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Account Health</h3>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Contacts
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {contactCount}
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
                  <div
                    className="bg-[#2a78f6] h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(contactCount * 10, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Opportunities
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {opportunityCount}
                  </span>
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
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Tier
                  </span>
                  <Badge className={tier.colors.badge}>{tier.label}</Badge>
                </div>
              </div>
              <div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Revenue
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {account.revenue ? formatCurrency(Number(account.revenue)) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-3 tracking-wider">
              Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab('contacts')}
                className="w-full text-left p-2 rounded border bg-blue-50 dark:bg-slate-800/50 border-blue-100 dark:border-slate-700 hover:border-[#2a78f6]/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-[#2a78f6]">
                    person_add
                  </span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-[#2a78f6]">
                    View Contacts
                  </span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('opportunities')}
                className="w-full text-left p-2 rounded border bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700 hover:border-slate-300 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[18px] text-slate-500">
                    trending_up
                  </span>
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
                  <span className="material-symbols-outlined !text-[18px] text-slate-500">
                    account_tree
                  </span>
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
              <div
                className={`w-10 h-10 rounded-lg ${tier.colors.avatarBg} flex items-center justify-center text-sm font-bold shrink-0`}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {account.name}
                </p>
                <p className="text-xs text-slate-500">{tier.label} Account</p>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
