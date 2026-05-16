# Phase 3 Redis Completion Report

## Summary

Phase 3 centralizes Redis/Valkey key construction, adds cache and realtime helpers, and updates the critical Redis usage paths so Redis remains coordination/cache infrastructure rather than financial source of truth.

## Key Builders

Central file:
- `backend/src/constants/redis-keys.ts`

Builders added or confirmed:
- `otp:{purpose}:{identifier}`
- `otp_attempts:{purpose}:{identifier}`
- `rate:login:{ip}`
- `rate:login_user:{email}`
- `rate:api:{userId}:{route}`
- `rate:api_ip:{ip}:{route}`
- `lock:auction:{auctionId}`
- `lock:payment:{paymentId}`
- `lock:escrow:{escrowId}`
- `lock:milestone:{milestoneId}`
- `idem:payment:{idempotencyKey}`
- `webhook:{gateway}:{eventId}`
- `cache:categories:all`
- `cache:vendor_search:{hash}`
- `cache:product_search:{hash}`
- `cache:tender_public:{hash}`
- `notifications:user:{userId}`

Identifier-like values are normalized and hashed where appropriate to avoid raw email, IP, OTP identity, idempotency key, or webhook event IDs becoming directly visible in Redis keys.

## Redis Usage Updated

- OTP service uses centralized `otp`, `otp_attempts`, and OTP cooldown keys.
- Rate limit middleware uses centralized login, user-login, API-user, API-IP, and named rate keys.
- Auction lock usage uses `redisKeys.lockAuction`.
- Payment confirmation uses `redisKeys.lockPayment`.
- Payment idempotency uses `redisKeys.idemPayment` as a Redis processing guard alongside the database `IdempotencyKey` table.
- Webhook replay uses `redisKeys.webhook` with a Redis replay marker and the database `PaymentWebhookEvent` unique constraint as source of truth.
- Escrow refund uses `redisKeys.lockEscrow`.
- Milestone release uses `redisKeys.lockMilestone`.
- Notification creation publishes realtime events through `notifications:user:{userId}`.

## Services Added

`backend/src/services/cache.service.ts`
- `getCache`
- `setCache`
- `deleteCache`
- `getOrSetCache`
- `invalidateByPattern`

`invalidateByPattern` only accepts `cache:` patterns, so it cannot be accidentally used for locks, OTP, payment idempotency, or webhook replay state.

`backend/src/services/realtime.service.ts`
- `publishRealtimeEvent`
- `publishNotificationEvent`
- `subscribeRealtimeChannel`

Notification writes still persist to PostgreSQL first; Redis pub/sub is only an event delivery helper.

## Environment And Local Services

- `CACHE_DRIVER=redis` is present in `backend/.env.example`.
- Added a Valkey-compatible service option to `docker-compose.yml` under the `valkey` profile.

Example:

```bash
docker compose --profile valkey up valkey
```

## Financial Source Of Truth

Redis is not used as the financial source of truth. Payments, escrow, milestones, ledger entries, invoices, and webhook event records remain persisted in PostgreSQL. Redis is used for:
- short-lived distributed locks
- idempotency processing guard
- webhook replay marker
- rate limits
- OTP state
- cache entries
- notification pub/sub

## Verification

Commands run:
- `npm run typecheck --workspace=backend` - passed
- `npm run build --workspace=backend` - passed
- `npm run test:security --workspace=backend` - passed

Security test note:
- The static security suite expects duplicate email checks in `backend/index.ts`; seller and buyer profile registration paths now explicitly guard `existingEmail` in addition to existing mobile checks.

## Remaining Notes

- Redis/Valkey outage behavior remains intentionally conservative for critical operations: OTP and critical locks fail closed, while rate limiting and cache utilities fall back where safe.
- Existing SSE notification clients remain in-process; Redis pub/sub is now available for multi-instance notification fanout.
