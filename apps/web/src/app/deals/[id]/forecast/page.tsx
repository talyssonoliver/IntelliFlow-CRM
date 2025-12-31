'use client';

import * as React from 'react';
import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  DollarSign,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  Users,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

type StageId = 'PROSPECTING' | 'QUALIFICATION' | 'NEEDS_ANALYSIS' | 'PROPOSAL' | 'NEGOTIATION';

interface ForecastDeal {
  id: string;
  name: string;
  stage: StageId;
  value: number;
  probability: number;
  expectedCloseDate: string;
  owner: {
    name: string;
    avatar: string;
  };
  riskLevel: 'low' | 'medium' | 'high';
}

interface MonthlyProjection {
  month: string;
  actual: number | null;
  projected: number | null;
}

interface WinRateData {
  month: string;
  rate: number;
  isProjected: boolean;
}

interface StageData {
  stage: string;
  value: number;
  percentage: number;
}

// =============================================================================
// Constants & Sample Data
// =============================================================================

const STAGE_PROBABILITIES: Record<StageId, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
};

const STAGE_LABELS: Record<StageId, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
};

// Sample forecast deals data
const FORECAST_DEALS: ForecastDeal[] = [
  {
    id: '1',
    name: 'Acme Corp Enterprise License',
    stage: 'NEGOTIATION',
    value: 120000,
    probability: 60,
    expectedCloseDate: '2025-01-25',
    owner: { name: 'Sarah J.', avatar: 'SJ' },
    riskLevel: 'medium',
  },
  {
    id: '2',
    name: 'Global Tech Expansion',
    stage: 'PROPOSAL',
    value: 85000,
    probability: 45,
    expectedCloseDate: '2025-02-12',
    owner: { name: 'Mike R.', avatar: 'MR' },
    riskLevel: 'low',
  },
  {
    id: '3',
    name: 'DataCorp Platform Migration',
    stage: 'NEEDS_ANALYSIS',
    value: 250000,
    probability: 35,
    expectedCloseDate: '2025-03-01',
    owner: { name: 'Sarah J.', avatar: 'SJ' },
    riskLevel: 'high',
  },
  {
    id: '4',
    name: 'StartupXYZ Team License',
    stage: 'QUALIFICATION',
    value: 45000,
    probability: 25,
    expectedCloseDate: '2025-02-28',
    owner: { name: 'Alex T.', avatar: 'AT' },
    riskLevel: 'low',
  },
  {
    id: '5',
    name: 'MegaCorp Enterprise Suite',
    stage: 'NEGOTIATION',
    value: 350000,
    probability: 75,
    expectedCloseDate: '2025-01-31',
    owner: { name: 'Sarah J.', avatar: 'SJ' },
    riskLevel: 'low',
  },
];

// Revenue projection data (actual + projected)
const MONTHLY_PROJECTIONS: MonthlyProjection[] = [
  { month: 'Jul', actual: 280000, projected: null },
  { month: 'Aug', actual: 420000, projected: null },
  { month: 'Sep', actual: 380000, projected: null },
  { month: 'Oct', actual: null, projected: 520000 },
  { month: 'Nov', actual: null, projected: 680000 },
  { month: 'Dec', actual: null, projected: 750000 },
];

// Win rate trend data
const WIN_RATE_DATA: WinRateData[] = [
  { month: 'May', rate: 18, isProjected: false },
  { month: 'Jun', rate: 22, isProjected: false },
  { month: 'Jul', rate: 20, isProjected: false },
  { month: 'Aug', rate: 25, isProjected: false },
  { month: 'Sep', rate: 28, isProjected: false },
  { month: 'Oct', rate: 30, isProjected: true },
];

// =============================================================================
// Utility Functions
// =============================================================================

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${Math.round(value / 1000)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatFullCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function calculateWeightedPipelineValue(deals: ForecastDeal[]): number {
  return deals.reduce((sum, deal) => sum + deal.value * (deal.probability / 100), 0);
}

function calculateTotalPipelineValue(deals: ForecastDeal[]): number {
  return deals.reduce((sum, deal) => sum + deal.value, 0);
}

function calculateForecastAccuracy(): { accuracy: number; isAtRisk: boolean; target: number } {
  // In production, this would compare historical forecasts to actuals
  // Using Bayesian adjustment algorithm from IFC-092 implementation
  const accuracy = 82; // Sample: 82% accuracy
  const target = 85;
  return {
    accuracy,
    isAtRisk: accuracy < target,
    target,
  };
}

function getStageBreakdown(deals: ForecastDeal[]): StageData[] {
  const stageValues: Record<string, number> = {};
  let total = 0;

  deals.forEach((deal) => {
    const label = STAGE_LABELS[deal.stage];
    stageValues[label] = (stageValues[label] || 0) + deal.value;
    total += deal.value;
  });

  return Object.entries(stageValues)
    .map(([stage, value]) => ({
      stage,
      value,
      percentage: Math.round((value / total) * 100),
    }))
    .sort((a, b) => b.value - a.value);
}

function getRiskColor(risk: 'low' | 'medium' | 'high'): string {
  switch (risk) {
    case 'low':
      return 'bg-green-100 text-green-700';
    case 'medium':
      return 'bg-amber-100 text-amber-700';
    case 'high':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500';
  if (probability >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

// =============================================================================
// Components
// =============================================================================

function ForecastAccuracyCard({
  accuracy,
  isAtRisk,
  target,
}: {
  accuracy: number;
  isAtRisk: boolean;
  target: number;
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 z-10">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Forecast Accuracy</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{accuracy}%</h3>
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                isAtRisk
                  ? 'text-amber-600 bg-amber-100 dark:bg-amber-900/30'
                  : 'text-green-600 bg-green-100 dark:bg-green-900/30'
              }`}
            >
              {isAtRisk ? 'At Risk' : 'On Target'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Target: ≥ {target}%</p>
        </div>

        {/* Gauge Chart */}
        <div className="relative size-20 flex-shrink-0">
          <svg className="size-20 transform -rotate-90" viewBox="0 0 36 36">
            {/* Background circle */}
            <path
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray="100, 100"
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            {/* Progress circle */}
            <path
              className="text-primary"
              strokeDasharray={`${accuracy}, 100`}
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Target className="h-6 w-6 text-primary" />
          </div>
        </div>
      </div>
    </Card>
  );
}

function PipelineValueCard({ value, trend }: { value: number; trend: number }) {
  const isPositive = trend >= 0;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Pipeline Value</p>
      <div className="flex items-center gap-3 mt-1">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{formatFullCurrency(value)}</h3>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {trend}% vs last month
        </span>
      </div>
    </Card>
  );
}

function WeightedForecastCard({ value, trend }: { value: number; trend: number }) {
  const isPositive = trend >= 0;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Weighted Forecast</p>
      <div className="flex items-center gap-3 mt-1">
        <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{formatFullCurrency(value)}</h3>
      </div>
      <div className="flex items-center gap-1 mt-1">
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-500" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500" />
        )}
        <span
          className={`text-sm font-medium ${isPositive ? 'text-green-600 dark:text-green-500' : 'text-red-600'}`}
        >
          {isPositive ? '+' : ''}
          {trend}% vs last month
        </span>
      </div>
    </Card>
  );
}

function RevenueProjectionChart({ data }: { data: MonthlyProjection[] }) {
  const chartData = data.map((d) => ({
    month: d.month,
    actual: d.actual,
    projected: d.projected,
  }));

  return (
    <Card className="p-6 h-96">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revenue Projection</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-xs text-slate-500 font-medium">Actual</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="text-xs text-slate-500 font-medium">Projected</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData} barGap={0}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(value) => formatCurrency(value)}
            tick={{ fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => {
              const numValue = typeof value === 'number' ? value : null;
              return numValue ? formatFullCurrency(numValue) : 'N/A';
            }}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
          />
          <Bar dataKey="actual" fill="#137fec" radius={[4, 4, 0, 0]} />
          <Bar dataKey="projected" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function WinRateTrendCard({ data }: { data: WinRateData[] }) {
  const avgRate = Math.round(data.reduce((sum, d) => sum + d.rate, 0) / data.length);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Win Rate Trend</h3>
        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
          Avg {avgRate}%
        </span>
      </div>
      <div className="h-24 flex items-end gap-1 mt-4">
        {data.map((item, index) => (
          <div
            key={`${item.month}-${index}`}
            className={`flex-1 rounded-t transition-all hover:opacity-80 ${
              item.isProjected
                ? 'bg-slate-200 dark:bg-slate-700 border-t-2 border-dashed border-slate-400'
                : index === data.length - 2
                  ? 'bg-primary'
                  : 'bg-primary/30'
            }`}
            style={{ height: `${item.rate * 2.5}%` }}
            title={`${item.month}: ${item.rate}%`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-400">
        {data.map((item, index) => (
          <span key={`${item.month}-label-${index}`}>{item.month}</span>
        ))}
      </div>
    </Card>
  );
}

function PipelineByStageCard({ stages }: { stages: StageData[] }) {
  const maxValue = Math.max(...stages.map((s) => s.value));

  return (
    <Card className="p-6">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Pipeline by Stage</h3>
      <div className="flex flex-col gap-3">
        {stages.map((stage, index) => (
          <div key={stage.stage} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{stage.stage}</span>
              <span className="font-medium">{formatCurrency(stage.value)}</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(stage.value / maxValue) * 100}%`,
                  backgroundColor: `rgba(19, 127, 236, ${1 - index * 0.2})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OpportunitiesAtRiskTable({ deals }: { deals: ForecastDeal[] }) {
  // Filter and sort by risk level and value
  const riskyDeals = deals
    .filter((d) => d.riskLevel === 'medium' || d.riskLevel === 'high' || d.probability < 60)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Top Opportunities at Risk</h3>
        <Link href="/deals" className="text-sm text-primary font-medium hover:underline">
          View All Deals
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Deal Name
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Stage
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Value
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Probability
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Expected Close
              </th>
              <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Owner
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {riskyDeals.map((deal) => (
              <tr
                key={deal.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                onClick={() => (window.location.href = `/deals/${deal.id}`)}
              >
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{deal.name}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                    {STAGE_LABELS[deal.stage]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {formatFullCurrency(deal.value)}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${getProbabilityColor(deal.probability)}`}
                        style={{ width: `${deal.probability}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{deal.probability}%</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {new Date(deal.expectedCloseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium">
                      {deal.owner.avatar}
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{deal.owner.name}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ForecastSidebar() {
  return (
    <aside className="w-64 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex-col shrink-0 hidden lg:flex">
      <div className="p-4 flex flex-col gap-6">
        {/* Create Deal Button */}
        <Link
          href="/deals/new"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white rounded-lg shadow shadow-primary/20 hover:bg-primary/90 transition-colors font-medium text-sm"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Create Deal
        </Link>

        {/* Deal Views */}
        <div>
          <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Deal Views
          </h3>
          <nav className="flex flex-col gap-1">
            <Link
              href="/deals"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group"
            >
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                list
              </span>
              <span className="text-sm font-medium">List View</span>
            </Link>
            <Link
              href="/deals"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group"
            >
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                view_kanban
              </span>
              <span className="text-sm font-medium">Pipeline Board</span>
            </Link>
            <div className="flex items-center gap-3 px-3 py-2 bg-primary/10 text-primary rounded-md transition-colors">
              <span className="material-symbols-outlined text-[20px]">insights</span>
              <span className="text-sm font-bold">Forecast</span>
            </div>
            <Link
              href="/deals"
              className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group"
            >
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                map
              </span>
              <span className="text-sm font-medium">Territory Map</span>
            </Link>
          </nav>
        </div>

        {/* My Folders */}
        <div>
          <h3 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            My Folders
          </h3>
          <nav className="flex flex-col gap-1">
            <button className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group text-left">
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-primary">
                folder
              </span>
              <span className="text-sm font-medium">Enterprise Q1</span>
            </button>
            <button className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group text-left">
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-primary">
                folder
              </span>
              <span className="text-sm font-medium">SMB Renewals</span>
            </button>
            <button className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors group text-left">
              <span className="material-symbols-outlined text-[20px] text-slate-400 group-hover:text-primary">
                folder
              </span>
              <span className="text-sm font-medium">At Risk</span>
            </button>
          </nav>
        </div>
      </div>

      {/* Trash */}
      <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800">
        <button className="flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors w-full">
          <span className="material-symbols-outlined text-[20px]">delete</span>
          <span className="text-sm font-medium">Trash</span>
        </button>
      </div>
    </aside>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function DealForecastPage() {
  const params = useParams();
  const dealId = params.id as string;

  // Calculate metrics
  const forecastAccuracy = useMemo(() => calculateForecastAccuracy(), []);
  const totalPipelineValue = useMemo(() => calculateTotalPipelineValue(FORECAST_DEALS), []);
  const weightedForecast = useMemo(() => calculateWeightedPipelineValue(FORECAST_DEALS), []);
  const stageBreakdown = useMemo(() => getStageBreakdown(FORECAST_DEALS), []);

  // Get current quarter label
  const currentQuarter = useMemo(() => {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `Q${quarter} ${now.getFullYear()}`;
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <ForecastSidebar />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#f6f7f8] dark:bg-[#101922] p-8">
        <div className="mx-auto flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                <Link href="/deals" className="hover:text-primary transition-colors">
                  Deals
                </Link>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="text-slate-900 dark:text-white font-medium">Forecast</span>
              </nav>

              <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-1">
                Deal Forecast
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                Performance analysis and revenue projection for {currentQuarter}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2">
                <Calendar className="h-4 w-4" />
                This Quarter
                <ChevronRight className="h-4 w-4 rotate-90" />
              </Button>
              <Button variant="outline" className="gap-2">
                <DollarSign className="h-4 w-4" />
                USD
                <ChevronRight className="h-4 w-4 rotate-90" />
              </Button>
              <Button className="gap-2">
                <Download className="h-4 w-4" />
                Export Report
              </Button>
            </div>
          </div>

          {/* KPI Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ForecastAccuracyCard {...forecastAccuracy} />
            <PipelineValueCard value={totalPipelineValue} trend={12} />
            <WeightedForecastCard value={weightedForecast} trend={5} />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Projection - 2/3 width */}
            <div className="lg:col-span-2">
              <RevenueProjectionChart data={MONTHLY_PROJECTIONS} />
            </div>

            {/* Win Rate & Pipeline by Stage - 1/3 width */}
            <div className="flex flex-col gap-6">
              <WinRateTrendCard data={WIN_RATE_DATA} />
              <PipelineByStageCard stages={stageBreakdown} />
            </div>
          </div>

          {/* Opportunities at Risk Table */}
          <OpportunitiesAtRiskTable deals={FORECAST_DEALS} />
        </div>
      </main>
    </div>
  );
}
