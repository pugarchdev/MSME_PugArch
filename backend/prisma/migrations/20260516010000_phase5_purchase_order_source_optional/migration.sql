-- Phase 5: allow non-tender procurement workflows to generate purchase orders.
-- Tender POs still carry tenderId/bidId, while Direct Purchase and RFQ POs use sourceType/sourceId.
ALTER TABLE "PurchaseOrder" ALTER COLUMN "tenderId" DROP NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "bidId" DROP NOT NULL;
