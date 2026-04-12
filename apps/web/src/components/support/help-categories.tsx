'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from '@intelliflow/ui';
import type { HelpCategory } from '@/lib/support/help-categories';

export interface HelpCategoriesProps {
  categories: HelpCategory[];
}

export function HelpCategories({ categories }: Readonly<HelpCategoriesProps>) {
  if (categories.length === 0) {
    return <EmptyState entity="search" phase="passive" />;
  }

  const sorted = [...categories].sort((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1;
    return a.order - b.order;
  });

  return (
    <ul
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-label="Help categories"
    >
      {sorted.map((category) => (
        <li key={category.id}>
          <Link
            href={category.href}
            className="group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
          >
            <Card className="h-full transition-colors hover:border-primary/50 dark:hover:border-primary/50 group-focus-visible:border-primary">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${category.color} dark:opacity-90`}
                    >
                      <span
                        className="material-symbols-outlined text-white text-xl"
                        aria-hidden="true"
                      >
                        {category.icon}
                      </span>
                    </div>
                    <CardTitle className="text-base font-semibold text-foreground dark:text-foreground">
                      {category.title}
                    </CardTitle>
                  </div>
                  {category.popular && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      Popular
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-3">
                  {category.description}
                </p>
                <span className="text-xs text-muted-foreground dark:text-muted-foreground">
                  {category.articleCount} {category.articleCount === 1 ? 'article' : 'articles'}
                </span>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
