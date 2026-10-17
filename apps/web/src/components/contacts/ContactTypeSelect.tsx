'use client';

/**
 * Contact type picker for New and Edit Contact (PG-205). A native <select>, like
 * the other fields in both forms: "No type", the tenant's active types, and — so
 * an edit never silently changes it — the stored key when its type is inactive or
 * gone, labelled "(inactive)". A failed fetch shows one alert with Retry and never
 * blocks saving (the type is optional).
 */
import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';

/** The picker list rarely changes; settings mutations invalidate it (NF-002). */
export const CONTACT_TYPES_STALE_TIME_MS = 5 * 60 * 1000;

const DEFAULT_SELECT_CLASS =
  'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer transition-shadow';

export interface ContactTypeSelectProps {
  id: string;
  /** The selected type key, or '' for no type. */
  value: string;
  onChange: (key: string) => void;
  label?: string;
  labelClassName?: string;
  selectClassName?: string;
  /** New Contact: preselect the tenant default once loaded, unless the user already chose. */
  preselectDefault?: boolean;
}

export function ContactTypeSelect({
  id,
  value,
  onChange,
  label = 'Contact type',
  labelClassName = 'block text-sm font-semibold text-slate-700 dark:text-slate-300',
  selectClassName = DEFAULT_SELECT_CLASS,
  preselectDefault = false,
}: Readonly<ContactTypeSelectProps>) {
  const query = trpc.contactTypes.listActive.useQuery(
    { includeInactive: true },
    { staleTime: CONTACT_TYPES_STALE_TIME_MS }
  );
  const types = query.data ?? [];
  const touched = useRef(false);
  const defaultKey = types.find((t) => t.isDefault && t.isActive)?.key;

  useEffect(() => {
    if (preselectDefault && !touched.current && value === '' && defaultKey) onChange(defaultKey);
  }, [preselectDefault, value, defaultKey, onChange]);

  const active = types.filter((t) => t.isActive);
  const stored = value && !active.some((t) => t.key === value) ? value : null;
  const storedName = stored ? (types.find((t) => t.key === stored)?.name ?? stored) : null;
  const hintId = `${id}-inactive-hint`;
  const errorId = `${id}-types-error`;
  const describedBy = [stored ? hintId : null, query.isError ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          touched.current = true;
          onChange(e.target.value);
        }}
        aria-describedby={describedBy || undefined}
        className={selectClassName}
      >
        <option value="">{query.isLoading ? 'Loading types…' : 'No type'}</option>
        {active.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
          </option>
        ))}
        {stored && <option value={stored}>{`${storedName} (inactive)`}</option>}
      </select>
      {stored && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          This type is inactive; saving keeps it. Choose another type to change it.
        </p>
      )}
      {query.isError && (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-2 text-xs text-red-700 dark:text-red-300"
        >
          <span>Contact types could not be loaded. You can still save without a type.</span>
          <button
            type="button"
            className="font-medium underline"
            aria-label="Retry loading contact types"
            onClick={() => query.refetch()}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
