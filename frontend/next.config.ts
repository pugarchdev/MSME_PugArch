import type { NextConfig } from 'next';
import path from 'path';

const getBackendUrl = (): string => {
  // If we are on Vercel and have related projects, resolve the corresponding backend preview/prod URL
  if (process.env.VERCEL_RELATED_PROJECTS) {
    try {
      const related = JSON.parse(process.env.VERCEL_RELATED_PROJECTS);
      const backendProject = related.find(
        (p: any) => p.projectName === 'msme-pugarch-backend'
      ) || related[0];
      
      if (backendProject) {
        const env = process.env.VERCEL_ENV || 'production';
        const host = backendProject.targets[env]?.url || backendProject.targets.production?.url;
        if (host) {
          return `https://${host}`;
        }
      }
    } catch (e) {
      console.error('Failed to parse VERCEL_RELATED_PROJECTS in next.config.ts:', e);
    }
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

