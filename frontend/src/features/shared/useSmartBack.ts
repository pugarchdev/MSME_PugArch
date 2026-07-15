'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pages that redirect-on-load (bridge/dispatcher pages). If the browser's back
 * stack would land the user on one of these, a plain history.back() bounces
 * them straight forward again — the classic "back button does nothing" loop.
 * useSmartBack skips them by navigating to an explicit fallback instead.
 */
const REDIRECTING_PATH_PATTERNS: RegExp[] = [
  /^\/marketplace\/requirements\/-?\d+$/, // BuyerRequirementDetailsPage → redirects to type-specific page
  /^\/bids\/\d+$/,                          // BidDetailsPage → redirects to /seller/rfq|rfp|tenders
];

const isRedirectingPath = (path: string): boolean =>
  REDIRECTING_PATH_PATTERNS.some((re) => re.test(path.split('?')[0]));

/**
 * Returns a `goBack(fallback)` function that:
 *  1. Prefers the real previous page (router.back) so the user returns exactly
 *     where they came from.
 *  2. If there is no history to go back to (cold open / new tab), OR the
 *     referrer is a redirect-only bridge page that would loop, navigates to the
 *     provided fallback route instead.
 *
 * Usage: const goBack = useSmartBack(); ... onClick={() => goBack('/seller/opportunities')}
 */
export const useSmartBack = () => {
  const router = useRouter();

  return useCallback(
    (fallback = '/dashboard') => {
      if (typeof window === 'undefined') {
        router.push(fallback);
        return;
      }

      const hasHistory = window.history.length > 1;
      let referrer = '';
      try {
        referrer = document.referrer ? new URL(document.referrer).pathname : '';
      } catch {
        referrer = '';
      }
      const sameOrigin = document.referrer.startsWith(window.location.origin);

      // If the page we'd go back to is a redirect bridge (same-origin), skip the
      // loop and go to the fallback directly.
      if (hasHistory && sameOrigin && referrer && isRedirectingPath(referrer)) {
        router.push(fallback);
        return;
      }

      if (hasHistory) {
        router.back();
        return;
      }

      router.push(fallback);
    },
    [router]
  );
};
