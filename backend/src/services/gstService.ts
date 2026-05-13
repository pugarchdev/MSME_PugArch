import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const APISETU_APIKEY = process.env.APIPSETU_API_KEY || process.env.GST_APISETU_APIKEY;
const APISETU_CLIENTID = process.env.APIPSETU_CLIENT_ID || process.env.GST_APISETU_CLIENTID;

export interface GstData {
  gstNumber: string;
  legalBusinessName: string;
  tradeName: string;
  constitutionOfBusiness: string;
  registrationDate: string;
  taxpayerType: string;
  businessAddress: string;
  state: string;
  pincode: string;
  pan: string;
}

export class GstService {
  static async verifyGstin(gstin: string): Promise<GstData> {
    const extractedPan = gstin.substring(2, 12);

    const cached = await prisma.gstCache.findUnique({
      where: { gstNumber: gstin }
    });

    if (cached) {
      console.log(`[GstService] Cache hit for ${gstin}`);
      return {
        gstNumber: cached.gstNumber,
        legalBusinessName: cached.legalBusinessName,
        tradeName: cached.tradeName || '',
        constitutionOfBusiness: cached.constitutionOfBusiness || '',
        registrationDate: cached.registrationDate ? cached.registrationDate.toISOString().split('T')[0] : '',
        taxpayerType: cached.taxpayerType || '',
        businessAddress: cached.businessAddress || '',
        state: cached.state || '',
        pincode: cached.pincode || '',
        pan: extractedPan
      };
    }

    console.log(`[GstService] Calling V2 PUBLIC API Setu for ${gstin}`);
    
    if (!APISETU_APIKEY || !APISETU_CLIENTID || APISETU_APIKEY.includes('YOUR_')) {
      throw new Error('GST data not in database and API Setu credentials are not configured.');
    }

    try {
      const txnId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);
      const toTimestamp = expiryDate.toISOString();

      const requestBody = {
        txnId: txnId,
        format: "json",
        certificateParameters: { GSTIN: gstin },
        
        user: { 
          id: "000000000000", 
          idType: "Aadhaar",
          mobile: "9999999999",
          email: "user@example.com"
        }, 
        data: { id: gstin },
        permission: { 
          access: "store",
          dateRange: { from: timestamp, to: toTimestamp },
          frequency: { unit: "once", value: 1, repeats: 0 }
        },

        consentArtifact: {
          consent: {
            consentId: crypto.randomUUID(),
            timestamp: timestamp,
            dataConsumer: { id: APISETU_CLIENTID },
            dataProvider: { id: "GSTN" },
            purpose: { description: "GST Search" },
            user: { 
              id: "000000000000", 
              idType: "Aadhaar",
              mobile: "9999999999",
              email: "user@example.com"
            },
            data: { id: gstin },
            permission: { 
              access: "store",
              dateRange: { from: timestamp, to: toTimestamp },
              frequency: { unit: "once", value: 1, repeats: 0 }
            }
          }
        }
      };

      console.log(`[GstService] SENDING V2 SEARCH REQUEST TO: https://apisetu.gov.in/certificate/v3/taxpayers/gstn`);

      const response = await fetch('https://apisetu.gov.in/certificate/v3/taxpayers/gstn', {
        method: 'POST',
        headers: {
          'X-APISETU-APIKEY': APISETU_APIKEY!,
          'X-APISETU-CLIENTID': APISETU_CLIENTID!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[GstService] API Response Error:', result);
        if (response.status === 400) throw new Error(result.errorDescription || 'Invalid GST number.');
        throw new Error(result.message || result.errorDescription || 'API Verification failed');
      }

      const apiData = result.data || result.result || result;
      if (!apiData) throw new Error('No data found for this GSTIN');

      const mappedData: GstData = {
        gstNumber: gstin,
        legalBusinessName: apiData.legalName || apiData.lgnm || apiData.legal_name || apiData.prvdr || apiData.businessName || '',
        tradeName: apiData.tradeName || apiData.trdn || apiData.trade_name || '',
        constitutionOfBusiness: apiData.constitutionOfBusiness || apiData.ctb || '',
        registrationDate: apiData.dateOfRegistration || apiData.rgdt || '',
        taxpayerType: apiData.taxpayerType || apiData.dty || '',
        businessAddress: apiData.address ? 
          `${apiData.address.building || ''} ${apiData.address.floor || ''} ${apiData.address.street || ''} ${apiData.address.city || ''}`.trim() : 
          apiData.addressString || '',
        state: apiData.address?.state || apiData.stcd || '',
        pincode: apiData.address?.pincode || apiData.pncd || '',
        pan: extractedPan
      };

      await prisma.gstCache.upsert({
        where: { gstNumber: gstin },
        update: {
          legalBusinessName: mappedData.legalBusinessName,
          tradeName: mappedData.tradeName,
          constitutionOfBusiness: mappedData.constitutionOfBusiness,
          registrationDate: mappedData.registrationDate ? new Date(mappedData.registrationDate) : null,
          taxpayerType: mappedData.taxpayerType,
          businessAddress: mappedData.businessAddress,
          state: mappedData.state,
          pincode: mappedData.pincode,
          lastVerified: new Date()
        },
        create: {
          gstNumber: mappedData.gstNumber,
          legalBusinessName: mappedData.legalBusinessName,
          tradeName: mappedData.tradeName,
          constitutionOfBusiness: mappedData.constitutionOfBusiness,
          registrationDate: mappedData.registrationDate ? new Date(mappedData.registrationDate) : null,
          taxpayerType: mappedData.taxpayerType,
          businessAddress: mappedData.businessAddress,
          state: mappedData.state,
          pincode: mappedData.pincode
        }
      });

      return mappedData;
    } catch (error: any) {
      console.error(`[GstService] Verification failed: ${error.message}`);
      throw error;
    }
  }
}
