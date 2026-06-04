# Database Deployment Note

## Before Deployment

- Take a PostgreSQL backup and confirm restore access.
- Confirm the target `DATABASE_URL` points to the intended production database.
- Confirm no local development database URL is loaded by the deployment shell.
- Review pending migrations with `npx prisma migrate status` from `backend`.

## Deploy Steps

1. Stop long-running local backend processes before generating Prisma on Windows.
2. Run `npx prisma migrate deploy` from `backend`.
3. Run `npx prisma generate` from `backend`.
4. Run `npm run build --workspace=backend` from the repo root.
5. Verify `/api/health`, `/api/test`, and critical public routes.

## Current Migration Review

- `20260604103000_procurement_bid_module` creates procurement-bid tables and enums.
- `20260604150000_phase5_procurement_status_hardening` is additive enum expansion only.
- No `DROP`, `TRUNCATE`, or destructive data rewrite was found in the Phase 5 hardening migration.
- Foreign-key cascades in the procurement-bid module are limited to child records owned by the parent procurement bid, participation, clarification, evaluation, or award record.

## Rollback Plan

- If `migrate deploy` fails before applying a migration, fix the migration/configuration and rerun after backup verification.
- If a migration applies but the app fails health checks, keep the database backup available, stop traffic, inspect migration logs, and either deploy a forward fix or restore the backup according to the incident response plan.
