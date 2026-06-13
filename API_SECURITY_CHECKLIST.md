# API Security Checklist

- Validate input with Zod or an established validation helper.
- Require authentication for protected resources.
- Enforce organization ownership or admin/master-admin override.
- Mask PII and sensitive financial metadata.
- Write audit events for create, update, approval, rejection, upload, payment, and award actions.
- Use idempotency or distributed locks for repeated financial or auction actions.
- Return safe error messages instead of raw exceptions.

