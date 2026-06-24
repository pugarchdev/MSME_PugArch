export const getBaseUrl = () => {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (process.env.NEXT_PUBLIC_BACKEND_PORT) {
        return `${protocol}//${hostname}:${process.env.NEXT_PUBLIC_BACKEND_PORT}`;
      }
      const parsedPort = parseInt(port, 10);
      if (!isNaN(parsedPort) && parsedPort >= 3000 && parsedPort <= 3010) {
        const backendPort = 5000 + (parsedPort - 3000);
        return `${protocol}//${hostname}:${backendPort}`;
      }
      return `${protocol}//${hostname}:5000`;
    }
  }

  const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL || '';
  return rawBaseUrl;
};

export const BASE_URL = getBaseUrl().replace(/\/$/, '');
if (typeof window !== 'undefined') {
  console.log('[api] BASE_URL resolved to:', BASE_URL, 'window.location.origin:', window.location.origin, 'process.env.NODE_ENV:', process.env.NODE_ENV);
}
// GET responses are kept in memory and used as instant render data when the
// user navigates back to a page they have already visited. Background refresh
// (see `shouldCache` block in api.fetch) keeps them up to date so we can pick
// a comfortably long TTL — the old 5-minute window meant tab-switching back
// after a coffee break would re-show the loading spinner.
const GET_CACHE_TTL = 15 * 60_000;
// Stale entries past their TTL are still useful: they're rendered instantly
// while we kick off a background fetch, the same pattern as React Query's
// staleTime/cacheTime separation. This is what makes the portal feel
// "loaded once per session" rather than refetching on every navigation.
const GET_CACHE_STALE_LIMIT = 60 * 60_000;

type CachedResponse = {
  body: any;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timestamp: number;
};

const getCache = new Map<string, CachedResponse>();
const inFlightGetResponses = new Map<string, Promise<Response>>();

const resolveUrl = (endpoint: string) => {
  if (endpoint.startsWith('http')) return endpoint;

  // On Vercel, BASE_URL is intentionally empty — all /api/* requests are
  // same-origin and proxied to the backend via Next.js rewrites.
  // In local dev, BASE_URL is the backend URL (e.g. http://localhost:5000).
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

const writeGetCache = async (key: string, response: Response) => {
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
};

const isCacheFresh = (entry?: CachedResponse) => Boolean(entry && Date.now() - entry.timestamp < GET_CACHE_TTL);
// "Usable" means we can render it instantly; if it's older than fresh we
// still serve it but kick off a refresh in the background (stale-while-
// revalidate). This is what eliminates the loading spinner when navigating
// between pages within the same session.
const isCacheUsable = (entry?: CachedResponse) => Boolean(entry && Date.now() - entry.timestamp < GET_CACHE_STALE_LIMIT);
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

/**
 * Convert a mutation endpoint into the GET-cache prefix that should be
 * invalidated. The goal: when a user marks a notification as read at
 * `/api/notifications/123/read`, only invalidate cached responses under
 * `/api/notifications`, not every other cached page.
 *
 * Heuristic: take the path up to (but not including) the first numeric
 * segment. If there are no numeric segments, use the path verbatim. This
 * works cleanly for REST-style endpoints used across this portal:
 *   /api/notifications/123/read         -> /api/notifications
 *   /api/admin/onboarding/45/status     -> /api/admin/onboarding
 *   /api/seller/onboarding              -> /api/seller/onboarding
 *   /api/auth/login                     -> /api/auth/login
 */
const invalidatePrefixFor = (endpoint: string) => {
  // Strip query string before splitting; we never key cache by it anyway.
  const path = endpoint.split('?')[0];
  const segments = path.split('/');
  const truncated: string[] = [];
  for (const segment of segments) {
    if (segment && /^\d+$/.test(segment)) break;
    truncated.push(segment);
  }
  const prefix = truncated.join('/') || path;
  
  const prefixesToInvalidate = new Set<string>();
  const cleanPrefix = prefix.startsWith('/') ? prefix : '/' + prefix;
  prefixesToInvalidate.add(cleanPrefix);

  if (cleanPrefix.startsWith('/api/cart')) {
    prefixesToInvalidate.add('/api/cart');
    prefixesToInvalidate.add('/api/approvals');
  }
  if (cleanPrefix.startsWith('/api/approvals')) {
    prefixesToInvalidate.add('/api/approvals');
    prefixesToInvalidate.add('/api/cart');
  }
  if (cleanPrefix.startsWith('/api/marketplace/guest-cart')) {
    prefixesToInvalidate.add('/api/marketplace/guest-cart');
  }
  if (cleanPrefix.startsWith('/api/quote-requests') || cleanPrefix.startsWith('/api/quote-responses')) {
    prefixesToInvalidate.add('/api/quote-requests');
    prefixesToInvalidate.add('/api/quote-responses');
    prefixesToInvalidate.add('/api/dashboard/summary');
    prefixesToInvalidate.add('/api/purchase-orders');
  }
  if (cleanPrefix.startsWith('/api/bids')) {
    prefixesToInvalidate.add('/api/purchase-orders');
    prefixesToInvalidate.add('/api/dashboard/summary');
  }

  for (const pref of prefixesToInvalidate) {
    clearApiCache(pref);
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
      // Instant render path: any cache entry younger than GET_CACHE_STALE_LIMIT
      // is rendered immediately. If it's still within the fresh TTL we don't
      // bother refreshing; if it's stale we fire a background refresh so the
      // UI stays current without the user seeing a spinner.
      if (isCacheUsable(cached)) {
        const isStale = !isCacheFresh(cached);
        if (isStale && !refreshingKeys.has(key)) {
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

      const pending = inFlightGetResponses.get(key);
      if (pending) {
        return pending.then((response) => response.clone());
      }
    }

    const request = fetch(url, {
      credentials: 'include',
      ...fetchOptions,
      headers,
    }).then(async (response) => {
      if (response.status === 401 && shouldDispatchUnauthorized(endpoint)) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
      }
      if (response.status === 503 && !endpoint.includes('/health')) {
        // 503 means the backend explicitly declared itself down (e.g. behind a
        // maintenance proxy). Hard-navigate to the maintenance page so the
        // user gets a clear status. 500/502/504 are treated as transient and
        // bubble up to the caller, which can show a toast and let React Query
        // retry instead of nuking the whole app.
        if (typeof window !== 'undefined' && !window.location.pathname.includes('503')) {
          window.location.href = '/503.html';
        }
      }
      if (shouldCache && response.ok) {
        await writeGetCache(key, response);
      }
      return response;
    }).catch(networkErrorResponse);

    if (shouldCache) {
      inFlightGetResponses.set(
        key,
        request
          .then((response) => response.clone())
          .finally(() => inFlightGetResponses.delete(key))
      );
    }

    return request;
  },

  get: (endpoint: string, options: RequestInit & { skipCache?: boolean } = {}) =>
    api.fetch(endpoint, { ...options, method: 'GET' }),

  post: (endpoint: string, body: any, options: RequestInit = {}) =>
    api.fetch(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body)
    }).then((response) => {
      // Only invalidate the resource that just mutated, not every cached
      // page. Wiping the entire cache is what was making the dashboard look
      // like it reloads on every navigation: a single click that POSTs
      // (e.g. marking a notification read) used to drop every other
      // unrelated GET from cache.
      if (response.ok) invalidatePrefixFor(endpoint);
      return response;
    }),

  put: (endpoint: string, body: any, options: RequestInit = {}) =>
    api.fetch(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body)
    }).then((response) => {
      if (response.ok) invalidatePrefixFor(endpoint);
      return response;
    }),

  patch: (endpoint: string, body: any, options: RequestInit = {}) =>
    api.fetch(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body)
    }).then((response) => {
      if (response.ok) invalidatePrefixFor(endpoint);
      return response;
    }),

  delete: (endpoint: string, options: RequestInit = {}) =>
    api.fetch(endpoint, { ...options, method: 'DELETE' }).then((response) => {
      if (response.ok) invalidatePrefixFor(endpoint);
      return response;
    }),

  peek: (endpoint: string, options: RequestInit = {}) => {
    const cached = getCache.get(cacheKey(endpoint, options));
    // peek() is what page components call before render to seed initial
    // state. Use the same stale-while-revalidate window as the fetch path
    // so revisited pages render instantly even after the fresh TTL.
    return isCacheUsable(cached) ? cached?.body : null;
  },

  invalidate: clearApiCache,
};
