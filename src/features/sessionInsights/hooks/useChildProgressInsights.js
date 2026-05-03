import { useEffect, useState } from 'react';
import { getChildProgressInsights } from '../services/sessionInsightsApi';

export function useChildProgressInsights(childId, options = {}) {
  const [state, setState] = useState({ loading: false, error: '', data: null });

  useEffect(() => {
    let disposed = false;
    async function load() {
      if (!childId) {
        if (!disposed) setState({ loading: false, error: '', data: null });
        return;
      }
      if (!disposed) setState((current) => ({ ...current, loading: true, error: '' }));
      try {
        const result = await getChildProgressInsights(childId, options);
        if (!disposed) setState({ loading: false, error: '', data: result || null });
      } catch (error) {
        if (!disposed) setState({ loading: false, error: String(error?.message || error || 'Could not load child insights.'), data: null });
      }
    }
    load();
    return () => {
      disposed = true;
    };
  }, [childId, JSON.stringify(options || {})]);

  return state;
}

export default useChildProgressInsights;