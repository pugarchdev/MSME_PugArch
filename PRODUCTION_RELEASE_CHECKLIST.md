# Production Release Checklist

## Frontend

- `npm run typecheck --workspace=frontend` passes.
- `npm run build --workspace=frontend` passes.
- `NEXT_PUBLIC_ENABLE_PROCUREMENT_DEMO_DATA=false`.
- `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` points to the production backend.
- Public routes `/`, `/marketplace/products`, `/bids`, `/bids/:bidId`, and `/bids/:bidId/results` are smoke tested.
- Source map and deployment logging settings are reviewed.

## Backend

- Prisma DLL lock is cleared before build on Windows.
- `npx prisma generate` passes.
- `npm run typecheck --workspace=backend` passes.
- `npm run prisma:validate --workspace=backend` passes.
- `npm run build --workspace=backend` passes.
- `/api/health`, `/api/test`, and `/api/tenders/public` respond successfully.
- Payment webhook URLs and secrets are configured.
- File storage provider credentials are configured.
- Structured logs are enabled with production-safe `LOG_LEVEL`.

## Database

- Backup is taken before migration.
- `npx prisma migrate status` is reviewed.
- `npx prisma migrate deploy` is ready to apply pending migrations.
- Critical tables are verified after deployment.
- Rollback/restore owner and timing are documented.

## Security

- Real secrets are not committed.
- `JWT_SECRET` is at least 32 random characters.
- Production CORS uses explicit origins only.
- File uploads and signed-url access remain authenticated.
- Sealed financial quotes are protected from unauthorized access.
- Payment idempotency and webhook replay protection are enabled.
- Admin, master-admin, buyer, and seller route access is enforced.
- Audit logs are active for sensitive workflows.

## Business Flow

- Buyer RFQ/tender publishing is tested.
- Seller participation and document upload are tested.
- Technical evaluation is tested.
- Financial evaluation and ranking are tested.
- Award, PO/work order, seller acceptance, delivery, GRN, invoice, payment, settlement, and dispute paths are tested.
