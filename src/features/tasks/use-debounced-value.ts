import { useEffect, useState } from "react";

/** Value that settles `delay` ms after the last change (search inputs → server queries). */
export const useDebouncedValue = <T,>(value: T, delay = 250): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
};
