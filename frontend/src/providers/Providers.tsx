'use client';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'sonner';
import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';

function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    // Wait for the DOM to settle after page transitions
    const timeoutId = setTimeout(() => {
      const dashboardMain = document.querySelector('.dashboard-main');
      
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        ...(dashboardMain ? {
          wrapper: dashboardMain as HTMLElement,
          content: (dashboardMain.firstElementChild as HTMLElement) || (dashboardMain as HTMLElement),
        } : {})
      });

      let rafId: number;
      function raf(time: number) {
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      }
      rafId = requestAnimationFrame(raf);

      return () => {
        cancelAnimationFrame(rafId);
        lenis.destroy();
      };
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [pathname]);

  return null;
}

// Sensible defaults that make every query feel snappy:
//  - staleTime: 15 minutes — within this window revisits use the cache
//    instantly with zero refetch. Beyond this window the cache is still
//    rendered immediately, but a silent background refetch fires so the
//    data stays current (stale-while-revalidate).
//  - gcTime: 60 minutes — keep unused data in cache for an hour so
//    back-navigation between pages within a session is instant. After
//    logout we reset the QueryClient elsewhere, so nothing leaks.
//  - refetchOnWindowFocus / refetchOnReconnect: off, because B2B users
//    keep many tabs open and don't want a spinner every time they tab
//    back in. We rely on explicit invalidations instead.
//  - refetchOnMount: true (default) — if data is stale, refetch on
//    mount; if fresh, serve from cache. Combined with staleTime this
//    gives instant SPA-like navigation for recently visited pages.
//  - placeholderData: keepPreviousData — when query keys change (e.g.
//    navigating between pages or changing filters) the previous data
//    stays visible until the new data arrives. This eliminates the
//    "flash to empty spinner" between page transitions.
//  - retry x2 covers the typical Neon serverless cold-start blip.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60_000,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: true,
      placeholderData: keepPreviousData,
      retry: 2
    },
    mutations: {
      retry: 0
    }
  }
});

export const Providers = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SmoothScroll />
      {children}
      <Toaster position="top-center" richColors closeButton expand={true} />
    </AuthProvider>
  </QueryClientProvider>
);
