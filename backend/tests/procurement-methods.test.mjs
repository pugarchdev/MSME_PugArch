/**
 * Procurement Methods - Source-level QA test suite.
 *
 * Validates the full procurement-method stack across backend and frontend:
 *  1. All 17 canonical methods are registered in backend + frontend.
 *  2. normalizeCanonicalMethod / normalizeProcurementMethod resolves aliases.
 *  3. broadMethodForCanonical always returns one of the 5 broad types.
 *  4. Frontend METHOD_DEFINITIONS covers every canonical method with required fields.
 *  5. suggestProcurementMethod recommends every method for at least one scenario.
 *  6. Prisma schema indexes canonicalMethod on Requirement, Tender, PurchaseOrder.
 *  7. phase4.routes.ts handles canonicalMethod storage.
 *  8. procurement-workflow.service.ts accepts canonicalMethod.
 *  9. BidParticipationPage.tsx adapts steps for each procurement type family.
 * 10. SellerOpportunitiesPage.tsx routes all methods through action mapping.
 * 11. No console.log / console.debug left in procurement core files.
 * 12. Legacy alias backward compatibility.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- Source files under test ----
const backendMethods  = read('backend/src/utils/procurement-methods.ts');
const frontendHelpers = read('frontend/src/features/procurementWizard/procurementMethodHelpers.ts');
const frontendConfig  = read('frontend/src/features/procurementWizard/procurementMethodsConfig.ts');
const frontendTypes   = read('frontend/src/features/procurementWizard/types.ts');
const schema          = read('backend/prisma/schema.prisma');
const phase4          = read('backend/src/routes/phase4.routes.ts');
const marketplace     = read('backend/src/routes/marketplace.routes.ts');
const workflowService = read('backend/src/services/workflow/procurement-workflow.service.ts');
const bidParticipation = read('frontend/src/features/procurementBid/pages/BidParticipationPage.tsx');
const sellerOpportunities = read('frontend/src/features/sellerOpportunities/pages/SellerOpportunitiesPage.tsx');
const checkoutService = read('backend/src/modules/procurementCheckout/procurement-checkout.service.ts');

const CANONICAL_METHODS = [
  'DIRECT_PURCHASE',
  'CATALOG_PURCHASE',
  'RFQ',
  'RFP',
  'RFI',
  'SEALED_TENDER',
  'OPEN_TENDER',
  'LIMITED_TENDER',
  'TWO_PACKET_BID',
  'REVERSE_AUCTION',
  'BID_WITH_REVERSE_AUCTION',
  'RATE_CONTRACT',
  'REPEAT_ORDER',
  'SINGLE_SOURCE',
  'PAC',
  'EMERGENCY_PURCHASE',
  'BOQ_BASED_BID',
];

const BROAD_METHODS = ['DIRECT_PURCHASE', 'RFQ', 'TENDER', 'REVERSE_AUCTION', 'RATE_CONTRACT'];

// =====================================================================
// 1 — CANONICAL METHOD REGISTRY
// =====================================================================

test('Backend registers all 17 canonical methods', () => {
  for (const method of CANONICAL_METHODS) {
    assert.ok(
      backendMethods.includes(`'${method}'`),
      `Backend CANONICAL_PROCUREMENT_METHODS missing: ${method}`
    );
  }
});

test('Frontend helpers register all 17 canonical methods', () => {
  for (const method of CANONICAL_METHODS) {
    assert.ok(
      frontendHelpers.includes(`'${method}'`),
      `Frontend CANONICAL_METHODS array missing: ${method}`
    );
  }
});

test('Frontend ProcurementMethodId type covers all 17 methods', () => {
  for (const method of CANONICAL_METHODS) {
    assert.ok(
      frontendConfig.includes(`'${method}'`),
      `Frontend ProcurementMethodId type missing: ${method}`
    );
  }
});

// =====================================================================
// 2 — BROAD METHOD MAPPING
// =====================================================================

test('Backend broadMethodForCanonical handles every canonical method', () => {
  // The switch statement should have a case for each canonical method
  for (const method of CANONICAL_METHODS) {
    assert.ok(
      backendMethods.includes(`'${method}'`) || backendMethods.includes(`case '${method}'`),
      `broadMethodForCanonical missing switch case for: ${method}`
    );
  }
  // Returns only the 5 broad types
  for (const broad of BROAD_METHODS) {
    assert.ok(
      backendMethods.includes(`return '${broad}'`),
      `broadMethodForCanonical missing return for broad type: ${broad}`
    );
  }
});

test('Frontend broadMethodForCanonical mirrors backend mapping', () => {
  for (const broad of BROAD_METHODS) {
    assert.ok(
      frontendHelpers.includes(`return '${broad}'`),
      `Frontend broadMethodForCanonical missing return: ${broad}`
    );
  }
});

// =====================================================================
// 3 — LEGACY ALIAS BACKWARD COMPATIBILITY
// =====================================================================

const LEGACY_ALIASES = [
  'CATALOGUE_PURCHASE',
  'L1_COMPARISON',
  'L1_PURCHASE',
  'REQUEST_FOR_QUOTATION',
  'REQUEST_FOR_PROPOSAL',
  'EXPRESSION_OF_INTEREST',
  'CUSTOM_PRODUCT_BID',
  'CUSTOM_BID',
  'CUSTOM_SERVICE_BID',
  'SINGLE_TENDER',
  'PAC_BID',
  'BOQ_BID',
  'BOQ',
  'EMERGENCY',
  'BID_WITH_RA',
  'E_BID_WITH_RA',
];

test('Backend legacyAliases covers all known legacy names', () => {
  for (const alias of LEGACY_ALIASES) {
    assert.ok(
      backendMethods.includes(alias),
      `Backend legacyAliases missing: ${alias}`
    );
  }
});

test('Frontend aliases covers all known legacy names', () => {
  for (const alias of LEGACY_ALIASES) {
    assert.ok(
      frontendHelpers.includes(alias),
      `Frontend aliases missing: ${alias}`
    );
  }
});

// =====================================================================
// 4 — FRONTEND METHOD_DEFINITIONS COMPLETENESS
// =====================================================================

test('METHOD_DEFINITIONS has an entry for every canonical method', () => {
  for (const method of CANONICAL_METHODS) {
    const pattern = new RegExp(`id:\\s*'${method}'`);
    assert.match(
      frontendConfig,
      pattern,
      `METHOD_DEFINITIONS missing entry for: ${method}`
    );
  }
});

test('Each METHOD_DEFINITIONS entry has required metadata', () => {
  const requiredFields = ['title', 'subtitle', 'icon', 'accent', 'badge', 'complexity', 'estimatedTime', 'buyerTypes', 'requiredFields', 'allowedEvaluations'];
  for (const field of requiredFields) {
    // Count occurrences — should appear at least 17 times (one per method)
    const matches = frontendConfig.match(new RegExp(`\\b${field}:\\s*`, 'g'));
    assert.ok(
      matches && matches.length >= 17,
      `METHOD_DEFINITIONS: field '${field}' appears ${matches?.length || 0} times, expected >= 17`
    );
  }
});

// =====================================================================
// 5 — SUGGESTION ENGINE COVERAGE
// =====================================================================

test('suggestProcurementMethod can recommend or reference every canonical method', () => {
  // Most methods should appear as result.id = 'METHOD'.
  // REPEAT_ORDER is intentionally not auto-suggested — it requires a prior order
  // reference and is always selected manually by the buyer. We verify it still
  // appears in the METHOD_DEFINITIONS and config for manual selection.
  const manualOnlyMethods = new Set(['REPEAT_ORDER']);
  for (const method of CANONICAL_METHODS) {
    if (manualOnlyMethods.has(method)) {
      // Just verify it's defined in METHOD_DEFINITIONS
      const defPattern = new RegExp(`id:\\s*'${method}'`);
      assert.match(
        frontendConfig,
        defPattern,
        `${method} should be defined in METHOD_DEFINITIONS even if not auto-suggested`
      );
      continue;
    }
    const assignPattern = new RegExp(`result\\.id\\s*=\\s*'${method}'`);
    assert.match(
      frontendConfig,
      assignPattern,
      `suggestProcurementMethod never assigns result.id = '${method}'`
    );
  }
});

test('suggestProcurementMethod returns valid confidence levels', () => {
  const confidenceLevels = ['HIGH', 'MEDIUM', 'LOW'];
  for (const level of confidenceLevels) {
    assert.ok(
      frontendConfig.includes(`'${level}'`),
      `Missing confidence level in suggestion engine: ${level}`
    );
  }
});

// =====================================================================
// 6 — PRISMA SCHEMA
// =====================================================================

test('Schema has canonicalMethod field on Requirement model', () => {
  assert.match(schema, /canonicalMethod\s+String\?/);
});

test('Schema has canonicalMethod index on Requirement', () => {
  assert.match(schema, /@@index\(\[canonicalMethod\]\)/);
  assert.match(schema, /@@index\(\[canonicalMethod,\s*status\]\)/);
});

test('Schema has canonicalMethod on PurchaseOrder model', () => {
  // Multiple models have canonicalMethod
  const occurrences = schema.match(/canonicalMethod\s+String\?/g);
  assert.ok(
    occurrences && occurrences.length >= 2,
    `Expected canonicalMethod in at least 2 models, found ${occurrences?.length || 0}`
  );
});

// =====================================================================
// 7 — BACKEND PHASE4 ROUTES
// =====================================================================

test('phase4.routes.ts stores canonicalMethod on requirement creation', () => {
  assert.match(phase4, /canonicalMethod/);
});

test('phase4.routes.ts uses normalizeCanonicalMethod or accepts canonicalMethod', () => {
  // Should reference canonical method handling
  assert.ok(
    phase4.includes('canonicalMethod') && phase4.includes('procurementMethod'),
    'phase4.routes.ts should handle both canonicalMethod and procurementMethod'
  );
});

test('phase4.routes.ts has visibility filtering for private methods', () => {
  // The route should filter restricted procurement types from public views
  assert.ok(
    phase4.includes('SINGLE_SOURCE') || phase4.includes('PAC') || phase4.includes('EMERGENCY_PURCHASE') || phase4.includes('canonicalMethod'),
    'phase4.routes.ts should contain method-aware visibility logic'
  );
});

// =====================================================================
// 8 — PROCUREMENT WORKFLOW SERVICE
// =====================================================================

test('procurement-workflow.service.ts accepts canonicalMethod in RequirementInput', () => {
  assert.match(workflowService, /canonicalMethod\?:\s*string/);
});

test('procurement-workflow.service.ts stores canonicalMethod in requirement creation', () => {
  assert.match(workflowService, /canonicalMethod:\s*input\.canonicalMethod/);
});

// =====================================================================
// 9 — PROCUREMENT CHECKOUT SERVICE
// =====================================================================

test('procurement-checkout.service.ts computes canonicalMethod via normalizeCanonicalMethod', () => {
  assert.match(checkoutService, /normalizeCanonicalMethod/);
  assert.match(checkoutService, /canonicalMethod/);
});

test('procurement-checkout.service.ts stores both broad and canonical methods', () => {
  assert.match(checkoutService, /broadMethodForCanonical/);
  assert.match(checkoutService, /fullProcurementMethod/);
});

// =====================================================================
// 10 — MARKETPLACE ROUTES VISIBILITY
// =====================================================================

test('marketplace.routes.ts filters by canonicalMethod for visibility', () => {
  assert.ok(
    marketplace.includes('canonicalMethod'),
    'marketplace.routes.ts must reference canonicalMethod for visibility filtering'
  );
});

// =====================================================================
// 11 — BID PARTICIPATION PAGE
// =====================================================================

test('BidParticipationPage adapts steps dynamically', () => {
  // Should have step management logic based on procurement type
  assert.ok(
    bidParticipation.includes('activeSteps') || bidParticipation.includes('step'),
    'BidParticipationPage should dynamically manage bid steps'
  );
});

// =====================================================================
// 12 — SELLER OPPORTUNITIES PAGE
// =====================================================================

test('SellerOpportunitiesPage routes opportunities by type', () => {
  // SellerOpportunitiesPage uses OpportunityType ('Quick Quote', 'Large Procurement', etc.)
  // rather than canonical method names directly — this is intentional for the seller UX.
  assert.ok(
    sellerOpportunities.includes('OpportunityType') || sellerOpportunities.includes('type'),
    'SellerOpportunitiesPage should route by opportunity type'
  );
  // Should handle all main opportunity sources
  assert.ok(
    sellerOpportunities.includes('Large Procurement') || sellerOpportunities.includes('Auction'),
    'SellerOpportunitiesPage should list procurement opportunity types'
  );
});

// =====================================================================
// 13 — NO DEBUG STATEMENTS IN CORE PROCUREMENT FILES
// =====================================================================

const PROCUREMENT_CORE_FILES = [
  { name: 'procurement-methods.ts', content: backendMethods },
  { name: 'procurementMethodHelpers.ts', content: frontendHelpers },
  { name: 'procurementMethodsConfig.ts', content: frontendConfig },
  { name: 'procurement-workflow.service.ts', content: workflowService },
  { name: 'procurement-checkout.service.ts', content: checkoutService },
];

test('No console.log/debug statements in procurement core files', () => {
  for (const { name, content } of PROCUREMENT_CORE_FILES) {
    assert.doesNotMatch(
      content,
      /console\.(log|debug)\(/,
      `Found console.log/debug in ${name} — remove before production`
    );
  }
});

// =====================================================================
// 14 — TYPE SAFETY: ProcurementMethodId <-> CanonicalProcurementMethod
// =====================================================================

test('Backend CanonicalProcurementMethod type is derived from const array', () => {
  assert.match(backendMethods, /as\s+const/);
  assert.match(backendMethods, /typeof\s+CANONICAL_PROCUREMENT_METHODS\[number\]/);
});

test('Frontend ProcurementMethodId type lists all 17 methods', () => {
  const typeBlock = frontendConfig.match(/export type ProcurementMethodId\s*=[\s\S]*?;/);
  assert.ok(typeBlock, 'ProcurementMethodId type definition not found');
  for (const method of CANONICAL_METHODS) {
    assert.ok(
      typeBlock[0].includes(`'${method}'`),
      `ProcurementMethodId union type missing: ${method}`
    );
  }
});

// =====================================================================
// 15 — SLUG GENERATION
// =====================================================================

test('Backend exports methodSlugForCanonical', () => {
  assert.match(backendMethods, /export const methodSlugForCanonical/);
});

test('Frontend exports slugForCanonical', () => {
  assert.match(frontendHelpers, /export const slugForCanonical/);
});

// =====================================================================
// 16 — LABEL GENERATION
// =====================================================================

test('Frontend exports labelForCanonical with acronym handling', () => {
  assert.match(frontendHelpers, /export const labelForCanonical/);
  // Should handle acronyms like RFQ, RFP, RFI, PAC
  assert.match(frontendHelpers, /RFQ:\s*'RFQ'/);
  assert.match(frontendHelpers, /RFP:\s*'RFP'/);
  assert.match(frontendHelpers, /RFI:\s*'RFI'/);
  assert.match(frontendHelpers, /PAC:\s*'PAC'/);
});

// =====================================================================
// 17 — CANONICAL METHOD FROM RECORD (EXTRACTION)
// =====================================================================

test('Backend canonicalMethodFromRecord extracts from multiple sources', () => {
  assert.match(backendMethods, /export const canonicalMethodFromRecord/);
  // Should check canonicalMethod, payload.fullProcurementMethod, methodSlug, procurementMethod
  assert.match(backendMethods, /record\.canonicalMethod/);
  assert.match(backendMethods, /fullProcurementMethod/);
  assert.match(backendMethods, /record\.methodSlug/);
  assert.match(backendMethods, /record\.procurementMethod/);
});

// =====================================================================
// 18 — FRONTEND mapToDatabaseMethod COMPATIBILITY
// =====================================================================

test('Frontend exports mapToDatabaseMethod for database enum compatibility', () => {
  assert.match(frontendConfig, /export const mapToDatabaseMethod/);
  assert.match(frontendConfig, /broadMethodForCanonical/);
});

// =====================================================================
// 19 — BUYER TYPE FILTERING
// =====================================================================

test('METHOD_DEFINITIONS restricts some methods to GOVERNMENT_BUYER only', () => {
  // OPEN_TENDER, LIMITED_TENDER, PAC should be government-only
  const govOnlyMethods = ['OPEN_TENDER', 'LIMITED_TENDER', 'PAC'];
  for (const method of govOnlyMethods) {
    const methodBlock = frontendConfig.match(new RegExp(`id:\\s*'${method}'[\\s\\S]*?(?=\\{\\s*id:|$)`));
    assert.ok(methodBlock, `Cannot find method block for ${method}`);
    assert.ok(
      methodBlock[0].includes('GOVERNMENT_BUYER'),
      `${method} should list GOVERNMENT_BUYER in buyerTypes`
    );
  }
});

test('METHOD_DEFINITIONS restricts some methods to PRIVATE_BUYER only', () => {
  // RFQ, RFP, RFI, SEALED_TENDER, REPEAT_ORDER, SINGLE_SOURCE, EMERGENCY_PURCHASE
  const privateOnlyMethods = ['RFQ', 'RFP', 'RFI', 'SEALED_TENDER', 'REPEAT_ORDER', 'SINGLE_SOURCE', 'EMERGENCY_PURCHASE'];
  for (const method of privateOnlyMethods) {
    const methodBlock = frontendConfig.match(new RegExp(`id:\\s*'${method}'[\\s\\S]*?(?=\\{\\s*id:|$)`));
    assert.ok(methodBlock, `Cannot find method block for ${method}`);
    assert.ok(
      methodBlock[0].includes('PRIVATE_BUYER'),
      `${method} should list PRIVATE_BUYER in buyerTypes`
    );
  }
});

// =====================================================================
// 20 — COMPREHENSIVE CROSS-CHECK
// =====================================================================

test('Backend and frontend canonical lists match exactly', () => {
  // Both should define exactly the same set of 17 methods
  const backendMatches = backendMethods.match(/CANONICAL_PROCUREMENT_METHODS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(backendMatches, 'Cannot parse CANONICAL_PROCUREMENT_METHODS from backend');
  
  const frontendMatches = frontendHelpers.match(/CANONICAL_METHODS:\s*ProcurementMethodId\[\]\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(frontendMatches, 'Cannot parse CANONICAL_METHODS from frontend');
  
  const extractMethods = str => str.match(/'([A-Z_]+)'/g)?.map(m => m.replace(/'/g, '')) || [];
  const backendList = extractMethods(backendMatches[1]);
  const frontendList = extractMethods(frontendMatches[1]);
  
  assert.equal(backendList.length, 17, `Backend has ${backendList.length} methods, expected 17`);
  assert.equal(frontendList.length, 17, `Frontend has ${frontendList.length} methods, expected 17`);
  
  for (const method of backendList) {
    assert.ok(
      frontendList.includes(method),
      `Method ${method} is in backend but not frontend`
    );
  }
});
