import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi } from './apiClient';

export const useFeatureQuery = <T,>(endpoint: string, initialValue: T) => {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getApi<T>(endpoint, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load data');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return useMemo(() => ({ data, loading, error, reload, setData }), [data, loading, error, reload]);
};
