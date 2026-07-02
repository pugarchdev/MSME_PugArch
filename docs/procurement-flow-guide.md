# Procurement Flow Guide

## Table of Contents

1. [Process Overview](#process-overview)
2. [Procurement Types](#procurement-types)
3. [Buyer Workflow](#buyer-workflow)
4. [Seller Workflow](#seller-workflow)
5. [Required Fields by Method](#required-fields-by-method)
6. [Status Lifecycle](#status-lifecycle)
7. [Flow Diagrams](#flow-diagrams)
8. [Sample Data](#sample-data)

---

## Process Overview

This procurement portal supports **17 procurement methods** across 5 categories, designed for both Private and Government buyers. The system facilitates the complete procurement lifecycle from buyer request creation through seller participation, evaluation, award, and finally to purchase order generation.

### Key Stakeholders

| Stakeholder | Role |
|-------------|------|
| **Buyer** | Creates procurement requests, evaluates bids, awards contracts |
| **Seller** | Views opportunities, submits quotes, participates in auctions |
| **Approver** | Reviews and approves/rejects procurement requests |
| **System** | Manages workflows, notifications, and status transitions |

---

## Procurement Types

### 1. Direct Purchase Methods (5 types)

| Method | Code | Description | Buyer Type |
|--------|------|-------------|------------|
| Direct Purchase | `DIRECT_PURCHASE` | Purchase directly from selected supplier without comparative quotes | Private, Government |
| Catalog Purchase | `CATALOG_PURCHASE` | Buy pre-approved catalogue items with fixed pricing | Private |
| Repeat Order | `REPEAT_ORDER` | Duplicate a previous successful order at original terms | Private |
| Single Source | `SINGLE_SOURCE` | Direct negotiation with single vendor due to technical lock-in | Private |
| Emergency Purchase | `EMERGENCY_PURCHASE` | Bypass timelines for sudden, unforeseen requirements | Private |

### 2. Quotation Methods (2 types)

| Method | Code | Description |
|--------|------|-------------|
| Request for Quotation | `RFQ` | Invite quotes for standard items |
| Request for Information | `RFI` | Gather market capabilities |

### 3. Tender Methods (7 types)

| Method | Code | Description | Buyer Type |
|--------|------|-------------|------------|
| Request for Proposal | `RFP` | Complex services/projects | Private |
| Sealed Tender | `SEALED_TENDER` | Secure formal envelope bidding | Private |
| Open Tender | `OPEN_TENDER` | Public invitation for bids (mandatory >25L for govt) | Government |
| Limited Tender | `LIMITED_TENDER` | Direct invites to pre-registered supplier pool | Government |
| Two-Packet Bid | `TWO_PACKET_BID` | Separate technical and financial packet submissions | Government |
| PAC | `PAC` | Proprietary Article Certificate - OEM-specific procurement | Government |
| BOQ-Based Bid | `BOQ_BASED_BID` | Multiple line items using uploaded spreadsheet template | Both |

### 4. Auction Methods (2 types)

| Method | Code | Description |
|--------|------|-------------|
| Reverse Auction | `REVERSE_AUCTION` | Dynamic real-time online price competition |
| Bid with Reverse Auction | `BID_WITH_REVERSE_AUCTION` | Standard bid followed by reverse auction |

### 5. Contract Method (1 type)

| Method | Code | Description |
|--------|------|-------------|
| Rate Contract | `RATE_CONTRACT` | Establish rate schedules for recurring demands over fixed period |

---

## Buyer Workflow

### Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          BUYER PROCUREMENT WORKFLOW                         │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ 1. START     │
     │ Login        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────────────────────────────────────────────────────────────┐
     │                    2. CREATE PROCUREMENT (9 Steps)                   │
     └──────────────────────────────────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │ Step 1       │──── Select Buyer Type (Private / Government)
     │ Select Type  │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 2       │──── Select Procurement Method (RFQ, Tender, etc.)
     │ Select Method│
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 3       │──── Internal Details: Cost Center, Budget Head, Project Code
     │ Internal     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 4       │──── Add Items / Upload BOQ / Define Services
     │ Items/BOQ    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 5       │──── Select Vendors / Open to All / Category Invite
     │ Vendors      │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 6       │──── Submission Dates, Validity Period, Packet Type
     │ Schedule     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 7       │──── Payment Terms, Delivery, Warranty, EMD
     │ Terms        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 8       │──── Upload Required Documents (Tech Specs, T&C)
     │ Documents    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Step 9       │──── Evaluation Criteria Builder (L1, QCBS, etc.)
     │ Evaluation   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 3. Preview   │──── Review All Details
     │ & Publish    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 4. Submit    │──── Send for Approval (if required)
     │ for Approval│
     └──────┬───────┘
            │
            ▼
     ┌──────────────────────────────────────────────────────────────────────┐
     │                         5. APPROVAL PROCESS                           │
     │    PENDING_APPROVAL → APPROVED or REJECTED                           │
     └──────────────────────────────────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │ 6. Published │──── Event Live on Portal
     │ & Open       │
     └──────┬───────┘
            │
            ▼
     ┌──────────────────────────────────────────────────────────────────────┐
     │                     7. SELLER PARTICIPATION                           │
     │    - View Participants                                                │
     │    - Answer Clarifications                                            │
     │    - Technical Evaluation (for Two-Packet)                           │
     └──────────────────────────────────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │ 8. Financial │──── Open Financial Bids / Run Reverse Auction
     │ Evaluation   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 9. L1        │──── Lowest Bidder Identified
     │ Generation   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 10. Award    │──── Recommend Award → Award to Selected Seller
     │ Recommendation│
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 11. PO       │──── Generate Purchase Order
     │ Generation   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 12. Order    │──── Delivery → GRN → Invoice → Payment
     │ Fulfillment  │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ END          │──── Procurement Complete
     └──────────────┘
```

### Buyer Actions Summary

| Step | Action | Route |
|------|--------|-------|
| 1 | Create Procurement | `/buyer/procurement/create` |
| 2 | Save Draft | `POST /api/procurement/drafts` |
| 3 | Submit Procurement | `POST /api/procurement/submit` |
| 4 | View My Procurements | `GET /api/buyer/my-procurements` |
| 5 | View Participants | `GET /api/buyer/bids/:bidId/participants` |
| 6 | Technical Evaluation | `POST /api/buyer/bids/:bidId/technical-evaluation` |
| 7 | Open Financial | `POST /api/buyer/bids/:bidId/open-financial-evaluation` |
| 8 | Recommend Award | `POST /api/buyer/bids/:bidId/recommend-award` |
| 9 | Generate PO | `POST /api/procurement-mode/confirm` |

---

## Seller Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SELLER PROCUREMENT WORKFLOW                        │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ 1. START     │
     │ Login        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 2. Browse    │──── View Invited Events, Marketplace Leads,
     │ Opportunities│──── Unified Sourcing Events, Reverse Auctions
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 3. Event     │──── View Detailed Requirements, Terms,
     │ Details      │──── Documents, Evaluation Criteria
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 4. Participate│──── Click "Participate" → Start Participation
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 5. Upload    │──── Technical Documents (for Two-Packet: sealed
     │ Technical    │──── until technical qualification)
     │ Documents    │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 6. Submit    │──── Financial Quote / Price Bid
     │ Financial    │
     │ Quote        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 7. Final     │──── Lock and Submit Bid
     │ Submission   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 8. Clarify   │──── Respond to Buyer Queries
     │ (Optional)   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────────────────────────────────────────────────────────────┐
     │                      9. AWAIT EVALUATION                             │
     │    - Technical Evaluation (if Two-Packet)                           │
     │    - Financial Evaluation                                           │
     │    - L1 Generation                                                  │
     └──────────────────────────────────────────────────────────────────────┘
            │
            ▼
     ┌──────────────┐
     │ 10. Receive  │──── View Award Status
     │ Award        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 11. Accept/  │──── Accept or Reject Award
     │ Reject       │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 12. Receive  │──── View Generated Purchase Order
     │ PO           │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ 13. Execute  │──── Deliver Goods/Services → Receive GRN
     │ Order        │──── Submit Invoice → Receive Payment
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ END          │──── Order Complete
     └──────────────┘
```

### Seller Actions Summary

| Step | Action | Route |
|------|--------|-------|
| 1 | Browse Events | `/seller/procurement/events` |
| 2 | View Event Details | `/seller/procurement/events/:id` |
| 3 | Start Participation | `POST /api/bids/:bidId/participate` |
| 4 | Upload Technical Docs | `POST /api/bids/:bidId/participation/:participationId/technical-documents` |
| 5 | Submit Financial Quote | `POST /api/bids/:bidId/participation/:participationId/financial-quote` |
| 6 | Final Submission | `POST /api/bids/:bidId/participation/:participationId/submit` |
| 7 | Respond to Clarification | `POST /api/bids/:bidId/clarifications/:clarificationId/respond` |
| 8 | View Awards | `GET /api/seller/awards` |
| 9 | Accept Award | `POST /api/seller/awards/:awardId/accept` |

---

## Required Fields by Method

### Always Required Fields

| Field | Description | Example |
|-------|-------------|---------|
| `title` | Procurement title | "Office Furniture Procurement Q3 2024" |
| `estimatedValue` | Budget estimate (INR) | 500000 |
| `deliveryLocation` | Delivery address | "Warehouse, Sector 62, Noida" |

### Method-Specific Required Fields

#### RFQ (Request for Quotation)

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "IT Equipment Procurement" |
| estimatedValue | Yes | 250000 |
| deliveryLocation | Yes | "Mumbai Office" |
| requiredByDate | Yes | "2024-12-31" |
| items.description | Yes | "Laptop Dell Latitude 5440" |
| items.quantity | Yes | 10 |
| items.unit | Yes | "Nos" |

#### RFP (Request for Proposal)

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Software Development Services" |
| estimatedValue | Yes | 5000000 |
| deliveryLocation | Yes | "Pan India" |
| scopeOfWork | Yes | "Develop ERP Module for Finance" |
| deliverables | Yes | ["Module Code", "Documentation", "Training"] |
| timeline | Yes | "6 Months" |

#### OPEN_TENDER / SEALED_TENDER / LIMITED_TENDER

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Road Construction Project" |
| estimatedValue | Yes | 50000000 |
| deliveryLocation | Yes | "Delhi NCR" |
| submissionDate | Yes | "2024-11-15" |
| submissionTime | Yes | "17:00" |
| tenderFee | No | 5000 |
| emdAmount | No | 500000 |

#### TWO_PACKET_BID

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Infrastructure Development" |
| estimatedValue | Yes | 100000000 |
| deliveryLocation | Yes | "Hyderabad" |
| submissionDate | Yes | "2024-12-01" |
| technicalOpeningDate | Yes | "2024-12-02" |
| financialOpeningDate | Yes | "2024-12-05" |

#### SINGLE_SOURCE

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Oracle License Renewal" |
| estimatedValue | Yes | 2000000 |
| deliveryLocation | Yes | "Bangalore" |
| justification | Yes | "Proprietary system requiring OEM support" |
| selectedSellerId | Yes | "seller_123" |

#### EMERGENCY_PURCHASE

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Emergency IT Equipment" |
| estimatedValue | Yes | 150000 |
| deliveryLocation | Yes | "Chennai" |
| justification | Yes | "Critical server failure, immediate replacement needed" |
| emergencyCertificate | Yes | (Upload) |

#### BOQ_BASED_BID

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Building Construction BOQ" |
| estimatedValue | Yes | 25000000 |
| deliveryLocation | Yes | "Pune" |
| submissionDate | Yes | "2024-11-20" |
| boqFile | Yes | (Excel Upload) |

#### REVERSE_AUCTION

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Steel Procurement Auction" |
| estimatedValue | Yes | 10000000 |
| deliveryLocation | Yes | "Jamshedpur" |
| auctionStartDate | Yes | "2024-11-25" |
| auctionStartTime | Yes | "10:00" |
| auctionDuration | Yes | 60 (minutes) |
| minDecrement | Yes | 10000 |

#### RATE_CONTRACT

| Field | Required | Sample Value |
|-------|----------|---------------|
| title | Yes | "Annual Stationery Supply" |
| estimatedValue | Yes | 1000000 |
| deliveryLocation | Yes | "All Branch Offices" |
| contractPeriod | Yes | "12 Months" |
| rateList | Yes | (Item-wise rates) |

---

## Status Lifecycle

### ProcurementBid Status Flow

```
                              ┌──────────────────┐
                              │                  │
                              │     DRAFT        │
                              │                  │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
              ┌───────────────│                  │
              │               │ PENDING_APPROVAL │
              │               │                  │
              │               └────────┬─────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
           ┌──────────────────┐               ┌──────────────────┐
           │                  │               │                  │
           │    APPROVED      │               │    REJECTED      │
           │                  │               │                  │
           └────────┬─────────┘               └──────────────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │    PUBLISHED     │
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │   OPEN / LIVE    │─────────────────────┐
           │                  │                     │
           └────────┬─────────┘                     │
                    │                               │
                    ▼                               ▼
           ┌──────────────────┐            ┌──────────────────┐
           │                  │            │                  │
           │ TECHNICAL_EVAL   │            │    CANCELLED     │
           │ (Two-Packet)     │            │                  │
           └────────┬─────────┘            └──────────────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │ FINANCIAL_EVAL   │
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │   L1_GENERATED   │
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │ AWARD_RECOMMENDED│
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │     AWARDED      │
           │                  │
           └────────┬���────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │   PO_GENERATED   │
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │   IN_PROGRESS    │
           │                  │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │                  │
           │    COMPLETED     │
           │                  │
           └──────────────────┘
```

### Order Fulfillment Status Flow

```
PROCUREMENT_CREATED
       │
       ▼
SUPPLIER_SELECTED
       │
       ▼
PO_GENERATED ─────────────────────────────────┐
       │                                        │
       ▼                                        │
SELLER_ACCEPTED                                │
       │                                        │
       ▼                                        │
DELIVERY_STARTED                               │
       │                                        │
       ▼                                        │
DELIVERY_COMPLETED                             │
       │                                        │
       ▼                                        │
GRN_CONFIRMED                                  │
       │                                        │
       ▼                                        │
INVOICE_UPLOADED                               │
       │                                        │
       ▼                                        │
INVOICE_APPROVED                               │
       │                                        │
       ▼                                        │
PAYMENT_INITIATED                              │
       │                                        │
       ▼                                        │
ESCROW_HELD                                    │
       │                                        │
       ▼                                        │
SETTLEMENT_RELEASED                            │
       │                                        │
       ▼                                        │
COMPLETED ◄────────────────────────────────────┘
```

---

## Flow Diagrams

### End-to-End Procurement Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            PROCUREMENT END-TO-END FLOW                          │
└─────────────────────────────────────────────────────────────────────────────────┘

    BUYER                              SYSTEM                              SELLER
    ═════                              ══════                              ══════

       │                                                                         │
       │  1. Create Procurement                                                   │
       │  (Fill Details, Items, Terms)                                           │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 2. Validate & Save Draft                   │
       │                           │◄────────────────────                       │
       │                           │                                             │
       │  3. Submit for Approval   │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 4. Route to Approver                       │
       │                           │◄────────────────────                       │
       │                           │                                             │
       │  5. Approval Decision     │                                             │
       │◄──────────────────────────│                                             │
       │     (Approve/Reject)      │                                             │
       │                           │                                             │
       │  6. Publish Event         │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 7. Notify Invited Sellers                 │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       │                           │ 8. Event Visible in Marketplace           │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │                           │ 9. View & Download Documents              │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │                           │ 10. Submit Clarification Question         │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │  11. Answer Clarification│                                             │
       │◄──────────────────────────│                                             │
       │                           │                                             │
       │                           │ 12. Submit Technical Documents            │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │                           │ 13. Submit Financial Quote                │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │                           │ 14. Final Submission                      │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │  15. View All Bids        │                                             │
       │◄──────────────────────────│                                             │
       │                           │                                             │
       │  16. Technical Evaluation│                                             │
       │  (For Two-Packet)         │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  17. Open Financial Bids │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  18. Evaluate & Generate L1│                                            │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  19. Recommend Award      │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 20. Notify Awarded Seller                 │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       │  21. Generate PO          │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 22. Send PO to Seller                     │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       │  23. Accept PO            │                                             │
       │◄──────────────────────────│                                             │
       │                           │                                             │
       │  24. Track Delivery       │                                             │
       │◄──────────────────────────│                                             │
       │                           │ 25. Update Delivery Status                │
       │                           │◄───────────────────────────────────────────
       │                           │                                             │
       │  26. Confirm GRN          │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  27. Process Payment      │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │ 28. Payment Settlement                    │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       ▼                           ▼                                             ▼
   COMPLETE                      COMPLETE                                      COMPLETE
```

### Two-Packet Bid Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TWO-PACKET BID FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

    BUYER                              SYSTEM                              SELLER
    ═════                              ══════                              ══════

       │                                                                         │
       │  Create Tender with Two-Packet                                          │
       │  - Technical Opening: Dec 2                                            │
       │  - Financial Opening: Dec 5                                            │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │  Publish Tender                            │
       │                           │◄────────────────────                       │
       │                           │                                             │
       │                           │  Display Tender (Dates Visible)           │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Submit Technical Packet                  │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Submit Financial Packet (SEALED)         │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  SUBMISSION DEADLINE      │                                             │
       │       (Dec 1)             │                                             │
       │                           │                                             │
       │                           │  LOCK Financial Packets                   │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  Technical Evaluation     │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  TECHNICAL OPENING        │                                             │
       │       (Dec 2)             │                                             │
       │                           │                                             │
       │                           │  Notify Technically Qualified             │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       │                           │  Notify Techncially Disqualified          │
       │                           │───────────────────────────────────────────►
       │                           │                                             │
       │  FINANCIAL OPENING        │                                             │
       │       (Dec 5)             │                                             │
       │                           │                                             │
       │                           │  UNLOCK Financial Packets                 │
       │                           │  Open for Buyer Review                    │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  Evaluate Financial       │                                             │
       │  Generate L1              │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │  Award Recommendation     │                                             │
       │─────────────────────────────►                                           │
       ▼                           ▼                                             ▼
```

### Reverse Auction Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           REVERSE AUCTION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    BUYER                              SYSTEM                              SELLER
    ═════                              ══════                              ══════

       │                                                                         │
       │  Create Reverse Auction                                               │
       │  - Base Price: ₹10,00,000                                            │
       │  - Min Decrement: ₹10,000                                            │
       │  - Duration: 60 minutes                                              │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │  Schedule Auction                         │
       │                           │◄────────────────────                       │
       │                           │                                             │
       │                           │  Auction Scheduled                        │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  AUCTION START TIME      │                                             │
       │       (10:00 AM)         │                                             │
       │                           │                                             │
       │                           │  START AUCTION                            │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Live: Current Low: ₹9,90,000            │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Seller A bids: ₹9,80,000                 │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Live: Current Low: ₹9,80,000 (Seller A) │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Seller B bids: ₹9,70,000                 │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │                           │  Live: Current Low: ₹9,70,000 (Seller B) │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  View Live Rankings     │                                             │
       │◄──────────────────────────│                                             │
       │                           │                                             │
       │  AUCTION END TIME       │                                             │
       │       (11:00 AM)        │                                             │
       │                           │                                             │
       │                           │  CLOSE AUCTION                            │
       │                           │◄──────────────────────────────────────────
       │                           │                                             │
       │  View Final Results      │                                             │
       │  - Winner: Seller B      │                                             │
       │  - Final Price: ₹9,70,000│                                             │
       │◄──────────────────────────│                                             │
       │                           │                                             │
       │  Award to Winner         │                                             │
       │─────────────────────────────►                                           │
       │                           │                                             │
       │                           │  Notify Winner                            │
       │                           │───────────────────────────────────────────►
       ▼                           ▼                                             ▼
```

---

## Sample Data

### Sample 1: RFQ (Request for Quotation)

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "IT Equipment Procurement - Q4 2024" |
| Buyer Type | Private |
| Procurement Method | RFQ |
| Estimated Value | ₹2,50,000 |
| Delivery Location | "ABC Corporation, Sector 62, Noida, UP - 201309" |
| Required By Date | 2024-12-31 |
| Payment Terms | "30 days from delivery" |
| Warranty Required | "Minimum 1 year" |

**Line Items:**

| Item Description | Quantity | Unit | Specifications |
|------------------|----------|------|----------------|
| Dell Latitude 5440 Laptop | 10 | Nos | Intel i7, 16GB RAM, 512GB SSD |
| Logitech MX Master 3 Mouse | 10 | Nos | Wireless, Bluetooth |
| Dell 24-inch Monitor | 10 | Nos | IPS Panel, 1920x1080 |

**Invited Sellers:** Seller A, Seller B, Seller C

---

### Sample 2: Open Tender (Government)

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Road Construction - NH-48 Section" |
| Buyer Type | Government |
| Procurement Method | OPEN_TENDER |
| Estimated Value | ₹50,00,00,000 (50 Crores) |
| Delivery Location | "KM 45-78, NH-48, Gujarat" |
| Submission Date | 2024-11-15 |
| Submission Time | 17:00 |
| Tender Fee | ₹10,000 |
| EMD Amount | ₹50,00,000 |
| Completion Period | "18 Months" |

**Eligibility Criteria:**

- Minimum 5 years experience in road construction
- Minimum annual turnover: ₹100 Crores
- Should have completed at least 2 similar projects

**Technical Specifications:**

- Sub-grade preparation as per IRC:37
- WMM thickness: 150mm
- BC layer: 40mm

---

### Sample 3: Two-Packet Bid (Government)

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Smart City IT Infrastructure" |
| Buyer Type | Government |
| Procurement Method | TWO_PACKET_BID |
| Estimated Value | ₹25,00,00,000 (25 Crores) |
| Delivery Location | "Bhopal Smart City" |
| Submission Date | 2024-12-01 |
| Technical Opening Date | 2024-12-02 |
| Financial Opening Date | 2024-12-05 |
| Tender Fee | ₹25,000 |
| EMD Amount | ₹25,00,000 |

**Technical Packet Requirements:**

- Company profile
- Similar project experience certificates
- Technical specifications compliance
- Team composition
- Implementation methodology

**Financial Packet Requirements:**

- Price schedule (sealed)
- Price breakdown
- Payment terms acceptance

---

### Sample 4: Emergency Purchase (Private)

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Emergency Server Replacement" |
| Buyer Type | Private |
| Procurement Method | EMERGENCY_PURCHASE |
| Estimated Value | ₹5,00,000 |
| Delivery Location | "Data Center, Bangalore" |
| Justification | "Primary database server crashed, critical for business operations. Immediate replacement required to restore services." |
| Emergency Certificate | (Attached: Incident Report dated 2024-10-25) |

**Selected Seller:**

| Field | Value |
|-------|-------|
| Seller Name | "TechServe Solutions Pvt Ltd" |
| Justification | "Authorized Dell partner with 24x7 support, immediate availability" |

---

### Sample 5: Reverse Auction

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Steel Procurement - TMT Bars" |
| Buyer Type | Private |
| Procurement Method | REVERSE_AUCTION |
| Estimated Value | ₹1,00,00,000 |
| Delivery Location | "Construction Site, Mumbai" |
| Base Price (Starting) | ₹1,00,00,000 |
| Auction Start Date | 2024-11-25 |
| Auction Start Time | 10:00 AM |
| Auction Duration | 60 minutes |
| Minimum Decrement | ₹50,000 |
| Extension Rule | "5 minutes if bid in last 2 minutes" |

**Item Specifications:**

| Item | Quantity | Grade |
|------|----------|-------|
| TMT Bars 12mm | 100 MT | Fe 550D |
| TMT Bars 16mm | 150 MT | Fe 550D |
| TMT Bars 20mm | 100 MT | Fe 550D |

---

### Sample 6: Rate Contract

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Annual Stationery Supply Contract" |
| Buyer Type | Private |
| Procurement Method | RATE_CONTRACT |
| Estimated Annual Value | ₹10,00,000 |
| Delivery Location | "All Branch Offices (15 locations)" |
| Contract Period | 12 Months |
| Payment Terms | "Monthly reconciliation, 45 days" |

**Rate List:**

| Item | Unit | Contract Rate (₹) |
|------|------|-------------------|
| A4 Size Paper (500 sheets) | Ream | 350 |
| Blue Ball Point Pen | Dozen | 45 |
| Stapler (Big) | Piece | 120 |
| File Folder | Piece | 15 |
| White Board Marker | Piece | 25 |

---

### Sample 7: BOQ-Based Bid

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Office Interior Work - New Branch" |
| Buyer Type | Private |
| Procurement Method | BOQ_BASED_BID |
| Estimated Value | ₹15,00,000 |
| Delivery Location | "Pune, Maharashtra" |
| Submission Date | 2024-11-20 |
| BOQ File | "BOQ_InteriorWork.xlsx" |

**BOQ Sample (Excel Format):**

| S.No | Item Description | Unit | Quantity | Rate (₹) | Amount (₹) |
|------|------------------|------|----------|----------|------------|
| 1 | False Ceiling (Gypsum) | Sqft | 2000 | 120 | 2,40,000 |
| 2 | Flooring (Vitrified Tiles) | Sqft | 1500 | 180 | 2,70,000 |
| 3 | Wall Painting | Sqft | 4000 | 25 | 1,00,000 |
| 4 | Reception Counter | Nos | 1 | 75,000 | 75,000 |
| 5 | Conference Table (10 Seater) | Nos | 1 | 50,000 | 50,000 |
| 6 | Office Chairs | Nos | 50 | 8,000 | 4,00,000 |
| 7 | Electrical Wiring | Lot | 1 | 2,00,000 | 2,00,000 |
| 8 | AC Installation | Nos | 4 | 35,000 | 1,40,000 |

---

### Sample 8: Single Source Procurement

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Oracle Database License Renewal" |
| Buyer Type | Private |
| Procurement Method | SINGLE_SOURCE |
| Estimated Value | ₹20,00,000 |
| Delivery Location | "Head Office, Bangalore" |
| Justification | "Existing Oracle database infrastructure is proprietary. Only Oracle Corporation can provide valid licensing, technical support, and upgrade services. Switching vendors would require complete re-architecture causing business disruption." |
| Selected Seller | "Oracle India Pvt Ltd" |

---

### Sample 9: Catalog Purchase

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Office Furniture - Catalog Order" |
| Buyer Type | Private |
| Procurement Method | CATALOG_PURCHASE |
| Estimated Value | ₹5,00,000 |
| Delivery Location | "Gurgaon Office" |

**Catalog Items Selected:**

| Catalog Item | Unit Price (₹) | Quantity | Total (₹) |
|--------------|----------------|----------|-----------|
| Executive Desk (Oak Finish) | 25,000 | 5 | 1,25,000 |
| Ergonomic Chair (High Back) | 15,000 | 10 | 1,50,000 |
| Meeting Table (6 Seater) | 30,000 | 2 | 60,000 |
| Storage Cabinet | 12,000 | 5 | 60,000 |
| Bookshelf | 8,000 | 3 | 24,000 |

---

### Sample 10: Repeat Order

**Buyer Input:**

| Field | Value |
|-------|-------|
| Title | "Q4 2024 - Repeat IT Consumables Order" |
| Buyer Type | Private |
| Procurement Method | REPEAT_ORDER |
| Estimated Value | ₹1,00,000 |
| Delivery Location | "Mumbai Office" |
| Original PO Reference | "PO-2024-00345" |
| Original Order Date | 2024-01-15 |
| Justification | "Reordering same items as per original PO at same terms and pricing for Q4 requirement" |

**Items (Same as Original PO):**

| Item | Original Rate (₹) | Order Qty | Total (₹) |
|------|-------------------|-----------|-----------|
| Printer Toner HP 85A | 2,500 | 20 | 50,000 |
| A4 Paper (500 sheets) | 350 | 100 | 35,000 |
| USB Flash Drive 32GB | 500 | 30 | 15,000 |

---

## Summary

This document provides a comprehensive guide to the procurement portal workflow. The system supports multiple procurement methods to accommodate various business requirements, from simple direct purchases to complex two_packet tenders and reverse auctions.

### Key Takeaways:

1. **For Buyers:** Use the 9-step wizard to create procurements. Start with selecting the buyer type and method that best fits your requirement.

2. **For Sellers:** Monitor the seller dashboard for invited events and open opportunities. Submit technical and financial packets as required.

3. **For Approvers:** Review pending approvals and ensure compliance with organizational policies.

4. **Status Tracking:** Use the status lifecycle diagrams to understand where each procurement stands in its journey.

5. **Method Selection:** Choose the appropriate method based on value, urgency, and competitive requirements.

---

*Document Version: 1.0*  
*Last Updated: July 2026*