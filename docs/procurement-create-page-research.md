# Create Procurement Page Research And Field Review

Date: 2026-06-20

## Scope

This review covers the `CreateProcurementPage` intake wizard for an MSME/PugArch procurement portal serving MSME sellers and private buyers across small, medium, and large industries. The goal is to keep procurement creation fast enough for MVP delivery while still matching common Indian procurement patterns.

## Sources Checked

- Government e Marketplace overview, August 2024: https://assets-bg.gem.gov.in/resources/upload/shared_doc/gem-overview-ppt-12-august-2024_1724322936.pdf
- General Financial Rules procurement methods, 2017 extract: https://nitdgp.ac.in/uploads/82cb81c7ee80d79b8ac80bda680fce40.pdf
- DC MSME Public Procurement Policy MSE page: https://dcmsme.gov.in/pppm.htm.aspx
- PIB release on Public Procurement Policy for Micro and Small Enterprises, 2024-08-01: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2040253

## Procurement Types

The current route options are mostly correct for the portal:

- Direct Purchase: appropriate for low-value, known seller, catalogue, urgent, or proprietary/PAC style buying.
- L1 Comparison: useful for private buyers comparing equivalent catalogue offers before placing an order.
- RFQ / eRFQ: appropriate for controlled quotation collection from selected or open suppliers.
- Tender / e-Bid: appropriate for higher-value and formal two-bid/compliance-heavy procurement.
- Reverse Auction: appropriate after technical qualification, where price discovery is the main objective.

Official references support these broad routes. GeM lists Direct Procurement, e-Bidding, and Reverse Auction as core tools. GFR procurement methods include advertised tender, limited tender, two-stage bidding, single tender, and electronic reverse auctions.

Recommended later addition:

- Rate Contract / Framework Agreement. The backend already has a `RATE_CONTRACT` procurement method, and this is useful for recurring industrial purchases, maintenance contracts, spares, consumables, packaging, logistics, and office supplies. For the 3-day delivery window, this can be deferred because RFQ and Direct Purchase cover the same MVP user journey well enough.

## Requirement Types

The current requirement types are suitable:

- Goods
- Services
- Works
- Consultancy

These map well to government and private procurement categories. They should remain broad because industry-specific detail is better captured in category, subcategory, item specification, and compliance documents.

## Fields That Should Stay Required At Intake

These are the minimum fields needed to avoid an unusable procurement record:

- Procurement title
- Procurement route/type
- Requirement type
- Category
- At least one line item or service name
- Quantity greater than zero
- Supplier path, such as open, selected vendors, or single/PAC vendor
- For single/direct vendor flows, selected vendor should remain required
- For tender handoff, short description and detailed scope should remain required
- For tender handoff, bid closing date and time should remain required

## Fields That Should Be Optional At Intake

These fields are important before final tender/RFQ publication, but they should not block creation of an intake draft:

- Department
- Estimated value
- Funding source
- Cost center
- Justification/scope for non-tender routes
- Tender number, because the system can generate or assign it later
- Bid start date
- Delivery date
- Delivery location
- Delivery type
- Delivery timeline
- Payment terms
- EMD amount unless EMD is explicitly enabled
- Performance security amount unless performance security is enabled
- Minimum turnover
- Experience years
- Required certifications
- Compliance notes
- Buyer contact name/email/mobile, because authenticated buyer profile data can fill it later
- Most documents and attachments

## Document Policy

Documents should be treated as supporting attachments during intake, not hard blockers. This is especially important for private buyers and MSMEs who may first create an RFQ from a short business requirement.

For tender publication, the final tender module can still enforce:

- Tender specification / NIT
- BOQ or price schedule
- Terms and conditions
- Technical annexures when applicable
- Compliance documents when applicable

The Create Procurement wizard now defaults non-tender documents to Optional. Tender keeps the Tender Specification File and BOQ / Price Schedule as Mandatory labels, but readiness only expects at least one primary document before handoff instead of blocking every document row.

## MSME Preferences

MSME preference, startup preference, SHG preference, women-owned preference, Make in India, and local supplier preference are valid fields. The PIB release confirms the public procurement policy includes annual MSE procurement targets, including sub-targets for SC/ST-owned and women-owned MSEs. For private buyers these should remain optional preference toggles, not mandatory compliance rules.

## Current Code Changes Made

- Renamed the document step description from mandatory-document language to supporting-document language.
- Renamed the side panel from "Gating Rules" to "Before Publishing".
- Made department, estimated value, non-tender justification/scope, tender number, delivery fields, payment terms, and buyer contact fields optional in the intake UI.
- Softened readiness checks:
  - Budget is now an estimate check, not a hard conceptual blocker.
  - Tender bid start date is no longer required; closing date/time is enough for handoff.
  - Delivery readiness accepts any useful delivery detail instead of requiring all delivery fields.
  - Commercial readiness no longer requires payment terms at intake.
  - Buyer contact readiness accepts any contact detail.
  - Documents no longer require every mandatory row to have an attachment during intake.

## Recommendation For The Next 3 Days

1. Keep Create Procurement as a fast intake wizard.
2. Enforce strict validations only inside final RFQ, Tender, Auction, or Purchase Order publish actions.
3. Add Rate Contract later if time permits; do not block MVP on it.
4. Keep procurement types as-is for launch because they cover public-style and private-buyer workflows.
5. Avoid making all GeM/GFR rules mandatory for private buyers; use them as compliance guidance and defaults.
