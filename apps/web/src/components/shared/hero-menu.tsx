'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@intelliflow/ui';
import { heroActionClassName } from './page-header';

export interface HeroMenuItem {
  value: string;
  label: string;
  /** Material Symbols icon name */
  icon?: string;
}

/**
 * A button on the page hero that opens a short menu (owner 22/11 on Analytics: "Unify this time
 * picker because it is too different from the button"). The period picker and Export use the same
 * control, so every hero dropdown looks like the hero's buttons.
 *
 * With `value`, it is a picker: the button shows the chosen item and the menu ticks it.
 * Without, it is an action menu: the button shows `label`.
 */
export function HeroMenu({
  label,
  icon,
  items,
  value,
  onSelect,
  variant = 'secondary',
  heading,
  ariaLabel,
}: Readonly<{
  label: string;
  icon?: string;
  items: readonly HeroMenuItem[];
  value?: string;
  onSelect: (value: string) => void;
  variant?: 'primary' | 'secondary';
  /** Small heading above the items, e.g. "CSV export" */
  heading?: string;
  ariaLabel?: string;
}>) {
  const [open, setOpen] = useState(false);
  const picked = value === undefined ? undefined : items.find((i) => i.value === value);
  const shown = picked?.label ?? label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={heroActionClassName(variant)}
          aria-label={ariaLabel ? `${ariaLabel}: ${shown}` : undefined}
        >
          {icon && (
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="whitespace-nowrap">{shown}</span>
          <span
            className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            expand_more
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 overflow-hidden p-0">
        <div className="py-1" role="menu">
          {heading && (
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {heading}
            </div>
          )}
          {items.map((item) => {
            const selected = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role={value === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={value === undefined ? undefined : selected}
                onClick={() => {
                  setOpen(false);
                  onSelect(item.value);
                }}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-sm text-foreground transition-colors hover:bg-muted"
              >
                {item.icon && (
                  <span
                    className="material-symbols-outlined text-lg text-muted-foreground"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                )}
                <span className="flex-1 text-left">{item.label}</span>
                {selected && (
                  <span
                    className="material-symbols-outlined text-lg text-ds-primary"
                    aria-hidden="true"
                  >
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
