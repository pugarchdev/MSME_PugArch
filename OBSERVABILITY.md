# Observability

## Logs

- Use structured logs for server startup, route errors, payment callbacks, upload failures, and workflow transitions.
- Avoid logging passwords, secrets, tokens, database URLs, or raw private documents.

## Metrics

- Track API latency, error rate, authentication failures, upload failures, payment webhook outcomes, Prisma errors, Redis errors, and frontend build health.

## Alerts

- Alert on production startup failure, repeated 5xx responses, payment webhook replay failures, database connectivity loss, storage upload failures, and unusual login or upload volume.

## Review

- Review dashboards after each production deployment and after incident recovery.
