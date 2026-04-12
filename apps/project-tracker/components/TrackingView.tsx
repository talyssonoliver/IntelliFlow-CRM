'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  StatusTracker,
  FeatureMatrixPanel,
  SpecTrackerPanel,
  QualityDashboard,
  RiskRegister,
  AIMetrics,
  SecurityDashboard,
  BuildHealth,
  StatusHistory,
  ContinuousTaskHealth,
} from './tracking';
import CollapsibleSection from './CollapsibleSection';

type TrackingTab =
  | 'status'
  | 'featureMatrix'
  | 'specTracker'
  | 'quality'
  | 'risks'
  | 'ai'
  | 'security'
  | 'build'
  | 'cadence'
  | 'history';

interface TabConfig {
  id: TrackingTab;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'status',
    label: 'Status',
    icon: 'monitoring',
    description: 'Task status snapshot and progress tracking',
  },
  {
    id: 'featureMatrix',
    label: 'Feature Matrix',
    icon: 'table_chart',
    description: 'Source-of-truth feature inventory with task and coverage traceability',
  },
  {
    id: 'specTracker',
    label: 'Spec Tracker',
    icon: 'fact_check',
    description:
      'Cross-references specs, attestations, plans, and CSV status to verify real completion',
  },
  {
    id: 'quality',
    label: 'Quality',
    icon: 'check_circle',
    description: 'Debt, coverage, and SonarQube metrics',
  },
  {
    id: 'risks',
    label: 'Risks',
    icon: 'warning',
    description: 'Risk register and mitigation tracking',
  },
  {
    id: 'ai',
    label: 'AI',
    icon: 'smart_toy',
    description: 'Model performance, drift, and costs',
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'shield',
    description: 'Vulnerability scanning and compliance',
  },
  {
    id: 'build',
    label: 'Build',
    icon: 'hardware',
    description: 'Build health and validation status',
  },
  {
    id: 'cadence',
    label: 'Cadence',
    icon: 'autorenew',
    description: 'Continuous task freshness and cadence health',
  },
  {
    id: 'history',
    label: 'History',
    icon: 'history',
    description: 'Status change timeline and audit trail',
  },
];

export default function TrackingView() {
  const [activeTab, setActiveTab] = useState<TrackingTab>('status');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'status':
        return <StatusTracker />;
      case 'featureMatrix':
        return <FeatureMatrixPanel />;
      case 'specTracker':
        return <SpecTrackerPanel />;
      case 'quality':
        return <QualityDashboard />;
      case 'risks':
        return <RiskRegister />;
      case 'ai':
        return <AIMetrics />;
      case 'security':
        return <SecurityDashboard />;
      case 'build':
        return <BuildHealth />;
      case 'cadence':
        return <ContinuousTaskHealth />;
      case 'history':
        return <StatusHistory onBack={() => setActiveTab('status')} />;
      default:
        return <StatusTracker />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Continuous Tracking</h2>
          <p className="text-gray-500 mt-1">
            Monitor and refresh artifact metrics with manual controls
          </p>
        </div>
      </div>

      {/* Tab Navigation (G13 fix: ARIA tablist/tab roles) */}
      <div
        className="bg-gray-100 rounded-lg p-1 inline-flex gap-1"
        role="tablist"
        aria-label="Tracking dashboard sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
              ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              }
            `}
            title={tab.description}
          >
            <Icon name={tab.icon} size="base" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content (wrapped in tabpanel div since CollapsibleSection doesn't forward ARIA props) */}
      <div role="tabpanel" aria-labelledby={`tab-${activeTab}`} id={`tabpanel-${activeTab}`}>
        <CollapsibleSection
          storageKey={`tracking-${activeTab}`}
          title={TABS.find((t) => t.id === activeTab)?.label ?? 'Tracking'}
          icon="monitoring"
          defaultExpanded
        >
          {renderTabContent()}
        </CollapsibleSection>
      </div>
    </div>
  );
}
