'use client';

import Link from 'next/link';
import { Card, Badge } from '@intelliflow/ui';
import developerGuidesJson from '@/data/developer-guides.json';
import { hasFields, isLinkCategory, isOneOf, parseJsonArray } from '@/lib/shared/json-data';

interface GuideCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  items: GuideItem[];
}

interface GuideItem {
  id: string;
  title: string;
  description: string;
  href: string;
  status: 'available' | 'coming-soon';
  external?: boolean;
}

const GUIDE_STATUSES: readonly GuideItem['status'][] = ['available', 'coming-soon'];

const isGuideItem = (value: unknown): boolean =>
  hasFields(
    value,
    { id: 'string', title: 'string', description: 'string', href: 'string' },
    { external: 'boolean' }
  ) && isOneOf(value.status, GUIDE_STATUSES);

/** The guide catalogue is content, kept in data/developer-guides.json. */
const GUIDE_CATEGORIES: GuideCategory[] = parseJsonArray<GuideCategory>(
  developerGuidesJson,
  'data/developer-guides.json',
  (value) => isLinkCategory(value, isGuideItem)
);

function StatusBadge({ status }: Readonly<{ status: 'available' | 'coming-soon' }>) {
  if (status === 'coming-soon') {
    return <Badge variant="warning">Coming Soon</Badge>;
  }
  return null;
}

export function GuidesList() {
  return (
    <div className="flex flex-col gap-8">
      {GUIDE_CATEGORIES.map((category) => {
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

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  >
                    {cardContent}
                    {isExternal && <span className="sr-only">(opens in new tab)</span>}
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
