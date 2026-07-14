/**
 * Dynamic seller submission → buyer visibility - source-level integration test.
 *
 * Covers the RequirementResponse.responseData flow:
 *   1. Schema: RequirementResponse carries a nullable responseData Json column
 *   2. Backend: response zod schema validates responseData (documents + lineItems)
 *   3. Backend: create + draft-update persist responseData
 *   4. Backend: buyer/seller/ownResponse selects all expose responseData
 *   5. Seller UI: SubmitQuotationPage renders buyer-requested document slots,
 *      an item-wise quote table, blocks submit on missing required docs, and
 *      sends responseData on both draft save and final submit
 *   6. Buyer UI: BuyerRequirementDetailsPage fetches the buyer responses
 *      endpoint and renders line quotes + uploaded documents per seller
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const schema = read('backend/prisma/schema.prisma');
const marketplaceRoutes = read('backend/src/routes/marketplace.routes.ts');
const submitQuotationPage = read('frontend/src/features/rfq/pages/SubmitQuotationPage.tsx');
const buyerDetailsPage = read('frontend/src/features/marketplace/pages/BuyerRequirementDetailsPage.tsx');

// ============================================================
// STAGE 1 — Prisma schema
// ============================================================

test('Stage 1: RequirementResponse model has nullable responseData Json column', () => {
    const model = schema.match(/model RequirementResponse \{[\s\S]*?\n\}/);
    assert.ok(model, 'RequirementResponse model exists');
    assert.match(model[0], /responseData\s+Json\?/);
});

// ============================================================
// STAGE 2 — Backend validation
// ============================================================

test('Stage 2: response schema validates structured responseData', () => {
    assert.match(marketplaceRoutes, /const responseDataSchema = z\.object\(\{/);
    assert.match(marketplaceRoutes, /documents: z\.array\(responseDocumentSchema\)/);
    assert.match(marketplaceRoutes, /lineItems: z\.array\(responseLineItemSchema\)/);
    // wired into the response body schema
    assert.match(marketplaceRoutes, /responseData: responseDataSchema/);
    // document + line item shapes match what the seller UI sends
    assert.match(marketplaceRoutes, /fileAssetId: z\.coerce\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)\.nullable\(\)/);
    assert.match(marketplaceRoutes, /unitPrice: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)\.nullable\(\)/);
});

// ============================================================
// STAGE 3 — Backend persistence (create + draft update)
// ============================================================

test('Stage 3: responseData persists on create and survives draft updates', () => {
    // create branch
    assert.match(marketplaceRoutes, /responseData: body\.responseData \?\? undefined/);
    // update branch keeps existing value when the field is omitted
    assert.match(marketplaceRoutes, /responseData: body\.responseData !== undefined \? body\.responseData : existingDraft\.responseData/);
});

// ============================================================
// STAGE 4 — Backend reads expose responseData
// ============================================================

test('Stage 4: buyer, seller and ownResponse selects all include responseData', () => {
    const selects = marketplaceRoutes.match(/responseData: true/g) || [];
    assert.ok(selects.length >= 3, `expected >=3 selects with responseData, found ${selects.length}`);
    // buyer responses endpoint exists for the buyer dashboard
    assert.match(marketplaceRoutes, /router\.get\('\/buyer\/requirements\/:id\/responses'/);
});

// ============================================================
// STAGE 5 — Seller submission UI
// ============================================================

test('Stage 5a: seller page builds responseData for draft and submit', () => {
    assert.match(submitQuotationPage, /function buildResponseData\(\)/);
    // both save paths attach it
    const wired = submitQuotationPage.match(/payload\.responseData = responseData/g) || [];
    assert.equal(wired.length, 2, 'draft save AND final submit attach responseData');
});

test('Stage 5b: buyer-requested documents render as upload slots with required markers', () => {
    // merges the three shapes buyer-requested docs can arrive in
    assert.match(submitQuotationPage, /rfqData\?\.payload\?\.documents/);
    assert.match(submitQuotationPage, /rfqData\?\.requiredDocuments/);
    // one slot per requested doc + per-slot upload
    assert.match(submitQuotationPage, /Documents Requested By Buyer/);
    assert.match(submitQuotationPage, /uploadRequestedDoc\(idx, file\)/);
});

test('Stage 5c: submit blocked until required documents are uploaded', () => {
    assert.match(submitQuotationPage, /doc\.required && doc\.status !== 'done'/);
    assert.match(submitQuotationPage, /errs\.requestedDocs/);
});

test('Stage 5d: item-wise quotation table with GST-inclusive totals', () => {
    assert.match(submitQuotationPage, /Item-Wise Quotation/);
    assert.match(submitQuotationPage, /updateLineQuote\(idx, \{ unitPrice: e\.target\.value \}\)/);
    // totals feed the headline offer
    assert.match(submitQuotationPage, /setOfferedPrice\(String\(lineTotals\.total\)\)/);
});

// ============================================================
// STAGE 6 — Buyer visibility UI
// ============================================================

test('Stage 6: buyer detail page fetches responses and renders responseData', () => {
    assert.match(buyerDetailsPage, /\/api\/buyer\/requirements\/\$\{numericId\}\/responses/);
    assert.match(buyerDetailsPage, /function SellerResponseCard/);
    // structured payload rendered: line quotes + uploaded documents
    assert.match(buyerDetailsPage, /responseData\.lineItems/);
    assert.match(buyerDetailsPage, /responseData\.documents/);
    // uploaded docs open via file asset with URL fallback
    assert.match(buyerDetailsPage, /openFileAsset/);
    assert.match(buyerDetailsPage, /doc\.fileUrl/);
});

// ============================================================
// STAGE 7 — Reverse auction effective status + linked requirement
// ============================================================

const reverseAuctionRoutes = read('backend/src/routes/reverse-auction.routes.ts');
const reverseAuctionDetailPage = read('frontend/src/features/reverseAuctions/pages/ReverseAuctionDetailPage.tsx');
const appTsx = read('frontend/src/App.tsx');
const invitePopup = read('frontend/src/features/notifications/InviteLoginPopup.tsx');

test('Stage 7a: auction status derives from the clock and persists lazily', () => {
    assert.match(reverseAuctionRoutes, /const withEffectiveStatus = async/);
    // terminal statuses never touched
    assert.match(reverseAuctionRoutes, /TERMINAL_AUCTION_STATUSES/);
    // ended auctions become CLOSED, scheduled ones go LIVE inside the window
    assert.match(reverseAuctionRoutes, /effective = 'CLOSED'/);
    assert.match(reverseAuctionRoutes, /effective = 'LIVE'/);
    // applied on detail, live-summary, and list reads (definition itself uses `= async`)
    const applications = reverseAuctionRoutes.match(/withEffectiveStatus\(/g) || [];
    assert.ok(applications.length >= 3, `helper applied in >=3 endpoints, found ${applications.length} call sites`);
});

test('Stage 7b: auction detail carries the buyer-filled requirement summary', () => {
    assert.match(reverseAuctionRoutes, /const linkedRequirementSummary = async/);
    assert.match(reverseAuctionRoutes, /consigneeDetails: Array\.isArray\(payload\.consigneeDetails\)/);
    assert.match(reverseAuctionRoutes, /\{ \.\.\.auction, isPublic, hasJoined, linkedRequirement \}/);
    // seller detail page renders it
    assert.match(reverseAuctionDetailPage, /function LinkedRequirementPanel/);
    assert.match(reverseAuctionDetailPage, /auction\.data\.linkedRequirement/);
});

// ============================================================
// STAGE 8 — Detail page shows buyer wizard payload
// ============================================================

test('Stage 8: requirement detail renders wizard documents, consignees, timeline', () => {
    assert.match(buyerDetailsPage, /payload\.documents/);
    assert.match(buyerDetailsPage, /payload\.consigneeDetails/);
    assert.match(buyerDetailsPage, /payload\.tender\?\.bidClosingDate/);
    assert.match(buyerDetailsPage, /payload\.rules\?\.emdRequired/);
});

// ============================================================
// STAGE 9 — Multi-seller comparison
// ============================================================

test('Stage 9: buyer can compare responses side-by-side with L1 highlight', () => {
    assert.match(buyerDetailsPage, /function ResponseComparisonTable/);
    assert.match(buyerDetailsPage, /setResponsesView/);
    // sorted by offered price, lowest marked L1
    assert.match(buyerDetailsPage, /L1 · Lowest/);
    // per-item lowest unit price computed across sellers
    assert.match(buyerDetailsPage, /lowestUnitFor/);
});

// ============================================================
// STAGE 10 — Invite notifications + login popup
// ============================================================

test('Stage 10a: backend notifies invited sellers in-app', () => {
    assert.match(reverseAuctionRoutes, /notificationService\.notifyWithEmail/);
    assert.match(reverseAuctionRoutes, /type: 'reverse_auction_invite'/);
});

test('Stage 10b: login popup shows pending invites for 5s with a cross button', () => {
    assert.match(invitePopup, /AUTO_HIDE_MS = 5000/);
    assert.match(invitePopup, /status=unread/);
    assert.match(invitePopup, /\.includes\('invit'\)/);
    // once per session per user
    assert.match(invitePopup, /sessionStorage\.getItem\(sessionKey\)/);
    // dismiss button present
    assert.match(invitePopup, /aria-label="Dismiss invitations popup"/);
    // clicking an invite marks it read and navigates
    assert.match(invitePopup, /notifications\/\$\{invite\.id\}\/read/);
    // mounted globally in the app shell
    assert.match(appTsx, /InviteLoginPopup/);
});
