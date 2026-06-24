import { Router, type Response } from 'express';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import prisma from '../config/prisma.js';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { upload } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { notificationService } from '../services/notification.service.js';
import { generateOtp, storeOtp, verifyOtp, consumeOtp } from '../services/otp.service.js';
import { sendOtpEmail } from '../services/mail.service.js';
import { smsService } from '../services/sms.service.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { sha256 } from '../utils/crypto.js';

const db = prisma as any;
const router = Router();

// Help utilities
const clean = (value: unknown) => String(value ?? '').trim();
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json(maskSensitive({ success: true, data }));
const parse = <T>(schema: z.ZodType<T>, value: unknown) => schema.parse(value);
const userId = (req: AuthRequest) => {
  if (!req.user?.id) throw new ApiError(401, 'Unauthorized');
  return req.user.id;
};

const auditWrite = (req: AuthRequest, action: string, entityType: string, entityId?: number | string, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: userId(req),
    actorRole: req.user?.role,
    action,
    entityType,
    entityId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata
  });

// Zod schemas for input validation
const profileUpdateSchema = z.object({
  organizationName: z.string().trim().min(2).max(100).optional(),
  departmentName: z.string().trim().max(100).optional().nullable(),
  organizationType: z.string().trim().max(100).optional().nullable(),
  registrationNumber: z.string().trim().max(100).optional().nullable(),
  gstNumber: z.string().trim().max(15).optional().nullable(),
  panNumber: z.string().trim().max(10).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  pincode: z.string().trim().max(6).optional().nullable(),
  officialEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  officialPhone: z.string().trim().max(15).optional().nullable().or(z.literal('')),
  website: z.string().trim().url().optional().nullable().or(z.literal('')),
  contactPersonName: z.string().trim().max(100).optional().nullable(),
  contactPersonDesignation: z.string().trim().max(100).optional().nullable(),
  contactPersonMobile: z.string().trim().max(15).optional().nullable(),
  contactPersonEmail: z.string().trim().email().optional().nullable().or(z.literal('')),
  logoUrl: z.string().trim().optional().nullable().refine(
    val => !val || val === '' || /^\//.test(val) || /^https?:\/\/.+/.test(val),
    { message: 'logoUrl must be a valid absolute URL, relative path, or empty' }
  ),
  bannerUrl: z.string().trim().optional().nullable().refine(
    val => !val || val === '' || /^\//.test(val) || /^https?:\/\/.+/.test(val),
    { message: 'bannerUrl must be a valid absolute URL, relative path, or empty' }
  ),
  otp: z.string().trim().optional()
});

const manualItemSchema = z.object({
  serialNo: z.string().trim().max(50).optional().nullable(),
  itemDescription: z.string().trim().min(2).max(500),
  category: z.string().trim().max(100).optional().nullable(),
  estimatedMonthlyRequirement: z.string().trim().max(100).optional().nullable(),
  unit: z.string().trim().max(50).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable()
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive())
});

// ==========================================
// BUYER SECURE ROUTES (Role: buyer)
// ==========================================

// Get own showcase profile
router.get('/profile', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const profile = await db.buyerProfile.findUnique({
      where: { userId: userId(req) }
    });
    if (!profile) throw new ApiError(404, 'Buyer profile not found');

    // Auto-fetch/fill from registration/onboarding details if showcase fields are empty
    const enriched = {
      ...profile,
      departmentName: profile.departmentName || profile.department || null,
      registrationNumber: profile.registrationNumber || profile.cin || null,
      gstNumber: profile.gstNumber || profile.gst || null,
      panNumber: profile.panNumber || profile.pan || null,
      address: profile.address || profile.registeredAddress || profile.corporateAddress || null,
      city: profile.city || null,
      state: profile.state || null,
      pincode: profile.pincode || null,
      officialEmail: profile.officialEmail || profile.email || null,
      officialPhone: profile.officialPhone || profile.mobile || null,
      website: profile.website || null,
      contactPersonName: profile.contactPersonName || profile.representativeName || null,
      contactPersonDesignation: profile.contactPersonDesignation || profile.designation || null,
      contactPersonMobile: profile.contactPersonMobile || profile.mobile || null,
      contactPersonEmail: profile.contactPersonEmail || profile.email || null,
    };

    ok(res, enriched);
  } catch (err) {
    next(err);
  }
}) as any);

// Send OTP for showcase profile sensitive updates
router.post('/profile/send-otp', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: userId(req) },
      include: { buyerProfile: true }
    });
    if (!user) throw new ApiError(404, 'User not found');
    if (!user.email) throw new ApiError(400, 'Email address is not configured for OTP.');

    const mobile = user.mobile || user.buyerProfile?.mobile;
    if (!mobile) throw new ApiError(400, 'Mobile number is not configured for OTP.');

    const otp = generateOtp();
    
    // Store OTP in database/Redis under the 'buyer_profile_update' purpose
    const otpState = await storeOtp('buyer_profile_update', user.email, otp, { userId: user.id });
    
    // Send via email
    const emailSent = await sendOtpEmail(user.email, otp, '[SECURE AUTH] MSME Showcase Profile Update Verification');
    
    // Send via SMS
    const smsSent = await smsService.sendOtpSms(mobile, otp, 'common_otp');

    await auditWrite(req, 'buyer.showcase_profile_update_otp.sent', 'user', user.id, {
      email: user.email,
      mobile,
      emailSent,
      smsSent: smsSent.success
    });

    ok(res, { 
      success: true, 
      message: 'Verification code sent to registered Email and Mobile number.',
      sendsRemaining: otpState.sendsRemaining 
    });
  } catch (err) {
    next(err);
  }
}) as any);

// Update own showcase profile details
router.put('/profile', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const body = parse(profileUpdateSchema, req.body);
    const existing = await db.buyerProfile.findUnique({
      where: { userId: userId(req) }
    });
    if (!existing) throw new ApiError(404, 'Buyer profile not found');

    // Check if sensitive fields changed
    const isSensitiveChanged = 
      (body.gstNumber !== undefined && body.gstNumber !== existing.gstNumber && body.gstNumber !== existing.gst) ||
      (body.registrationNumber !== undefined && body.registrationNumber !== existing.registrationNumber && body.registrationNumber !== existing.cin) ||
      (body.panNumber !== undefined && body.panNumber !== existing.panNumber && body.panNumber !== existing.pan) ||
      (body.officialEmail !== undefined && body.officialEmail !== existing.officialEmail && body.officialEmail !== existing.email);

    if (isSensitiveChanged) {
      const otp = req.body.otp;
      if (!otp) {
        throw new ApiError(403, 'OTP verification is required to update organization details.', 'OTP_REQUIRED');
      }

      const user = await db.user.findUnique({ where: { id: userId(req) }, select: { email: true } });
      if (!user || !user.email) throw new ApiError(400, 'User email not configured.');

      const otpCheck = await verifyOtp('buyer_profile_update', user.email, otp);
      if (!otpCheck.ok) {
        throw new ApiError(400, 'Invalid or expired OTP code. Please request a new one.');
      }
      await consumeOtp('buyer_profile_update', user.email);
    }

    // Strip otp from body before updating
    const { otp, ...updateData } = body as any;

    const updated = await db.buyerProfile.update({
      where: { userId: userId(req) },
      data: {
        ...updateData,
        verificationStatus: 'PENDING',
        verifiedAt: null,
        verifiedBy: null
      }
    });

    // Sync to OrganizationProfile & Organization if organization exists
    const orgId = req.user?.organizationId || existing.organizationId;
    if (orgId) {
      if (body.logoUrl !== undefined) {
        await db.organizationProfile.upsert({
          where: { organizationId: orgId },
          update: { logoUrl: body.logoUrl || null },
          create: { organizationId: orgId, logoUrl: body.logoUrl || null }
        });
      }
      if (body.organizationName) {
        await db.organization.update({
          where: { id: orgId },
          data: { organizationName: body.organizationName }
        });
      }

      // Invalidate marketplace homepage caches
      try {
        const { invalidateByPattern } = await import('../services/cache.service.js');
        await invalidateByPattern('cache:marketplace:home:v2');
        await invalidateByPattern('cache:marketplace:home-layout:v2:*');
      } catch (cacheErr) {
        console.error('[Cache Invalidation Failed]', cacheErr);
      }
    }

    // Notify user of update
    await notificationService.notify(userId(req), {
      title: 'Showcase Profile Updated',
      message: 'Your organization showcase details have been updated successfully.',
      type: 'showcase_profile_updated',
      priority: 'low',
      redirectUrl: '/buyer/profile'
    }).catch(err => console.error('[Notification Failed]', err));

    ok(res, updated);
  } catch (err) {
    next(err);
  }
}) as any);

// Download Excel Template for Frequently Bought Items
router.get('/items/template', (async (req, res, next) => {
  try {
    const wb = XLSX.utils.book_new();
    const data = [
      ['Sl. No.', 'Item Description', 'Category', 'Estimated Monthly Requirement', 'Unit', 'Remarks'],
      ['1', 'Industrial Gases', 'Gases', '100', 'Cylinder', 'Required for welding'],
      ['2', 'Tarpauline', 'Covers', '50', 'Nos', 'Heavy duty'],
      ['3', 'Fire Extinguishers', 'Safety', '20', 'Nos', 'CO2 and Dry Powder'],
      ['4', 'Air Conditioners', 'Appliances', '5', 'Nos', '2 Ton Split'],
      ['5', 'Office Stationery', 'Office', '1000', 'Pack', 'Monthly refills']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="buyer_frequently_bought_items_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
}) as any);

// Get own frequently bought items list
router.get('/items', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const items = await db.buyerFrequentlyBoughtItem.findMany({
      where: { buyerId: userId(req) },
      orderBy: { id: 'asc' }
    });
    ok(res, items);
  } catch (err) {
    next(err);
  }
}) as any);

// Export own current items as Excel
router.get('/items/export', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const items = await db.buyerFrequentlyBoughtItem.findMany({
      where: { buyerId: userId(req) },
      orderBy: { id: 'asc' }
    });

    const data = [
      ['Sl. No.', 'Item Description', 'Category', 'Estimated Monthly Requirement', 'Unit', 'Remarks']
    ];
    items.forEach((item: any, idx: number) => {
      data.push([
        item.serialNo || String(idx + 1),
        item.itemDescription,
        item.category || '',
        item.estimatedMonthlyRequirement || '',
        item.unit || '',
        item.remarks || ''
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Frequently Bought Items');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="buyer_frequently_bought_items.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.end(buffer);
  } catch (err) {
    next(err);
  }
}) as any);

// Add single item manually
router.post('/items', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const body = parse(manualItemSchema, req.body);
    const profile = await db.buyerProfile.findUnique({
      where: { userId: userId(req) }
    });
    if (!profile) throw new ApiError(404, 'Buyer profile not found');

    const item = await db.buyerFrequentlyBoughtItem.create({
      data: {
        buyerId: userId(req),
        organizationProfileId: profile.id,
        serialNo: body.serialNo || null,
        itemDescription: body.itemDescription,
        category: body.category || null,
        estimatedMonthlyRequirement: body.estimatedMonthlyRequirement || null,
        unit: body.unit || null,
        remarks: body.remarks || null
      }
    });

    ok(res, item);
  } catch (err) {
    next(err);
  }
}) as any);

// Edit single item manually
router.put('/items/:id', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const body = parse(manualItemSchema, req.body);
    const item = await db.buyerFrequentlyBoughtItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, 'Item not found');
    if (item.buyerId !== userId(req)) throw new ApiError(403, 'Forbidden');

    const updated = await db.buyerFrequentlyBoughtItem.update({
      where: { id },
      data: {
        serialNo: body.serialNo || null,
        itemDescription: body.itemDescription,
        category: body.category || null,
        estimatedMonthlyRequirement: body.estimatedMonthlyRequirement || null,
        unit: body.unit || null,
        remarks: body.remarks || null
      }
    });

    ok(res, updated);
  } catch (err) {
    next(err);
  }
}) as any);

// Delete single item manually
router.delete('/items/:id', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const item = await db.buyerFrequentlyBoughtItem.findUnique({ where: { id } });
    if (!item) throw new ApiError(404, 'Item not found');
    if (item.buyerId !== userId(req)) throw new ApiError(403, 'Forbidden');

    await db.buyerFrequentlyBoughtItem.delete({ where: { id } });
    ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}) as any);

// Bulk delete items
router.post('/items/bulk-delete', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const body = parse(bulkDeleteSchema, req.body);
    await db.buyerFrequentlyBoughtItem.deleteMany({
      where: {
        id: { in: body.ids },
        buyerId: userId(req)
      }
    });
    ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}) as any);

// Clear all items (replace full list with empty)
router.post('/items/clear', authenticate, authorize('buyer'), (async (req: AuthRequest, res: Response, next) => {
  try {
    await db.buyerFrequentlyBoughtItem.deleteMany({
      where: { buyerId: userId(req) }
    });
    ok(res, { success: true });
  } catch (err) {
    next(err);
  }
}) as any);

// Upload Excel File and parse
router.post('/items/upload', authenticate, authorize('buyer'), upload.single('file'), (async (req: AuthRequest & { file?: Express.Multer.File }, res: Response, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'Excel or CSV file is required');
    const profile = await db.buyerProfile.findUnique({ where: { userId: userId(req) } });
    if (!profile) throw new ApiError(404, 'Buyer profile not found');

    const limitMB = 5;
    if (req.file.size > limitMB * 1024 * 1024) {
      throw new ApiError(400, `File size exceeds limit of ${limitMB}MB`);
    }

    // Check confirmation replace flag
    const confirmReplace = req.body.confirmReplace === 'true' || req.body.confirmReplace === true;
    const existingCount = await db.buyerFrequentlyBoughtItem.count({ where: { buyerId: userId(req) } });
    if (existingCount > 0 && !confirmReplace) {
      return res.status(200).json({
        success: false,
        warning: 'Replacing items will overwrite your existing frequently bought items. Please confirm replacement.',
        existingCount
      });
    }

    // Parse workbook safely (avoid formula execution)
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellFormula: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new ApiError(400, 'Worksheet is empty');
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

    if (rows.length === 0) {
      throw new ApiError(400, 'Excel file contains no rows');
    }

    // Identify headers
    let headers: string[] = [];
    let startRowIndex = 0;
    const firstRow = rows[0] ? rows[0].map((h: any) => String(h || '').trim().toLowerCase()) : [];

    if (firstRow.includes('item description') || firstRow.includes('description') || firstRow.includes('itemdescription')) {
      headers = firstRow;
      startRowIndex = 1;
    }

    const getIndex = (names: string[], fallback: number) => {
      const idx = headers.findIndex(h => names.includes(h));
      return idx !== -1 ? idx : fallback;
    };

    const slIdx = getIndex(['sl. no.', 'sl.no.', 'sl no', 'serial no', 'serial number'], 0);
    const descIdx = getIndex(['item description', 'description', 'item_description'], 1);
    const catIdx = getIndex(['category'], 2);
    const reqIdx = getIndex(['estimated monthly requirement', 'monthly requirement', 'requirement', 'estimated monthly qty', 'estimated qty'], 3);
    const unitIdx = getIndex(['unit'], 4);
    const remarksIdx = getIndex(['remarks', 'remark'], 5);

    const validItems: any[] = [];
    const invalidRows: any[] = [];
    const descriptionsSeen = new Set<string>();
    const duplicateDescriptions = new Set<string>();

    for (let i = startRowIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue; // Skip empty rows

      // If all cells in row are empty, skip
      const isRowEmpty = row.every((c: any) => c === undefined || c === null || String(c).trim() === '');
      if (isRowEmpty) continue;

      const itemDescription = clean(row[descIdx]);
      const serialNo = clean(row[slIdx]);
      const category = clean(row[catIdx]);
      const estimatedMonthlyRequirement = clean(row[reqIdx]);
      const unit = clean(row[unitIdx]);
      const remarks = clean(row[remarksIdx]);

      if (!itemDescription) {
        invalidRows.push({
          rowNumber: i + 1,
          reason: 'Item Description is mandatory',
          rowValues: row
        });
        continue;
      }

      if (descriptionsSeen.has(itemDescription.toLowerCase())) {
        duplicateDescriptions.add(itemDescription.toLowerCase());
      } else {
        descriptionsSeen.add(itemDescription.toLowerCase());
      }

      validItems.push({
        serialNo: serialNo || null,
        itemDescription,
        category: category || null,
        estimatedMonthlyRequirement: estimatedMonthlyRequirement || null,
        unit: unit || null,
        remarks: remarks || null
      });
    }

    // Save batch record
    const batch = await db.buyerItemUploadBatch.create({
      data: {
        buyerId: userId(req),
        organizationProfileId: profile.id,
        fileName: req.file.originalname,
        totalRows: rows.length - startRowIndex,
        validRows: validItems.length,
        invalidRows: invalidRows.length,
        status: validItems.length > 0 ? 'SUCCESS' : 'FAILED'
      }
    });

    if (validItems.length > 0) {
      // Clear old items if confirmed
      if (confirmReplace) {
        await db.buyerFrequentlyBoughtItem.deleteMany({
          where: { buyerId: userId(req) }
        });
      }

      // Bulk create items
      const insertData = validItems.map(item => ({
        ...item,
        buyerId: userId(req),
        organizationProfileId: profile.id,
        // Mark as duplicate in remarks if duplicated in the Excel file
        remarks: duplicateDescriptions.has(item.itemDescription.toLowerCase())
          ? `[DUPLICATE DESCRIPTION] ${item.remarks || ''}`.trim()
          : item.remarks
      }));

      await db.buyerFrequentlyBoughtItem.createMany({
        data: insertData
      });

      await notificationService.notify(userId(req), {
        title: 'Items Uploaded Successfully',
        message: `Successfully uploaded ${validItems.length} frequently bought items.`,
        type: 'items_uploaded_success',
        priority: 'medium',
        redirectUrl: '/buyer/profile'
      }).catch(err => console.error('[Notification Failed]', err));
    } else {
      await notificationService.notify(userId(req), {
        title: 'Items Upload Failed',
        message: `Failed to parse frequently bought items. ${invalidRows.length} invalid rows found.`,
        type: 'items_uploaded_failed',
        priority: 'high',
        redirectUrl: '/buyer/profile'
      }).catch(err => console.error('[Notification Failed]', err));
    }

    ok(res, {
      success: true,
      batchId: batch.id,
      totalProcessed: validItems.length + invalidRows.length,
      savedCount: validItems.length,
      invalidCount: invalidRows.length,
      invalidRows,
      hasDuplicates: duplicateDescriptions.size > 0,
      duplicateCount: duplicateDescriptions.size
    });
  } catch (err) {
    next(err);
  }
}) as any);


// ==========================================
// PUBLIC SHOWCASE ROUTES
// ==========================================

// Get verified and active buyer organizations (home page strip)
router.get('/public/organizations', (async (req, res, next) => {
  try {
    const organizations = await db.buyerProfile.findMany({
      where: {
        verificationStatus: 'VERIFIED',
        isActive: true
      },
      select: {
        id: true,
        userId: true,
        organizationName: true,
        departmentName: true,
        organizationType: true,
        state: true,
        city: true,
        logoUrl: true,
        bannerUrl: true,
        verificationStatus: true,
        isActive: true,
        updatedAt: true
      },
      orderBy: { organizationName: 'asc' }
    });
    ok(res, organizations);
  } catch (err) {
    next(err);
  }
}) as any);

// Get public profile details by ID
router.get('/public/organizations/:id', (async (req, res, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const profile = await db.buyerProfile.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id },
              { organizationId: id }
            ]
          },
          {
            OR: [
              { verificationStatus: 'VERIFIED' },
              { organization: { verificationStatus: 'VERIFIED', isBlacklisted: false } }
            ]
          }
        ],
        isActive: true
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        organizationName: true,
        departmentName: true,
        organizationType: true,
        registrationNumber: true,
        gstNumber: true,
        panNumber: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        officialEmail: true,
        officialPhone: true,
        website: true,
        logoUrl: true,
        bannerUrl: true,
        verificationStatus: true,
        isActive: true,
        updatedAt: true,
        cin: true,
        gst: true,
        pan: true,
        registeredAddress: true,
        email: true,
        mobile: true,
        businessType: true,
        department: true,
        organization: {
          select: {
            id: true,
            organizationName: true,
            organizationType: true,
            gstin: true,
            panNumber: true,
            cinNumber: true,
            addressLine1: true,
            city: true,
            state: true,
            pincode: true,
            website: true
          }
        }
      }
    });
    if (!profile) throw new ApiError(404, 'Organization profile not found or not active');

    const mappedProfile = {
      id: profile.id,
      userId: profile.userId,
      organizationName: profile.organizationName || profile.organization?.organizationName || 'N/A',
      departmentName: profile.departmentName || profile.department || 'N/A',
      organizationType: profile.organizationType || profile.organization?.organizationType || profile.businessType || 'N/A',
      registrationNumber: profile.registrationNumber || profile.cin || profile.organization?.cinNumber || 'N/A',
      gstNumber: profile.gstNumber || profile.gst || profile.organization?.gstin || 'N/A',
      panNumber: profile.panNumber || profile.pan || profile.organization?.panNumber || 'N/A',
      address: profile.address || profile.registeredAddress || profile.organization?.addressLine1 || 'N/A',
      city: profile.city || profile.organization?.city || 'N/A',
      state: profile.state || profile.organization?.state || 'N/A',
      pincode: profile.pincode || profile.organization?.pincode || 'N/A',
      officialEmail: profile.officialEmail || profile.email || 'N/A',
      officialPhone: profile.officialPhone || profile.mobile || 'N/A',
      website: profile.website || profile.organization?.website || '',
      logoUrl: profile.logoUrl,
      bannerUrl: profile.bannerUrl,
      verificationStatus: profile.verificationStatus,
      isActive: profile.isActive,
      updatedAt: profile.updatedAt
    };

    ok(res, mappedProfile);
  } catch (err) {
    next(err);
  }
}) as any);

// Get public items list for a buyer organization (with filters)
router.get('/public/organizations/:id/items', (async (req, res, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const search = clean(req.query.search);
    const category = clean(req.query.category);

    const profile = await db.buyerProfile.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id },
              { organizationId: id }
            ]
          },
          {
            OR: [
              { verificationStatus: 'VERIFIED' },
              { organization: { verificationStatus: 'VERIFIED', isBlacklisted: false } }
            ]
          }
        ],
        isActive: true
      },
      select: { id: true }
    });

    if (!profile) {
      return ok(res, []);
    }

    const where: any = {
      organizationProfileId: profile.id,
      status: 'ACTIVE'
    };

    if (search) {
      where.itemDescription = { contains: search, mode: 'insensitive' };
    }
    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    const items = await db.buyerFrequentlyBoughtItem.findMany({
      where,
      orderBy: { id: 'asc' }
    });

    ok(res, items);
  } catch (err) {
    next(err);
  }
}) as any);


// ==========================================
// ADMIN CONTROL ROUTES (Role: admin)
// ==========================================

// Verify/reject buyer organization status manually
router.post('/admin/organizations/:id/status', authenticate, authorize('admin'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const { status } = parse(z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']) }), req.body);

    const adminUser = req.user?.id ? await prisma.user.findUnique({ where: { id: req.user.id } }) : null;
    const adminName = adminUser?.name || 'Admin';

    const updated = await db.buyerProfile.update({
      where: { id },
      data: {
        verificationStatus: status,
        verificationStatusEnum: status as any,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
        verifiedBy: status === 'VERIFIED' ? adminName : null
      }
    });

    if (updated.organizationId) {
      await db.organization.update({
        where: { id: updated.organizationId },
        data: {
          verificationStatus: status as any,
          organizationOnboardingStatus: status === 'VERIFIED' ? 'approved_for_procurement' : undefined
        }
      });
    }

    if (status === 'VERIFIED') {
      const dbUser = await db.user.findUnique({ where: { id: updated.userId } });
      if (dbUser) {
        let sectionStatus = dbUser.sectionStatus ? { ...(dbUser.sectionStatus as object) } : {};
        sectionStatus = {
          org: 'approved',
          rep: 'approved',
          docs: 'approved',
          address: 'approved',
          procurement: 'approved',
          ...sectionStatus
        };
        await db.user.update({
          where: { id: updated.userId },
          data: {
            onboardingStatus: 'approved_for_procurement',
            sectionStatus
          }
        });
      }
    }

    await notificationService.notify(updated.userId, {
      title: `Showcase Status Updated: ${status}`,
      message: `Your organization showcase profile status has been updated to ${status} by admin.`,
      type: 'admin_showcase_status_updated',
      priority: 'high',
      redirectUrl: '/buyer/profile'
    }).catch(err => console.error('[Notification Failed]', err));

    ok(res, updated);
  } catch (err) {
    next(err);
  }
}) as any);

// Toggle buyer visibility active status
router.post('/admin/organizations/:id/visibility', authenticate, authorize('admin'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const id = z.coerce.number().int().parse(req.params.id);
    const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);

    const updated = await db.buyerProfile.update({
      where: { id },
      data: { isActive }
    });

    await notificationService.notify(updated.userId, {
      title: isActive ? 'Showcase Activated' : 'Showcase Deactivated',
      message: `Your showcase visibility has been ${isActive ? 'activated' : 'deactivated'} by admin.`,
      type: 'admin_showcase_visibility_updated',
      priority: 'medium',
      redirectUrl: '/buyer/profile'
    }).catch(err => console.error('[Notification Failed]', err));

    ok(res, updated);
  } catch (err) {
    next(err);
  }
}) as any);

// Admin view buyer items
router.get('/admin/organizations/:id/items', authenticate, authorize('admin'), (async (req: AuthRequest, res: Response, next) => {
  try {
    const organizationProfileId = z.coerce.number().int().parse(req.params.id);
    const items = await db.buyerFrequentlyBoughtItem.findMany({
      where: { organizationProfileId },
      orderBy: { id: 'asc' }
    });
    ok(res, items);
  } catch (err) {
    next(err);
  }
}) as any);

export { router as buyerShowcaseRouter };
