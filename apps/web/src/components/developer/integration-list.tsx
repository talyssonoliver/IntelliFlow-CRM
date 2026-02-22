'use client';

import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { Badge } from '@intelliflow/ui';

interface IntegrationCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  items: IntegrationItem[];
}

interface IntegrationItem {
  id: string;
  title: string;
  description: string;
  href: string;
  status: 'available' | 'beta' | 'coming-soon';
  tags?: string[];
  external?: boolean;
}

const integrationCategories: IntegrationCategory[] = [
  {
    id: 'webhooks',
    title: 'Webhooks',
    description: 'Real-time event notifications for your applications',
    icon: 'webhook',
    color: 'bg-blue-500',
    items: [
      {
        id: 'inbound-webhooks',
        title: 'Inbound Webhooks',
        description: 'Receive events from external services into IntelliFlow CRM',
        href: '/docs/webhooks',
        status: 'available',
      },
      {
        id: 'outbound-webhooks',
        title: 'Outbound Webhooks',
        description: 'Send real-time event notifications to your endpoints',
        href: '/docs/webhooks',
        status: 'available',
      },
    ],
  },
  {
    id: 'sdk-tools',
    title: 'SDK & Developer Tools',
    description: 'Libraries and tools for building with IntelliFlow',
    icon: 'code',
    color: 'bg-emerald-500',
    items: [
      {
        id: 'typescript-sdk',
        title: 'TypeScript SDK',
        description: 'Official TypeScript/JavaScript SDK for IntelliFlow CRM API (v0.1.0)',
        href: '/docs/api',
        status: 'beta',
      },
      {
        id: 'react-hooks',
        title: 'React Hooks',
        description: 'Pre-built React hooks for common CRM operations and data fetching',
        href: '/docs/api',
        status: 'available',
      },
      {
        id: 'cli-tools',
        title: 'CLI Tools',
        description: 'Command-line interface for managing IntelliFlow CRM resources',
        href: '#',
        status: 'coming-soon',
      },
    ],
  },
  {
    id: 'authentication',
    title: 'Authentication',
    description: 'Secure access and identity management',
    icon: 'lock',
    color: 'bg-orange-500',
    items: [
      {
        id: 'oauth',
        title: 'OAuth (Google & Azure)',
        description: 'Single sign-on with Google Workspace and Microsoft Azure AD',
        href: 'https://intelliflow-crm.dev/docs/auth/oauth',
        status: 'available',
        external: true,
      },
      {
        id: 'jwt-bearer',
        title: 'JWT / Bearer Token',
        description: 'Token-based authentication for API access and service-to-service calls',
        href: '/docs/api',
        status: 'available',
      },
      {
        id: 'api-keys',
        title: 'API Keys',
        description: 'Programmatic API key generation and management for integrations',
        href: '#',
        status: 'coming-soon',
      },
      {
        id: 'mfa',
        title: 'Multi-Factor Authentication',
        description: 'TOTP-based two-factor authentication for enhanced account security',
        href: 'https://intelliflow-crm.dev/docs/auth/mfa',
        status: 'available',
        external: true,
      },
    ],
  },
  {
    id: 'connectors',
    title: 'Third-Party Connectors',
    description: 'Pre-built integrations with popular business tools',
    icon: 'hub',
    color: 'bg-purple-500',
    items: [
      {
        id: 'sap-erp',
        title: 'SAP ERP',
        description: 'Enterprise resource planning synchronization with SAP systems',
        href: 'https://intelliflow-crm.dev/docs/connectors/sap',
        status: 'available',
        external: true,
      },
      {
        id: 'stripe',
        title: 'Stripe',
        description: 'Payment processing and subscription management integration',
        href: 'https://intelliflow-crm.dev/docs/connectors/stripe',
        status: 'available',
        external: true,
      },
      {
        id: 'paypal',
        title: 'PayPal',
        description: 'PayPal payment gateway integration for invoicing and transactions',
        href: 'https://intelliflow-crm.dev/docs/connectors/paypal',
        status: 'available',
        external: true,
      },
      {
        id: 'gmail',
        title: 'Gmail',
        description: 'Gmail integration for email tracking, logging, and campaign management',
        href: 'https://intelliflow-crm.dev/docs/connectors/gmail',
        status: 'available',
        external: true,
      },
      {
        id: 'outlook',
        title: 'Outlook',
        description: 'Microsoft Outlook integration for email and calendar synchronization',
        href: 'https://intelliflow-crm.dev/docs/connectors/outlook',
        status: 'available',
        external: true,
      },
      {
        id: 'slack',
        title: 'Slack',
        description: 'Slack workspace integration for CRM notifications and commands',
        href: 'https://intelliflow-crm.dev/docs/connectors/slack',
        status: 'available',
        external: true,
      },
      {
        id: 'teams',
        title: 'Microsoft Teams',
        description: 'Teams integration for collaboration, notifications, and meeting links',
        href: 'https://intelliflow-crm.dev/docs/connectors/teams',
        status: 'available',
        external: true,
      },
    ],
  },
];

function StatusBadge({ status }: { status: IntegrationItem['status'] }) {
  switch (status) {
    case 'beta':
      return <Badge variant="secondary">Beta</Badge>;
    case 'coming-soon':
      return <Badge variant="warning">Coming Soon</Badge>;
    default:
      return null;
  }
}

export function IntegrationList() {
  return (
    <div className="flex flex-col gap-8">
      {integrationCategories.map((category) => {
        if (category.items.length === 0) return null;

        return (
          <section key={category.id} aria-labelledby={`category-${category.id}`}>
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 ${category.color} rounded-lg flex items-center justify-center`}
              >
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  {category.icon}
                </span>
              </div>
              <div>
                <h2
                  id={`category-${category.id}`}
                  className="text-lg font-semibold text-foreground"
                >
                  {category.title}
                </h2>
                <p className="text-sm text-muted-foreground">{category.description}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {category.items.map((item) => {
                const isDisabled = item.status === 'coming-soon';
                const isExternal = item.external === true;

                const cardContent = (
                  <Card
                    className={`p-4 h-full transition-all ${
                      isDisabled
                        ? 'opacity-70 cursor-not-allowed'
                        : 'hover:border-primary hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground">{item.title}</span>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <span
                        className="material-symbols-outlined text-muted-foreground shrink-0"
                        aria-hidden="true"
                      >
                        chevron_right
                      </span>
                    </div>
                  </Card>
                );

                if (isDisabled) {
                  return (
                    <div key={item.id} aria-disabled="true">
                      {cardContent}
                    </div>
                  );
                }

                if (isExternal) {
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                    >
                      {cardContent}
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  >
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
