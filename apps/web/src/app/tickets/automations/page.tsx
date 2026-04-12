'use client';

import { PageHeader } from '@/components/shared/page-header';
import { AutomationRuleBuilder } from '@/components/tickets/AutomationRuleBuilder';

export default function AutomationsPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Tickets', href: '/tickets' }, { label: 'Automations' }]}
        title="Automations"
        description="Create rules to automatically route, assign, and escalate tickets."
      />
      <AutomationRuleBuilder />
    </>
  );
}
