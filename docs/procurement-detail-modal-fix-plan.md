# Procurement Detail Modal Fix - Implementation Plan

**Date:** 2026-06-21  
**Issue:** The procurement details modal in "My Procurements" page is not showing all information from the Create Procurement wizard (missing suppliers, rules, documents sections)

## Problem Analysis

### Current State
1. **Create Procurement Wizard** ([`CreateProcurementPage.tsx`](../frontend/src/features/procurementWizard/pages/CreateProcurementPage.tsx)) collects comprehensive data across multiple sections:
   - Basics (title, category, department, priority, etc.)
   - Items (line items with specifications)
   - Vendors (supplier selection, MSME preferences, eligibility criteria)
   - Schedule (dates, timelines, pre-bid meetings)
   - Rules (bid type, evaluation, EMD, performance security, auction settings)
   - Documents (uploaded files with metadata)
   - Approval (workflow configuration)
   - Tender Details (for tender-specific fields)

2. **Backend Storage** ([`phase4.routes.ts`](../backend/src/routes/phase4.routes.ts)):
   - The `saveProcurementDraft` function stores ALL wizard data in the `payload` field (line 825)
   - The payload is a JSON object containing the complete Draft structure
   - Backend properly saves: `payload: body.payload || null`

3. **Requirements Detail Modal** ([`RequirementsPage.tsx`](../frontend/src/features/requirements/pages/RequirementsPage.tsx), lines 1196-1700):
   - Currently displays payload-based sections for: basics, vendors, schedule, rules, tender, approval, items, consignees, documents
   - **HOWEVER**, the modal is already designed to show these sections!
   - The issue is that the payload structure from Create Procurement wizard doesn't match what the modal expects

### Root Cause
The Create Procurement wizard uses a `Draft` type structure (lines 100-212 in CreateProcurementPage.tsx):
```typescript
type Draft = {
  id?: number;
  type: ProcurementType;
  basics: { title, category, department, ... };
  vendors: { selection, msmePreference, ... };
  schedule: { publishDate, submissionDate, ... };
  rules: { bidType, evaluation, emdRequired, ... };
  items: ItemRow[];
  consigneeDetails: ConsigneeRow[];
  documents: DocumentRow[];
  approval: { workflow, approver, notes };
  tender: { tenderNumber, deliveryLocation, ... };
}
```

But the RequirementDetail modal expects the payload to have these exact property names, and the Create Procurement wizard needs to ensure it's saving the complete Draft object to the backend.

## Solution Design

### Phase 1: Verify Payload Saving (Frontend)
**File:** `frontend/src/features/procurementWizard/pages/CreateProcurementPage.tsx`

1. **Locate the save/submit functions** that call `saveProcurementDraft` or `submitProcurementDraft`
2. **Ensure the complete Draft object is being sent** in the payload field
3. **Verify document metadata** is included in the documents array with proper structure

### Phase 2: Enhance RequirementDetail Modal Display
**File:** `frontend/src/features/requirements/pages/RequirementsPage.tsx`

The modal already has sections for displaying:
- ✅ Basics (lines 1273-1293)
- ✅ Suppliers/Vendors (lines 1295-1316)
- ✅ Schedule (lines 1318-1334)
- ✅ Rules & Evaluation (lines 1336-1358)
- ✅ Tender Details (lines 1360-1460)
- ✅ Approval (lines 1462-1477)
- ✅ Items (lines 1479-1532)
- ✅ Consignees (lines 1534-1561)
- ✅ Documents (lines 1563-1584)

**What needs to be verified:**
1. The payload structure matches what the modal expects
2. All document metadata (fileName, size, version, requirement level) is properly displayed
3. The sections show when data is present

### Phase 3: Testing Checklist

After implementation, verify:
1. ✅ Create a procurement using the Create Procurement wizard
2. ✅ Fill in all sections: basics, items, vendors, schedule, rules, documents
3. ✅ Upload documents in the documents section
4. ✅ Save as draft or submit
5. ✅ Navigate to "My Procurements" page
6. ✅ Click on the Requirement ID
7. ✅ Verify the modal shows:
   - Basic details section
   - Supplier selection section with all vendor preferences
   - Schedule/timeline section
   - Rules & evaluation section with EMD, performance security, auction settings
   - All line items with specifications
   - All uploaded documents with proper metadata
   - Tender details (if applicable)
   - Approval configuration

## Implementation Steps

### Step 1: Review Create Procurement Save Logic
**Location:** `frontend/src/features/procurementWizard/pages/CreateProcurementPage.tsx`

Search for functions that call:
- `saveProcurementDraft()`
- `submitProcurementDraft()`

Ensure they pass the complete `draft` object in the payload:
```typescript
const payload = {
  basics: draft.basics,
  vendors: draft.vendors,
  schedule: draft.schedule,
  rules: draft.rules,
  items: draft.items,
  consigneeDetails: draft.consigneeDetails,
  documents: draft.documents,
  approval: draft.approval,
  tender: draft.tender,
  type: draft.type
};
```

### Step 2: Verify Document Structure
Ensure documents in the payload include:
```typescript
{
  id: string;
  name: string;
  requirement: 'Mandatory' | 'Optional' | 'Not Required';
  fileName: string;
  version: number;
  fileAssetId?: number;
  documentUrl?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
}
```

### Step 3: Add Missing Sections (if needed)
If any sections are missing from the RequirementDetail modal, add them following the existing pattern:

```typescript
{/* Section: Your New Section */}
{payload?.yourSection && (
  <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
    <SectionTitle>🔧 Your Section Title</SectionTitle>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <InfoCell label="Field Name" value={payload.yourSection.fieldName} />
      {/* Add more fields */}
    </div>
  </div>
)}
```

### Step 4: Debug Payload Structure
Add temporary logging to verify payload structure:

**In RequirementDetail component:**
```typescript
console.log('Requirement payload:', requirement?.payload);
console.log('Payload basics:', payload?.basics);
console.log('Payload vendors:', payload?.vendors);
console.log('Payload documents:', payload?.documents);
```

## Key Files to Modify

1. **Frontend - Create Procurement Wizard:**
   - `frontend/src/features/procurementWizard/pages/CreateProcurementPage.tsx`
   - Search for save/submit functions
   - Ensure complete payload is sent

2. **Frontend - Requirements Detail Modal:**
   - `frontend/src/features/requirements/pages/RequirementsPage.tsx`
   - Lines 1196-1700 (RequirementDetail component)
   - Verify all sections are displaying correctly

3. **Backend (Already Correct):**
   - `backend/src/routes/phase4.routes.ts`
   - Line 825: `payload: body.payload || null` ✅
   - Backend is already saving the payload correctly

## Expected Outcome

After implementation:
1. All procurements created via Create Procurement wizard will have complete payload data
2. Clicking on any Requirement ID in "My Procurements" will open a modal showing:
   - ✅ Basic details (category, department, priority, estimated value, etc.)
   - ✅ Supplier selection criteria (MSME preference, eligibility, turnover requirements)
   - ✅ Schedule and timeline (publish date, submission date, delivery date)
   - ✅ Rules and evaluation (bid type, EMD, performance security, auction settings)
   - ✅ All line items with specifications and pricing
   - ✅ All uploaded documents with metadata (name, file, requirement level, version)
   - ✅ Tender-specific details (if applicable)
   - ✅ Approval workflow configuration

## Next Steps

1. Switch to Code mode to implement the fixes
2. Review the save/submit functions in CreateProcurementPage.tsx
3. Verify payload structure being sent to backend
4. Test the complete flow end-to-end
5. Document any additional findings

## Notes

- The backend is already correctly configured to store and retrieve the payload
- The RequirementDetail modal already has UI components for all sections
- The main task is ensuring the Create Procurement wizard sends the complete Draft object in the correct structure
- All sections should be conditionally rendered based on data presence