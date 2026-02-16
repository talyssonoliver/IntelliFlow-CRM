import { PageHeader } from '@/components/shared/page-header';
import Link from 'next/link';

const settingsSections = [
  { title: 'Profile', description: 'Manage your personal information and preferences', href: '/settings/profile', taskId: 'PG-105' },
  { title: 'Account', description: 'Account security, password, and session management', href: '/settings/account', taskId: 'PG-106' },
  { title: 'Organization', description: 'Company details, branding, and defaults', href: '/settings/organization', taskId: 'PG-107' },
  { title: 'Users & Teams', description: 'Invite users and manage team assignments', href: '/settings/users', taskId: 'PG-108' },
  { title: 'Roles & Permissions', description: 'Define roles and access control policies', href: '/settings/roles', taskId: 'PG-110' },
  { title: 'API Keys', description: 'Generate and manage API access keys', href: '/settings/api-keys', taskId: 'PG-113' },
  { title: 'Webhooks', description: 'Configure webhook endpoints for events', href: '/settings/webhooks', taskId: 'PG-114' },
  { title: 'Integrations', description: 'Connect third-party services and tools', href: '/settings/integrations', taskId: 'PG-115' },
  { title: 'Notifications', description: 'Email and in-app notification preferences', href: '/settings/notifications', taskId: 'PG-116' },
  { title: 'Import / Export', description: 'Bulk data import and export operations', href: '/settings/import-export', taskId: 'PG-117' },
  { title: 'Audit Log', description: 'Activity audit trail and compliance log', href: '/settings/audit-log', taskId: 'PG-118' },
  { title: 'Billing', description: 'Subscription, invoices, and payment methods', href: '/settings/billing', taskId: 'PG-119' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, organization, and application preferences"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg border bg-card p-5 hover:shadow-md transition-shadow"
          >
            <h3 className="font-semibold mb-1">{section.title}</h3>
            <p className="text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
