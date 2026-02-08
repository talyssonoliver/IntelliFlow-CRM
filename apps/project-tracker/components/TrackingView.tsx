'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';
import {
  StatusTracker,
  FeatureMatrixPanel,
  QualityDashboard,
  RiskRegister,
  AIMetrics,
  SecurityDashboard,
  BuildHealth,
} from './tracking';
import StatusHistory from './tracking/StatusHistory';
import CollapsibleSection from './CollapsibleSection';

type TrackingTab = 'status' | 'featureMatrix' | 'quality' | 'risks' | 'ai' | 'security' | 'build' | 'history';

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

      {/* Tab Navigation */}
      <div className="bg-gray-100 rounded-lg p-1 inline-flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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
            <Icon name={tab.icon} size="base" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <CollapsibleSection
        storageKey={`tracking-${activeTab}`}
        title={TABS.find((t) => t.id === activeTab)?.label ?? 'Tracking'}
        icon="monitoring"
        defaultExpanded
      >
        {renderTabContent()}
      </CollapsibleSection>
    </div>
  );
}
