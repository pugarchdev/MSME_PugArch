# Phase 2 Database Domain Model Completion Report

## Summary

Phase 2 adds the missing government-grade procurement domain tables, taxonomy, lifecycle enums, and backward-compatible enum helper fields required to evolve the MSME portal beyond the working prototype.

The existing lower-case enums (`Role`, `RegistrationStatus`, `OnboardingStatus`, `TenderStatus`) were preserved. Existing string status columns were not replaced; new enum helper columns were added in parallel where needed.

## Migration

- Migration folder: `20260516000000_domain_model_completion`
- Migration file: `backend/prisma/migrations/20260516000000_domain_model_completion/migration.sql`
- Prisma schema validation: passed
- Prisma client generation: passed

`npx prisma migrate dev --name domain_model_completion` could not complete because the existing migration history fails during shadow database replay at `20260514223000_add_financial_security_models` with `SellerOffice` missing.

`npx prisma migrate deploy` also could not apply new migrations because the target database already records a failed migration: `20260515170000_phase_2b_core_foundation`.

## Models Added

Catalogue and taxonomy:
- `Category`
- `Product`
- `ProductImage`
- `ProductSpecification`
- `Service`
- `Certification`

Procurement:
- `Requirement`
- `RequirementItem`
- `DirectPurchase`
- `QuoteResponse`
- `TenderItem`
- `TenderDocument`
- `TenderParticipant`
- `BidItem`

Evaluation and contracts:
- `TechnicalEvaluationCriteria`
- `TechnicalEvaluationResult`
- `FinancialEvaluation`
- `ComparativeStatement`
- `Contract`

Fulfillment and finance:
- `PurchaseOrderItem`
- `DeliveryTracking`
- `DeliveryTrackingEvent`
- `InspectionReport`
- `InvoiceItem`
- `MilestonePayment`

Ratings:
- `SupplierRating`
- `BuyerRating`

## Foundation Models Confirmed

Already present and retained:
- `Organization`
- `UserSession`
- `RbacRole`
- `Permission`
- `RolePermission`
- `SellerDocument`
- `ApiVerificationLog`
- `NotificationLog`
- `ApiLog`
- `ComplianceRule`
- `FraudAlert`

## Enums Added

- `BidStatus`
- `AuctionStatus`
- `ParticipantStatus`
- `RequirementStatus`
- `DirectPurchaseStatus`
- `QuoteRequestStatus`
- `QuoteResponseStatus`
- `POStatus`
- `DeliveryStatus`
- `InspectionStatus`
- `InvoiceStatus`
- `PaymentStatus`
- `EscrowStatus`
- `EvaluationStatus`
- `ContractStatus`
- `ContractType`
- `SLAStatus`
- `LedgerEntryType`
- `MilestoneStatus`
- `MilestonePaymentStatus`
- `DisputeStatus`
- `GrievanceStatus`
- `TenderStatusV2`

Already present and retained:
- `UserStatus`
- `OrganizationType`
- `VerificationStatus`
- `MSMECategory`
- `ProcurementMethod`
- `ApprovalStatus`
- `ProductStatus`
- `CategoryType`
- `PricingModel`
- `StorageProvider`
- `FileStatus`
- `Severity`
- `PaymentGateway`
- `PaymentMethod`

## Models Extended

- `User`: organization-linked domain relations for catalogue, requirements, purchases, evaluations, participants, and ratings.
- `BuyerProfile`: existing optional `organizationId` retained.
- `SellerProfile`: existing optional `organizationId` retained; added certifications relation.
- `Organization`: added category, product, service, requirement, and tender relations.
- `FileAsset`: added product image, tender document, purchase order PDF, and invoice file relations.
- `Tender`: added `categoryId`, `requirementId`, `organizationId`, `statusEnum`, `publishedAt`, `closedAt`, and `awardedBidId`.
- `Bid`: added `bidNumber`, `statusEnum`, `modifiedAt`, and item/evaluation/contract relations.
- `QuoteRequest`: added `statusEnum` and `QuoteResponse` relation.
- `Auction`: added `statusEnum`, `currentLowestBid`, `currentWinnerId`, and current winner relation.
- `PurchaseOrder`: added `poStatus`, `sourceType`, `sourceId`, `pdfFileId`, item, delivery, inspection, and contract relations.
- `Invoice`: added `invoiceStatus`, `tdsAmount`, tax amount fields, `invoiceFileId`, item, and milestone payment relations.
- `PaymentTransaction`: added `paymentStatus`.
- `FinancialLedgerEntry`: added `entryTypeEnum`.
- `EscrowAccount`: added `escrowStatus`.
- `Milestone`: added `statusEnum` and milestone payment relation.
- `Dispute`: added `statusEnum`.
- `GrievanceTicket`: added `statusEnum` and `slaStatus`.
- `ComplianceViolation`: added optional `entityType` and `entityId`.

## Seed Data Added

Existing seed coverage retained:
- System roles
- Permissions
- Role permissions
- Basic compliance rules

Added category roots:
- IT Equipment
- Office Supplies
- Machinery
- Services
- Construction
- Consulting
- Furniture
- Medical Supplies
- Logistics
- Software & Cloud

No fake production users were added.

## Backward Compatibility Notes

- Lower-case Prisma enums were not replaced or renamed.
- Existing string status fields remain in place.
- New lifecycle enums are optional helper fields for gradual migration.
- Existing financial workflow tables were extended additively.
- Existing `Tender.status` remains the lower-case `TenderStatus`; new uppercase tender lifecycle values use `TenderStatusV2` through `Tender.statusEnum`.
- The generated migration is schema-diff based and additive, but the live database cannot accept it until existing failed migration state is resolved.

## Verification

Commands run:
- `npx prisma format` - passed
- `npx prisma validate` - passed
- `npx prisma migrate dev --name domain_model_completion` - blocked by historical shadow replay failure
- `npx prisma generate` - passed
- `npm run typecheck --workspace=backend` - passed
- `npm run typecheck --workspace=frontend` - passed
- `npm run build --workspace=backend` - passed
- `npm run build --workspace=frontend` - passed

Additional migration apply attempt:
- `npx prisma migrate deploy` - blocked because the target database records failed migration `20260515170000_phase_2b_core_foundation`

## Remaining Migration Risks

- The checked-in migration history does not replay cleanly into a Prisma shadow database.
- The configured database has a failed migration record that must be resolved before new migrations can be applied.
- Before applying Phase 2 to shared or production-like data, inspect the failed `20260515170000_phase_2b_core_foundation` migration and decide whether it should be fixed forward, marked rolled back, or marked applied after manual verification.
- The generated Phase 2 migration contains new foreign keys; existing data should be checked for orphaned references before applying it to a database with drift.
