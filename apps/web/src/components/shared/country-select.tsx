'use client';

/**
 * CountrySelect — ISO 3166-1 alpha-2 country picker (PG-197).
 *
 * The code list comes from the domain (`ISO_COUNTRY_CODES`, the 249 assigned
 * codes); display names are derived with `Intl.DisplayNames`, so no country
 * names are hard-coded here. Returns the code via `onChange`; the optional
 * "No country" entry clears the field (`null`).
 */

import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@intelliflow/ui';
import { ISO_COUNTRY_CODES } from '@intelliflow/domain';

export interface CountrySelectProps {
  id?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  placeholder?: string;
  /** Show a "No country" entry that clears the value. */
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
}

const CLEAR_VALUE = '__none__';

export interface CountryOption {
  code: string;
  label: string;
}

/** Country options sorted by English display name. */
export function getCountryOptions(locale = 'en'): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return ISO_COUNTRY_CODES.map((code) => ({ code, label: names.of(code) ?? code })).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

/** Display name of a code, falling back to the code itself. */
export function countryLabel(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountrySelect({
  id,
  value,
  onChange,
  ariaLabel,
  ariaInvalid,
  ariaDescribedBy,
  placeholder = 'Select a country',
  allowClear = true,
  disabled,
  className,
}: Readonly<CountrySelectProps>) {
  const options = useMemo(() => getCountryOptions(), []);

  return (
    <Select
      value={value ?? (allowClear ? CLEAR_VALUE : '')}
      onValueChange={(next) => onChange(next === CLEAR_VALUE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowClear && <SelectItem value={CLEAR_VALUE}>No country</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.code} value={option.code}>
            {option.label} ({option.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
