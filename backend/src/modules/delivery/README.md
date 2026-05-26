# Delivery Tracking Module

Production-ready procurement delivery tracking layered on top of the existing
PO / invoice / escrow workflow.

## What lives here

| File | Purpose |
|------|---------|
| `delivery.constants.ts` | Status enum, transition map, allowed-roles map |
| `delivery.validation.ts` | Zod schemas for every endpoint |
| `delivery.service.ts` | Workflow service (single source of truth for mutations) |
| `delivery.routes.ts` | HTTP routes mounted at `/api/delivery` |

## Production switches

Two environment flags control runtime behaviour:

| Variable | Default | Effect |
|---|---|---|
| `DELIVERY_AUTO_SEED` | `true` in dev, `false` in prod | When `true`, `GET /api/delivery` auto-creates `DeliveryTracking` rows for orphan POs the actor owns. In prod, leave this `false` and use the explicit admin endpoint instead. |
| `LOCK_FALLBACK_ALLOW` | `false` | When `false`, distributed locks that fail to reach Redis return HTTP 503 in production instead of silently falling back to per-instance in-memory locks. |
| `DB_KEEPALIVE` | `false` in prod | When `true`, the backend pings the database every 4 minutes to keep Neon serverless compute awake. Default is on in development, off in production. |

## Production-safe one-shot backfill

If you deploy to a production database that already has POs, run this **once**
as an admin to create their delivery rows:

```http
POST /api/delivery/admin/backfill
Authorization: Bearer <admin-token>
```

The response is `{ "created": <number> }`. Idempotent — running it again with
no orphan POs returns `{ "created": 0 }`.

## Status transitions

Every mutation funnels through `transitionStatus()`. It validates the source →
destination edge against `DELIVERY_STATUS_TRANSITIONS` and writes a
`DeliveryStatusLog` row capturing actor, role, IP, user agent, and remarks.
Admin overrides skip the edge validation but still write the log.

## Audit guarantees

- Every status change writes one row to `DeliveryStatusLog` (history is append-only).
- Every action writes one row to `AuditLog` via the central audit service.
- Status events are also written to `DeliveryTrackingEvent` for the UI timeline.
- Document uploads write to `DeliveryDocument` with the uploader role recorded.
- All `PaymentSettlement` state changes record the actor user id (`invoiceVerifiedById`,
  `approvedById`, `releasedById`, `rejectedById`).

## Testing

Source-level contract tests live in `backend/tests/delivery.test.mjs` and run as
part of `npm run security:check`. They verify:

1. Routes are mounted and require authentication
2. All 15 happy-path stages and 11 exception statuses exist in code + Prisma
3. Rejection / dispute / admin override require a reason
4. Buyer rejection refines on `rejectionReason`
5. Every state change writes a status log entry
6. Admin override and dispute resolution are admin-only
7. Finance flow enforces sequence (verify → approve → release)
8. Buyer/consignee acceptance only runs after delivery
9. Every transaction declares the 20s Neon-safe timeout
10. Auto-seed is gated behind `DELIVERY_AUTO_SEED` / `NODE_ENV`
11. Distributed lock fallback is strict in production
12. Participant uniqueness is enforced at the DB
13. Child tables cascade on delivery deletion
14. Notification preferences are honoured

## Known limitations

- The dropdown of logistics partners is seeded from `seed_logistics_partners.ts`
  with 20 common Indian carriers. Run the seed script once per environment.
- `DELIVERY_FAILED → REATTEMPT_SCHEDULED` is the only retry edge; multi-failure
  routing rules (e.g. auto-cancel after N attempts) are not implemented.
- SLA breach detection is computed on read in the report query, not via a
  background job. Acceptable for current volume; revisit if the delivery
  table grows past ~100k rows.
