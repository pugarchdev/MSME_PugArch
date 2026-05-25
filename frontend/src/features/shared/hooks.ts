import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApi, normalizeList, normalizePaginated } from './apiClient';

export type ViewMode = 'list' | 'grid';

export const useResponsiveViewMode = () => {
  const [viewMode, setViewModeState] = useState<ViewMode>('list');
  const hasManualSelection = useRef(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const applyDeviceDefault = () => {
      if (!hasManualSelection.current) {
        setViewModeState(mobileQuery.matches ? 'grid' : 'list');
      }
    };

    applyDeviceDefault();
    mobileQuery.addEventListener('change', applyDeviceDefault);
    return () => mobileQuery.removeEventListener('change', applyDeviceDefault);
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    hasManualSelection.current = true;
    setViewModeState(mode);
  }, []);

  return [viewMode, setViewMode] as const;
};

export const useFeatureQuery = <T,>(endpoint: string, initialValue: T) => {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getApi<T>(endpoint, false);
      setData(Array.isArray(initialValue) ? (normalizeList(result) as T) : result);
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

const endpointWithParams = (endpoint: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const glue = endpoint.includes('?') ? '&' : '?';
  const queryString = query.toString();
  return queryString ? `${endpoint}${glue}${queryString}` : endpoint;
};

export const usePaginatedFeatureQuery = <T,>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  pageSizeDefault = 20,
) => {
  const [records, setRecords] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(pageSizeDefault);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paramsKey = JSON.stringify(params);

  const requestEndpoint = useMemo(
    () => endpointWithParams(endpoint, { ...params, skip: (page - 1) * pageSize, take: pageSize }),
    [endpoint, page, pageSize, paramsKey]
  );

  const reload = useCallback(async () => {
    setLoading(current => records.length === 0 || current);
    setError(null);
    try {
      const body = await getApi<unknown>(requestEndpoint, false);
      const pageData = normalizePaginated<T>(body);
      setRecords(pageData.records);
      setTotal(pageData.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load data');
    } finally {
      setLoading(false);
    }
  }, [records.length, requestEndpoint]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(1);
  }, [endpoint, pageSize, paramsKey]);

  const setPageSize = useCallback((nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  }, []);

  return useMemo(() => ({
    records,
    loading,
    error,
    reload,
    setRecords,
    page,
    pageSize,
    total,
    setPage,
    setPageSize
  }), [records, loading, error, reload, page, pageSize, total, setPageSize]);
};

export const usePagination = <T,>(items: T[], pageSizeDefault = 20) => {
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
