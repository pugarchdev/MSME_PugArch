-- Repair migration: production DB drifted from schema.prisma because earlier
-- changes to the Notification stack were applied with `prisma db push` locally
-- and never committed as a migration. Idempotent (safe to run on databases
-- that already have these columns/tables).

-- 1) Notification: add columns the application code expects.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "redirectUrl" TEXT;

-- 2) Notification.userId foreign key to User (was missing in older migrations).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Notification_userId_fkey' AND conrelid = '"Notification"'::regclass
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) NotificationLog: add columns the application code expects.
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "action" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

-- 4) NotificationPreference: brand new table referenced by /notifications/preferences.
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
  "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
  "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
  "procurementAlerts" BOOLEAN NOT NULL DEFAULT true,
  "complianceAlerts" BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'NotificationPreference_userId_fkey' AND conrelid = '"NotificationPreference"'::regclass
  ) THEN
    ALTER TABLE "NotificationPreference"
      ADD CONSTRAINT "NotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
