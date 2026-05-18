ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mobile" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dob" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDualRole" BOOLEAN DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "User_userId_key" ON "User"("userId");

ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "panMasked" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "panFingerprint" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "gstMasked" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "gstFingerprint" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "aadhaarMasked" TEXT;
ALTER TABLE "BuyerProfile" ADD COLUMN IF NOT EXISTS "aadhaarFingerprint" TEXT;

ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "panMasked" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "panFingerprint" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "aadhaarMasked" TEXT;
ALTER TABLE "SellerProfile" ADD COLUMN IF NOT EXISTS "aadhaarFingerprint" TEXT;

CREATE TABLE IF NOT EXISTS "SellerOffice" (
  "id" SERIAL PRIMARY KEY,
  "sellerProfileId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "gstRegistered" BOOLEAN NOT NULL DEFAULT false,
  "gstNumber" TEXT,
  "declaringAs" TEXT,
  "pincode" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "contactNumber" TEXT,
  "isMandatory" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerOffice_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SellerBankAccount" (
  "id" SERIAL PRIMARY KEY,
  "sellerProfileId" INTEGER NOT NULL,
  "ifsc" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "bankAddress" TEXT NOT NULL,
  "holderName" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerBankAccount_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "SellerOffice" ADD COLUMN IF NOT EXISTS "gstMasked" TEXT;
ALTER TABLE "SellerOffice" ADD COLUMN IF NOT EXISTS "gstFingerprint" TEXT;

ALTER TABLE "SellerBankAccount" ADD COLUMN IF NOT EXISTS "accountNumberMasked" TEXT;
ALTER TABLE "SellerBankAccount" ADD COLUMN IF NOT EXISTS "bankFingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BuyerProfile_panFingerprint_key" ON "BuyerProfile"("panFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerProfile_gstFingerprint_key" ON "BuyerProfile"("gstFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "BuyerProfile_aadhaarFingerprint_key" ON "BuyerProfile"("aadhaarFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerProfile_panFingerprint_key" ON "SellerProfile"("panFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerProfile_aadhaarFingerprint_key" ON "SellerProfile"("aadhaarFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerOffice_gstFingerprint_key" ON "SellerOffice"("gstFingerprint");
CREATE UNIQUE INDEX IF NOT EXISTS "SellerBankAccount_bankFingerprint_key" ON "SellerBankAccount"("bankFingerprint");

CREATE INDEX IF NOT EXISTS "User_role_onboardingStatus_idx" ON "User"("role", "onboardingStatus");
CREATE INDEX IF NOT EXISTS "User_mobile_idx" ON "User"("mobile");
CREATE INDEX IF NOT EXISTS "BuyerProfile_gstFingerprint_idx" ON "BuyerProfile"("gstFingerprint");
CREATE INDEX IF NOT EXISTS "BuyerProfile_panFingerprint_idx" ON "BuyerProfile"("panFingerprint");
CREATE INDEX IF NOT EXISTS "SellerProfile_panFingerprint_idx" ON "SellerProfile"("panFingerprint");
CREATE INDEX IF NOT EXISTS "SellerProfile_aadhaarFingerprint_idx" ON "SellerProfile"("aadhaarFingerprint");
CREATE INDEX IF NOT EXISTS "SellerOffice_sellerProfileId_idx" ON "SellerOffice"("sellerProfileId");
CREATE INDEX IF NOT EXISTS "SellerOffice_gstFingerprint_idx" ON "SellerOffice"("gstFingerprint");
CREATE INDEX IF NOT EXISTS "SellerBankAccount_sellerProfileId_idx" ON "SellerBankAccount"("sellerProfileId");
CREATE INDEX IF NOT EXISTS "SellerBankAccount_bankFingerprint_idx" ON "SellerBankAccount"("bankFingerprint");

CREATE TABLE IF NOT EXISTS "Bid" (
  "id" SERIAL PRIMARY KEY,
  "tenderId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "quantity" INTEGER NOT NULL,
  "deliveryDays" INTEGER NOT NULL,
  "warranty" TEXT,
  "validTill" TIMESTAMP(3),
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bid_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Bid_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "QuoteRequest" (
  "id" SERIAL PRIMARY KEY,
  "buyerId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "documentUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QuoteRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Auction" (
  "id" SERIAL PRIMARY KEY,
  "tenderId" INTEGER NOT NULL,
  "startPrice" DOUBLE PRECISION NOT NULL,
  "currentBid" DOUBLE PRECISION,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Auction_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Bid_tenderId_sellerId_key" ON "Bid"("tenderId", "sellerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Auction_tenderId_key" ON "Auction"("tenderId");
CREATE INDEX IF NOT EXISTS "Tender_buyerId_status_idx" ON "Tender"("buyerId", "status");
CREATE INDEX IF NOT EXISTS "Tender_createdAt_idx" ON "Tender"("createdAt");
CREATE INDEX IF NOT EXISTS "Bid_sellerId_status_idx" ON "Bid"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "Bid_tenderId_status_idx" ON "Bid"("tenderId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRequest_buyerId_status_idx" ON "QuoteRequest"("buyerId", "status");
CREATE INDEX IF NOT EXISTS "QuoteRequest_sellerId_status_idx" ON "QuoteRequest"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" SERIAL PRIMARY KEY,
  "poNumber" TEXT NOT NULL,
  "tenderId" INTEGER NOT NULL,
  "bidId" INTEGER NOT NULL,
  "buyerId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'generated',
  "version" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "PurchaseOrder_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "tenderId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "bidId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18,2);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PurchaseOrder' AND column_name = 'totalValue'
  ) THEN
    UPDATE "PurchaseOrder" SET "amount" = COALESCE("amount", "totalValue"::DECIMAL(18,2), 0) WHERE "amount" IS NULL;
  ELSE
    UPDATE "PurchaseOrder" SET "amount" = COALESCE("amount", 0) WHERE "amount" IS NULL;
  END IF;
END $$;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "amount" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_tenderId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "Tender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_bidId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_buyerId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_sellerId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DeliveryWorkflow" (
  "id" SERIAL PRIMARY KEY,
  "purchaseOrderId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "version" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryWorkflow_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InspectionRecord" (
  "id" SERIAL PRIMARY KEY,
  "purchaseOrderId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "remarks" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionRecord_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Invoice" (
  "id" SERIAL PRIMARY KEY,
  "invoiceNumber" TEXT NOT NULL,
  "purchaseOrderId" INTEGER NOT NULL,
  "sellerId" INTEGER NOT NULL,
  "buyerId" INTEGER NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "version" INTEGER NOT NULL DEFAULT 0,
  "fileAssetId" INTEGER,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "Invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Invoice_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "fileAssetId" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Invoice' AND column_name = 'invoiceNo'
  ) THEN
    UPDATE "Invoice" SET "invoiceNumber" = COALESCE("invoiceNumber", "invoiceNo", 'INV-MIGRATED-' || "id"::TEXT) WHERE "invoiceNumber" IS NULL;
  ELSE
    UPDATE "Invoice" SET "invoiceNumber" = COALESCE("invoiceNumber", 'INV-MIGRATED-' || "id"::TEXT) WHERE "invoiceNumber" IS NULL;
  END IF;
END $$;
ALTER TABLE "Invoice" ALTER COLUMN "invoiceNumber" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "amount" TYPE DECIMAL(18,2) USING "amount"::DECIMAL(18,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_purchaseOrderId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_sellerId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_buyerId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
  "id" SERIAL PRIMARY KEY,
  "referenceId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "invoiceId" INTEGER,
  "purchaseOrderId" INTEGER,
  "payerId" INTEGER NOT NULL,
  "payeeId" INTEGER NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'initiated',
  "version" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentTransaction_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentTransaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentTransaction_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FinancialLedgerEntry" (
  "id" SERIAL PRIMARY KEY,
  "transactionId" INTEGER NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" INTEGER NOT NULL,
  "debitAccount" TEXT NOT NULL,
  "creditAccount" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "entryType" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialLedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "route" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "responseHash" TEXT,
  "responseBody" JSONB,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_bidId_key" ON "PurchaseOrder"("bidId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_buyerId_status_idx" ON "PurchaseOrder"("buyerId", "status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_sellerId_status_idx" ON "PurchaseOrder"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_tenderId_idx" ON "PurchaseOrder"("tenderId");
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryWorkflow_purchaseOrderId_key" ON "DeliveryWorkflow"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryWorkflow_status_idx" ON "DeliveryWorkflow"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "InspectionRecord_purchaseOrderId_key" ON "InspectionRecord"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "InspectionRecord_status_idx" ON "InspectionRecord"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "Invoice_purchaseOrderId_status_idx" ON "Invoice"("purchaseOrderId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_sellerId_status_idx" ON "Invoice"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "Invoice_buyerId_status_idx" ON "Invoice"("buyerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_referenceId_key" ON "PaymentTransaction"("referenceId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_providerPaymentId_key" ON "PaymentTransaction"("providerPaymentId");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_invoiceId_status_idx" ON "PaymentTransaction"("invoiceId", "status");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_purchaseOrderId_status_idx" ON "PaymentTransaction"("purchaseOrderId", "status");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_payerId_status_idx" ON "PaymentTransaction"("payerId", "status");
CREATE INDEX IF NOT EXISTS "PaymentTransaction_payeeId_status_idx" ON "PaymentTransaction"("payeeId", "status");
CREATE INDEX IF NOT EXISTS "FinancialLedgerEntry_transactionId_idx" ON "FinancialLedgerEntry"("transactionId");
CREATE INDEX IF NOT EXISTS "FinancialLedgerEntry_entityType_entityId_idx" ON "FinancialLedgerEntry"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "FinancialLedgerEntry_entryType_idx" ON "FinancialLedgerEntry"("entryType");
CREATE INDEX IF NOT EXISTS "FinancialLedgerEntry_createdAt_idx" ON "FinancialLedgerEntry"("createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_key_userId_route_key" ON "IdempotencyKey"("key", "userId", "route");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_userId_route_idx" ON "IdempotencyKey"("userId", "route");
CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");
