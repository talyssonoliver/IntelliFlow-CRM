'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const TASK_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'task-settings',
    label: 'Task Settings',
    description: 'Fields, statuses & defaults',
    icon: 'tune',
    href: '/tasks/task-settings',
  },
  {
    id: 'task-types',
    label: 'Task Types',
    description: 'Categories & templates',
    icon: 'category',
    href: '/tasks/task-types',
  },
  {
    id: 'automation',
    label: 'Task Automation',
    description: 'Auto-assign & recurring rules',
    icon: 'auto_awesome',
    href: '/tasks/automation',
  },
];

interface TaskSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaskSettingsPanel({ isOpen, onClose }: Readonly<TaskSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Task Settings"
      items={TASK_SETTINGS_ITEMS}
    />
  );
}
