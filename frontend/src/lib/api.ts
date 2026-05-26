const getBaseUrl = () => {
  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  if (rawBaseUrl) return rawBaseUrl;

  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
      return `${protocol}//${hostname}:5000`;
    }
  }

  return rawBaseUrl;
};

const BASE_URL = getBaseUrl().replace(/\/$/, '');
const GET_CACHE_TTL = 5 * 60_000;

type CachedResponse = {
  body: any;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timestamp: number;
};

const getCache = new Map<string, CachedResponse>();

const resolveUrl = (endpoint: string) => {
  if (endpoint.startsWith('http')) return endpoint;

  if (!BASE_URL && process.env.NODE_ENV !== 'development') {
    throw new Error('NEXT_PUBLIC_API_URL is not configured for this deployment');
  }

  if (
    process.env.NODE_ENV !== 'development' &&
    typeof window !== 'undefined' &&
    BASE_URL &&
    new URL(BASE_URL).origin === window.location.origin
  ) {
    throw new Error('NEXT_PUBLIC_API_URL points to the frontend deployment instead of the backend API');
  }

  return `${BASE_URL}${endpoint}`;
};

export const readJsonResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    const body = await response.text();
    const preview = body.trim().slice(0, 80);
    throw new Error(
      preview.startsWith('<')
        ? 'Backend API returned HTML instead of JSON. Check NEXT_PUBLIC_API_URL.'
        : 'Backend API returned a non-JSON response.'
    );
  }

  return response.json();
};

export const unwrapApiData = <T = any>(body: any): T => {
  if (body && typeof body === 'object' && 'data' in body) return body.data as T;
  return body as T;
};

const getHeaderValue = (headers: HeadersInit | undefined, name: string) => {
  if (!headers) return '';
  if (headers instanceof Headers) return headers.get(name) || '';
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found?.[1] || '';
  }
  return (headers as Record<string, string>)[name] || (headers as Record<string, string>)[name.toLowerCase()] || '';
};

const cacheKey = (endpoint: string, options: RequestInit = {}) => {
  const auth = getHeaderValue(options.headers, 'Authorization');
  return `${endpoint}|${auth}`;
};

const responseFromCache = (entry: CachedResponse) => new Response(JSON.stringify(entry.body), {
  status: entry.status,
  statusText: entry.statusText,
  headers: {
    'Content-Type': 'application/json',
    ...entry.headers,
    'X-MSME-Cache': 'HIT'
  }
});

const isCacheFresh = (entry?: CachedResponse) => Boolean(entry && Date.now() - entry.timestamp < GET_CACHE_TTL);
const refreshingKeys = new Set<string>();
const shouldDispatchUnauthorized = (endpoint: string) =>
  ![
    '/api/auth/me',
    '/api/auth/refresh',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/notifications',
  ].some((path) => endpoint.startsWith(path));

const networkErrorResponse = (error: unknown) => {
  // Note: we used to hard-navigate to '/503.html' here but that nuked the
  // entire app on any transient blip (Neon cold start, Redis flap, brief
  // network drop). Returning a synthetic 503 Response is enough: callers
  // surface a toast or inline error and React Query retries automatically.
  // The 503 page can still be reached manually by users if needed.
  return new Response(
    JSON.stringify({
      success: false,
      message: 'Unable to reach the backend API. Please check that the backend server is running.',
      code: 'NETWORK_ERROR',
      detail: error instanceof Error ? error.message : String(error || ''),
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

const clearApiCache = (matcher?: string) => {
  if (!matcher) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.startsWith(matcher) || key.includes(matcher)) getCache.delete(key);
  }
};

export const api = {
  fetch: (endpoint: string, options: RequestInit & { skipCache?: boolean } = {}) => {
    const url = resolveUrl(endpoint);
    const method = (options.method || 'GET').toUpperCase();
    const { skipCache, ...fetchOptions } = options;
    const shouldCache = method === 'GET' && !skipCache;
    const key = cacheKey(endpoint, options);
    const headers: Record<string, string> = { ...fetchOptions.headers as any };
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (shouldCache) {
      const cached = getCache.get(key);
      if (isCacheFresh(cached)) {
        if (!refreshingKeys.has(key)) {
          refreshingKeys.add(key);
          fetch(url, {
            credentials: 'include',
            ...fetchOptions,
            headers,
          })
            .then(async (response) => {
              if (response.status === 401 && shouldDispatchUnauthorized(endpoint)) {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                }
                return;
              }
              if (!response.ok) return;
              const body = await response.clone().json();
              const responseHeaders: Record<string, string> = {};
              response.headers.forEach((value, headerKey) => {
                responseHeaders[headerKey] = value;
              });
              getCache.set(key, {
                body,
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                timestamp: Date.now()
              });
            })
            .catch(() => {
              // Background refresh must never block cached rendering.
            })
            .finally(() => refreshingKeys.delete(key));
        }
        return Promise.resolve(responseFromCache(cached!));
      }
    }

    return fetch(url, {
      credentials: 'include',
      ...fetchOptions,
      headers,
    }).then(async (response) => {
      if (response.status === 401 && shouldDispatchUnauthorized(endpoint)) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      if (response.status >= 500 && !endpoint.includes('/health')) {
        if (typeof window !== 'undefined' && !window.location.pathname.includes('503')) {
          window.location.href = '/503.html';
        }
      }
      if (shouldCache && response.ok) {
        const clone = response.clone();
        try {
          const body = await clone.json();
          const responseHeaders: Record<string, string> = {};
          clone.headers.forEach((value, headerKey) => {
            responseHeaders[headerKey] = value;
          });
          getCache.set(key, {
            body,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            timestamp: Date.now()
          });
        } catch {
          // Non-JSON GET responses are intentionally not cached.
        }
      }
      return response;
    }).catch(networkErrorResponse);
  },

  get: (endpoint: string, options: RequestInit = {}) =>
    api.fetch(endpoint, { ...options, method: 'GET' }),

  post: (endpoint: string, body: any, options: RequestInit = {}) =>
    api.fetch(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body)
    }).then((response) => {
      if (response.ok) clearApiCache();
      return response;
    }),

  put: (endpoint: string, body: any, options: RequestInit = {}) =>
    api.fetch(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body)
    }).then((response) => {
      if (response.ok) clearApiCache();
      return response;
    }),

  delete: (endpoint: string, options: RequestInit = {}) =>
    api.fetch(endpoint, { ...options, method: 'DELETE' }).then((response) => {
      if (response.ok) clearApiCache();
      return response;
    }),

  peek: (endpoint: string, options: RequestInit = {}) => {
    const cached = getCache.get(cacheKey(endpoint, options));
    return isCacheFresh(cached) ? cached?.body : null;
  },

  invalidate: clearApiCache,
};
