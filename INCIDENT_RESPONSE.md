# Incident Response

## Triage

1. Identify affected route, workflow, user role, and data class.
2. Preserve logs, request IDs, timestamps, and deployment identifiers.
3. Limit exposure by disabling affected access paths or credentials where needed.

## Containment

1. Rotate exposed secrets or tokens.
2. Revoke compromised sessions.
3. Apply temporary allowlist, rate limit, or feature gate controls if required.

## Recovery

1. Patch the root cause.
2. Run typecheck, build, Prisma validation, and security readiness checks.
3. Deploy with rollback notes and monitor logs.

## Review

Document impact, affected records, corrective action, and follow-up regression coverage.
