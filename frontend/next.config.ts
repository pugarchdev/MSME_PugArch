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
    NEXT_PUBLIC_API_URL: getBackendUrl(),
  },
  eslint: {
    ignoreDuringBuilds: true
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

