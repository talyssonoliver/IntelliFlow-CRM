'use client';

/**
 * Automation Settings Hub — IFC-031 FU-011 / FU-012
 *
 * Landing page for tenant-level workflow automation configuration.
 */

import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';

const SECTIONS = [
  {
    href: '/settings/automation/custom-node-types',
    icon: 'widgets',
    title: 'Custom Node Types',
    description: 'Register tenant-specific workflow node types.',
  },
  {
    href: '/settings/automation/custom-actions',
    icon: 'bolt',
    title: 'Custom Actions',
    description: 'Register webhook-based action handlers.',
  },
];

export default function AutomationSettingsPage() {
  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Automation' },
        ]}
        title="Automation"
        description="Extend the workflow builder with tenant-specific node and action types."
        className="mb-6"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="no-underline">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg border border-input bg-muted/40 p-2">
                    <span className="material-symbols-outlined text-base" aria-hidden="true">
                      {s.icon}
                    </span>
                  </div>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{s.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
