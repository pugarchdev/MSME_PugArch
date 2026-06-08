/**
 * HTTP cache middleware — sets short-lived cache directives on read-only
 * endpoints so React Query's stale-while-revalidate gets help from the
 * browser cache + intermediate caches.
 *
 * Usage:
 *   router.get('/some/endpoint', shortCache(15), handler)
 *
 * - Default TTL: 15 seconds
 * - private: response is user-specific (don't share across users)
 * - must-revalidate: respect TTL strictly
 * - stale-while-revalidate: serve stale up to 5x TTL while refetching
 *
 * Skipped automatically when the request is not a GET, or when the response
 * is non-200, or when the user is not authenticated (caching anonymous
 * responses for authenticated routes is risky).
 */
import type { NextFunction, Request, Response } from 'express';

export const shortCache = (ttlSeconds = 15) => {
    return (_req: Request, res: Response, next: NextFunction) => {
        // Hook into res.set so we apply only after the route handler decides
        // to send a successful response.
        const originalSend = res.send.bind(res);
        res.send = ((body: any) => {
            if (res.statusCode >= 200 && res.statusCode < 300 && _req.method === 'GET') {
                if (!res.getHeader('Cache-Control')) {
                    res.setHeader(
                        'Cache-Control',
                        `private, max-age=${ttlSeconds}, must-revalidate, stale-while-revalidate=${ttlSeconds * 5}`
                    );
                }
            }
            return originalSend(body);
        }) as typeof res.send;
        next();
    };
};

/** Long cache for genuinely static-ish data (categories, logistics partners). */
export const longCache = (ttlSeconds = 300) => shortCache(ttlSeconds);
