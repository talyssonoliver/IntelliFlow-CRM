'use client';

import Link from 'next/link';
import { Card, Badge } from '@intelliflow/ui';
import developerIntegrationsJson from '@/data/developer-integrations.json';
import { hasFields, isLinkCategory, isOneOf, parseJsonArray } from '@/lib/shared/json-data';

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

const INTEGRATION_STATUSES: readonly IntegrationItem['status'][] = [
  'available',
  'beta',
  'coming-soon',
];

const isIntegrationItem = (value: unknown): boolean =>
  hasFields(
    value,
    { id: 'string', title: 'string', description: 'string', href: 'string' },
    { tags: 'string[]', external: 'boolean' }
  ) && isOneOf(value.status, INTEGRATION_STATUSES);

/** The integration catalogue is content, kept in data/developer-integrations.json. */
const integrationCategories: IntegrationCategory[] = parseJsonArray<IntegrationCategory>(
  developerIntegrationsJson,
  'data/developer-integrations.json',
  (value) => isLinkCategory(value, isIntegrationItem)
);

function StatusBadge({ status }: Readonly<{ status: IntegrationItem['status'] }>) {
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
