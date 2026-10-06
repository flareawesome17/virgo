import { useEffect, useState } from 'react';

/**
 * The value, once it has stopped changing for `delay` ms.
 *
 * For search boxes wired to a query key: without it the list refetches on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
