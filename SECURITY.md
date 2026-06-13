# Security

This repository uses centralized authentication, role checks, request validation, rate limiting, audit logging, and private file handling for sensitive marketplace and procurement workflows.

Key controls:
- JWT sessions are validated through backend middleware.
- Protected APIs enforce role and organization ownership checks.
- Write APIs use Zod validation and centralized audit logging.
- Sensitive identifiers, bank details, and credentials must be masked before logs or responses.
- Payment webhooks and mutable payment actions must use idempotency or replay protection.
- Auction bid submission uses a Redis-backed lock with a production-safe failure mode.

