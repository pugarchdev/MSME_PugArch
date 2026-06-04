# Threat Model

## Assets

- User identities, sessions, roles, and organization membership.
- Procurement bids, quotations, sealed financial quotes, purchase orders, invoices, GRNs, settlements, and audit logs.
- Uploaded private documents and generated file assets.
- Payment, escrow, delivery, dispute, and grievance records.

## Trust Boundaries

- Browser to frontend runtime.
- Frontend to backend API.
- Backend to database, Redis or Valkey, file storage, email, and payment integrations.
- Public marketplace routes versus authenticated buyer, seller, admin, and master-admin routes.

## Primary Risks

- Unauthorized access to private procurement, payment, or document data.
- Status transition abuse across procurement, order, payment, and settlement workflows.
- Upload abuse through unsafe MIME types, oversized files, or ownership bypass.
- Replay or duplicate payment and webhook processing.
- Production misconfiguration, especially weak secrets, permissive CORS, or debug logging.

## Mitigations

- Route authentication and role authorization.
- Zod validation and secure error handling.
- File validation plus owner-bound signed-url access.
- Idempotency and replay tracking for payment flows.
- Production environment validation, security headers, rate limits, and audit logging.
