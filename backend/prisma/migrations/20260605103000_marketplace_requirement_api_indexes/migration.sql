-- Targeted indexes for marketplace buyer requirement and seller response APIs.
CREATE INDEX IF NOT EXISTS "BuyerRequirement_status_createdAt_idx"
  ON "BuyerRequirement"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "BuyerRequirement_status_isUrgent_lastDate_idx"
  ON "BuyerRequirement"("status", "isUrgent", "lastDate");

CREATE INDEX IF NOT EXISTS "BuyerRequirement_updatedAt_idx"
  ON "BuyerRequirement"("updatedAt");

CREATE INDEX IF NOT EXISTS "RequirementResponse_requirementId_createdAt_idx"
  ON "RequirementResponse"("requirementId", "createdAt");

CREATE INDEX IF NOT EXISTS "RequirementResponse_requirementId_sellerUserId_status_idx"
  ON "RequirementResponse"("requirementId", "sellerUserId", "status");

CREATE INDEX IF NOT EXISTS "RequirementResponse_sellerOrganizationId_createdAt_idx"
  ON "RequirementResponse"("sellerOrganizationId", "createdAt");

CREATE INDEX IF NOT EXISTS "RequirementResponse_sellerUserId_createdAt_idx"
  ON "RequirementResponse"("sellerUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "RequirementResponse_updatedAt_idx"
  ON "RequirementResponse"("updatedAt");
