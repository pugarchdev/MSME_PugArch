ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "canonicalMethod" TEXT;

CREATE INDEX IF NOT EXISTS "Requirement_canonicalMethod_idx" ON "Requirement"("canonicalMethod");
CREATE INDEX IF NOT EXISTS "Requirement_buyerId_canonicalMethod_idx" ON "Requirement"("buyerId", "canonicalMethod");
CREATE INDEX IF NOT EXISTS "Requirement_canonicalMethod_status_idx" ON "Requirement"("canonicalMethod", "status");
