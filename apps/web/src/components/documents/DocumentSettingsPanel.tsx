'use client';

import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const DOCUMENT_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'document-settings',
    label: 'Document Settings',
    description: 'Defaults, metadata & permissions',
    icon: 'tune',
    href: '/documents/document-settings',
  },
  {
    id: 'document-types',
    label: 'Document Types',
    description: 'Categories & classification',
    icon: 'category',
    href: '/documents/document-types',
  },
  {
    id: 'storage-policies',
    label: 'Storage Policies',
    description: 'Retention & archival rules',
    icon: 'cloud_sync',
    href: '/documents/storage-policies',
  },
];

interface DocumentSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DocumentSettingsPanel({ isOpen, onClose }: Readonly<DocumentSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Document Settings"
      items={DOCUMENT_SETTINGS_ITEMS}
    />
  );
}
