# Deployment Security Checklist

- Set `NODE_ENV=production` for production deployments.
- Provide strong values for `JWT_SECRET`, database, Redis, payment, email, and storage credentials.
- Keep `LOG_LEVEL` out of `debug` or `trace` in production.
- Keep `APISETU_ALLOW_INSECURE_TLS=false` in production.
- Configure `FRONTEND_URL` or `CORS_ALLOWED_ORIGINS` with explicit production origins.
- Do not rely on development localhost or preview wildcard CORS in production.
- Keep `CORS_ALLOW_VERCEL_PREVIEWS=false` for production deployments.
- Keep `NEXT_PUBLIC_ENABLE_PROCUREMENT_DEMO_DATA=false` for production frontend builds.
- Configure payment webhook secrets for the selected payment provider.
- Configure storage credentials for the selected document provider.
- Run `npm run typecheck --workspaces --if-present`.
- Run `npm run prisma:validate --workspace=backend`.
- Run `npm run build --workspace=frontend` and backend build after Prisma client generation is unlocked.
- Run `npm run security:static` and `npm run production:check`.
- Confirm required environment files are ignored by Git.
