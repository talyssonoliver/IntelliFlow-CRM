'use client';

/**
 * Settings Home Page
 *
 * Central hub for all application settings with organized navigation,
 * client-side search, and recent changes section.
 * Part of PG-104 (Settings Home).
 */

import { useState, useDeferredValue, useCallback } from 'react';
import { SearchInput } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared';
import { SettingsNav } from '@/components/shared/settings-nav';
import { SETTINGS_ITEMS, filterSettings } from '@/lib/shared/settings-search';

export default function SettingsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDeferredValue(searchQuery);

  const filteredCount = debouncedQuery
    ? filterSettings(debouncedQuery, SETTINGS_ITEMS).length
    : SETTINGS_ITEMS.length;

  const handleClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClear();
      }
    },
    [handleClear]
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Settings' }]}
        title="Settings"
        description="Manage your account, team, and application settings"
      />

      {/* Search */}
      <div role="search" aria-label="Search settings">
        <SearchInput
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={handleClear}
          onKeyDown={handleKeyDown}
          placeholder="Search settings..."
          aria-label="Search settings"
        />
        <div aria-live="polite" className="sr-only">
          {(() => {
            if (!debouncedQuery) return '';
            const plural = filteredCount === 1 ? '' : 's';
            return `${filteredCount} setting${plural} found`;
          })()}
        </div>
      </div>

      {/* Navigation Cards */}
      <SettingsNav searchQuery={debouncedQuery} />

      {/* Recent Changes */}
      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recent Changes
        </h2>
        <p className="text-sm text-muted-foreground">No recent changes</p>
      </div>
    </div>
  );
}
