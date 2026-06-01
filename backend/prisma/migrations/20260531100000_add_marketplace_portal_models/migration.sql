-- CreateTable
CREATE TABLE "MarketplaceBanner" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "ctaText" TEXT,
    "ctaLink" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceNotice" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceBanner_isActive_displayOrder_idx" ON "MarketplaceBanner"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "MarketplaceBanner_companyId_idx" ON "MarketplaceBanner"("companyId");

-- CreateIndex
CREATE INDEX "MarketplaceNotice_isActive_publishedAt_idx" ON "MarketplaceNotice"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "MarketplaceNotice_companyId_idx" ON "MarketplaceNotice"("companyId");

-- CreateIndex
CREATE INDEX "MarketplaceNotice_type_idx" ON "MarketplaceNotice"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceSetting_companyId_key_key" ON "MarketplaceSetting"("companyId", "key");

-- CreateIndex
CREATE INDEX "MarketplaceSetting_companyId_idx" ON "MarketplaceSetting"("companyId");
