'use client';

import * as React from 'react';
import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Button } from '@intelliflow/ui';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@intelliflow/ui';

// Pipeline stage configuration matching Prisma schema
const PIPELINE_STAGES = [
  { id: 'QUALIFICATION', label: 'Qualification', color: '#137fec' },
  { id: 'NEEDS_ANALYSIS', label: 'Needs Analysis', color: '#6366f1' },
  { id: 'PROPOSAL', label: 'Proposal', color: '#8b5cf6' },
  { id: 'NEGOTIATION', label: 'Negotiation', color: '#f59e0b' },
  { id: 'CLOSED_WON', label: 'Closed Won', color: '#22c55e' },
  { id: 'CLOSED_LOST', label: 'Closed Lost', color: '#ef4444' },
] as const;

type StageId = (typeof PIPELINE_STAGES)[number]['id'];

// Deal interface matching Prisma Opportunity model
interface Deal {
  id: string;
  name: string;
  value: number;
  stage: StageId;
  probability: number;
  expectedCloseDate: string | null;
  accountName: string;
  contactName: string | null;
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

// Sample data for demonstration
const SAMPLE_DEALS: Deal[] = [
  {
    id: '1',
    name: 'Enterprise License - Acme Corp',
    value: 75000,
    stage: 'QUALIFICATION',
    probability: 20,
    expectedCloseDate: '2025-02-15',
    accountName: 'Acme Corporation',
    contactName: 'John Smith',
    ownerId: '1',
    ownerName: 'Sarah Johnson',
    createdAt: '2024-12-01',
  },
  {
    id: '2',
    name: 'Annual Subscription - TechStart',
    value: 24000,
    stage: 'QUALIFICATION',
    probability: 25,
    expectedCloseDate: '2025-01-30',
    accountName: 'TechStart Inc',
    contactName: 'Emily Chen',
    ownerId: '1',
    ownerName: 'Sarah Johnson',
    createdAt: '2024-12-10',
  },
  {
    id: '3',
    name: 'Custom Integration - GlobalTech',
    value: 120000,
    stage: 'NEEDS_ANALYSIS',
    probability: 40,
    expectedCloseDate: '2025-03-01',
    accountName: 'GlobalTech Solutions',
    contactName: 'Michael Brown',
    ownerId: '2',
    ownerName: 'Mike Davis',
    createdAt: '2024-11-15',
  },
  {
    id: '4',
    name: 'Platform Migration - DataCorp',
    value: 85000,
    stage: 'PROPOSAL',
    probability: 60,
    expectedCloseDate: '2025-02-28',
    accountName: 'DataCorp Analytics',
    contactName: 'Lisa Wang',
    ownerId: '1',
    ownerName: 'Sarah Johnson',
    createdAt: '2024-10-20',
  },
  {
    id: '5',
    name: 'Consulting Package - InnovateCo',
    value: 45000,
    stage: 'PROPOSAL',
    probability: 55,
    expectedCloseDate: '2025-02-10',
    accountName: 'InnovateCo',
    contactName: 'David Lee',
    ownerId: '2',
    ownerName: 'Mike Davis',
    createdAt: '2024-11-01',
  },
  {
    id: '6',
    name: 'Enterprise Suite - MegaCorp',
    value: 250000,
    stage: 'NEGOTIATION',
    probability: 75,
    expectedCloseDate: '2025-01-31',
    accountName: 'MegaCorp Industries',
    contactName: 'Robert Taylor',
    ownerId: '1',
    ownerName: 'Sarah Johnson',
    createdAt: '2024-09-15',
  },
  {
    id: '7',
    name: 'Team License - StartupXYZ',
    value: 12000,
    stage: 'CLOSED_WON',
    probability: 100,
    expectedCloseDate: '2024-12-20',
    accountName: 'StartupXYZ',
    contactName: 'Alex Martinez',
    ownerId: '2',
    ownerName: 'Mike Davis',
    createdAt: '2024-08-01',
  },
  {
    id: '8',
    name: 'API Access - DevTools',
    value: 18000,
    stage: 'CLOSED_LOST',
    probability: 0,
    expectedCloseDate: '2024-12-15',
    accountName: 'DevTools Inc',
    contactName: 'Chris Anderson',
    ownerId: '1',
    ownerName: 'Sarah Johnson',
    createdAt: '2024-10-01',
  },
];

const dealViews = [
  { id: 'all', label: 'All Deals', icon: 'list', count: 8, href: null },
  { id: 'my', label: 'My Deals', icon: 'person', count: 5, href: null },
  { id: 'closing', label: 'Closing This Month', icon: 'event', count: 3, href: null },
  { id: 'high-value', label: 'High Value (>$50K)', icon: 'star', count: 4, href: null },
  { id: 'forecast', label: 'Forecast', icon: 'insights', count: null, href: '/deals/all/forecast' },
];

const segments = [
  { id: 'hot', label: 'Hot Deals (>70%)', color: 'bg-green-500', count: 2 },
  { id: 'at-risk', label: 'At Risk', color: 'bg-red-500', count: 1 },
  { id: 'stalled', label: 'Stalled (>30 days)', color: 'bg-amber-500', count: 2 },
];

// Sortable Deal Card Component
function SortableDealCard({ deal, onNavigate }: { deal: Deal; onNavigate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
    data: {
      type: 'deal',
      deal,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-surface-light dark:bg-surface-dark rounded-lg border border-border-light dark:border-border-dark',
        'p-4 cursor-pointer transition-all duration-200',
        'hover:border-ds-primary hover:shadow-md',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-ds-primary'
      )}
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-medium text-slate-900 dark:text-white text-sm line-clamp-2">
          {deal.name}
        </h4>
        <button
          type="button"
          aria-label="Drag to move deal"
          className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
        >
          <span className="material-symbols-outlined text-lg">drag_indicator</span>
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-sm">business</span>
          <span className="truncate">{deal.accountName}</span>
        </div>

        {deal.contactName && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="material-symbols-outlined text-sm">person</span>
            <span className="truncate">{deal.contactName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-lg text-emerald-500">payments</span>
          <span className="font-semibold text-slate-900 dark:text-white text-sm">
            {formatCurrency(deal.value)}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="material-symbols-outlined text-sm">event</span>
          <span>{formatDate(deal.expectedCloseDate)}</span>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-slate-500 dark:text-slate-400">Probability</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{deal.probability}%</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#137fec] rounded-full transition-all duration-300"
            style={{ width: `${deal.probability}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Pipeline Column Component
function PipelineColumn({
  stage,
  deals,
  onDealNavigate,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  deals: Deal[];
  onDealNavigate: (dealId: string) => void;
}) {
  const totalValue = deals.reduce((sum, deal) => sum + deal.value, 0);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  return (
    <div className="flex-1 min-w-[280px] max-w-[320px]">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="font-medium text-slate-900 dark:text-white">{stage.label}</span>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
            {deals.length}
          </span>
        </div>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {formatCurrency(totalValue)}
        </span>
      </div>

      {/* Droppable Area */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 min-h-[400px]">
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {deals.map((deal) => (
              <SortableDealCard key={deal.id} deal={deal} onNavigate={() => onDealNavigate(deal.id)} />
            ))}
            {deals.length === 0 && (
              <div className="flex items-center justify-center h-[100px] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                <p className="text-sm text-slate-400 dark:text-slate-500">Drop deals here</p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// Main Deals Page Component
export default function DealsPage() {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(SAMPLE_DEALS);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [activeView, setActiveView] = useState('all');

  // Navigate to deal detail page
  const handleDealNavigate = useCallback((dealId: string) => {
    router.push(`/deals/${dealId}`);
  }, [router]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<StageId, Deal[]> = {
      QUALIFICATION: [],
      NEEDS_ANALYSIS: [],
      PROPOSAL: [],
      NEGOTIATION: [],
      CLOSED_WON: [],
      CLOSED_LOST: [],
    };

    deals.forEach((deal) => {
      grouped[deal.stage].push(deal);
    });

    return grouped;
  }, [deals]);

  // Chart data
  const pieChartData = useMemo(() => {
    return PIPELINE_STAGES.filter((stage) => !['CLOSED_WON', 'CLOSED_LOST'].includes(stage.id)).map(
      (stage) => ({
        name: stage.label,
        value: dealsByStage[stage.id].length,
        color: stage.color,
      })
    );
  }, [dealsByStage]);

  const barChartData = useMemo(() => {
    return PIPELINE_STAGES.map((stage) => ({
      name: stage.label.replace(' ', '\n'),
      revenue: dealsByStage[stage.id].reduce((sum, deal) => sum + deal.value, 0),
      color: stage.color,
    }));
  }, [dealsByStage]);

  // Pipeline stats
  const pipelineStats = useMemo(() => {
    const activeDeals = deals.filter(
      (d) => !['CLOSED_WON', 'CLOSED_LOST'].includes(d.stage)
    );
    const totalValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
    const weightedValue = activeDeals.reduce(
      (sum, d) => sum + d.value * (d.probability / 100),
      0
    );
    const wonValue = dealsByStage.CLOSED_WON.reduce((sum, d) => sum + d.value, 0);

    return {
      totalDeals: activeDeals.length,
      totalValue,
      weightedValue,
      wonValue,
    };
  }, [deals, dealsByStage]);

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const deal = deals.find((d) => d.id === active.id);
    if (deal) {
      setActiveDeal(deal);
    }
  }, [deals]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDeal(null);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      if (activeId === overId) return;

      const activeDeal = deals.find((d) => d.id === activeId);
      const overDeal = deals.find((d) => d.id === overId);

      if (!activeDeal) return;

      // If dropping on a stage (column)
      const targetStage = PIPELINE_STAGES.find((s) => s.id === overId);
      if (targetStage) {
        setDeals((prev) =>
          prev.map((d) => (d.id === activeId ? { ...d, stage: targetStage.id } : d))
        );
        return;
      }

      // If dropping on another deal
      if (overDeal && activeDeal.stage !== overDeal.stage) {
        // Move to new stage
        setDeals((prev) =>
          prev.map((d) => (d.id === activeId ? { ...d, stage: overDeal.stage } : d))
        );
      } else if (overDeal && activeDeal.stage === overDeal.stage) {
        // Reorder within same stage
        const stageDeals = deals.filter((d) => d.stage === activeDeal.stage);
        const oldIndex = stageDeals.findIndex((d) => d.id === activeId);
        const newIndex = stageDeals.findIndex((d) => d.id === overId);

        if (oldIndex !== newIndex) {
          const newOrder = arrayMove(stageDeals, oldIndex, newIndex);
          setDeals((prev) => {
            const otherDeals = prev.filter((d) => d.stage !== activeDeal.stage);
            return [...otherDeals, ...newOrder];
          });
        }
      }
    },
    [deals]
  );

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Left Sidebar */}
      <aside className="w-56 border-r border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark flex-shrink-0 hidden lg:block">
        <div className="p-4">
          {/* Deal Views */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Deal Views
            </h3>
            <nav className="space-y-1">
              {dealViews.map((view) =>
                view.href ? (
                  <Link
                    key={view.id}
                    href={view.href}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">{view.icon}</span>
                      <span>{view.label}</span>
                    </div>
                  </Link>
                ) : (
                  <button
                    key={view.id}
                    onClick={() => setActiveView(view.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                      activeView === view.id
                        ? 'bg-[#137fec]/10 text-[#137fec] font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">{view.icon}</span>
                      <span>{view.label}</span>
                    </div>
                    {view.count !== null && <span className="text-xs text-slate-400">{view.count}</span>}
                  </button>
                )
              )}
            </nav>
          </div>

          {/* Segments */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
              Segments
            </h3>
            <nav className="space-y-1">
              {segments.map((segment) => (
                <button
                  key={segment.id}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${segment.color}`} />
                    <span>{segment.label}</span>
                  </div>
                  <span className="text-xs text-slate-400">{segment.count}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Module Settings */}
        <div className="absolute bottom-0 left-0 w-56 p-4 border-t border-border-light dark:border-border-dark">
          <button className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <span className="material-symbols-outlined text-lg">settings</span>
            <span>Module Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 bg-[#f6f7f8] dark:bg-[#101922] overflow-x-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-4">
          <Link href="/dashboard" className="hover:text-[#137fec]">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-white font-medium">Deals</span>
        </nav>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Deals Pipeline
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">
              Manage your sales pipeline with drag-and-drop
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/deals/all/forecast"
              className="group flex items-center justify-center gap-2 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 font-medium py-2.5 px-5 rounded-lg shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-[#2d3a4a] focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                insights
              </span>
              <span>Forecast</span>
            </Link>
            <Link
              href="/deals/new"
              className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
            >
              <span
                className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
                aria-hidden="true"
              >
                add
              </span>
              <span>New Deal</span>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <p className="text-sm text-slate-500 dark:text-slate-400">Active Deals</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {pipelineStats.totalDeals}
            </p>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <p className="text-sm text-slate-500 dark:text-slate-400">Pipeline Value</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(pipelineStats.totalValue)}
            </p>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <p className="text-sm text-slate-500 dark:text-slate-400">Weighted Value</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {formatCurrency(pipelineStats.weightedValue)}
            </p>
          </Card>
          <Card className="p-4 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <p className="text-sm text-slate-500 dark:text-slate-400">Won This Period</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {formatCurrency(pipelineStats.wonValue)}
            </p>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid gap-4 md:grid-cols-2 mb-6">
          <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Deals by Stage
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Revenue by Stage
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value) => {
                    const numValue = typeof value === 'number' ? value : 0;
                    return [`$${numValue.toLocaleString()}`, 'Revenue'];
                  }}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* Kanban Board */}
        <Card className="p-4 overflow-x-auto bg-surface-light dark:bg-surface-dark border-border-light dark:border-border-dark">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {PIPELINE_STAGES.map((stage) => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  deals={dealsByStage[stage.id]}
                  onDealNavigate={handleDealNavigate}
                />
              ))}
            </div>

            <DragOverlay>
              {activeDeal && (
                <div className="bg-white dark:bg-slate-900 rounded-lg border-2 border-[#137fec] shadow-xl p-4 w-[280px] opacity-90">
                  <h4 className="font-medium text-slate-900 dark:text-white text-sm mb-2">
                    {activeDeal.name}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg text-emerald-500">payments</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">
                      {formatCurrency(activeDeal.value)}
                    </span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </Card>

      </main>
    </div>
  );
}
