import dotenv from 'dotenv';
console.log('--- BACKEND index.ts (PRISMA) EXECUTING ---');
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envResult = dotenv.config({
  path: [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env')
  ],
  override: true
});
console.log(`--- ENV loaded from: ${envResult.parsed ? 'backend/.env' : 'not found'} | API Setu key: ${process.env.APISETU_API_KEY ? 'configured' : 'missing'} ---`);

import express from 'express';
import type { Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Import Prisma Client
import prisma from './src/lib/prisma.js';
import { Role, RegistrationStatus } from '@prisma/client';
import { authenticate, authorize, authorizeAdmin } from './src/middleware/auth.js';
import type { AuthRequest } from './src/middleware/auth.js';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-procure-key';

// Cloudinary Configuration
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('--- Cloudinary configured successfully ---');
} else {
  console.warn('--- Cloudinary configuration missing ---');
}

// Multer Storage Configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000,
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 5001;
  const configuredOrigins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    ...(process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim()).filter(Boolean)
      : [
        "https://msme-portal-pug-arch-frontend.vercel.app",
        "https://msme-portal-pug-arch-frontend-onet.vercel.app"
      ])
  ];

  app.use(cors({
    origin: (origin, callback) => {
      let hostname = '';
      try {
        hostname = origin ? new URL(origin).hostname : '';
      } catch {
        return callback(new Error(`CORS blocked for invalid origin: ${origin}`));
      }

      if (!origin || configuredOrigins.includes(origin) || /^msme(-portal)?-pugarch-frontend(-[a-z0-9-]+)*\.vercel\.app$/.test(hostname)) {
        return callback(null, true);
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  }));
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url} [${res.statusCode}] - ${duration}ms`);
    });
    next();
  });

  const ensureOnboardingEditable = async (
    userId: number
  ): Promise<{ editable: boolean; status?: number; message?: string }> => {
    // Force unlock for all statuses as requested by USER
    return { editable: true };
  };

  const normalizeSpaces = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
  const notificationClients = new Map<number, Set<Response>>();

  const emitNotification = (userId: number, notification: any) => {
    const clients = notificationClients.get(userId);
    if (!clients) return;
    for (const client of clients) {
      client.write('event: notification\n');
      client.write(`data: ${JSON.stringify(notification)}\n\n`);
    }
  };

  const createNotificationSafe = async (payload: { userId: number; title: string; message: string; type: string }) => {
    try {
      const notification = await prisma.notification.create({ data: payload });
      emitNotification(payload.userId, notification);
      return notification;
    } catch (err) {
      console.error('[Notification] Failed to create notification:', err);
      return null;
    }
  };

  const notifyAdminsOfApplication = async (applicant: any, organizationName: string, applicationType: 'buyer' | 'seller') => {
    try {
      const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
      const timestamp = new Date().toLocaleString('en-IN');
      await Promise.all(admins.map(admin => createNotificationSafe({
        userId: admin.id,
        title: `${applicationType === 'buyer' ? 'Buyer' : 'Seller'} application submitted`,
        message: `${applicant.name} (${organizationName || 'Organization not provided'}) submitted a ${applicationType} application for review on ${timestamp}. Status: Under compliance review.`,
        type: `${applicationType}_application_submitted`
      })));
    } catch (err) {
      console.error('[Notification] Failed to notify admins:', err);
    }
  };

  const profileOrganizationName = (user: any) =>
    normalizeSpaces(
      user?.sellerProfile?.businessName ||
      user?.buyerProfile?.organizationName ||
      user?.name ||
      'Organization not provided'
    );

  const applicationTypeLabel = (role: unknown) => String(role) === 'seller' ? 'Seller' : 'Buyer';

  const sectionLabel = (role: unknown, section: string) => {
    const buyerLabels: Record<string, string> = {
      org: 'Organisation Details',
      rep: 'Authorized Representative',
      address: 'Address Details',
      procurement: 'Procurement Profile',
      docs: 'Documents'
    };
    const sellerLabels: Record<string, string> = {
      pan: 'Business PAN Validation',
      details: 'Business Details',
      additional: 'Additional Details',
      offices: 'Office Locations',
      bank: 'Bank Accounts',
      einvoicing: 'E-Invoicing',
      ownership: 'Beneficial Ownership'
    };
    return String(role) === 'buyer' ? (buyerLabels[section] || section) : (sellerLabels[section] || section);
  };

  const statusMessage = (status: string, reason?: string) => {
    if (status === 'approved_for_procurement') return 'Your application has been approved for procurement access.';
    if (status === 'rejected') return `Your application has been rejected.${reason ? ` Reason: ${reason}` : ''}`;
    if (status === 'resubmission_required') return `Changes are required before approval.${reason ? ` Details: ${reason}` : ''}`;
    if (status === 'under_compliance_review') return 'Your application is under compliance review.';
    return `Your application status has been updated to ${status}.`;
  };

  const validateSellerBankPayload = (body: any) => {
    const values = {
      ifsc: normalizeSpaces(body.ifsc).toUpperCase(),
      bankName: normalizeSpaces(body.bankName),
      bankAddress: normalizeSpaces(body.bankAddress),
      holderName: normalizeSpaces(body.holderName),
      accountNumber: String(body.accountNumber || '').trim(),
      isPrimary: Boolean(body.isPrimary)
    };
    const errors: Record<string, string> = {};
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    const bankNameRegex = /^[A-Za-z0-9 .,&()/-]+$/;
    const holderRegex = /^[A-Za-z .'-]+$/;
    const accountRegex = /^\d{9,18}$/;

    if (!values.ifsc) errors.ifsc = 'IFSC code is required';
    else if (!ifscRegex.test(values.ifsc)) errors.ifsc = 'Invalid IFSC format';

    if (!values.bankName) errors.bankName = 'Bank name is required';
    else if (values.bankName.length < 2 || values.bankName.length > 100) errors.bankName = 'Bank name must be 2 to 100 characters';
    else if (!bankNameRegex.test(values.bankName)) errors.bankName = 'Bank name contains invalid characters';

    if (!values.bankAddress) errors.bankAddress = 'Bank address is required';
    else if (values.bankAddress.length < 10 || values.bankAddress.length > 250) errors.bankAddress = 'Bank address must be 10 to 250 characters';

    if (!values.holderName) errors.holderName = 'Account holder name is required';
    else if (values.holderName.length < 2) errors.holderName = 'Account holder name must be at least 2 characters';
    else if (!holderRegex.test(values.holderName)) errors.holderName = 'Account holder name contains invalid characters';

    if (!values.accountNumber) errors.accountNumber = 'Bank account number is required';
    else if (!accountRegex.test(values.accountNumber)) errors.accountNumber = 'Account number must be 9 to 18 digits';

    return { values, errors, isValid: Object.keys(errors).length === 0 };
  };

  const validatePersonalVerification = (role: unknown, details: any, dob: unknown, mobile: unknown) => {
    const errors: Record<string, string> = {};
    const method = String(details?.verificationMethod || '').trim();
    const mobileValue = String(mobile || '').trim();
    const dobValue = String(dob || '').trim();

    if (role !== 'seller') return { errors, isValid: true };
    if (!['aadhaar', 'pan'].includes(method)) {
      errors.verificationMethod = 'Select Aadhaar or Personal PAN verification';
      return { errors, isValid: false };
    }

    if (method === 'aadhaar') {
      const aadhaarValue = String(details?.aadhaarNumber || '').trim();
      const validIdentity = /^\d{12}$/.test(aadhaarValue) || /^\d{16}$/.test(aadhaarValue);
      const validMobile = /^[6-9]\d{9}$/.test(mobileValue) && !/^(\d)\1{9}$/.test(mobileValue);
      if (!validIdentity) errors.aadhaarNumber = 'Aadhaar must be 12 digits or Virtual ID must be 16 digits';
      if (!validMobile) errors.mobile = 'Aadhaar-linked mobile must be a valid 10 digit Indian mobile number';
      if (!details?.isAadhaarVerified) errors.aadhaarVerified = 'Aadhaar verification is required';
    }

    if (method === 'pan') {
      const pan = String(details?.pan || '').trim().toUpperCase();
      const name = normalizeSpaces(details?.accountName);
      const parsedDob = dobValue ? new Date(dobValue) : null;
      const now = new Date();
      const age = parsedDob
        ? now.getFullYear() - parsedDob.getFullYear() - (now < new Date(now.getFullYear(), parsedDob.getMonth(), parsedDob.getDate()) ? 1 : 0)
        : 0;
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) errors.pan = 'PAN must follow ABCDE1234F format';
      if (!/^[A-Za-z .-]{2,100}$/.test(name)) errors.accountName = 'Name as on PAN must be 2-100 valid text characters';
      if (!parsedDob || parsedDob > now || age < 18) errors.dob = 'Date of birth must not be future and user must be at least 18 years old';
    }

    return { errors, isValid: Object.keys(errors).length === 0 };
  };

  const compactParts = (...parts: unknown[]) =>
    parts
      .map(part => normalizeSpaces(part))
      .filter(Boolean);

  const pickFirstValue = (...values: unknown[]) => {
    for (const value of values) {
      const normalized = normalizeSpaces(value);
      if (normalized) return normalized;
    }
    return '';
  };

  const cleanEnv = (value: unknown) => normalizeSpaces(value).replace(/^['"]|['"]$/g, '');
  const getApiSetuConfig = () => ({
    apiKey: cleanEnv(process.env.APISETU_API_KEY),
    clientId: cleanEnv(process.env.APISETU_CLIENT_ID),
    urlTemplate: cleanEnv(process.env.APISETU_GST_URL || 'https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}')
  });

  const fetchApiSetuJson = async (apiUrl: string, headers: Record<string, string>) => {
    try {
      const response = await fetch(apiUrl, { method: 'GET', headers });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      return { ok: response.ok, status: response.status, body, text };
    } catch (err: any) {
      const allowInsecureTls =
        cleanEnv(process.env.APISETU_ALLOW_INSECURE_TLS).toLowerCase() === 'true' ||
        process.env.NODE_ENV !== 'production';

      const isCertificateChainError =
        err?.cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        /certificate/i.test(String(err?.cause?.message || err?.message || ''));

      if (!allowInsecureTls) {
        throw err;
      }

      console.warn('[GST Verify] Node TLS rejected API Setu certificate chain. Retrying with APISETU_ALLOW_INSECURE_TLS fallback.');
      return new Promise<{ ok: boolean; status: number; body: any; text: string }>((resolve, reject) => {
        const request = https.request(apiUrl, {
          method: 'GET',
          headers,
          rejectUnauthorized: false
        }, response => {
          let text = '';
          response.setEncoding('utf8');
          response.on('data', chunk => { text += chunk; });
          response.on('end', () => {
            let body: any = {};
            try {
              body = text ? JSON.parse(text) : {};
            } catch {
              body = {};
            }
            resolve({
              ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
              status: response.statusCode || 0,
              body,
              text
            });
          });
        });
        request.on('error', reject);
        request.setTimeout(20000, () => request.destroy(new Error('API Setu request timed out')));
        request.end();
      });
    }
  };

  const getNestedValue = (source: any, paths: string[]) => {
    for (const path of paths) {
      const value = path.split('.').reduce((current, key) => {
        if (current === undefined || current === null) return undefined;
        return current[key];
      }, source);
      const normalized = normalizeSpaces(value);
      if (normalized) return normalized;
    }
    return '';
  };

  const resolveGstPayload = (raw: any) =>
    raw?.data?.result ||
    raw?.data?.gstinData ||
    raw?.data?.gstDetails ||
    raw?.data?.data ||
    raw?.result ||
    raw?.gstinData ||
    raw?.gstDetails ||
    raw?.taxpayerDetails ||
    raw?.taxPayerDetails ||
    raw?.certificateData ||
    raw;

  const normalizeGstDetails = (raw: any, requestedGstin: string) => {
    const payload = resolveGstPayload(raw);
    const principal =
      payload?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress ||
      payload?.principalPlaceOfBusinessFields ||
      payload?.pradr ||
      payload?.principalPlaceOfBusiness ||
      payload?.principalAddress ||
      payload?.principal_place_of_business ||
      {};
    const addressSource = principal?.addr || principal?.address || principal;
    const requested = requestedGstin.toUpperCase();
    const responseGstin = pickFirstValue(
      payload?.gstin,
      payload?.gstIn,
      payload?.GSTIN,
      payload?.gstIdentificationNumber,
      getNestedValue(raw, ['data.gstin', 'data.GSTIN', 'result.gstin'])
    ).toUpperCase();

    const legalName = pickFirstValue(payload?.legalNameOfBusiness, payload?.lgnm, payload?.legalName, payload?.legal_name, payload?.legalNam, payload?.legal_name_of_business, payload?.name);
    const tradeName = pickFirstValue(payload?.tradeNam, payload?.tradeName, payload?.trade_name, payload?.trade_name_of_business, payload?.businessName);
    const pincode = pickFirstValue(addressSource?.pncd, addressSource?.pinCode, addressSource?.pincode, addressSource?.pin, addressSource?.zip);
    const district = pickFirstValue(addressSource?.dst, addressSource?.district, addressSource?.dist, addressSource?.districtName);
    const city = pickFirstValue(addressSource?.city, addressSource?.town, addressSource?.village, addressSource?.location, district);
    const state = pickFirstValue(addressSource?.stcd, addressSource?.state, addressSource?.stateName);
    const address = compactParts(
      addressSource?.bno,
      addressSource?.buildingNumber,
      addressSource?.bnm,
      addressSource?.buildingName,
      addressSource?.flno,
      addressSource?.floorNumber,
      addressSource?.floor,
      addressSource?.st,
      addressSource?.streetName,
      addressSource?.street,
      addressSource?.loc,
      addressSource?.location,
      addressSource?.locality,
      addressSource?.landMark,
      addressSource?.city,
      district,
      state,
      pincode
    ).join(', ');

    return {
      requestedGstin: requested,
      responseGstin,
      legalName,
      tradeName,
      organizationName: legalName || tradeName,
      address,
      registeredOfficeAddress: address,
      country: 'India',
      state,
      city,
      district,
      pincode,
      pinCode: pincode,
      pan: pickFirstValue(payload?.pan, payload?.PAN, payload?.panNo, payload?.panNumber) || requested.substring(2, 12),
      status: pickFirstValue(payload?.gstnStatus, payload?.sts, payload?.status, payload?.authStatus) || 'Active',
      raw
    };
  };

  app.get("/", (req, res) => {
    res.json({
      message: "PugArch MSME Marketplace API (Prisma/PostgreSQL) is running",
      health: "/api/test"
    });
  });

  app.get("/api/test", (req, res) => res.json({ message: "API working" }));

  // --- Tender APIs ---
  app.get('/api/tenders', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
    try {
      const tenders = await prisma.tender.findMany({
        where: { buyerId: Number(req.user?.id) },
        orderBy: { createdAt: 'desc' }
      });
      res.json(tenders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/tenders/public', authenticate, authorize('seller', 'buyer', 'admin'), async (req: AuthRequest, res) => {
    try {
      const tenders = await prisma.tender.findMany({
        where: { status: 'published' },
        include: { buyer: { include: { buyerProfile: true } } },
        orderBy: { createdAt: 'desc' }
      });
      res.json(tenders);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GST Verification Utility
  app.get('/api/utils/gst-verify/:gstin', async (req, res) => {
    const rawGstin = String(req.params.gstin || '');
    const gstin = rawGstin.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{1}[Zz]{1}[0-9A-Z]{1}$/.test(gstin)) {
      return res.status(400).json({ message: 'Invalid GSTIN format' });
    }

    const gstStateMap: Record<string, string> = {
      '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
      '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
      '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
      '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
      '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
      '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
      '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
      '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
      '37': 'Andhra Pradesh (New)', '38': 'Ladakh'
    };

    const derivedFallback = {
      legalName: '',
      tradeName: '',
      address: '',
      state: gstStateMap[gstin.substring(0, 2)] || '',
      city: '',
      pincode: '',
      pan: gstin.substring(2, 12),
      status: '',
      isRegisteredDealer: false,
      partial: true,
      source: 'derived_from_gstin'
    };

    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      const { apiKey, clientId, urlTemplate } = getApiSetuConfig();
      console.log(`[GST Verify] Request for: ${gstin}`);
      console.log(`[GST Verify] Using API Key: ${apiKey ? (apiKey.substring(0, 5) + '...') : 'MISSING'}`);
      console.log(`[GST Verify] Using Client ID: ${clientId ? clientId : 'MISSING'}`);

      if (!apiKey || apiKey.includes('YOUR_')) {
        console.warn('[GST Verify] No API key found in .env.');
        return res.status(500).json({
          message: 'API Setu GST API key is not configured on server. Add APISETU_API_KEY in backend/.env.'
        });
      }

      if (!clientId || clientId.includes('YOUR_')) {
        return res.status(500).json({
          message: 'API Setu client ID is not configured on server. Add APISETU_CLIENT_ID in backend/.env.'
        });
      }

      // Supports either:
      // 1) Official API Setu path: /gstn/v2/taxpayers/{gstin}
      // 2) ...?gstin={gstin}
      // 3) plain endpoint (we append /{gstin})
      const apiUrl = urlTemplate.includes('{gstin}')
        ? urlTemplate.replace('{gstin}', encodeURIComponent(gstin))
        : urlTemplate.includes('gstin=')
          ? urlTemplate.replace(/gstin=[^&]*/i, `gstin=${encodeURIComponent(gstin)}`)
          : `${urlTemplate.replace(/\/$/, '')}/${encodeURIComponent(gstin)}`;

      console.log(`[GST Verify] Calling API Setu endpoint: ${apiUrl}`);

      const providerResponse = await fetchApiSetuJson(apiUrl, {
        'X-APISETU-APIKEY': apiKey,
        'X-APISETU-CLIENTID': clientId,
        'Accept': 'application/json'
      });

      console.log(`[GST Verify] API Setu Response Status: ${providerResponse.status}`);

      if (!providerResponse.ok) {
        console.error(`[GST Verify] API Setu Error: ${providerResponse.status} - ${providerResponse.text}`);
        return res.json({
          ...derivedFallback,
          message: "Live GST verification unavailable right now. Derived basic details from GSTIN.",
          providerStatus: providerResponse.status
        });
      }

      const result: any = providerResponse.body;
      console.log(`[GST Verify] GST Data Received:`, JSON.stringify(result).substring(0, 120) + '...');
      
      console.log('[GST Verify] Raw API Setu response:', JSON.stringify(result));
      const normalized = normalizeGstDetails(result, gstin);
      console.log('[GST Verify] Mapped GST output:', JSON.stringify({
        requestedGstin: normalized.requestedGstin,
        responseGstin: normalized.responseGstin || 'not_returned',
        legalName: normalized.legalName,
        tradeName: normalized.tradeName,
        state: normalized.state,
        city: normalized.city,
        pincode: normalized.pincode,
        hasAddress: Boolean(normalized.address)
      }));

      if (normalized.responseGstin && normalized.responseGstin !== gstin) {
        return res.status(409).json({
          message: 'GST API response does not match the requested GSTIN. Please retry.',
          requestedGstin: gstin,
          responseGstin: normalized.responseGstin
        });
      }

      if (!normalized.legalName && !normalized.tradeName) {
        return res.json({
          ...derivedFallback,
          message: 'Provider returned incomplete GST data. Please verify GSTIN and enter details manually.'
        });
      }

      res.json({
        ...normalized,
        isRegisteredDealer: ['active', 'registered', 'regular', 'composition'].includes(String(normalized.status).toLowerCase()),
        message: normalized.address ? undefined : 'Address not available from GST API. Please enter manually.'
      });
    } catch (err: any) {
      console.error('[GST Verify] Critical Failure:', err);
      const errorCode = err?.cause?.code || err?.code || '';
      const errorDetail = normalizeSpaces(err?.cause?.message || err?.message || 'Unknown network error');
      res.json({
        ...derivedFallback,
        message: process.env.NODE_ENV === 'production'
          ? 'Live GST verification failed due to provider/network issue. Derived basic details from GSTIN.'
          : `Live GST verification failed: ${errorCode ? `${errorCode} - ` : ''}${errorDetail}`,
        providerError: process.env.NODE_ENV === 'production' ? undefined : {
          code: errorCode,
          detail: errorDetail
        }
      });
    }
  });

  // --- Bid / Quotation APIs ---
  app.post('/api/tenders/:id/bids', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const tenderId = Number(req.params.id);
      const sellerId = Number(req.user?.id);

      // Check if tender exists and is active
      const tender = await prisma.tender.findUnique({
        where: { id: tenderId }
      });

      if (!tender || tender.status !== 'published') {
        return res.status(400).json({ message: 'Tender is not active or does not exist' });
      }

      // Create or update bid
      const bid = await prisma.bid.upsert({
        where: {
          bidCompoundId: { tenderId, sellerId }
        } as any,
        update: {
          ...req.body,
          status: 'pending'
        },
        create: {
          ...req.body,
          tenderId,
          sellerId,
          status: 'pending'
        }
      });

      // Update tender bidsCount
      await prisma.tender.update({
        where: { id: tenderId },
        data: { bidsCount: { increment: 1 } }
      });

      res.json(bid);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/tenders/:id/bids', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
    try {
      const tenderId = Number(req.params.id);
      const bids = await prisma.bid.findMany({
        where: { tenderId },
        include: {
          seller: {
            include: {
              sellerProfile: true
            }
          }
        },
        orderBy: { unitPrice: 'asc' } as any
      });
      res.json(bids);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/bids/my', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const bids = await prisma.bid.findMany({
        where: { sellerId: Number(req.user?.id) },
        include: { tender: true },
        orderBy: { createdAt: 'desc' }
      });
      res.json(bids);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/bids/:id/status', authenticate, authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
    try {
      const bidId = Number(req.params.id);
      const { status } = req.body; // accepted, rejected

      const bid = await prisma.bid.update({
        where: { id: bidId },
        data: { status }
      });

      // If accepted, reject all other bids for the same tender
      if (status === 'accepted') {
        await prisma.bid.updateMany({
          where: {
            tenderId: bid.tenderId,
            id: { not: bidId }
          },
          data: { status: 'rejected' }
        });

        // Close the tender
        await prisma.tender.update({
          where: { id: bid.tenderId },
          data: { status: 'closed' }
        });
      }

      res.json(bid);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/tenders', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
    try {
      if (!req.user || req.user.role !== 'buyer') {
        return res.status(403).json({ message: 'Only buyers can create tenders' });
      }

      const tenderId = `T-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const { title, category, budget, description, documentUrl } = req.body;

      const tender = await prisma.tender.create({
        data: {
          title,
          category,
          budget: Number(budget),
          description,
          documentUrl,
          buyerId: Number(req.user.id),
          tenderId,
          closesAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        }
      });

      res.status(201).json(tender);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put('/api/tenders/:id/status', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const tenderId = Number(req.params.id);

      const tender = await prisma.tender.findUnique({
        where: { id: tenderId }
      });

      if (!tender || tender.buyerId !== Number(req.user?.id)) {
        return res.status(404).json({ message: 'Tender not found or unauthorized' });
      }

      const updatedTender = await prisma.tender.update({
        where: { id: tenderId },
        data: { status }
      });

      res.json(updatedTender);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Seed Data Logic ---
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('Seeding sample data for Prisma...');
      const hashedPassword = await bcrypt.hash('password123', 10);

      // Admin
      await prisma.user.create({
        data: {
          name: 'Admin User',
          email: 'admin@pugarch.com',
          password: hashedPassword,
          role: 'admin',
          registrationStatus: 'completed',
          onboardingStatus: 'approved_for_procurement'
        }
      });

      // Sample Users
      const sampleUsers = [
        { name: 'Rajesh Kumar', email: 'rajesh@texcorp.com', role: 'seller' as const },
        { name: 'Suresh Raina', email: 'suresh@buildcon.com', role: 'buyer' as const },
      ];

      for (const u of sampleUsers) {
        const user = await prisma.user.create({
          data: {
            name: u.name,
            email: u.email,
            password: hashedPassword,
            role: u.role,
            registrationStatus: 'completed',
            onboardingStatus: 'approved_for_procurement'
          }
        });

        if (u.role === 'seller') {
          await prisma.sellerProfile.create({
            data: {
              userId: user.id,
              organizationType: 'Pvt Ltd',
              pan: 'ABCDE1234F',
              nameAsInPan: u.name,
              panVerified: true,
              businessName: 'TEXCORP',
              productCategories: ['Textiles'],
            }
          });
        } else {
          await prisma.buyerProfile.create({
            data: {
              userId: user.id,
              organizationName: 'BUILDCON',
              businessType: 'Partnership',
              industry: 'Construction',
              pan: 'BCDEF2345G',
              representativeName: u.name,
              mobile: '9123456789',
              state: 'Karnataka',
              city: 'Bangalore',
              pincode: '560001',
              registeredAddress: '45, Tech Center, MG Road',
              gst: '29BCDEF2345G1Z2',
            }
          });

          // Add a tender for the buyer
          await prisma.tender.create({
            data: {
              buyerId: user.id,
              tenderId: 'T-2026-0001',
              title: 'Office Furniture Supply',
              category: 'Furniture',
              budget: 500000,
              description: 'Need ergonomic chairs and desks.',
              status: 'published',
              closesAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
            }
          });
        }
      }
      console.log('Seeding completed.');
    }
  } catch (err: any) {
    const message = String(err?.message || '');
    if (message.includes("Can't reach database server")) {
      console.warn('Seeding skipped: database server is unreachable.');
    } else {
      console.error('Seeding error:', err);
    }
  }

  // --- File Upload ---
  app.post('/api/upload', authenticate, upload.single('file'), (req: any, res: any) => {
    try {
      console.log('--- Upload Request Headers:', req.headers['content-type']);
      if (!req.file) {
        console.error('--- No file found in request. Body:', req.body);
        return res.status(400).json({ message: 'No file uploaded' });
      }
      console.log(`--- Uploading file to Cloudinary: ${req.file.originalname} (${req.file.size} bytes) ---`);

      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'msme_marketplace_docs',
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) {
            console.error('--- Cloudinary Stream Upload Error:', error);
            return res.status(500).json({ message: 'Upload failed', error });
          }
          console.log('--- Cloudinary Upload Success:', result?.secure_url);
          res.json({ url: result?.secure_url, publicId: result?.public_id });
        }
      );

      stream.end(req.file.buffer);
    } catch (err: any) {
      console.error('--- General Upload Error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  });

  // --- Auth APIs ---
  app.post('/api/auth/send-email-otp', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      console.log(`[Email OTP] Request for: ${email}`);
      if (!email) return res.status(400).json({ message: 'Email is required' });

      // Preemptive check: Does user already exist in DB?
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        console.log(`[Email OTP] Rejection: User ${email} already exists.`);
        return res.status(400).json({ message: 'User already exists. Please login directly.' });
      }
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      console.log(`[Email OTP] Deleting old records for: ${email}`);
      await prisma.otp.deleteMany({ where: { email } });
      
      console.log(`[Email OTP] Creating new record for: ${email}`);
      await prisma.otp.create({
        data: {
          email,
          otp,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        }
      });

      const mailOptions = {
        from: `"Government Procurement Support" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `[SECURE AUTH] Action Verification Key: ${otp}`,
        html: `
          <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="background-color: #1e3a8a; color: #ffffff; padding: 20px; text-align: center; text-transform: uppercase; font-weight: bold; font-size: 18px; letter-spacing: 1.5px;">
              Security Audit Clearance
            </div>
            <div style="padding: 40px 30px; background-color: #ffffff;">
              <p style="margin: 0 0 12px; color: #475569; font-size: 15px;">A request has been lodged for administrative portal access validation.</p>
              <p style="margin: 0 0 30px; color: #1e293b; font-weight: bold; font-size: 15px;">Enter this verification code to authorize the action:</p>
              
              <div style="text-align: center; margin: 35px 0;">
                <div style="display: inline-block; padding: 18px 40px; background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 6px; font-size: 36px; font-weight: 800; color: #1e3a8a; letter-spacing: 12px; font-family: 'Courier New', Courier, monospace;">
                  ${otp}
                </div>
              </div>
              
              <div style="margin-top: 35px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
                  This identifier retains operational validity for exactly 10 minutes. If you did not trigger this verification event, terminate this alert immediately.
                </p>
              </div>
            </div>
          </div>
        `
      };

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        console.log(`[Email OTP] Attempting to send email via ${process.env.SMTP_HOST || 'smtp.gmail.com'}...`);
        await transporter.sendMail(mailOptions);
        console.log(`[Email OTP] Email sent successfully to: ${email}`);
      } else {
        console.log(`[Email OTP] No SMTP credentials, logging OTP: ${otp}`);
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error('[Email OTP] Failed:', err);
      res.status(500).json({
        message: process.env.NODE_ENV === 'production'
          ? 'Unable to send OTP right now. Please try again.'
          : err.message
      });
    }
  });

  app.post('/api/auth/verify-email-otp', async (req, res) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      const otp = String(req.body.otp || '').trim();
      const otpRecord = await prisma.otp.findFirst({ where: { email, otp } });
      if (!otpRecord) return res.status(400).json({ message: 'Invalid OTP' });
      if (otpRecord.expiresAt < new Date()) {
        await prisma.otp.delete({ where: { id: otpRecord.id } });
        return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      }

      await prisma.otp.update({
        where: { id: otpRecord.id },
        data: { isVerified: true }
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/auth/mobile-exists', async (req, res) => {
    try {
      const mobile = String(req.query.mobile || '').trim();
      if (!/^[6-9]\d{9}$/.test(mobile) || /^(\d)\1{9}$/.test(mobile)) {
        return res.status(400).json({ message: 'Enter a valid 10 digit Indian mobile number' });
      }

      const existingUser = await prisma.user.findFirst({
        where: { mobile },
        select: { id: true }
      });

      res.json({ exists: Boolean(existingUser) });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { password, role, registrationDetails, mobile, dob } = req.body;
      const email = String(req.body.email || '').trim().toLowerCase();
      const name = String(
        req.body.name ||
        registrationDetails?.accountName ||
        registrationDetails?.userId ||
        registrationDetails?.businessName ||
        email
      ).trim();
      const otpRecord = await prisma.otp.findFirst({ where: { email, isVerified: true } });
      if (!otpRecord) return res.status(400).json({ message: 'Verify email first' });
      if (otpRecord.expiresAt < new Date()) {
        await prisma.otp.delete({ where: { id: otpRecord.id } });
        return res.status(400).json({ message: 'OTP expired. Please request a new code.' });
      }

      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return res.status(400).json({ message: 'Email already registered. Please log in.' });

      if (mobile) {
        const existingMobile = await prisma.user.findFirst({ where: { mobile: String(mobile).trim() } });
        if (existingMobile) return res.status(400).json({ message: 'Mobile number already in use. Please use unique details.' });
      }

      const personalValidation = validatePersonalVerification(role, registrationDetails, dob, mobile);
      if (!personalValidation.isValid) {
        return res.status(400).json({
          message: 'Invalid personal verification details',
          errors: personalValidation.errors
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          name, email, password: hashedPassword,
          role: role as Role,
          mobile,
          dob: (dob && !isNaN(Date.parse(dob))) ? new Date(dob) : null,
          registrationStatus: RegistrationStatus.completed,
          registrationDetails: registrationDetails || {}
        }
      });

      if (otpRecord) await prisma.otp.delete({ where: { id: otpRecord.id } });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      const { password: _, ...userSafe } = user;
      res.status(201).json({ token, user: { ...userSafe, _id: user.id } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(400).json({ message: 'Not found' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Invalid' });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      const { password: _, ...userSafe } = user;
      res.json({ token, user: { ...userSafe, _id: user.id } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/auth/me', authenticate, async (req: AuthRequest, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(req.user?.id) },
        include: {
          sellerProfile: {
            include: {
              offices: true,
              bankAccounts: true
            }
          },
          buyerProfile: true
        }
      });
      if (!user) return res.status(404).json({ message: 'Not found' });

      const { password, ...userData } = user;
      res.json({
        user: { ...userData, _id: user.id },
        profile: user.role === 'seller' ? user.sellerProfile : user.buyerProfile
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/auth/change-password', authenticate, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = Number(req.user?.id);

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new passwords are required' });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ message: 'Current password incorrect' });

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      res.json({ message: 'Password updated successfully' });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Profile APIs ---
  app.post('/api/seller/register', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const { password, ...rawData } = req.body;

      if (password || rawData.mobile || rawData.dob) {
        const updateData: any = {};
        if (password) updateData.password = await bcrypt.hash(password, 10);
        if (rawData.mobile) updateData.mobile = rawData.mobile;
        if (rawData.dob && !isNaN(Date.parse(rawData.dob))) updateData.dob = new Date(rawData.dob);
        await prisma.user.update({ where: { id: userId }, data: updateData });
      }

      // Filter only allowed fields for SellerProfile (GeM Style)
      const profileData: any = {
        organizationType: rawData.organizationType,
        pan: rawData.pan,
        nameAsInPan: rawData.nameAsInPan,
        dateAsInPan: rawData.dateAsInPan ? new Date(rawData.dateAsInPan) : null,
        panVerified: rawData.panVerified ?? false,
        businessName: rawData.businessName,
        dateOfIncorporation: rawData.dateOfIncorporation ? new Date(rawData.dateOfIncorporation) : null,
        detailsUpdated: rawData.detailsUpdated ?? false,
        isStartup: rawData.isStartup ?? false,
        isUdyamCertified: rawData.isUdyamCertified ?? false,
        participateInBid: rawData.participateInBid ?? false,
        optForSahay: rawData.optForSahay ?? false,
        turnoverMax3Yrs: rawData.turnoverMax3Yrs,
        eInvoicingExcluded: rawData.eInvoicingExcluded ?? false,
        ownershipDeclarationAccepted: rawData.ownershipDeclarationAccepted ?? false,
        ownershipVerified: rawData.ownershipVerified ?? false,
        msmeCategory: rawData.msmeCategory,
        productCategories: rawData.productCategories,
        otherCategoryDetails: rawData.otherCategoryDetails,
        productList: rawData.productList,
        detailedProductName: rawData.detailedProductName,
        hsnCode: rawData.hsnCode,
        brand: rawData.brand,
        specifications: rawData.specifications,
        documents: rawData.documents,
        mobile: rawData.mobile,
        dob: (rawData.dob && !isNaN(Date.parse(rawData.dob))) ? new Date(rawData.dob) : null,
        roleInOrg: rawData.roleInOrg,
        termsAccepted: rawData.agreeTerms ?? false
      };

      const profile = await prisma.sellerProfile.upsert({
        where: { userId },
        update: profileData,
        create: { ...profileData, userId }
      });
      res.json({ success: true, profile });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Manage Seller Offices
  app.post('/api/seller/profile/offices', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
      if (!profile) return res.status(404).json({ message: 'Profile not found' });

      const office = await prisma.sellerOffice.create({
        data: { ...req.body, sellerProfileId: profile.id }
      });
      res.json({ success: true, office });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete('/api/seller/profile/offices/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const officeId = Number(req.params.id);
      const office = await prisma.sellerOffice.findUnique({
        where: { id: officeId },
        include: { sellerProfile: true }
      });
      if (!office || office.sellerProfile.userId !== userId) {
        return res.status(404).json({ message: 'Office not found' });
      }
      await prisma.sellerOffice.delete({ where: { id: officeId } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Manage Seller Bank Accounts
  app.post('/api/seller/profile/bank', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const profile = await prisma.sellerProfile.findUnique({ where: { userId } });
      if (!profile) return res.status(404).json({ message: 'Profile not found' });

      const validation = validateSellerBankPayload(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ message: 'Invalid bank account details', errors: validation.errors });
      }

      const existingAccounts = await prisma.sellerBankAccount.findMany({
        where: { sellerProfileId: profile.id },
        orderBy: { createdAt: 'asc' }
      });
      const duplicate = existingAccounts.find(bank =>
        bank.ifsc.toUpperCase() === validation.values.ifsc &&
        bank.accountNumber === validation.values.accountNumber
      );
      if (duplicate) {
        return res.status(409).json({ message: 'This bank account is already added for this seller profile' });
      }

      const shouldBePrimary = existingAccounts.length === 0 || validation.values.isPrimary;
      const bank = await prisma.$transaction(async (tx) => {
        if (shouldBePrimary) {
          await tx.sellerBankAccount.updateMany({
            where: { sellerProfileId: profile.id },
            data: { isPrimary: false }
          });
        }
        return tx.sellerBankAccount.create({
          data: {
            sellerProfileId: profile.id,
            ifsc: validation.values.ifsc,
            bankName: validation.values.bankName,
            bankAddress: validation.values.bankAddress,
            holderName: validation.values.holderName,
            accountNumber: validation.values.accountNumber,
            isPrimary: shouldBePrimary
          }
        });
      });
      const bankAccounts = await prisma.sellerBankAccount.findMany({
        where: { sellerProfileId: profile.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
      });
      res.json({ success: true, bank, bankAccounts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
  
  app.post('/api/seller/submit', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { sellerProfile: true }
      });
      if (!existingUser) return res.status(404).json({ message: 'User not found' });
      
      const user = await prisma.user.update({
        where: { id: userId },
        data: { 
          onboardingStatus: 'under_compliance_review',
          registrationStatus: 'completed'
        }
      });

      if (existingUser.onboardingStatus !== 'under_compliance_review') {
        await notifyAdminsOfApplication(existingUser, profileOrganizationName(existingUser), 'seller');
      }

      res.json({ success: true, user });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });


  app.delete('/api/seller/profile/bank/:id', authenticate, authorize('seller'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const bankId = Number(req.params.id);
      const bank = await prisma.sellerBankAccount.findUnique({
        where: { id: bankId },
        include: { sellerProfile: true }
      });
      if (!bank || bank.sellerProfile.userId !== userId) {
        return res.status(404).json({ message: 'Bank account not found' });
      }
      const accounts = await prisma.sellerBankAccount.findMany({
        where: { sellerProfileId: bank.sellerProfileId },
        orderBy: { createdAt: 'asc' }
      });
      if (accounts.length === 1) {
        return res.status(400).json({ message: 'At least one bank account must remain on the profile' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.sellerBankAccount.delete({ where: { id: bankId } });
        if (bank.isPrimary) {
          const replacement = accounts.find(account => account.id !== bankId);
          if (replacement) {
            await tx.sellerBankAccount.update({
              where: { id: replacement.id },
              data: { isPrimary: true }
            });
          }
        }
      });
      const bankAccounts = await prisma.sellerBankAccount.findMany({
        where: { sellerProfileId: bank.sellerProfileId },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }]
      });
      res.json({ success: true, bankAccounts });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/buyer/register', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'buyer') return res.status(403).json({ message: 'Forbidden' });
      const userId = Number(req.user.id);
      const editCheck = await ensureOnboardingEditable(userId);
      if (!editCheck.editable) return res.status(editCheck.status || 403).json({ message: editCheck.message });
      const { password, ...rawData } = req.body;
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { buyerProfile: true }
      });
      if (!existingUser) return res.status(404).json({ message: 'User not found' });

      const mobile = rawData.mobile || existingUser.mobile;
      if (!mobile) {
        return res.status(400).json({ message: 'Mobile number is required to complete buyer onboarding' });
      }

      if (password || rawData.mobile) {
        const updateData: any = {};
        if (password) updateData.password = await bcrypt.hash(password, 10);
        if (rawData.mobile) updateData.mobile = mobile;
        await prisma.user.update({ where: { id: userId }, data: updateData });
      }

      // Filter only allowed fields for BuyerProfile
      const profileData: any = {
        organizationName: rawData.organizationName || existingUser.name,
        businessType: rawData.businessType || 'Private Limited Company',
        industry: rawData.industry,
        cin: rawData.cin,
        pan: rawData.pan,
        gst: rawData.gst,
        website: rawData.website,
        state: rawData.state,
        district: rawData.district,
        officeZoneName: rawData.officeZoneName,
        representativeName: rawData.representativeName,
        designation: rawData.designation,
        department: rawData.department,
        email: rawData.email,
        mobile,
        alternateMobile: rawData.alternateMobile,
        aadhaarNumber: rawData.aadhaarNumber,
        aadhaarVerified: rawData.aadhaarVerified ?? false,
        country: rawData.country,
        city: rawData.city,
        pincode: rawData.pincode,
        registeredAddress: rawData.registeredAddress,
        corporateAddress: rawData.corporateAddress,
        procurementCategories: Array.isArray(rawData.procurementCategories) ? rawData.procurementCategories : [],
        otherCategoryDetails: rawData.otherCategoryDetails,
        annualBudget: rawData.annualBudget,
        preferredMethods: Array.isArray(rawData.preferredMethods) ? rawData.preferredMethods : [],
        otherMethodDetails: rawData.otherMethodDetails,
        declarationAccepted: rawData.declaration ?? false,
        termsAccepted: rawData.agreeTerms ?? false,
        documents: rawData.documents
      };

      const sectionStatus = {
        org: 'pending',
        rep: 'pending',
        address: 'pending',
        procurement: 'pending',
        docs: 'pending'
      };

      const [profile] = await prisma.$transaction([
        prisma.buyerProfile.upsert({
          where: { userId },
          update: profileData,
          create: { ...profileData, userId }
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            registrationStatus: 'completed',
            onboardingStatus: 'under_compliance_review',
            sectionStatus
          }
        })
      ]);

      if (existingUser.onboardingStatus !== 'under_compliance_review') {
        await notifyAdminsOfApplication(
          existingUser,
          normalizeSpaces(profile.organizationName || existingUser.buyerProfile?.organizationName || existingUser.name),
          'buyer'
        );
      }

      res.json({ success: true, profile });
    } catch (err: any) {
      console.error('[Buyer Register] Failed:', err);
      res.status(500).json({
        message: process.env.NODE_ENV === 'production'
          ? 'Unable to save buyer onboarding. Please try again.'
          : err.message
      });
    }
  });

  // --- Admin APIs ---
  app.get('/api/admin/onboarding', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const sellers = await prisma.user.findMany({
        where: { role: 'seller' },
        include: { sellerProfile: true },
        orderBy: { createdAt: 'desc' }
      });
      const buyers = await prisma.user.findMany({
        where: { role: 'buyer' },
        include: { buyerProfile: true },
        orderBy: { createdAt: 'desc' }
      });

      // Exclude passwords and format for frontend
      const formatUser = (u: any) => {
        const { password, ...rest } = u;
        return {
          ...rest,
          _id: u.id,
          profile: u.sellerProfile || u.buyerProfile,
          status: u.onboardingStatus
        };
      };

      res.json({
        sellers: sellers.map(formatUser),
        buyers: buyers.map(formatUser)
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/admin/status', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const { userId, status, reason } = req.body;
      const updateData: any = { onboardingStatus: status };
      const numericId = Number(userId);
      const user = await prisma.user.findUnique({
        where: { id: numericId },
        include: { sellerProfile: true, buyerProfile: true }
      });
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (status === 'approved_for_procurement') {
        const buyerSections = { org: 'approved', rep: 'approved', address: 'approved', procurement: 'approved', docs: 'approved' };
        const sellerSections = { pan: 'approved', details: 'approved', additional: 'approved', offices: 'approved', bank: 'approved', einvoicing: 'approved', ownership: 'approved' };

        updateData.sectionStatus = user?.role === 'buyer' ? buyerSections : sellerSections;
      }

      await prisma.user.update({ where: { id: numericId }, data: updateData });

      if (user.onboardingStatus !== status || ['approved_for_procurement', 'rejected', 'resubmission_required'].includes(status)) {
        const typeLabel = applicationTypeLabel(user.role);
        const actionLabel =
          status === 'approved_for_procurement' ? 'approved' :
          status === 'rejected' ? 'rejected' :
          status === 'resubmission_required' ? 'requires changes' :
          'updated';
        await createNotificationSafe({
          userId: numericId,
          title: `${typeLabel} application ${actionLabel}`,
          message: `${profileOrganizationName(user)}: ${statusMessage(status, normalizeSpaces(reason))}`,
          type: `onboarding_${status}`
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/vendors', authenticate, authorize('buyer', 'admin'), async (req, res) => {
    try {
      const vendors = await prisma.user.findMany({
        where: { role: 'seller', onboardingStatus: 'approved_for_procurement' },
        include: { sellerProfile: true }
      });
      res.json(vendors.map(v => ({ ...v, _id: v.id })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/vendors/:id', authenticate, authorize('buyer', 'admin'), async (req, res) => {
    try {
      const vendor = await prisma.user.findUnique({
        where: { id: Number(req.params.id), role: 'seller' },
        include: {
          sellerProfile: {
            include: {
              offices: true,
              bankAccounts: true
            }
          }
        }
      });
      if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
      const { password, ...vendorSafe } = vendor;
      res.json({ ...vendorSafe, _id: vendor.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Quote Request APIs ---
  app.post('/api/quotes', authenticate, authorize('buyer'), async (req: AuthRequest, res) => {
    try {
      const { sellerId, subject, message, documentUrl } = req.body;
      const buyerId = Number(req.user?.id);

      if (req.user?.role !== 'buyer') {
        return res.status(403).json({ message: 'Only buyers can request quotes' });
      }

      const quote = await prisma.quoteRequest.create({
        data: {
          buyerId,
          sellerId: Number(sellerId),
          subject,
          message,
          documentUrl,
          status: 'pending'
        },
        include: { buyer: true }
      });

      await createNotificationSafe({
        userId: Number(sellerId),
        title: 'New Quote Request',
        message: `Buyer ${quote.buyer.name} has requested a quote for: ${subject}`,
        type: 'quote_request'
      });

      res.status(201).json(quote);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/quotes', authenticate, authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
    try {
      const userId = Number(req.user?.id);
      const role = req.user?.role;

      let quotes;
      if (role === 'buyer') {
        quotes = await prisma.quoteRequest.findMany({
          where: { buyerId: userId },
          include: { seller: { include: { sellerProfile: true } } },
          orderBy: { createdAt: 'desc' }
        });
      } else if (role === 'seller') {
        quotes = await prisma.quoteRequest.findMany({
          where: { sellerId: userId },
          include: { buyer: { include: { buyerProfile: true } } },
          orderBy: { createdAt: 'desc' }
        });
      } else {
        return res.status(403).json({ message: 'Forbidden' });
      }

      res.json(quotes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/admin/section-status', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const { userId, section, status, rejectionReason } = req.body;

      console.log(`[Admin] Attempting update - User: ${userId}, Section: ${section}, Status: ${status}`);

      if (!userId || !section || !status) {
        console.error('!!! CRITICAL DATA MISSING FROM FRONTEND !!!', { userId, section, status });
        return res.status(400).json({ message: 'Missing required fields: userId, section, or status' });
      }

      const numericId = Number(userId);
      if (isNaN(numericId)) {
        console.error(`!!! INVALID USER ID RECEIVED !!!: ${userId}`);
        return res.status(400).json({ message: 'User ID must be a valid number' });
      }

      const user = await prisma.user.findUnique({
        where: { id: numericId },
        include: { sellerProfile: true, buyerProfile: true }
      });
      if (!user) {
        console.error(`!!! USER NOT FOUND IN DATABASE !!!: ${numericId}`);
        return res.status(404).json({ message: 'User not found' });
      }

      // Initialize status and reasons if they are null
      const currentStatus = (user.sectionStatus as Record<string, any>) || {};
      const currentReasons = (user.sectionRejectionReasons as Record<string, any>) || {};
      const previousSectionStatus = String(currentStatus[section] || '');
      const previousReason = normalizeSpaces(currentReasons[section]);

      const sectionStatus: Record<string, string> = { ...currentStatus, [section]: status };
      const sectionRejectionReasons: Record<string, string> = { ...currentReasons };

      if (status === 'rejected' || status === 'resubmission_required') {
        sectionRejectionReasons[section] = rejectionReason || '';
      } else if (status === 'approved') {
        sectionRejectionReasons[section] = '';
      }

      // Calculate overall onboarding status based on all sections
      const sections = user.role === 'buyer'
        ? ['org', 'rep', 'address', 'procurement', 'docs']
        : ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership'];

      const statuses = sections.map(s => sectionStatus[s] || 'pending');

      let onboardingStatus = 'under_compliance_review';
      if (statuses.every(s => s === 'approved')) onboardingStatus = 'approved_for_procurement';
      else if (statuses.some(s => s === 'rejected')) onboardingStatus = 'rejected';
      else if (statuses.some(s => s === 'resubmission_required')) onboardingStatus = 'resubmission_required';

      console.log(`[Admin] New calculated status: ${onboardingStatus}`);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          sectionStatus,
          sectionRejectionReasons,
          onboardingStatus: onboardingStatus as any
        }
      });

      const label = sectionLabel(user.role, section);
      const normalizedReason = normalizeSpaces(rejectionReason);
      const sectionChanged = previousSectionStatus !== status || previousReason !== normalizedReason;
      if (sectionChanged && ['rejected', 'resubmission_required'].includes(status)) {
        await createNotificationSafe({
          userId: user.id,
          title: `${label} requires attention`,
          message: `${profileOrganizationName(user)}: ${label} has been marked as ${status.replace(/_/g, ' ')}.${normalizedReason ? ` Admin remarks: ${normalizedReason}` : ''}`,
          type: `section_${status}`
        });
      }

      if (user.onboardingStatus !== onboardingStatus && onboardingStatus === 'approved_for_procurement') {
        await createNotificationSafe({
          userId: user.id,
          title: `${applicationTypeLabel(user.role)} application approved`,
          message: `${profileOrganizationName(user)}: ${statusMessage(onboardingStatus)}`,
          type: 'onboarding_approved_for_procurement'
        });
      }

      res.json({ success: true, onboardingStatus: onboardingStatus });
    } catch (err: any) {
      console.error('--- SECTION STATUS ERROR ---');
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
      res.status(500).json({ message: err.message });
    }
  });

  // Admin: Send Feedback/Query to Stakeholder
  app.post('/api/admin/feedback', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const { userId, feedback } = req.body;
      const numericId = Number(userId);
      const user = await prisma.user.findUnique({
        where: { id: numericId },
        include: { sellerProfile: true, buyerProfile: true }
      });
      if (!user) return res.status(404).json({ message: 'User not found' });

      const normalizedFeedback = normalizeSpaces(feedback);
      await prisma.user.update({
        where: { id: numericId },
        data: { adminFeedback: feedback }
      });

      if (normalizedFeedback && normalizeSpaces(user.adminFeedback) !== normalizedFeedback) {
        await createNotificationSafe({
          userId: numericId,
          title: 'Admin feedback received',
          message: `${profileOrganizationName(user)}: ${normalizedFeedback}`,
          type: 'admin_feedback'
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/admin/stats', authenticate, authorizeAdmin, async (req, res) => {
    try {
      const [pending, sellers, buyers, total] = await Promise.all([
        prisma.user.count({ where: { onboardingStatus: 'pending', role: { in: ['seller', 'buyer'] } } }),
        prisma.user.count({ where: { onboardingStatus: 'approved_for_procurement', role: 'seller' } }),
        prisma.user.count({ where: { onboardingStatus: 'approved_for_procurement', role: 'buyer' } }),
        prisma.user.count({ where: { role: { in: ['seller', 'buyer'] } } })
      ]);
      res.json({ pendingApproval: pending, activeSellers: sellers, activeBuyers: buyers, totalNetwork: total });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get('/api/notifications/stream', async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) return res.status(401).json({ message: 'No token provided' });

      const decoded = jwt.verify(token, JWT_SECRET) as { id?: string | number };
      const userId = Number(decoded.id);
      if (!userId) return res.status(401).json({ message: 'Invalid token' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write('event: connected\n');
      res.write('data: {"ok":true}\n\n');

      const clients = notificationClients.get(userId) || new Set<Response>();
      clients.add(res);
      notificationClients.set(userId, clients);

      const heartbeat = setInterval(() => {
        res.write('event: heartbeat\n');
        res.write('data: {}\n\n');
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        if (clients.size === 0) notificationClients.delete(userId);
      });
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  });

  app.get('/api/notifications', authenticate, async (req: AuthRequest, res) => {
    try {
      const notifications = await prisma.notification.findMany({
        where: { userId: Number(req.user?.id) },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      res.json(notifications);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post('/api/notifications/read-all', authenticate, async (req: AuthRequest, res) => {
    try {
      await prisma.notification.updateMany({
        where: { userId: Number(req.user?.id), isRead: false },
        data: { isRead: true }
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const startListening = (port: number) => {
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port} (Prisma/PostgreSQL)`);
    });

    server.on('error', (err: any) => {
      if (err?.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.warn(`Port ${port} is in use. Retrying on port ${nextPort}...`);
        startListening(nextPort);
        return;
      }
      console.error('Server failed to start:', err);
    });
  };

  startListening(PORT);
}

startServer().catch(err => {
  console.error("Critical error:", err);
  process.exit(1);
});
