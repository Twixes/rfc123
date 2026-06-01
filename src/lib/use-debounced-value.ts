"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value`, but trailing-edge: only updates after `value` has been
 * stable for `delayMs`. Cheap and dependency-free; suitable for keystroke-
 * driven inputs that feed expensive downstream computations.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
