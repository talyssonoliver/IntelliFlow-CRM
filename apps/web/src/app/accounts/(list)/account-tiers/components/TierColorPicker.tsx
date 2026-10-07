'use client';

import { useState } from 'react';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
} from '@intelliflow/ui';
import { ACCOUNT_TIER_COLOR_TOKENS, type AccountTierColorToken } from '@intelliflow/validators';
import { tierColorClasses } from '@/lib/accounts/tier-colors';

export interface TierColorPickerProps {
  readonly tierLabel: string;
  readonly value: AccountTierColorToken;
  readonly onChange: (token: AccountTierColorToken) => void;
  readonly disabled?: boolean;
}

/**
 * Colour swatch button that opens the 18-colour palette as a radio group
 * (arrow keys move, Enter/Space select, Escape closes and returns focus).
 */
export function TierColorPicker({ tierLabel, value, onChange, disabled }: TierColorPickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 w-9 p-0"
          disabled={disabled}
          aria-label={`Colour for ${tierLabel}: ${value}`}
        >
          <span
            className={`h-4 w-4 rounded-full ${tierColorClasses(value).dot}`}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3" align="start">
        <RadioGroup
          value={value}
          onValueChange={(token) => {
            onChange(token as AccountTierColorToken);
            setOpen(false);
          }}
          aria-label={`Colour for ${tierLabel}`}
          className="grid grid-cols-6 gap-2"
        >
          {ACCOUNT_TIER_COLOR_TOKENS.map((token) => (
            <RadioGroupItem
              key={token}
              value={token}
              aria-label={token}
              title={token}
              className={`h-7 w-7 rounded-full border-2 border-transparent data-[state=checked]:border-foreground ${tierColorClasses(token).dot}`}
            />
          ))}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
