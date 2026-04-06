'use client';

/**
 * Settings Navigation Component
 *
 * Renders categorized settings cards with filtering support.
 * Part of PG-104 (Settings Home).
 */

import Link from 'next/link';
import { Card, EmptyState } from '@intelliflow/ui';
import { getResolvedCategories } from '@/lib/shared/settings-search';

export interface SettingsNavProps {
  searchQuery?: string;
  className?: string;
}

export function SettingsNav({ searchQuery, className }: Readonly<SettingsNavProps>) {
  const categories = getResolvedCategories(searchQuery);

  if (categories.length === 0) {
    return (
      <output
        className={className}
        aria-live="polite"
      >
        <EmptyState entity="search" phase="passive" />
      </output>
    );
  }

  return (
    <div className={className}>
      {categories.map((category) => (
        <div key={category.id} className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {category.title}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {category.items.map((item) => (
              <Link key={item.id} href={item.href} className="group">
                <Card className="p-4 h-full hover:border-primary hover:shadow-md transition-all">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 ${item.color} rounded-lg flex items-center justify-center flex-shrink-0`}
                    >
                      <span className="material-symbols-outlined text-xl text-primary-foreground">
                        {item.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all text-lg mt-0.5">
                      chevron_right
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
