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

const featureQueryGlobalCache = new Map<string, any>();
const paginatedQueryGlobalCache = new Map<string, any>();

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
  const initialValueRef = useRef(initialValue);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['feature-query', endpoint] as const, [endpoint]);

  const getCachedData = useCallback((): T => {
    if (featureQueryGlobalCache.has(endpoint)) {
      return featureQueryGlobalCache.get(endpoint);
    }
    const rqCached = queryClient.getQueryData<T>(queryKey);
    if (rqCached !== undefined) {
      return rqCached;
    }
    const cached = peekApi<T>(endpoint);
    if (cached !== null) {
      const normalized = (isArray ? (normalizeList(cached) as any) : (cached as any)) as T;
      featureQueryGlobalCache.set(endpoint, normalized);
      return normalized;
    }
    return initialValueRef.current;
  }, [endpoint, queryClient, queryKey, isArray]);

  const [localData, setLocalData] = useState<T>(getCachedData);

  useEffect(() => {
    setLocalData(getCachedData());
  }, [endpoint, getCachedData]);

  const query = useQuery<T, Error, T, typeof queryKey>({
    queryKey,
    queryFn: async () => {
      const result = await getApi<T>(endpoint, false);
      const normalized = (isArray ? (normalizeList(result) as T) : (result as T));
      featureQueryGlobalCache.set(endpoint, normalized);
      return normalized;
    },
    placeholderData: ((previous: any) => {
      if (previous !== undefined) return previous;
      return getCachedData();
    }) as any,
    retry: 2
  });

  useEffect(() => {
    if (query.data !== undefined) {
      setLocalData(query.data);
    }
  }, [query.data]);

  // Keep an "override" data snapshot so callers using `setData(...)` to apply
  // optimistic updates don't get overridden by the next refetch.
  const [override, setOverride] = useState<T | null>(null);
  const data = (override ?? query.data ?? localData) as T;

  const setData = useCallback(
    (next: T | ((prev: T) => T)) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(data) : next;
      setOverride(value);
      featureQueryGlobalCache.set(endpoint, value);
      queryClient.setQueryData(queryKey, value);
      setLocalData(value);
    },
    [data, queryClient, queryKey, endpoint]
  );

  const reload = useCallback(async () => {
    setOverride(null);
    await query.refetch();
  }, [query]);

  // `loading` should only be true when we have no data at all. Background
  // refetches must not blank the UI - that's the whole point of caching.
  const hasData = data !== undefined && data !== null && (!isArray || (data as any).length > 0 || featureQueryGlobalCache.has(endpoint));
  const loading = query.isLoading && !hasData && override === null;
  const error = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;

  return useMemo(() => ({ data, loading, refreshing: query.isFetching, error, reload, setData }), [data, loading, query.isFetching, error, reload, setData]);
};

const endpointWithParams = (endpoint: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  const sortedEntries = Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, value] of sortedEntries) {
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
  
  // Sort parameters alphabetically by key to ensure stable query strings
  const paramsKey = useMemo(() => {
    const sortedParams: Record<string, any> = {};
    Object.keys(params)
      .sort()
      .forEach((key) => {
        sortedParams[key] = params[key];
      });
    return JSON.stringify(sortedParams);
  }, [params]);

  const requestEndpoint = useMemo(
    () => endpointWithParams(endpoint, { ...params, skip: (page - 1) * pageSize, take: pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paramsKey is the stable form of params
    [endpoint, page, pageSize, paramsKey]
  );

  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['paginated-feature-query', requestEndpoint] as const, [requestEndpoint]);

  const getCachedData = useCallback(() => {
    if (paginatedQueryGlobalCache.has(requestEndpoint)) {
      return paginatedQueryGlobalCache.get(requestEndpoint);
    }
    const rqCached = queryClient.getQueryData<any>(queryKey);
    if (rqCached !== undefined) {
      return rqCached;
    }
    const cached = peekApi<unknown>(requestEndpoint);
    if (cached !== null) {
      const normalized = normalizePaginated<T>(cached);
      paginatedQueryGlobalCache.set(requestEndpoint, normalized);
      return normalized;
    }
    return undefined;
  }, [requestEndpoint, queryClient, queryKey]);

  const [localData, setLocalData] = useState<any>(getCachedData);

  // Sync state if requestEndpoint changes or cached data becomes available
  useEffect(() => {
    const cached = getCachedData();
    if (cached !== undefined) {
      setLocalData(cached);
    }
  }, [requestEndpoint, getCachedData]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const body = await getApi<unknown>(requestEndpoint, false);
      const normalized = normalizePaginated<T>(body);
      paginatedQueryGlobalCache.set(requestEndpoint, normalized);
      return normalized;
    },
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      return getCachedData();
    },
    retry: 2
  });

  useEffect(() => {
    if (query.data !== undefined) {
      setLocalData(query.data);
    }
  }, [query.data]);

  const data = query.data ?? localData;
  const records = (data?.records ?? []) as T[];
  const total = data?.total ?? 0;

  // loading is true ONLY if we have no records in both cache and current query data
  const hasData = data !== undefined && data !== null && (records.length > 0 || paginatedQueryGlobalCache.has(requestEndpoint));
  const loading = query.isLoading && !hasData;
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

  const setRecords = useCallback(
    (next: T[] | ((prev: T[]) => T[])) => {
      const currentRecords = records;
      const nextRecords = typeof next === 'function' ? (next as (p: T[]) => T[])(currentRecords) : next;
      const nextData = { total, records: nextRecords };
      paginatedQueryGlobalCache.set(requestEndpoint, nextData);
      queryClient.setQueryData(queryKey, nextData);
      setLocalData(nextData);
    },
    [queryClient, queryKey, requestEndpoint, total, records]
  );

  return useMemo(
    () => ({
      records,
      raw: data,
      warning: data?.warning ?? null,
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
    [records, data, loading, query.isFetching, error, reload, setRecords, page, pageSize, total, setPageSize]
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
