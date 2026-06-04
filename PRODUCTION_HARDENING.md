# Production Hardening

## Application

- Run production with `NODE_ENV=production`.
- Keep debug and trace logging disabled.
- Enforce strict CORS with configured production origins only.
- Use centralized security headers, request validation, rate limiting, and safe error handling.
- Keep procurement document access authenticated and owner/role checked.
- Keep sealed financial quote access restricted to authorized evaluation stages.
- Keep payment and settlement mutations idempotent and audited.

## Secrets

- Store secrets in the deployment environment.
- Rotate exposed credentials immediately after suspected compromise.
- Do not commit `.env`, `.env.local`, or production local environment files.

## Runtime

- Monitor startup logs, API error rates, Prisma connectivity, Redis connectivity, payment webhook failures, upload failures, and queue delays.
- Keep Prisma client generation separate from long-running processes on Windows hosts to avoid locked DLL files.
- Monitor route smoke checks for `/api/health`, marketplace public routes, bid routes, and authenticated buyer/seller/admin dashboards.
