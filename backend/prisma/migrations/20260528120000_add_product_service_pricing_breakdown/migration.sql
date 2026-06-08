-- Repair: the Prisma schema declared taxRate/discount on Product and Service
-- (parallel to the Bid pricing breakdown migration in
-- 20260527170000_add_bid_pricing_breakdown), but no migration ever added the
-- columns to the database. The runtime Prisma client therefore raised P2022
-- ("The column `Product.taxRate` does not exist in the current database") on
-- every call to /api/seller/products and /api/seller/services, which the
-- error helper rendered as the "LIVE DATA UNAVAILABLE" banner on the
-- marketplace page. ADD COLUMN IF NOT EXISTS keeps this migration safe for
-- environments that may have been hand-patched.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "discount" DECIMAL(5, 2) DEFAULT 0.00;

ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "discount" DECIMAL(5, 2) DEFAULT 0.00;
