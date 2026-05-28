'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'sonner';
import React from 'react';

// Sensible defaults that make every query feel snappy:
//  - staleTime: 15 minutes — within this window revisits just use the
//    cache without spinning. Background refetches still happen on real
//    triggers (mutation invalidations), so the data stays correct.
//  - gcTime: 60 minutes — keep unused data in cache for an hour so
//    back-navigation between pages within a session is instant. After
//    logout we reset the QueryClient elsewhere, so nothing leaks.
//  - refetchOnWindowFocus / refetchOnReconnect: off, because B2B users
//    keep many tabs open and don't want a spinner every time they tab
//    back in. We rely on explicit invalidations instead.
//  - refetchOnMount: only refetch when the data is actually stale.
//  - retry x2 covers the typical Neon serverless cold-start blip.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15 * 60_000,
      gcTime: 60 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
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
      {children}
      <Toaster position="top-center" richColors closeButton />
    </AuthProvider>
  </QueryClientProvider>
);
