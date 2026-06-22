-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN "payload" JSONB,
ADD COLUMN "draftStep" INTEGER;

-- Add comment for documentation
COMMENT ON COLUMN "Requirement"."payload" IS 'Complete Create Procurement wizard data including basics, vendors, schedule, rules, items, documents, approval, and tender sections';
COMMENT ON COLUMN "Requirement"."draftStep" IS 'Current step in the Create Procurement wizard (0-based index)';

-- Made with Bob
