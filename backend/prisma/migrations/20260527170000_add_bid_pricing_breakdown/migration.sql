ALTER TABLE "Bid"
  ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "Bid"
SET
  "subtotal" = ROUND(("unitPrice" * "quantity")::numeric, 2)::double precision,
  "taxAmount" = ROUND((("unitPrice" * "quantity") * "taxRate" / 100)::numeric, 2)::double precision,
  "totalAmount" = ROUND((("unitPrice" * "quantity") + (("unitPrice" * "quantity") * "taxRate" / 100) - "discountAmount")::numeric, 2)::double precision;
