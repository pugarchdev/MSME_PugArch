-- CreateEnum
CREATE TYPE "Role" AS ENUM ('seller', 'buyer', 'admin');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('incomplete', 'completed');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('pending', 'pending_validation', 'under_compliance_review', 'resubmission_required', 'approved_for_procurement', 'rejected');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'incomplete',
    "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "sectionStatus" JSONB,
    "sectionRejectionReasons" JSONB,
    "registrationDetails" JSONB,
    "adminFeedback" TEXT DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "organizationName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "cin" TEXT,
    "pan" TEXT NOT NULL,
    "gst" TEXT,
    "website" TEXT,
    "representativeName" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "email" TEXT,
    "mobile" TEXT NOT NULL,
    "alternateMobile" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "registeredAddress" TEXT NOT NULL,
    "corporateAddress" TEXT,
    "procurementCategories" TEXT[],
    "otherCategoryDetails" TEXT,
    "annualBudget" TEXT,
    "preferredMethods" TEXT[],
    "documents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "applicantName" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "businessPanName" TEXT,
    "pan" TEXT NOT NULL,
    "aadhaarNumber" TEXT,
    "legalEntityType" TEXT,
    "dateOfIncorporation" TIMESTAMP(3),
    "turnover" TEXT,
    "email" TEXT,
    "mobile" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "gst" TEXT,
    "udyam" TEXT,
    "msmeCategory" TEXT,
    "authorizedPersonPan" TEXT,
    "bankAccount" TEXT,
    "ifsc" TEXT,
    "branchName" TEXT,
    "productCategories" TEXT[],
    "otherCategoryDetails" TEXT,
    "productList" TEXT,
    "detailedProductName" TEXT,
    "hsnCode" TEXT,
    "brand" TEXT,
    "specifications" TEXT,
    "documents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" SERIAL NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "tenderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TenderStatus" NOT NULL DEFAULT 'draft',
    "bidsCount" INTEGER NOT NULL DEFAULT 0,
    "closesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Otp" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "otp" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tender_tenderId_key" ON "Tender"("tenderId");

-- AddForeignKey
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
