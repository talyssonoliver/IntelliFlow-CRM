'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@intelliflow/ui';
import type { Risk, RiskHeatMapResponse, RiskProbability, RiskImpact, RiskStatus } from '@/app/api/compliance/types';

// Risk symbols for different statuses
const RISK_SYMBOLS: Record<RiskStatus, string> = {
  accepted: '○',
  mitigated: '△',
  requires_action: '□',
};

// Cell background colors based on risk level
function getCellColor(probability: RiskProbability, impact: RiskImpact): string {
  const riskLevel = getRiskLevel(probability, impact);
  switch (riskLevel) {
    case 'critical':
      return 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
    case 'high':
      return 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800';
    case 'medium':
      return 'bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800';
    case 'low':
      return 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800';
    default:
      return 'bg-muted border-border';
  }
}

function getRiskLevel(probability: RiskProbability, impact: RiskImpact): string {
  const probWeight = { low: 1, medium: 2, high: 3 };
  const impactWeight = { low: 1, medium: 2, high: 3 };
  const score = probWeight[probability] * impactWeight[impact];

  if (score >= 9) return 'critical';
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

function getStatusColor(status: RiskStatus): string {
  switch (status) {
    case 'accepted':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'mitigated':
      return 'text-amber-600 dark:text-amber-400';
    case 'requires_action':
      return 'text-red-600 dark:text-red-400';
  }
}

interface HeatMapCellProps {
  probability: RiskProbability;
  impact: RiskImpact;
  risks: Risk[];
  onCellClick: (risks: Risk[]) => void;
}

function HeatMapCell({ probability, impact, risks, onCellClick }: HeatMapCellProps) {
  const cellColor = getCellColor(probability, impact);
  const hasRisks = risks.length > 0;

  return (
    <button
      onClick={() => onCellClick(risks)}
      disabled={!hasRisks}
      className={`
        p-2 min-h-[80px] rounded-lg border transition-all
        ${cellColor}
        ${hasRisks ? 'hover:ring-2 hover:ring-primary cursor-pointer' : 'cursor-default opacity-75'}
      `}
    >
      <div className="text-center">
        <span className="text-lg font-bold text-foreground">{risks.length}</span>
        {hasRisks && (
          <div className="flex flex-wrap justify-center gap-1 mt-1">
            {risks.map((risk) => (
              <span
                key={risk.id}
                className={`text-lg ${getStatusColor(risk.status)}`}
                title={`${risk.title} (${risk.status})`}
              >
                {RISK_SYMBOLS[risk.status]}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

interface RiskDetailTooltipProps {
  risks: Risk[];
  onClose: () => void;
}

function RiskDetailTooltip({ risks, onClose }: RiskDetailTooltipProps) {
  if (risks.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-label="Close"
      />
      <Card className="relative z-10 w-full max-w-md p-4 m-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">
            {risks.length} Risk{risks.length > 1 ? 's' : ''} in this cell
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-3">
          {risks.map((risk) => (
            <div
              key={risk.id}
              className={`p-3 rounded-lg border ${
                risk.status === 'requires_action'
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  : risk.status === 'mitigated'
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                  : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{risk.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {risk.id} • {risk.category}
                  </p>
                </div>
                <span className={`text-xl ${getStatusColor(risk.status)}`}>
                  {RISK_SYMBOLS[risk.status]}
                </span>
              </div>
              {risk.mitigationPlan && (
                <p className="text-sm text-muted-foreground mt-2">
                  {risk.mitigationPlan}
                </p>
              )}
              {risk.dueDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Due: {new Date(risk.dueDate).toLocaleDateString()}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function RiskHeatMap() {
  const [data, setData] = useState<RiskHeatMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRisks, setSelectedRisks] = useState<Risk[]>([]);

  const fetchRisks = useCallback(async () => {
    try {
      const response = await fetch('/api/compliance/risks');
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch risks:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRisks();
  }, [fetchRisks]);

  const getRisksForCell = (probability: RiskProbability, impact: RiskImpact): Risk[] => {
    if (!data?.risks) return [];
    return data.risks.filter(
      (risk) => risk.probability === probability && risk.impact === impact
    );
  };

  const probabilities: RiskProbability[] = ['high', 'medium', 'low'];
  const impacts: RiskImpact[] = ['low', 'medium', 'high'];

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 dark:text-red-400">
              warning
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Risk Heat Map</h2>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="h-64 flex items-center justify-center">
          <span className="material-symbols-outlined text-4xl text-muted-foreground animate-spin">
            progress_activity
          </span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600 dark:text-red-400">
              warning
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Risk Heat Map</h2>
            <p className="text-sm text-muted-foreground">
              {data?.summary.total || 0} risks tracked
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Last updated: {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : '-'}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-emerald-600 dark:text-emerald-400">○</span>
          <span className="text-muted-foreground">Accepted ({data?.summary.byStatus.accepted || 0})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-amber-600 dark:text-amber-400">△</span>
          <span className="text-muted-foreground">Mitigated ({data?.summary.byStatus.mitigated || 0})</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-600 dark:text-red-400">□</span>
          <span className="text-muted-foreground">Requires Action ({data?.summary.byStatus.requires_action || 0})</span>
        </div>
      </div>

      {/* Heat Map Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[300px]">
          {/* Header row */}
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div className="flex items-end justify-center">
              <span className="text-xs font-medium text-muted-foreground transform -rotate-45 origin-center">
                Probability
              </span>
            </div>
            {impacts.map((impact) => (
              <div key={impact} className="text-center">
                <span className="text-xs font-medium text-muted-foreground capitalize">
                  {impact}
                </span>
              </div>
            ))}
          </div>

          {/* Impact label */}
          <div className="text-center mb-2">
            <span className="text-xs font-medium text-muted-foreground">Impact →</span>
          </div>

          {/* Grid rows */}
          {probabilities.map((probability) => (
            <div key={probability} className="grid grid-cols-4 gap-2 mb-2">
              <div className="flex items-center justify-end pr-2">
                <span className="text-xs font-medium text-muted-foreground capitalize">
                  {probability}
                </span>
              </div>
              {impacts.map((impact) => (
                <HeatMapCell
                  key={`${probability}-${impact}`}
                  probability={probability}
                  impact={impact}
                  risks={getRisksForCell(probability, impact)}
                  onCellClick={setSelectedRisks}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Risk Detail Tooltip */}
      {selectedRisks.length > 0 && (
        <RiskDetailTooltip
          risks={selectedRisks}
          onClose={() => setSelectedRisks([])}
        />
      )}
    </Card>
  );
}
