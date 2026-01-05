'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Material Symbols icon name (default: "search") */
  icon?: string;
  /** Whether to show clear button when input has value */
  showClear?: boolean;
  /** Callback when clear button is clicked */
  onClear?: () => void;
  /** Loading state - shows spinner instead of search icon */
  isLoading?: boolean;
  /** Container className for the wrapper div */
  containerClassName?: string;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      icon = 'search',
      showClear = true,
      onClear,
      isLoading = false,
      containerClassName,
      value,
      onChange,
      disabled,
      ...props
    },
    ref
  ) => {
    const hasValue = value !== undefined && value !== '';

    const handleClear = React.useCallback(() => {
      if (onClear) {
        onClear();
      } else if (onChange) {
        // Create a synthetic event to clear the input
        const syntheticEvent = {
          target: { value: '' },
          currentTarget: { value: '' },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    }, [onClear, onChange]);

    return (
      <div
        className={cn('relative flex-1', containerClassName)}
        role="search"
      >
        {/* Search/Loading Icon */}
        <span
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
            isLoading && 'animate-spin'
          )}
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-lg">
            {isLoading ? 'progress_activity' : icon}
          </span>
        </span>

        {/* Input */}
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={onChange}
          disabled={disabled || isLoading}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background text-sm ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'pl-10', // Space for search icon
            showClear && hasValue ? 'pr-10' : 'pr-4', // Space for clear button if showing
            // Remove browser default search styling
            '[&::-webkit-search-cancel-button]:hidden',
            '[&::-webkit-search-decoration]:hidden',
            className
          )}
          {...props}
        />

        {/* Clear Button */}
        {showClear && hasValue && !disabled && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'text-muted-foreground hover:text-foreground',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'rounded-sm transition-colors'
            )}
            aria-label="Clear search"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';

export { SearchInput };
