'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';

/**
 * The ⓘ next to a metric that says exactly how it is calculated (owner 26/11, Analytics mockup:
 * every KPI carries its definition, e.g. "Sum of won deal values by close date; not cash
 * collected"). A 44px tap target; the text opens in a popover.
 */
export function MetricDefinition({
  label,
  definition,
}: Readonly<{ label: string; definition: string }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Definition of ${label}`}
          className="-m-3 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            info
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="mt-1 text-muted-foreground">{definition}</p>
      </PopoverContent>
    </Popover>
  );
}
