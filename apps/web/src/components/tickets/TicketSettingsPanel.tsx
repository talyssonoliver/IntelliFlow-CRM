'use client';

import { FEATURE_ICONS } from '@/components/sidebar';
import {
  ModuleSettingsNav,
  type ModuleSettingsNavItem,
} from '@/components/shared/module-settings-nav';

const TICKET_SETTINGS_ITEMS: ModuleSettingsNavItem[] = [
  {
    id: 'sla-policies',
    label: 'SLA Policies',
    description: 'Response & resolution targets',
    icon: FEATURE_ICONS.slaPolicy,
    href: '/tickets/sla-policies',
  },
  {
    id: 'ticket-types',
    label: 'Ticket Types',
    description: 'Categories & SLA assignments',
    icon: FEATURE_ICONS.ticketType,
    href: '/tickets/types',
  },
  {
    id: 'automations',
    label: 'Automations',
    description: 'Routing & escalation rules',
    icon: FEATURE_ICONS.automation,
    href: '/tickets/automations',
  },
];

interface TicketSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TicketSettingsPanel({ isOpen, onClose }: Readonly<TicketSettingsPanelProps>) {
  return (
    <ModuleSettingsNav
      isOpen={isOpen}
      onClose={onClose}
      title="Ticket Settings"
      items={TICKET_SETTINGS_ITEMS}
    />
  );
}
