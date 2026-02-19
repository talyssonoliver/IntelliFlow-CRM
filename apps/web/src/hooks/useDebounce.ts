import { useState, useEffect } from 'react';

/**
 * Debounces a value by a specified delay.
 * Returns the debounced value that only updates after the delay has passed
 * without the input value changing.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
