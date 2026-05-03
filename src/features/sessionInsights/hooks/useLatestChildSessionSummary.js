import { useEffect, useState } from 'react';
import { getLatestChildSessionSummary } from '../services/sessionInsightsApi';

export function useLatestChildSessionSummary(childId) {
  const [state, setState] = useState({ loading: false, error: '', summary: null });

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!childId) {
        if (!disposed) setState({ loading: false, error: '', summary: null });
        return;
      }
      if (!disposed) setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const result = await getLatestChildSessionSummary(childId);
        if (!disposed) setState({ loading: false, error: '', summary: result.summary || null });
      } catch (error) {
        if (!disposed) setState({ loading: false, error: String(error?.message || error || 'Could not load latest summary.'), summary: null });
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, [childId]);

  return state;
}

export default useLatestChildSessionSummary;