'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const AI_MODULE_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'ai-settings',
    label: 'AI Settings',
    description: 'General AI preferences & defaults',
    icon: 'tune',
    href: '/agent-approvals/ai-settings',
  },
  {
    id: 'model-config',
    label: 'Model Configuration',
    description: 'LLM providers, models & parameters',
    icon: 'psychology',
    href: '/agent-approvals/model-config',
  },
  {
    id: 'approval-policies',
    label: 'Approval Policies',
    description: 'Review rules & escalation paths',
    icon: 'policy',
    href: '/agent-approvals/approval-policies',
  },
];

interface AIModuleSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIModuleSettingsPanel({ isOpen, onClose }: Readonly<AIModuleSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="AI & Agents"
      items={AI_MODULE_SETTINGS_ITEMS}
    />
  );
}
