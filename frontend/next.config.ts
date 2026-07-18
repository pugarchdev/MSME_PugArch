import type { NextConfig } from 'next';
import path from 'path';

const isAbsoluteHttpUrl = (value?: string): value is string =>
  Boolean(value && /^https?:\/\//i.test(value));

const getBackendUrl = (): string => {
  // 1. Allow explicit override via BACKEND_URL or NEXT_PUBLIC_BACKEND_URL
  if (process.env.BACKEND_URL) {
    return process.env.BACKEND_URL.replace(/\/$/, '');
  }
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, '');
  }
  if (isAbsoluteHttpUrl(process.env.NEXT_PUBLIC_API_URL)) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  }

  // 2. If we are on Vercel, dynamically construct the backend URL from the frontend VERCEL_URL
  if (process.env.VERCEL_URL) {
    const vercelUrl = process.env.VERCEL_URL;
    let backendHost = vercelUrl;
    if (vercelUrl.includes('msme-pugarch-frontend')) {
      backendHost = vercelUrl.replace('msme-pugarch-frontend', 'msme-pugarch-backend');
    } else if (vercelUrl.includes('msme-portal-pug-arch-frontend')) {
      backendHost = vercelUrl.replace('msme-portal-pug-arch-frontend', 'msme-pugarch-backend');
    } else if (vercelUrl.includes('msme-frontend')) {
      backendHost = vercelUrl.replace('msme-frontend', 'msme-pugarch-backend');
    } else {
      backendHost = vercelUrl.replace('frontend', 'backend');
    }
    return `https://${backendHost}`.replace(/\/$/, '');
  }

  // 3. Fallback to local .env configuration
  return (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
};

const nextConfig: NextConfig = {
  transpilePackages: ['lucide-react'],
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF || '',
    // Only override NEXT_PUBLIC_API_URL if on Vercel
    ...(process.env.VERCEL_URL ? { NEXT_PUBLIC_API_URL: '/proxy' } : {}),
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
