# Production Hardening

Production deployments must use explicit secrets, production-safe CORS, structured logging, private file storage, payment replay protection, and non-debug log levels.

Required gates:
- Backend build and frontend build.
- Prisma validation and client generation.
- Static security checks.
- Production readiness checks.
- Smoke tests when the target environment is reachable.

