import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fn` whenever `key` changes. Ignores stale responses so fast filter changes
 * cannot overwrite newer data with older results.
 */
export function useAsync(fn, key) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const requestId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === requestId.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === requestId.current) setState((prev) => ({ data: prev.data, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    run();
  }, [key, run]);

  return { ...state, reload: run };
}
