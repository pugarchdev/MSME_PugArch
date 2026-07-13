import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const backendIndex = read('backend/index.ts');
const phase4Routes = read('backend/src/routes/phase4.routes.ts');
const procurementWorkflow = read('backend/src/services/workflow/procurement-workflow.service.ts');
const tenderWorkflow = read('backend/src/services/workflow/tender-workflow.service.ts');
const procurementBidService = read('backend/src/modules/procurementBid/procurement-bid.service.ts');

test('Rule 1: Sellers cannot view other sellers\' quotations', () => {
  // Check that /tenders/:id/bids filters by sellerId for sellers
  const bidRoute = phase4Routes.match(/router\.get\('\/tenders\/:id\/bids'[\s\S]{0,900}/)?.[0] || '';
  assert.match(bidRoute, /where\.sellerId\s*=\s*requesterId/, 'tender bids list must restrict sellers to their own bids');
  
  // Check that /quote-requests and /quote-requests/:id filter out draft quote responses for buyers
  assert.match(phase4Routes, /filter\(\(qr:\s*any\)\s*=>\s*qr\.status\s*!==\s*'DRAFT'\)/, 'draft quote responses must be hidden from buyers');
});

test('Rule 2 & 3: RFQ amendments and deadline extensions', () => {
  // Check that PUT /quote-requests/:id enforces amendment checks if responses exist
  const rfqPutRoute = phase4Routes.match(/router\.put\('\/quote-requests\/:id'[\s\S]{0,4500}/)?.[0] || '';
  assert.match(rfqPutRoute, /hasResponses\s*&&\s*!isAmendment/, 'RFQ modification must require isAmendment when responses exist');
  assert.match(rfqPutRoute, /updateMany[\s\S]*status:\s*'DRAFT'/, 'amendments must revert submitted responses to DRAFT');
  assert.match(rfqPutRoute, /version:\s*nextVersion/, 'amendments must increment the version field');
  
  // Check that deadline extensions notify sellers
  assert.match(rfqPutRoute, /isDeadlineExtended/, 'RFQ PUT must check if deadline is extended');
  assert.match(rfqPutRoute, /quote_request_deadline_extended/, 'RFQ PUT must send a deadline extended notification');
  assert.match(procurementBidService, /tender\.deadline_extended/, 'Procurement bid service must send a deadline extended notification');
});

test('Rule 4: Sellers can save quotations as drafts', () => {
  // Check that RFQ response creation supports DRAFT
  assert.match(procurementWorkflow, /isDraft\s*=\s*input\.status\s*===\s*'DRAFT'/, 'createQuoteResponse must support DRAFT status');
  
  // Check that tender bid submission supports drafts
  assert.match(tenderWorkflow, /isDraft\s*=\s*input\.status\s*===\s*'draft'/, 'submitBid must support draft status');
  assert.match(tenderWorkflow, /status:\s*\{\s*notIn:\s*\[\s*'withdrawn',\s*'draft'\s*\]\s*\}/, 'draft bids must not count towards the active bid count');
});

test('Rule 5: Quotation withdrawal before deadline if buyer permits', () => {
  // Check that tender bid withdrawal checks allowWithdrawal flag
  assert.match(tenderWorkflow, /tender\.allowWithdrawal\s*===\s*false/, 'tender bid withdrawal must check if buyer permits it');
  
  // Check that RFQ response withdrawal exists and checks allowWithdrawal flag
  assert.match(phase4Routes, /quoteRequest\.allowWithdrawal\s*===\s*false/, 'RFQ response withdrawal must check if buyer permits it');
  assert.match(phase4Routes, /quote_response\.withdrawn/, 'RFQ response withdrawal must be logged in audit');
});

test('Rule 6: Every submission generates an acknowledgement with response ID and timestamp', () => {
  // Quote response submission acknowledgement
  assert.match(procurementWorkflow, /acknowledgementId:\s*`ACK-QR-\$\{responseNumber\}-\$\{Date\.now\(\)\}`/, 'createQuoteResponse must generate acknowledgement on submission');
  
  // Tender bid submission acknowledgement
  assert.match(tenderWorkflow, /acknowledgementId:\s*`ACK-BID-\$\{bidNumber\}-\$\{Date\.now\(\)\}`/, 'submitBid must generate acknowledgement on submission');
  
  // Bid wizard participation final submission acknowledgement
  assert.match(procurementBidService, /acknowledgementId:\s*`ACK-BP-\$\{participation\.id\}-\$\{Date\.now\(\)\}`/, 'finalSubmitParticipation must generate acknowledgement on submission');
});

test('Rule 7: Every action (publish, edit, submit, evaluate, award, reject) is recorded in audit log', () => {
  assert.match(phase4Routes, /quote_request\.amended/, 'amendments must be logged');
  assert.match(phase4Routes, /quote_response\.submitted/, 'quote response submission must be logged');
  assert.match(phase4Routes, /quote_response\.withdrawn/, 'quote response withdrawal must be logged');
  assert.match(procurementWorkflow, /workflow\.rfq\.response_draft_created/, 'draft response creation must be logged');
});

test('Rule 8: Uploaded documents support preview, download, and version history', () => {
  // Check file response serialization has parentId and version
  assert.match(backendIndex, /parentId:\s*asset\.parentId/, 'toFileResponse must include parentId');
  assert.match(backendIndex, /version:\s*asset\.version/, 'toFileResponse must include version');
  
  // Check that file upload supports parentId/replaceFileId and increments version
  assert.match(backendIndex, /parentIdInput\s*=\s*req\.body\?\.parentId/, 'handleSecureUpload must support parentId');
  assert.match(backendIndex, /nextVersion\s*=\s*\(latestVersionAsset\?\.version\s*\|\|\s*1\)\s*\+\s*1/, 'handleSecureUpload must increment the file version');
  
  // Check file version history route exists
  assert.match(backendIndex, /app\.get\('\/api\/files\/:id\/versions'/, 'file versions history route must be registered');
});
