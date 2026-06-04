# API Security Checklist

- Authentication is required for protected buyer, seller, admin, master-admin, procurement, order, payment, delivery, dispute, and document routes.
- Role checks are applied at route or service boundaries.
- Request bodies, params, and query strings use schema validation where practical.
- File uploads use server-side type and size validation.
- File attachment flows verify ownership or privileged access.
- Payment and webhook flows use idempotency or replay protection.
- Errors are returned through safe error handlers.
- Audit events are recorded for sensitive workflow actions.
- Production CORS is limited to configured origins.
- Rate limits protect login, upload, and high-risk action routes.
