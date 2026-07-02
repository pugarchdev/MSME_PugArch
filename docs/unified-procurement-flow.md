# Unified Procurement Flow — Technical Documentation

> **Version**: 1.0 — Loops 1–12 consolidated  
> **Last updated**: 2026-06-29  
> **Status**: Ready for deployment / commit

---

## What Changed

The legacy fragmented procurement creation flows (separate Bid wizard, Requirements page, Direct Purchase page, standalone Reverse Auction create) were consolidated into a **single unified procurement wizard** (`CreateProcurementPage`). This wizard supports **17 canonical procurement methods** mapped to **5 Prisma database enums**.

### Key Additions (Loops 1–12)
- Unified `CreateProcurementPage` wizard with 9 guided steps
- `procurementMethodsConfig.ts` — canonical method definitions, recommendation engine, DB mapping
- `SourcingWizardComponents.tsx` — reusable sourcing UI components (stepper, BOQ table, supplier selector, eval builder)
- `BuyerProcurementHub` — buyer-side sourcing dashboard
- `SellerProcurementHub` — seller-side sourcing dashboard with KPIs
- `SellerEventListPage` — unified seller event list with filters
- `SellerEventDetailPage` — tabbed event detail with two-packet lock logic
- Enhanced `ReverseAuctionListPage`, `ReverseAuctionDetailPage`, `ReverseAuctionLivePage`
- `LegacyNoticePage` component for retired creation flows
- Legacy route redirects in `App.tsx`

---

## Active Routes

### Buyer Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/buyer/procurement` | `BuyerProcurementHub` | Sourcing dashboard |
| `/buyer/procurement/create` | `CreateProcurementPage` | Unified wizard |
| `/buyer/create-procurement` | `CreateProcurementPage` | Alias route |
| `/buyer/create-procurement/:draftId` | `CreateProcurementPage` | Resume draft |
| `/buyer/procurement/drafts` | `ProcurementDraftsPage` | Saved drafts |
| `/buyer/procurement/approvals` | `ApprovalQueuePage` | Approval queue |
| `/buyer/procurement/responses` | `Quotations` | Vendor responses |
| `/buyer/procurement/checkout` | `ProcurementCheckoutPage` | Order checkout |
| `/buyer/my-procurements` | `MyProcurementsPage` | Procurement list |
| `/cart` | `CartPage` | Shopping cart |

### Seller Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/seller/procurement` | `SellerProcurementHub` | Seller sourcing hub |
| `/seller/procurement/events` | `SellerEventListPage` | Unified event list |
| `/seller/procurement/events/:id` | `SellerEventDetailPage` | Event detail (tabbed) |
| `/seller/tenders/:id/bid` | `CreateQuotation` | Tender bid submission |
| `/bids/:id` | `BidDetailsPage` | Bid detail / participation |
| `/seller/opportunities` | `SellerOpportunitiesPage` | Marketplace leads |

### Reverse Auction Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/reverse-auctions` | `ReverseAuctionListPage` | Auction listing |
| `/reverse-auctions/:id` | `ReverseAuctionDetailPage` | Auction detail (buyer admin) |
| `/reverse-auctions/:id/live` | `ReverseAuctionLivePage` | Live bidding page |
| `/reverse-auctions/:id/results` | `AuctionResultPage` | Award results |
| `/reverse-auctions/create` | `LegacyNoticePage` | Redirects to unified wizard |

---

## Buyer Flow

```
1. Buyer opens /buyer/procurement (Sourcing Hub Dashboard)
2. Clicks "Create Procurement" → /buyer/procurement/create
3. Wizard Step 1: Selects buyer type (Private / Government) and procurement method
4. System recommends a method based on value, urgency, vendor availability
5. Steps 2–8: Internal details, items/BOQ/services, vendors, timeline, terms, documents, evaluation
6. Step 9: Preview & publish — validation blocks on errors, warns on info items
7. Submit → backend saves with DB-mapped method enum
8. Buyer can save draft at any step → /buyer/procurement/drafts to resume
```

## Seller Flow

```
1. Seller opens /seller/procurement (Procurement Sourcing Hub)
2. Views KPIs: Invited Events, Marketplace Leads, Submissions, etc.
3. Clicks "Unified Procurement Events" → /seller/procurement/events
4. Filters by method, status, submission status, deadline
5. Clicks "View Details" → /seller/procurement/events/:id
6. Reviews event overview, items, required documents, clarifications
7. Accepts terms → clicks "Open Submission Wizard" → /bids/:id or /seller/tenders/:id/bid
8. Submits technical + financial packets (financial locked for two-packet bids until tech qualified)
```

## Reverse Auction Flow

```
1. Buyer creates REVERSE_AUCTION or BID_WITH_REVERSE_AUCTION via unified wizard
2. Backend creates auction record linked to procurement event
3. Buyer opens /reverse-auctions/:id → manages lifecycle (Schedule → Start → Pause → Close)
4. Buyer invites sellers from detail page
5. Seller opens /reverse-auctions/:id/live → sees own rank, bid form, auction rules
6. Seller submits bids only when auction status is LIVE and within time window
7. Competitor identity hidden from seller view; only rank and price visible
8. Buyer views /reverse-auctions/:id/results for award recommendation
```

---

## Method Mapping: 17 Frontend Methods → 5 DB Enums

| Frontend Method | DB Enum | Category |
|----------------|---------|----------|
| `DIRECT_PURCHASE` | `DIRECT_PURCHASE` | Direct |
| `CATALOG_PURCHASE` | `DIRECT_PURCHASE` | Direct |
| `REPEAT_ORDER` | `DIRECT_PURCHASE` | Direct |
| `SINGLE_SOURCE` | `DIRECT_PURCHASE` | Direct |
| `EMERGENCY_PURCHASE` | `DIRECT_PURCHASE` | Direct |
| `RFQ` | `RFQ` | Quotation |
| `RFI` | `RFQ` | Quotation |
| `RFP` | `TENDER` | Tender |
| `SEALED_TENDER` | `TENDER` | Tender |
| `OPEN_TENDER` | `TENDER` | Tender |
| `LIMITED_TENDER` | `TENDER` | Tender |
| `TWO_PACKET_BID` | `TENDER` | Tender |
| `PAC` | `TENDER` | Tender |
| `BOQ_BASED_BID` | `TENDER` | Tender |
| `REVERSE_AUCTION` | `REVERSE_AUCTION` | Auction |
| `BID_WITH_REVERSE_AUCTION` | `REVERSE_AUCTION` | Auction |
| `RATE_CONTRACT` | `RATE_CONTRACT` | Contract |

The frontend `procurementType` field stores the canonical 17-method name for display; `mapToDatabaseMethod()` converts it to the 5 DB enums for backend persistence.

---

## Legacy Routes and Replacements

| Legacy Route | Status | Replacement |
|-------------|--------|-------------|
| `/buyer/create-bid` | Shows `LegacyNoticePage` | `/buyer/procurement/create` |
| `/buyer/requirements/new` | Shows `LegacyNoticePage` | `/buyer/procurement/create` |
| `/buyer/direct-purchase` | Shows `LegacyNoticePage` | `/buyer/procurement/create?method=DIRECT_PURCHASE` |
| `/reverse-auctions/create` | Shows `LegacyNoticePage` | `/buyer/procurement/create?method=REVERSE_AUCTION` |
| `/buyer/direct-purchase/checkout` | `Redirect` | `/buyer/procurement/checkout` |
| `/buyer/create-procurement/direct-purchase/checkout` | `Redirect` | `/buyer/procurement/checkout` |

> **Note**: Old files (bidCreationWizardV2, etc.) are preserved but no longer routed. Comments in `App.tsx` mark their legacy status.

---

## Manual Smoke Test Checklist

### Buyer
- [ ] Open `/buyer/procurement` — Sourcing Hub loads with action cards
- [ ] Open `/buyer/procurement/create` — wizard opens, RFQ is default method
- [ ] Select Government buyer → PAC method → verify PAC-specific document added
- [ ] Select BOQ → add BOQ rows → verify quantity/rate validation
- [ ] Save draft → navigate to `/buyer/procurement/drafts` → resume draft
- [ ] Submit RFQ → verify error-only blocking, warnings pass
- [ ] Open `/buyer/create-bid` → see LegacyNoticePage with redirect buttons
- [ ] Open `/cart` → CartPage renders for authenticated buyer

### Seller
- [ ] Open `/seller/procurement` → Sourcing Hub with KPIs
- [ ] Open `/seller/procurement/events` → event list table with filters
- [ ] Click "View Details" on an event → tabbed detail page
- [ ] Verify "Open Submission Wizard" link works (terms-gated)
- [ ] Filter by "Invited Events" → correct results
- [ ] Verify empty state when no events match filters

### Reverse Auction
- [ ] Buyer opens `/reverse-auctions/:id` → sees Start/Pause/Close controls
- [ ] Seller opens `/reverse-auctions/:id/live` → sees bid form, own rank only
- [ ] Verify bid input disabled when auction is not LIVE
- [ ] Verify seller cannot see competitor org names
- [ ] Verify reserve price hidden from seller
- [ ] Open `/reverse-auctions/create` → LegacyNoticePage displayed

---

## Remaining Limitations

1. **No real-time WebSocket**: Reverse auction live page uses polling (5s interval) instead of WebSocket push. Adequate for current scale but may need upgrade for high-concurrency auctions.

2. **Clarification board is UI-only**: The seller clarification submission in `SellerEventDetailPage` uses a simulated `setTimeout` — backend clarification API integration is pending.

3. **Unified event count**: `SellerProcurementHub` "Unified Procurement Events" card shows count `0` because it doesn't yet aggregate from the unified procurement API; individual KPIs (invites, opportunities) work correctly from the dashboard summary endpoint.

4. **Two-packet financial lock**: The lock logic in `SellerEventDetailPage` checks `currentStage` field values — depends on backend consistently setting these stage transitions.

5. **Draft ownership**: Frontend draft save uses `localStorage` + backend API. The backend `saveProcurementDraft` endpoint should validate that the requesting user owns the draft — verify this is implemented.

6. **GFR compliance wording**: All GFR references use advisory language ("GFR rules recommend...", "compliance-oriented") rather than making legally binding claims. No text says "fully GFR compliant".

7. **Old files preserved**: Legacy bidCreationWizardV2, old ReverseAuctionCreatePage, etc. are preserved on disk but no longer routed. They can be safely deleted in a future cleanup sprint.

8. **BOQ file upload**: BOQ file asset upload creates a `fileAssetId` reference but the actual file storage depends on the backend file upload service being properly configured.
