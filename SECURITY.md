# Security Policy

## Supported Surface

Security fixes cover the active JsgSmile portal code in `frontend`, `backend`, Prisma schema, deployment scripts, and production readiness tooling.

## Reporting

Report suspected vulnerabilities to the project owner with:

- Affected route, workflow, or file path.
- Steps to reproduce.
- Expected and actual impact.
- Any logs, screenshots, or request IDs that help reproduce safely.

Do not include live credentials, production tokens, or private user documents in reports.

## Handling

Security reports should be triaged before feature work. Confirmed issues should receive a tracked fix, targeted regression coverage where practical, and deployment notes for any required secret rotation or operational action.

## Baseline Controls

- Environment validation fails fast for missing critical secrets.
- Authentication, authorization, rate limiting, request validation, security headers, and audit logging are centralized.
- Uploaded files are validated server-side before storage.
- Private document access uses authenticated signed-url routes.
- Production CORS allows configured origins only.
