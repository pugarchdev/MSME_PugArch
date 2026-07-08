'use client';
import React, { Suspense } from 'react';
import App from '@/App';

export default function CatchAllPage() {
  return (
    <Suspense fallback={null}>
      <App />
    </Suspense>
  );
}
