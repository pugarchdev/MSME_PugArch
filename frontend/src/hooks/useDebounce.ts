import { useEffect, useState } from 'react';

/**
 * Custom hook to debounce any rapid changes to a state value.
 * Commonly used for inputs that trigger search API queries.
 * 
 * @param value The value to debounce
 * @param delay The delay in milliseconds (default: 400ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

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
