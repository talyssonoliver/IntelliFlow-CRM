import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import type { DocCategory } from '@/test/fixtures/docs-data';

interface DocsNavigationProps {
  categories: DocCategory[];
}

export function DocsNavigation({ categories }: Readonly<DocsNavigationProps>) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const linkProps = category.external
          ? { target: '_blank' as const, rel: 'noopener noreferrer' }
          : {};

        const isDisabled = category.comingSoon || category.external;

        const cardContent = (
          <Card
            className={`p-6 h-full transition-all ${
              isDisabled ? 'opacity-70 cursor-not-allowed' : 'hover:border-primary hover:shadow-md'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 ${category.color} rounded-lg flex items-center justify-center flex-shrink-0`}
              >
                <span className="material-symbols-outlined text-2xl text-white">
                  {category.icon}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2
                    className={`text-lg font-semibold text-foreground transition-colors ${
                      !isDisabled && 'group-hover:text-primary'
                    }`}
                  >
                    {category.title}
                  </h2>
                  {category.docCount != null && (
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {category.docCount}
                    </span>
                  )}
                  {category.comingSoon && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                      Coming Soon
                    </span>
                  )}
                  {category.external && (
                    <span className="text-xs font-medium text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                      External - Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
              </div>
              <span
                className={`material-symbols-outlined text-muted-foreground transition-all ${
                  !isDisabled && 'group-hover:text-primary group-hover:translate-x-1'
                }`}
              >
                chevron_right
              </span>
            </div>
          </Card>
        );

        if (isDisabled) {
          return <div key={category.id}>{cardContent}</div>;
        }

        return (
          <Link key={category.id} href={category.href} className="group" {...linkProps}>
            {cardContent}
          </Link>
        );
      })}
    </div>
  );
}
