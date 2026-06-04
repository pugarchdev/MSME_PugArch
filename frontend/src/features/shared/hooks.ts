import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getApi, normalizeList, normalizePaginated, peekApi } from './apiClient';

export type ViewMode = 'list' | 'grid';

export const useResponsiveViewMode = (storageKey?: string) => {
  const [viewMode, setViewModeState] = useState<ViewMode>('list');
  const hasManualSelection = useRef(false);

  useEffect(() => {
    const savedMode = storageKey ? window.localStorage.getItem(storageKey) : null;
    if (savedMode === 'list' || savedMode === 'grid') {
      hasManualSelection.current = true;
      setViewModeState(savedMode);
      return;
    }

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const applyDeviceDefault = () => {
      if (!hasManualSelection.current) {
        setViewModeState(mobileQuery.matches ? 'grid' : 'list');
      }
    };

    applyDeviceDefault();
    mobileQuery.addEventListener('change', applyDeviceDefault);
    return () => mobileQuery.removeEventListener('change', applyDeviceDefault);
  }, [storageKey]);

  const setViewMode = useCallback((mode: ViewMode) => {
    hasManualSelection.current = true;
    if (storageKey) window.localStorage.setItem(storageKey, mode);
    setViewModeState(mode);
  }, [storageKey]);

  return [viewMode, setViewMode] as const;
};

/**
 * useFeatureQuery - drop-in replacement that now uses React Query under the
 * hood, so every page using this hook gets:
 *   - Cached data that survives unmount/remount (instant when revisiting)
 *   - Background revalidation while showing stale data
 *   - Consistent loading state (`loading` only true when there is no data yet)
 *
 * The public shape ({ data, loading, error, reload, setData }) is unchanged so
 * existing call sites work without modification.
 */
export const useFeatureQuery = <T,>(endpoint: string, initialValue: T) => {
  const isArray = Array.isArray(initialValue);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['feature-query', endpoint] as const, [endpoint]);

  const query = useQuery<T>({
    queryKey,
    queryFn: async () => {
      const result = await getApi<T>(endpoint, false);
      return (isArray ? (normalizeList(result) as T) : (result as T));
    },
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      const cached = peekApi<T>(endpoint);
      if (cached !== null) {
        return (isArray ? (normalizeList(cached) as any) : (cached as any));
      }
      return undefined;
    },
    // Inherit the global staleTime/gcTime defaults from QueryClient. Those
    // are tuned (15 min stale, 60 min gc) so revisiting a feature page
    // within a session is instant. Hardcoding shorter windows here would
    // override that and reintroduce the spinner-on-back-nav behavior.
    retry: 2
  });

  // Keep an "override" data snapshot so callers using `setData(...)` to apply
  // optimistic updates don't get overridden by the next refetch.
  const [override, setOverride] = useState<T | null>(null);
  const data = (override ?? query.data ?? initialValue) as T;

  const setData = useCallback(
    (next: T | ((prev: T) => T)) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(data) : next;
      setOverride(value);
      queryClient.setQueryData(queryKey, value);
    },
    [data, queryClient, queryKey]
  );

  const reload = useCallback(async () => {
    setOverride(null);
    await query.refetch();
  }, [query]);

  // `loading` should only be true when we have no data at all. Background
  // refetches must not blank the UI - that's the whole point of caching.
  const loading = query.isLoading && query.data === undefined && override === null;
  const error = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;

  return useMemo(() => ({ data, loading, refreshing: query.isFetching, error, reload, setData }), [data, loading, query.isFetching, error, reload, setData]);
};

const endpointWithParams = (endpoint: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const glue = endpoint.includes('?') ? '&' : '?';
  const queryString = query.toString();
  return queryString ? `${endpoint}${glue}${queryString}` : endpoint;
};

/**
 * usePaginatedFeatureQuery - same retrofit as useFeatureQuery, with
 * `placeholderData` so the previous page stays visible while the next page
 * loads (no blank state during pagination).
 */
export const usePaginatedFeatureQuery = <T,>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  pageSizeDefault = 10,
) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(pageSizeDefault);
  const paramsKey = JSON.stringify(params);

  const requestEndpoint = useMemo(
    () => endpointWithParams(endpoint, { ...params, skip: (page - 1) * pageSize, take: pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paramsKey is the stable form of params
    [endpoint, page, pageSize, paramsKey]
  );

  const query = useQuery({
    queryKey: ['paginated-feature-query', requestEndpoint] as const,
    queryFn: async () => {
      const body = await getApi<unknown>(requestEndpoint, false);
      return normalizePaginated<T>(body);
    },
    // Inherit global staleTime/gcTime so paginated lists stay cached for
    // the session. placeholderData keeps the previous page visible while
    // a new page loads, so pagination doesn't flash a blank state.
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      const cached = peekApi<unknown>(requestEndpoint);
      if (cached !== null) {
        return normalizePaginated<T>(cached);
      }
      return undefined;
    },
    retry: 2
  });

  const records = (query.data?.records ?? []) as T[];
  const total = query.data?.total ?? 0;
  const loading = query.isLoading && query.data === undefined;
  const error = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;

  const reload = useCallback(async () => {
    await query.refetch();
  }, [query]);

  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only reset page on filter change
  }, [endpoint, pageSize, paramsKey]);

  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  }, []);

  // For setRecords to feel sensible we expose a no-op-friendly setter that
  // overrides the cached page; useful for optimistic delete/edit flows.
  const queryClient = useQueryClient();
  const setRecords = useCallback(
    (next: T[] | ((prev: T[]) => T[])) => {
      queryClient.setQueryData(['paginated-feature-query', requestEndpoint], (prev: any) => {
        const previous = (prev?.records ?? []) as T[];
        const value = typeof next === 'function' ? (next as (p: T[]) => T[])(previous) : next;
        return { ...(prev || { total }), records: value };
      });
    },
    [queryClient, requestEndpoint, total]
  );

  return useMemo(
    () => ({
      records,
      loading,
      refreshing: query.isFetching,
      error,
      reload,
      setRecords,
      page,
      pageSize,
      total,
      setPage,
      setPageSize
    }),
    [records, loading, query.isFetching, error, reload, setRecords, page, pageSize, total, setPageSize]
  );
};

export const usePagination = <T,>(items: T[], pageSizeDefault = 10) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(pageSizeDefault);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  }, []);

  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );

  return { page: currentPage, pageSize, total, pageItems, setPage, setPageSize };
};
