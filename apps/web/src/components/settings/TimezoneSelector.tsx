'use client';

/**
 * TimezoneSelector
 *
 * A grouped IANA timezone picker with browser detection.
 *
 * Task: IFC-191 — User Timezone Support
 */

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Button,
} from '@intelliflow/ui';

interface TimezoneSelectorProps {
  value: string;
  onChange: (timezone: string) => void;
  disabled?: boolean;
}

/** Curated fallback list when Intl.supportedValuesOf is unavailable */
const FALLBACK_TIMEZONES = [
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'Europe/Istanbul',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
];

function getTimezones(): string[] {
  let list: string[];
  try {
    if (typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list = (Intl as any).supportedValuesOf('timeZone') as string[];
    } else {
      list = [...FALLBACK_TIMEZONES];
    }
  } catch {
    list = [...FALLBACK_TIMEZONES];
  }
  // Ensure UTC is always available (some runtimes omit it from supportedValuesOf)
  if (!list.includes('UTC')) {
    list.unshift('UTC');
  }
  return list;
}

function groupByRegion(timezones: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const tz of timezones) {
    const region = tz.includes('/') ? tz.split('/')[0] : 'Other';
    if (!groups[region]) {
      groups[region] = [];
    }
    groups[region].push(tz);
  }

  return groups;
}

function formatTimezoneLabel(tz: string): string {
  const city = tz.includes('/') ? tz.split('/').slice(1).join('/').replaceAll('_', ' ') : tz;
  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value;
    return `${city} (${offset ?? tz})`;
  } catch {
    return city;
  }
}

export function TimezoneSelector({ value, onChange, disabled }: Readonly<TimezoneSelectorProps>) {
  const grouped = useMemo(() => {
    const tzList = getTimezones();
    return groupByRegion(tzList);
  }, []);

  const regionOrder = ['Europe', 'America', 'Asia', 'Africa', 'Australia', 'Pacific', 'Other'];
  const sortedRegions = regionOrder.filter((r) => grouped[r]?.length);
  // Include any regions not in the predefined order
  for (const region of Object.keys(grouped)) {
    if (!sortedRegions.includes(region)) {
      sortedRegions.push(region);
    }
  }

  const detectBrowserTimezone = () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        onChange(tz);
      }
    } catch {
      // Ignore detection failure
    }
  };

  return (
    <div className="space-y-2">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label="Timezone" className="w-full">
          <SelectValue placeholder="Select timezone" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {sortedRegions.map((region) => (
            <SelectGroup key={region}>
              <SelectLabel>{region}</SelectLabel>
              {grouped[region].map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {formatTimezoneLabel(tz)}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={detectBrowserTimezone}
        disabled={disabled}
      >
        Detect from browser
      </Button>
    </div>
  );
}
