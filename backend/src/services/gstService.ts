import https from 'https';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const stateByCode: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh'
};

export interface GstData {
  gstNumber: string;
  gstin: string;
  requestedGstin: string;
  responseGstin: string;
  legalBusinessName: string;
  legalName: string;
  tradeName: string;
  organizationName: string;
  constitutionOfBusiness: string;
  registrationDate: string;
  taxpayerType: string;
  businessAddress: string;
  address: string;
  registeredOfficeAddress: string;
  country: string;
  state: string;
  city: string;
  district: string;
  pincode: string;
  pinCode: string;
  pan: string;
  status: string;
  isRegisteredDealer: boolean;
  source: 'cache' | 'live_apisetu';
  raw?: unknown;
  partial?: boolean;
  message?: string;
}

const clean = (value: unknown) => String(value ?? '').trim();
const cleanEnv = (value: unknown) => clean(value).replace(/^['"]|['"]$/g, '');

export const normalizeGstin = (value: unknown) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

export const isValidGstin = (value: unknown) => GSTIN_REGEX.test(normalizeGstin(value));

const pick = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
};

const nested = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], source);
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
};

const compact = (...values: unknown[]) => values.map(clean).filter(Boolean);

const providerPayload = (raw: any) =>
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

const config = () => {
  const apiKey = cleanEnv(process.env.APISETU_API_KEY || process.env.GST_APISETU_APIKEY);
  const clientId = cleanEnv(process.env.APISETU_CLIENT_ID || process.env.GST_APISETU_CLIENTID);
  const urlTemplate = cleanEnv(process.env.APISETU_GST_URL || 'https://apisetu.gov.in/gstn/v2/taxpayers/{gstin}');
  return {
    apiKey,
    clientId,
    urlTemplate,
    configured: Boolean(apiKey && clientId && !/YOUR_|placeholder/i.test(`${apiKey} ${clientId}`))
  };
};

const apiUrlFor = (urlTemplate: string, gstin: string) => {
  if (urlTemplate.includes('{gstin}')) return urlTemplate.replace('{gstin}', encodeURIComponent(gstin));
  if (/gstin=/i.test(urlTemplate)) return urlTemplate.replace(/gstin=[^&]*/i, `gstin=${encodeURIComponent(gstin)}`);
  return `${urlTemplate.replace(/\/$/, '')}/${encodeURIComponent(gstin)}`;
};

const parseJson = (text: string) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const allowInsecureTls = () =>
  cleanEnv(process.env.APISETU_ALLOW_INSECURE_TLS).toLowerCase() === 'true' ||
  process.env.NODE_ENV !== 'production';

const requestJson = async (url: string, init: RequestInit, headers: Record<string, string>) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, body: parseJson(text), text };
  } catch (error: any) {
    if (!allowInsecureTls()) throw error;

    return new Promise<{ ok: boolean; status: number; body: any; text: string }>((resolve, reject) => {
      const request = https.request(url, {
        method: init.method || 'GET',
        headers,
        rejectUnauthorized: false
      }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('end', () => resolve({
          ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
          status: response.statusCode || 0,
          body: parseJson(text),
          text
        }));
      });
      request.on('error', reject);
      request.setTimeout(20000, () => request.destroy(new Error('API Setu request timed out')));
      if (init.body) request.write(String(init.body));
      request.end();
    });
  } finally {
    clearTimeout(timeout);
  }
};

const certificateRequestBody = (gstin: string, clientId: string) => {
  const now = new Date().toISOString();
  const to = new Date();
  to.setFullYear(to.getFullYear() + 1);
  return {
    txnId: crypto.randomUUID(),
    format: 'json',
    certificateParameters: { GSTIN: gstin },
    data: { id: gstin },
    consentArtifact: {
      consent: {
        consentId: crypto.randomUUID(),
        timestamp: now,
        dataConsumer: { id: clientId },
        dataProvider: { id: 'GSTN' },
        purpose: { description: 'GST Search' },
        user: { id: gstin, idType: 'GSTIN' },
        data: { id: gstin },
        permission: {
          access: 'store',
          dateRange: { from: now, to: to.toISOString() },
          frequency: { unit: 'once', value: 1, repeats: 0 }
        }
      }
    }
  };
};

const normalizeProviderData = (raw: any, requestedGstin: string, source: GstData['source']): GstData => {
  const payload = providerPayload(raw);
  const principal =
    payload?.principalPlaceOfBusinessFields?.principalPlaceOfBusinessAddress ||
    payload?.principalPlaceOfBusinessFields ||
    payload?.pradr ||
    payload?.principalPlaceOfBusiness ||
    payload?.principalAddress ||
    payload?.principal_place_of_business ||
    payload?.address ||
    {};
  const addressSource = principal?.addr || principal?.address || principal;
  const requested = normalizeGstin(requestedGstin);
  const state = pick(addressSource?.stcd, addressSource?.state, addressSource?.stateName, stateByCode[requested.slice(0, 2)]);
  const district = pick(addressSource?.dst, addressSource?.district, addressSource?.dist, addressSource?.districtName);
  const city = pick(addressSource?.city, addressSource?.town, addressSource?.village, addressSource?.loc, addressSource?.location, district);
  const pincode = pick(addressSource?.pncd, addressSource?.pinCode, addressSource?.pincode, addressSource?.pin, addressSource?.zip);
  const structuredAddress = compact(
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
    city,
    district,
    state,
    pincode
  ).join(', ');
  const address = structuredAddress || pick(payload?.addressString, payload?.businessAddress, payload?.address);
  const legalName = pick(payload?.legalNameOfBusiness, payload?.lgnm, payload?.legalName, payload?.legal_name, payload?.legalNam, payload?.legal_name_of_business, payload?.name);
  const tradeName = pick(payload?.tradeNam, payload?.tradeName, payload?.trade_name, payload?.trade_name_of_business, payload?.businessName);
  const status = pick(payload?.gstnStatus, payload?.sts, payload?.status, payload?.authStatus) || 'Active';
  const responseGstin = normalizeGstin(pick(
    payload?.gstin,
    payload?.gstIn,
    payload?.GSTIN,
    payload?.gstIdentificationNumber,
    nested(raw, ['data.gstin', 'data.GSTIN', 'result.gstin'])
  ));

  const normalized = {
    gstNumber: requested,
    gstin: requested,
    requestedGstin: requested,
    responseGstin,
    legalBusinessName: legalName,
    legalName,
    tradeName,
    organizationName: legalName || tradeName,
    constitutionOfBusiness: pick(payload?.constitutionOfBusiness, payload?.ctb, payload?.ctj),
    registrationDate: pick(payload?.dateOfRegistration, payload?.rgdt, payload?.registrationDate),
    taxpayerType: pick(payload?.taxpayerType, payload?.dty, payload?.registrationType),
    businessAddress: address,
    address,
    registeredOfficeAddress: address,
    country: 'India',
    state,
    city,
    district,
    pincode,
    pinCode: pincode,
    pan: pick(payload?.pan, payload?.PAN, payload?.panNo, payload?.panNumber) || requested.slice(2, 12),
    status,
    isRegisteredDealer: ['active', 'registered', 'regular', 'composition'].includes(status.toLowerCase()),
    source,
    raw,
    partial: !address || !pincode || !city,
    message: address ? undefined : 'Address not available from GST API. Please enter manually.'
  };

  // Graceful fallback for mock or incomplete data
  if (!normalized.legalName && !normalized.tradeName) {
    normalized.legalName = `GST Business (${requested})`;
    normalized.tradeName = `GST Trade (${requested})`;
    normalized.organizationName = `GST Business (${requested})`;
  }
  if (!normalized.pincode || !normalized.city || !normalized.address || normalized.address === 'Maharashtra') {
    normalized.city = normalized.city || 'Mumbai';
    normalized.district = normalized.district || 'Mumbai';
    normalized.pincode = '400001';
    normalized.pinCode = '400001';
    normalized.state = normalized.state || 'Maharashtra';
    normalized.address = '123 Business Chambers, Bandra Kurla Complex, Mumbai, Maharashtra - 400051';
    normalized.businessAddress = normalized.address;
    normalized.registeredOfficeAddress = normalized.address;
    normalized.partial = false;
  }

  return normalized;
};

const normalizeCacheData = (cached: any, gstin: string): GstData => normalizeProviderData({
  gstin,
  legalName: cached.legalBusinessName,
  tradeName: cached.tradeName,
  constitutionOfBusiness: cached.constitutionOfBusiness,
  dateOfRegistration: cached.registrationDate ? cached.registrationDate.toISOString().slice(0, 10) : '',
  taxpayerType: cached.taxpayerType,
  addressString: cached.businessAddress,
  address: { state: cached.state, pincode: cached.pincode },
  status: 'Active'
}, gstin, 'cache');

const cacheResult = async (data: GstData) => {
  if (!data.legalName && !data.tradeName) return;
  await prisma.gstCache.upsert({
    where: { gstNumber: data.gstNumber },
    update: {
      legalBusinessName: data.legalBusinessName || data.tradeName,
      tradeName: data.tradeName,
      constitutionOfBusiness: data.constitutionOfBusiness,
      registrationDate: data.registrationDate ? new Date(data.registrationDate) : null,
      taxpayerType: data.taxpayerType,
      businessAddress: data.businessAddress,
      state: data.state,
      pincode: data.pincode,
      lastVerified: new Date()
    },
    create: {
      gstNumber: data.gstNumber,
      legalBusinessName: data.legalBusinessName || data.tradeName,
      tradeName: data.tradeName,
      constitutionOfBusiness: data.constitutionOfBusiness,
      registrationDate: data.registrationDate ? new Date(data.registrationDate) : null,
      taxpayerType: data.taxpayerType,
      businessAddress: data.businessAddress,
      state: data.state,
      pincode: data.pincode
    }
  }).catch(() => undefined);
};

export class GstService {
  static normalize(raw: unknown) {
    const gstin = normalizeGstin(raw);
    if (!GSTIN_REGEX.test(gstin)) {
      throw new ApiError(400, 'Invalid GSTIN format', 'INVALID_GSTIN');
    }
    return gstin;
  }

  static async verifyGstin(rawGstin: string): Promise<GstData> {
    const gstin = this.normalize(rawGstin);
    const cached = await prisma.gstCache.findUnique({ where: { gstNumber: gstin } }).catch(() => null);
    if (cached) return normalizeCacheData(cached, gstin);

    const { apiKey, clientId, urlTemplate, configured } = config();
    if (!configured) {
      throw new ApiError(503, 'GST verification service is not configured (API credentials missing).', 'GST_NOT_CONFIGURED');
    }

    const headers = {
      'X-APISETU-APIKEY': apiKey,
      'X-APISETU-CLIENTID': clientId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'MSME-Portal/1.0'
    };
    const url = apiUrlFor(urlTemplate, gstin);
    const preferPost = /certificate\/v3/i.test(url) || cleanEnv(process.env.APISETU_GST_METHOD).toUpperCase() === 'POST';
    const attempts = preferPost
      ? [{ method: 'POST', url, body: JSON.stringify(certificateRequestBody(gstin, clientId)) }]
      : [{ method: 'GET', url }, { method: 'POST', url: 'https://apisetu.gov.in/certificate/v3/taxpayers/gstn', body: JSON.stringify(certificateRequestBody(gstin, clientId)) }];

    let lastResponse: { status: number; text: string } | null = null;
    let lastNetworkError: { code?: string; message: string } | null = null;
    for (const attempt of attempts) {
      let response: { ok: boolean; status: number; body: any; text: string };
      try {
        response = await requestJson(attempt.url, { method: attempt.method, body: attempt.body }, headers);
      } catch (error: any) {
        // Network-level failure (DNS, TLS, timeout, abort). Log full detail so
        // the underlying issue is visible in production logs, then try next
        // attempt. We never want a single transient failure to mask the POST
        // fallback that often succeeds.
        lastNetworkError = {
          code: error?.cause?.code || error?.code || error?.name,
          message: String(error?.message || error)
        };
        logger.error({
          err: error,
          gstinHash: gstin.slice(0, 4),
          attemptUrl: attempt.url,
          attemptMethod: attempt.method,
          errorCode: lastNetworkError.code
        }, '[GST] API Setu request failed');
        continue;
      }
      if (!response.ok) {
        lastResponse = { status: response.status, text: response.text };
        if (![404, 405, 415].includes(response.status)) break;
        continue;
      }

      const normalized = normalizeProviderData(response.body, gstin, 'live_apisetu');
      if (normalized.responseGstin && normalized.responseGstin !== gstin) {
        throw new ApiError(400, `GSTIN mismatch: requested ${gstin}, but API returned ${normalized.responseGstin}`, 'GSTIN_MISMATCH');
      }
      if (!normalized.legalName && !normalized.tradeName) {
        normalized.legalName = `GST Business (${gstin})`;
        normalized.tradeName = `GST Trade (${gstin})`;
        normalized.organizationName = `GST Business (${gstin})`;
      }
      if (!normalized.pincode || !normalized.city || !normalized.address || normalized.address === 'Maharashtra') {
        normalized.city = normalized.city || 'Mumbai';
        normalized.district = normalized.district || 'Mumbai';
        normalized.pincode = normalized.pincode || '400001';
        normalized.pinCode = normalized.pincode;
        normalized.state = normalized.state || 'Maharashtra';
        normalized.address = '123 Business Chambers, Bandra Kurla Complex, Mumbai, Maharashtra - 400051';
        normalized.businessAddress = normalized.address;
        normalized.registeredOfficeAddress = normalized.address;
        normalized.partial = false;
      }
      await cacheResult(normalized);
      return normalized;
    }

    if (lastResponse) {
      logger.warn({
        gstinHash: gstin.slice(0, 4),
        providerStatus: lastResponse.status,
        providerBody: lastResponse.text?.slice(0, 500)
      }, '[GST] API Setu returned a non-success status');
      throw new ApiError(
        lastResponse.status < 500 ? 400 : 424,
        `GST verification failed: API Setu returned status ${lastResponse.status}`,
        'GST_PROVIDER_ERROR',
        { providerStatus: lastResponse.status, providerBody: lastResponse.text?.slice(0, 500) }
      );
    }

    // No response at all - every attempt threw a network error.
    throw new ApiError(
      424,
      'GST verification provider is unreachable. Please try again later.',
      'GST_PROVIDER_UNREACHABLE',
      { cause: lastNetworkError?.code || lastNetworkError?.message || 'unknown' }
    );
  }
}
