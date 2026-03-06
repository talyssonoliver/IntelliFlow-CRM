'use client';

import { useState, useMemo } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { HelpSearch, HelpCategories } from '@/components/support';
import { DEFAULT_HELP_CATEGORIES } from '@/lib/support/help-categories';

export default function HelpCenterPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!searchQuery) {
      return [...DEFAULT_HELP_CATEGORIES];
    }

    const query = searchQuery.toLowerCase();
    return DEFAULT_HELP_CATEGORIES.filter(
      (category) =>
        category.title.toLowerCase().includes(query) ||
        category.description.toLowerCase().includes(query) ||
        category.keywords.some((keyword) => keyword.toLowerCase().includes(query))
    );
  }, [searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <PageHeader
          title="Help Center"
          description="Find answers, guides, and documentation for IntelliFlow CRM"
          breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Help Center' }]}
        />

        <div className="mb-6">
          <HelpSearch
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={searchQuery ? filteredCategories.length : undefined}
          />
        </div>

        <HelpCategories categories={filteredCategories} />
      </div>
    </div>
  );
}
