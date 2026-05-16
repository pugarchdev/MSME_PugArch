# Phase 0 — Baseline Audit & Recheck

**Report Generated**: 2026-05-15
**Active Feature Branch**: `secure-`

This document establishes the functional and architectural baseline for the conversion of the MSME procurement platform from prototype to a modular, secure, auditable, production-ready system.

---

## 📊 Platform Metric Summary

| Area | Measured Baseline Value | Notes / Status |
| :--- | :--- | :--- |
| **Current Branch** | `secure-` | Synced and fully up-to-date. |
| **`backend/index.ts` Line Count** | **4,433 lines** | Massive monolithic setup requiring splitting. |
| **Active Express Routes Count** | ~90+ routes | All hosted within the core listener loop. |
| **Prisma Validation** | `Valid` ✅ | Successfully synced with local schema definition. |
| **Backend Typecheck** | `Success` ✅ | Zero compilation or declaration errors. |
| **Frontend Typecheck** | `Success` ✅ | Fully typed without compilation errors. |
| **Backend Security Suite** | **14 / 14 Passed** ✅ | Strong foundational middleware assertions. |
| **Backend Build Status** | `Success` ✅ | Static bundle generated perfectly. |
| **Frontend Build Status** | `Success` ✅ | Production client assets created seamlessly. |

---

## 🧬 Codebase Architecture & Scans

### 1. Empty Module Analysis (`backend/src/modules`)
An audit of the existing backend module subdirectories reveals that while folders exist, **almost all are empty skeleton directories** without active routing code.

*   **Fully Populated Module**: `payments`
*   **Scaffolded / Partial Module**: `auth` (contains `login-event.service.ts` and partial routing skeletons)
*   **Empty / Placeholder Modules**:
    *   `admin`, `analytics`, `auctions`, `audit`, `bids`, `catalogue`, `compliance`, `delivery`, `disputes`, `escrow`, `files`, `grievances`, `inspection`, `invoices`, `notifications`, `onboarding`, `purchase-orders`, `quotations`, `requirements`, `tenders`, `users`, `vendors`.

### 2. Frontend Feature Structures & Gaps
Features defined in `frontend/src/features/` mirror the backend domain layout but currently lack fully hooked client-side queries.
*   **Mock Data Footprint**:
    *   `PurchaseOrders.tsx`: Operates purely on hardcoded `SAMPLE_ORDERS`.
    *   `ParcelTracking.tsx`: Operates on hardcoded `shipments` variable arrays; lacks dynamic external delivery API queries.
    *   `indiaStatesDistricts.ts`: Static lookup data for state/region routing.

---

## 🎯 API Route Inventory & Refactor Map
The monolith `index.ts` contains the following route grouping clusters which will be carved out in sequence during Phase 1:

1.  **Auth & Credentials** (`/api/auth/*`)
2.  **File Storage & Multi-part Uploads** (`/api/files/*`, `/api/upload`)
3.  **Onboarding** (`/api/seller/*`, `/api/buyer/*`)
4.  **Admin Control Plane** (`/api/admin/*`)
5.  **Vendors & Catalogue**
6.  **Procurement Tenders** (`/api/tenders/*`)
7.  **Bid Placement** (`/api/bids/*`)
8.  **Quotations & Invoicing** (`/api/quotations/*`, `/api/invoices/*`)
9.  **Live Auctions** (`/api/auctions/*`)
10. **Purchase Orders & Delivery** (`/api/purchase-orders/*`)
11. **Notifications & Realtime SSE**
12. **Disputes & Resolution** (`/api/disputes/*`, `/api/grievances/*`)

---

## ⚠️ Immediate Technical Risks

1.  **Extremely Fragile Monolith**: Modifying `backend/index.ts` carries significant risk of unexpected syntax breaks or merge conflicts due to file length (4,433 lines).
2.  **Duplicate Validation Layers**: Some older routes use ad-hoc checking, whereas new modules use structured `Zod` parsing. This inconsistent enforcement creates payload risks.
3.  **Legacy Mock Footprints**: Production build success hides functional gaps where the UI relies on frontend-only static mock data structures (`PurchaseOrders`, `ParcelTracking`).
4.  **Static Cache Footprints**: The lack of centralized key generation for Redis structures could lead to potential namespace collisions down the line.

---

### ✅ Baseline Audit Completed Successfully
The environment is verified as stable, building, and secure. Ready to commence **Phase 1: Backend Modular Refactor**.
