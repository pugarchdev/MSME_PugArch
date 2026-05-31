import type { NextConfig } from 'next';
import path from 'path';

const getBackendUrl = (): string => {
  // If we are on Vercel, dynamically construct the backend URL from the frontend VERCEL_URL
  if (process.env.VERCEL_URL) {
    // e.g. msme-frontend-git-home-anands-projects-27af4f8a.vercel.app
    // replaces 'msme-frontend' with 'msme-pugarch-backend' to get the exact matching backend host
    const vercelUrl = process.env.VERCEL_URL;
    const backendHost = vercelUrl.replace('msme-frontend', 'msme-pugarch-backend');
    return `https://${backendHost}`;
  }

  // Fallback to local .env configuration
  return process.env.NEXT_PUBLIC_API_URL || '';
};

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF || '',
    // On Vercel, set NEXT_PUBLIC_API_URL to empty string so client-side code makes
    // relative /api/... requests (same-origin). Next.js rewrites below proxy those
    // requests to the backend, completely avoiding CORS.
    // In local dev, use whatever is set in .env (e.g. http://localhost:5000).
    NEXT_PUBLIC_API_URL: process.env.VERCEL_URL ? '' : (process.env.NEXT_PUBLIC_API_URL || ''),
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async rewrites() {
    const backendUrl = getBackendUrl();
    // On Vercel: proxy /api/* requests from the frontend domain to the backend deployment.
    // This eliminates CORS entirely because the browser only ever talks to the frontend origin.
    if (process.env.VERCEL_URL && backendUrl) {
      console.log(`[next.config] Rewrites: /api/:path* → ${backendUrl}/api/:path*`);
      return [
        {
          source: '/api/:path*',
          destination: `${backendUrl}/api/:path*`,
        },
      ];
    }
    return [];
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'react-router-dom': path.resolve(__dirname, 'src/lib/next-router-dom.tsx'),
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

export default nextConfig;
