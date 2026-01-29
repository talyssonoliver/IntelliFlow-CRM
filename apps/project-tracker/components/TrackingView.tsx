'use client';

import { useState } from 'react';
import { Icon } from '@/lib/icons';
import StatusTracker from './tracking/StatusTracker';
import QualityDashboard from './tracking/QualityDashboard';
import RiskRegister from './tracking/RiskRegister';
import AIMetrics from './tracking/AIMetrics';
import SecurityDashboard from './tracking/SecurityDashboard';
import BuildHealth from './tracking/BuildHealth';

type TrackingTab = 'status' | 'quality' | 'risks' | 'ai' | 'security' | 'build';

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
];

export default function TrackingView() {
  const [activeTab, setActiveTab] = useState<TrackingTab>('status');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'status':
        return <StatusTracker />;
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
      default:
        return <StatusTracker />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Continuous Tracking</h2>
          <p className="text-gray-400 mt-1">
            Monitor and refresh artifact metrics with manual controls
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-gray-800/50 rounded-lg p-1 inline-flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
              ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
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
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/50 p-6">
        {renderTabContent()}
      </div>
    </div>
  );
}
