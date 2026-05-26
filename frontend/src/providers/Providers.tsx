'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Toaster } from 'sonner';
import React from 'react';

// Sensible defaults that make every query feel snappy:
//  - staleTime: 30s means revisits within half a minute use cache, no spinner
//  - gcTime keeps unused data in cache for 5 minutes for instant back-nav
//  - refetchOnWindowFocus is off because it's noisy in B2B portals
//  - retry x2 covers the typical Neon serverless cold-start blip
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
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
