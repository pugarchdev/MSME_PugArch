-- Add performance indexes for Requirement table
-- Single column indexes for sorting and filtering
CREATE INDEX IF NOT EXISTS "Requirement_createdAt_idx" ON "Requirement"("createdAt");
CREATE INDEX IF NOT EXISTS "Requirement_updatedAt_idx" ON "Requirement"("updatedAt");
CREATE INDEX IF NOT EXISTS "Requirement_requiredBy_idx" ON "Requirement"("requiredBy");

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "Requirement_buyerId_status_idx" ON "Requirement"("buyerId", "status");
CREATE INDEX IF NOT EXISTS "Requirement_buyerId_procurementMethod_idx" ON "Requirement"("buyerId", "procurementMethod");
CREATE INDEX IF NOT EXISTS "Requirement_organizationId_status_idx" ON "Requirement"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Requirement_status_createdAt_idx" ON "Requirement"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Requirement_procurementMethod_status_idx" ON "Requirement"("procurementMethod", "status");

-- Add comments for documentation
COMMENT ON INDEX "Requirement_createdAt_idx" IS 'Optimize sorting by creation date';
COMMENT ON INDEX "Requirement_updatedAt_idx" IS 'Optimize sorting by update date';
COMMENT ON INDEX "Requirement_requiredBy_idx" IS 'Optimize filtering by required date';
COMMENT ON INDEX "Requirement_buyerId_status_idx" IS 'Optimize buyer-specific status queries';
COMMENT ON INDEX "Requirement_buyerId_procurementMethod_idx" IS 'Optimize buyer-specific method queries';
COMMENT ON INDEX "Requirement_organizationId_status_idx" IS 'Optimize organization-specific status queries';
COMMENT ON INDEX "Requirement_status_createdAt_idx" IS 'Optimize status filtering with date sorting';
COMMENT ON INDEX "Requirement_procurementMethod_status_idx" IS 'Optimize method-specific status queries';

-- Made with Bob
