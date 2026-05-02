'use client';

import { useMemo, useState } from 'react';
import { Card, Button, Input, Popover, PopoverTrigger, PopoverContent } from '@intelliflow/ui';
import { CURRENCY_CODES, filterCurrencies, type CurrencyOption } from './currencies';

export interface CurrencySectionProps {
  value: string;
  onChange: (code: string) => void;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function CurrencySection({ value, onChange }: Readonly<CurrencySectionProps>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => filterCurrencies(query), [query]);
  const currentLabel = useMemo<CurrencyOption | undefined>(
    () => CURRENCY_CODES.find((c) => c.code === value),
    [value]
  );

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <Card className="lg:col-span-6 p-4 sm:p-5">
      <SectionHeader
        icon="attach_money"
        iconBg="bg-emerald-50 dark:bg-emerald-950"
        iconFg="text-emerald-600 dark:text-emerald-400"
        title="Display Currency"
        description="Currency used across all revenue analytics charts and exports."
      />

      <div className="space-y-2">
        <label htmlFor="currency-trigger" className="text-sm font-medium">
          Currency
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            {}
            <Button
              id="currency-trigger"
              variant="outline"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-label={`Select display currency, current value ${currentLabel?.code ?? value}`}
              className="w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{currentLabel?.code ?? value}</span>
                {currentLabel && (
                  <span className="text-muted-foreground"> — {currentLabel.name}</span>
                )}
              </span>
              <span className="material-symbols-outlined text-sm" aria-hidden="true">
                unfold_more
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="Search by code or name..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search currencies"
                className="h-9"
              />
            </div>
            {}
            <ul aria-label="Available currencies" className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No currencies match &quot;{query}&quot;
                </li>
              )}
              {filtered.map((c) => (
                <li key={c.code} aria-current={c.code === value ? 'true' : undefined}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.code)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-sm hover:bg-accent ${
                      c.code === value ? 'bg-accent/70 font-medium' : ''
                    }`}
                  >
                    <span className="font-mono">{c.code}</span>
                    <span className="text-muted-foreground ml-4">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </Card>
  );
}
