import type { NextConfig } from 'next';
import path from 'path';

const getBackendUrl = (): string => {
  // If we are on Vercel, dynamically construct the backend URL from the frontend VERCEL_URL
  if (process.env.VERCEL_URL) {
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
    // On Vercel, route API calls through /proxy to avoid CORS entirely.
    // In local dev, use whatever is set in .env (e.g. http://localhost:5000).
    NEXT_PUBLIC_API_URL: process.env.VERCEL_URL ? '/proxy' : (process.env.NEXT_PUBLIC_API_URL || ''),
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  async rewrites() {
    const backendUrl = getBackendUrl();
    if (process.env.VERCEL_URL && backendUrl) {
      console.log(`[next.config] Rewrites: /proxy/:path* → ${backendUrl}/:path*`);
      // beforeFiles ensures the rewrite runs BEFORE Vercel tries to match
      // filesystem pages, preventing false 404s on the /proxy prefix.
      return {
        beforeFiles: [
          {
            source: '/proxy/:path*',
            destination: `${backendUrl}/:path*`,
          },
        ],
        afterFiles: [],
        fallback: [],
      };
    }
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    };
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
