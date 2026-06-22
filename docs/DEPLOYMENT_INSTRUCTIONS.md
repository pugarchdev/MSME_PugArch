# 🚀 Deployment Instructions - Procurement Detail Modal Fix

## Quick Start

### 1. Run Database Migration (Required)

```bash
cd backend
npx prisma migrate deploy
```

### 2. Restart Backend Server

```bash
# Stop current server (Ctrl+C)
npm run dev
```

### 3. Test the Fix

1. Go to `/buyer/create-procurement`
2. Create a new procurement with ALL sections filled
3. Save/Submit
4. Go to `/buyer/procurements`
5. Click on the Requirement ID
6. ✅ Verify all sections show data

## What Was Fixed

### Problem
- Procurement details modal was not showing suppliers, rules, and documents sections
- Only basic info and line items were visible

### Solution
- Added `payload` and `draftStep` columns to `Requirement` table
- Updated backend to save complete wizard data in payload
- Updated serialization to retrieve payload from database
- Frontend modal already had all UI sections (no changes needed)

## Files Changed

1. ✅ `backend/prisma/schema.prisma` - Added payload and draftStep fields
2. ✅ `backend/src/routes/phase4.routes.ts` - Updated save and serialize functions
3. ✅ `backend/prisma/migrations/20260621_add_payload_to_requirement/migration.sql` - Migration file

## Verification

### Check Database
```sql
SELECT id, "requirementNumber", 
       CASE WHEN payload IS NULL THEN 'NO' ELSE 'YES' END as has_payload
FROM "Requirement" 
ORDER BY "createdAt" DESC LIMIT 5;
```

### Check API Response
```bash
# Get a requirement and check if payload is present
curl http://localhost:3000/api/buyer/requirements/1
```

Look for `"payload": { "basics": {...}, "vendors": {...}, ... }`

## Expected Behavior After Fix

When you click on a Requirement ID in "My Procurements", the modal should show:

✅ **Basic Details Section**
- Category, Department, Priority
- Estimated Value, Funding Source, Cost Center
- Justification

✅ **Supplier Selection Section**
- Selection Type (Open/Selected/Single)
- MSME Preference
- Make in India Preference
- Minimum Turnover, Experience Years
- Compliance Notes

✅ **Schedule/Timeline Section**
- Publish Date, Submission Date
- Opening Date, Delivery Date
- Validity Days, Pre-Bid Meeting

✅ **Rules & Evaluation Section**
- Bid Type, Evaluation Method
- EMD Required, EMD Amount
- Performance Security
- Reverse Auction Settings

✅ **Line Items Table**
- All items with specifications
- Quantities, Units, Prices
- GST, Brand Policy

✅ **Attached Documents Section**
- Document Name, File Name
- Requirement Level (Mandatory/Optional)
- Version, Size

✅ **Tender Details** (if tender method)
- Tender Number, Type, Mode
- Delivery Location, Payment Terms
- Evaluation Scoring, Timeline
- Contact Information

✅ **Approval Configuration**
- Workflow, Approver, Notes

## Troubleshooting

### Migration Fails
```bash
# Check current migration status
npx prisma migrate status

# If needed, reset and reapply
npx prisma migrate reset
npx prisma migrate deploy
```

### No Data in Modal
1. Create a NEW procurement after running migration
2. Old procurements may have incomplete data
3. Check browser console for errors
4. Verify backend logs for API errors

### Documents Not Showing
1. Ensure documents were uploaded (not just added to list)
2. Check if `fileAssetId` is present in payload
3. Verify upload completed successfully

## Rollback (If Needed)

```sql
-- Remove new columns
ALTER TABLE "Requirement" DROP COLUMN "payload";
ALTER TABLE "Requirement" DROP COLUMN "draftStep";
```

Then restart backend server.

## Success Checklist

- [ ] Database migration completed successfully
- [ ] Backend server restarted
- [ ] Created new procurement with all sections filled
- [ ] Clicked Requirement ID in "My Procurements"
- [ ] Modal shows all sections with data
- [ ] Documents section displays uploaded files
- [ ] No console errors
- [ ] No backend errors in logs

## Documentation

- **Planning Document:** `docs/procurement-detail-modal-fix-plan.md`
- **Implementation Details:** `docs/procurement-detail-modal-fix-implementation.md`
- **This Guide:** `DEPLOYMENT_INSTRUCTIONS.md`

---

**Status:** ✅ Ready for Deployment  
**Date:** 2026-06-21  
**Estimated Time:** 5 minutes (migration + restart + test)