const rawBaseUrl = import.meta.env.VITE_API_URL || '';
const BASE_URL = import.meta.env.DEV ? '' : rawBaseUrl.replace(/\/$/, '');
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

  if (!import.meta.env.DEV && !BASE_URL) {
    throw new Error('VITE_API_URL is not configured for this deployment');
  }

  if (
    !import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    BASE_URL &&
    new URL(BASE_URL).origin === window.location.origin
  ) {
    throw new Error('VITE_API_URL points to the frontend deployment instead of the backend API');
  }

  return `${BASE_URL}${endpoint}`;
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
    });
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
