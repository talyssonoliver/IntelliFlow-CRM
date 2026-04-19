'use client';

// Currency Tab — PG-187
// Popover + Input + filtered-list pattern (no Combobox primitive in @intelliflow/ui).

import { useMemo, useState } from 'react';
import { Card, Button, Input, Popover, PopoverTrigger, PopoverContent } from '@intelliflow/ui';
import { CURRENCY_CODES, filterCurrencies, type CurrencyOption } from './currencies';

export interface CurrencyTabProps {
  value: string;
  onChange: (code: string) => void;
}

export function CurrencyTab({ value, onChange }: Readonly<CurrencyTabProps>) {
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
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Display Currency</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Currency used across all revenue analytics charts and exports.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="currency-trigger" className="text-sm font-medium">
          Currency
        </label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="currency-trigger"
              variant="outline"
              role="combobox"
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
            <ul
              role="listbox"
              aria-label="Available currencies"
              className="max-h-64 overflow-y-auto p-1"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">
                  No currencies match &quot;{query}&quot;
                </li>
              )}
              {filtered.map((c) => (
                <li key={c.code} role="option" aria-selected={c.code === value}>
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
