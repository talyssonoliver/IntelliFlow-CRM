'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Badge } from '@intelliflow/ui';
import type { DocumentSearchProps, DocumentStatus, DocumentClassification } from './types';

// =============================================================================
// DocumentSearch Component
// =============================================================================

const STATUS_OPTIONS: { value: DocumentStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'UNDER_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SIGNED', label: 'Signed' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'SUPERSEDED', label: 'Superseded' },
];

const CLASSIFICATION_OPTIONS: { value: DocumentClassification; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
  { value: 'PRIVILEGED', label: 'Privileged' },
];

const FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'word', label: 'Word' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
  { value: 'image', label: 'Image' },
  { value: 'text', label: 'Text' },
];

const DEBOUNCE_MS = 300;

export function DocumentSearch({
  onSearch,
  onFilterChange,
  activeFilters,
  resultCount,
}: DocumentSearchProps) {
  const [searchValue, setSearchValue] = useState(activeFilters.query ?? '');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── Debounced Search ─────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(searchValue);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue, onSearch]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        onSearch(searchValue);
      }
    },
    [searchValue, onSearch]
  );

  const clearSearch = useCallback(() => {
    setSearchValue('');
    onSearch('');
  }, [onSearch]);

  // ─── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Close dropdown on Escape ─────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Filter Toggles ──────────────────────────────────────────────────────

  const toggleStatusFilter = useCallback(
    (status: DocumentStatus) => {
      const current = activeFilters.status ?? [];
      const updated = current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status];
      onFilterChange({ ...activeFilters, status: updated.length > 0 ? updated : undefined });
    },
    [activeFilters, onFilterChange]
  );

  const toggleClassificationFilter = useCallback(
    (classification: DocumentClassification) => {
      const current = activeFilters.classification ?? [];
      const updated = current.includes(classification)
        ? current.filter((c) => c !== classification)
        : [...current, classification];
      onFilterChange({
        ...activeFilters,
        classification: updated.length > 0 ? updated : undefined,
      });
    },
    [activeFilters, onFilterChange]
  );

  const toggleFileTypeFilter = useCallback(
    (fileType: string) => {
      const current = activeFilters.fileType ?? [];
      const updated = current.includes(fileType)
        ? current.filter((ft) => ft !== fileType)
        : [...current, fileType];
      onFilterChange({ ...activeFilters, fileType: updated.length > 0 ? updated : undefined });
    },
    [activeFilters, onFilterChange]
  );

  const clearAllFilters = useCallback(() => {
    setSearchValue('');
    onSearch('');
    onFilterChange({});
  }, [onSearch, onFilterChange]);

  // ─── Active Filter Chips ──────────────────────────────────────────────────

  const hasActiveFilters =
    (activeFilters.status?.length ?? 0) > 0 ||
    (activeFilters.classification?.length ?? 0) > 0 ||
    (activeFilters.fileType?.length ?? 0) > 0 ||
    activeFilters.dateRange !== undefined;

  // ─── Dropdown Renderer ────────────────────────────────────────────────────

  const renderDropdown = (
    id: string,
    label: string,
    options: { value: string; label: string }[],
    activeValues: string[] | undefined,
    onToggle: (value: string) => void
  ) => {
    const isOpen = openDropdown === id;
    const count = activeValues?.length ?? 0;

    return (
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpenDropdown(isOpen ? null : id)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={count > 0 ? 'border-primary text-primary' : ''}
        >
          {label}
          {count > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-primary text-white">
              {count}
            </span>
          )}
          <span className="material-symbols-outlined text-[16px] ml-1">
            {isOpen ? 'expand_less' : 'expand_more'}
          </span>
        </Button>
        {isOpen && (
          <div
            className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20 py-2"
            role="listbox"
            aria-label={`${label} filter options`}
          >
            {options.map((opt) => {
              const isActive = activeValues?.includes(opt.value) ?? false;
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggle(opt.value)}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3" data-testid="document-search">
      {/* Search Input + Filter Buttons */}
      <div className="flex flex-wrap items-center gap-3" ref={dropdownRef}>
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-slate-400">
            search
          </span>
          <input
            type="search"
            role="searchbox"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search documents..."
            className="w-full pl-10 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
            aria-label="Search documents"
          />
          {searchValue && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {renderDropdown('status', 'Status', STATUS_OPTIONS, activeFilters.status, (v) =>
          toggleStatusFilter(v as DocumentStatus)
        )}
        {renderDropdown(
          'classification',
          'Classification',
          CLASSIFICATION_OPTIONS,
          activeFilters.classification,
          (v) => toggleClassificationFilter(v as DocumentClassification)
        )}
        {renderDropdown(
          'fileType',
          'File Type',
          FILE_TYPE_OPTIONS,
          activeFilters.fileType,
          toggleFileTypeFilter
        )}
      </div>

      {/* Active Filter Chips + Result Count */}
      <div className="flex flex-wrap items-center gap-2">
        {activeFilters.status?.map((status) => {
          const opt = STATUS_OPTIONS.find((o) => o.value === status);
          return (
            <Badge key={`status-${status}`} variant="secondary" className="flex items-center gap-1">
              {opt?.label ?? status}
              <button
                onClick={() => toggleStatusFilter(status)}
                className="ml-1 hover:text-red-500"
                aria-label={`Remove ${opt?.label ?? status} filter`}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </Badge>
          );
        })}

        {activeFilters.classification?.map((cls) => {
          const opt = CLASSIFICATION_OPTIONS.find((o) => o.value === cls);
          return (
            <Badge key={`cls-${cls}`} variant="secondary" className="flex items-center gap-1">
              {opt?.label ?? cls}
              <button
                onClick={() => toggleClassificationFilter(cls)}
                className="ml-1 hover:text-red-500"
                aria-label={`Remove ${opt?.label ?? cls} filter`}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </Badge>
          );
        })}

        {activeFilters.fileType?.map((ft) => {
          const opt = FILE_TYPE_OPTIONS.find((o) => o.value === ft);
          return (
            <Badge key={`ft-${ft}`} variant="secondary" className="flex items-center gap-1">
              {opt?.label ?? ft}
              <button
                onClick={() => toggleFileTypeFilter(ft)}
                className="ml-1 hover:text-red-500"
                aria-label={`Remove ${opt?.label ?? ft} filter`}
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </Badge>
          );
        })}

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-primary hover:text-primary/80 font-medium"
            data-testid="clear-all-filters"
          >
            Clear all
          </button>
        )}

        {resultCount !== undefined && (
          <span className="ml-auto text-sm text-slate-500" data-testid="result-count">
            {resultCount === 0
              ? 'No results'
              : `${resultCount} result${resultCount === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
    </div>
  );
}
