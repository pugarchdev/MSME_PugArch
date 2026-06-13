# Deployment Security Checklist

- `.env`, `.env.local`, and production local env files stay ignored by git.
- Production must fail fast when critical environment variables are missing.
- Production CORS must not allow local development origins.
- Debug or trace logging must not be enabled in production.
- Insecure TLS overrides must be disabled in production.
- Backend and frontend builds must pass before promotion.

