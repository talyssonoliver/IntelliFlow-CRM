'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@intelliflow/ui';
import { Badge } from '@intelliflow/ui';
import type { HelpCategory } from '@/lib/support/help-categories';

export interface HelpCategoriesProps {
  categories: HelpCategory[];
}

export function HelpCategories({ categories }: HelpCategoriesProps) {
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-muted-foreground mb-3">
          search_off
        </span>
        <p className="text-muted-foreground text-lg">No results found</p>
        <p className="text-muted-foreground text-sm mt-1">Try adjusting your search terms</p>
      </div>
    );
  }

  const sorted = [...categories].sort((a, b) => {
    if (a.popular !== b.popular) return a.popular ? -1 : 1;
    return a.order - b.order;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((category) => (
        <Link
          key={category.id}
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
                    <span className="material-symbols-outlined text-white text-xl">
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
      ))}
    </div>
  );
}
