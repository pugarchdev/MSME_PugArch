ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'master_admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleScope') THEN
    CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'COMPANY', 'ORGANIZATION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Company" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "portalDisplayName" TEXT NOT NULL,
  "logoUrl" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "address" TEXT,
  "district" TEXT,
  "state" TEXT,
  "themeSettings" JSONB,
  "homepageContent" TEXT,
  "aboutContent" TEXT,
  "footerContent" TEXT,
  "grievanceContent" TEXT,
  "procurementPolicy" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Feature" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CompanyFeature" (
  "companyId" INTEGER NOT NULL,
  "featureId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyFeature_pkey" PRIMARY KEY ("companyId", "featureId")
);

CREATE TABLE IF NOT EXISTS "UserRole" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "roleId" INTEGER NOT NULL,
  "companyId" INTEGER,
  "organizationId" INTEGER,
  "assignedById" INTEGER,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "CompanySetting" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ContentPage" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "RbacRole" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "RbacRole" ADD COLUMN IF NOT EXISTS "scope" "RoleScope" NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "Permission" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "Permission" ADD COLUMN IF NOT EXISTS "featureId" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "companyId" INTEGER;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "oldValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "newValue" JSONB;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

INSERT INTO "Company" ("name", "shortName", "portalDisplayName", "district", "state", "homepageContent", "aboutContent", "footerContent", "grievanceContent", "procurementPolicy")
SELECT 'Jharsuguda District', 'JSG', 'JsgSmile', 'Jharsuguda', 'Odisha',
       'Welcome to the district MSME procurement portal.',
       'Digital procurement, onboarding, and supplier enablement for district MSMEs.',
       'JsgSmile MSME procurement portal',
       'Submit and track procurement grievances through the portal.',
       'District procurement policy content can be managed by administrators.'
WHERE NOT EXISTS (SELECT 1 FROM "Company");

UPDATE "User"
SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
WHERE "companyId" IS NULL AND "role"::text <> 'master_admin';

UPDATE "Organization"
SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "id" LIMIT 1)
WHERE "companyId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Organization_companyId_fkey') THEN
    ALTER TABLE "Organization" ADD CONSTRAINT "Organization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RbacRole_companyId_fkey') THEN
    ALTER TABLE "RbacRole" ADD CONSTRAINT "RbacRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Permission_featureId_fkey') THEN
    ALTER TABLE "Permission" ADD CONSTRAINT "Permission_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyFeature_companyId_fkey') THEN
    ALTER TABLE "CompanyFeature" ADD CONSTRAINT "CompanyFeature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyFeature_featureId_fkey') THEN
    ALTER TABLE "CompanyFeature" ADD CONSTRAINT "CompanyFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanyFeature_updatedById_fkey') THEN
    ALTER TABLE "CompanyFeature" ADD CONSTRAINT "CompanyFeature_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_userId_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_roleId_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RbacRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_companyId_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_organizationId_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserRole_assignedById_fkey') THEN
    ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompanySetting_companyId_fkey') THEN
    ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentPage_companyId_fkey') THEN
    ALTER TABLE "ContentPage" ADD CONSTRAINT "ContentPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_companyId_fkey') THEN
    ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_companyId_organizationId_key" ON "UserRole" ("userId", "roleId", "companyId", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySetting_companyId_key_key" ON "CompanySetting" ("companyId", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "ContentPage_companyId_slug_key" ON "ContentPage" ("companyId", "slug");
CREATE INDEX IF NOT EXISTS "Company_name_idx" ON "Company"("name");
CREATE INDEX IF NOT EXISTS "Company_district_state_idx" ON "Company"("district", "state");
CREATE INDEX IF NOT EXISTS "Company_isActive_idx" ON "Company"("isActive");
CREATE INDEX IF NOT EXISTS "Feature_module_idx" ON "Feature"("module");
CREATE INDEX IF NOT EXISTS "Feature_isSystem_idx" ON "Feature"("isSystem");
CREATE INDEX IF NOT EXISTS "CompanyFeature_featureId_idx" ON "CompanyFeature"("featureId");
CREATE INDEX IF NOT EXISTS "CompanyFeature_enabled_idx" ON "CompanyFeature"("enabled");
CREATE INDEX IF NOT EXISTS "CompanyFeature_updatedById_idx" ON "CompanyFeature"("updatedById");
CREATE INDEX IF NOT EXISTS "User_companyId_idx" ON "User"("companyId");
CREATE INDEX IF NOT EXISTS "Organization_companyId_idx" ON "Organization"("companyId");
CREATE INDEX IF NOT EXISTS "RbacRole_companyId_idx" ON "RbacRole"("companyId");
CREATE INDEX IF NOT EXISTS "RbacRole_scope_idx" ON "RbacRole"("scope");
CREATE INDEX IF NOT EXISTS "Permission_featureId_idx" ON "Permission"("featureId");
CREATE INDEX IF NOT EXISTS "UserRole_userId_idx" ON "UserRole"("userId");
CREATE INDEX IF NOT EXISTS "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE INDEX IF NOT EXISTS "UserRole_companyId_idx" ON "UserRole"("companyId");
CREATE INDEX IF NOT EXISTS "UserRole_organizationId_idx" ON "UserRole"("organizationId");
CREATE INDEX IF NOT EXISTS "UserRole_isActive_idx" ON "UserRole"("isActive");
CREATE INDEX IF NOT EXISTS "CompanySetting_companyId_idx" ON "CompanySetting"("companyId");
CREATE INDEX IF NOT EXISTS "ContentPage_companyId_idx" ON "ContentPage"("companyId");
CREATE INDEX IF NOT EXISTS "ContentPage_isActive_idx" ON "ContentPage"("isActive");
CREATE INDEX IF NOT EXISTS "AuditLog_companyId_idx" ON "AuditLog"("companyId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
