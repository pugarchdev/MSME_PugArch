import { getApi, postApi } from '../shared/apiClient';

export type AadhaarKycStatus = {
  status: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  provider: 'MERIPEHCHAAN';
  verificationType: 'AADHAAR';
  verifiedName?: string | null;
  verifiedAt?: string | null;
  ageVerified?: boolean | null;
};

export const aadhaarKycApi = {
  status: () => getApi<AadhaarKycStatus>('/api/kyc/aadhaar/status', true),
  reset: () => postApi<AadhaarKycStatus>('/api/kyc/aadhaar/reset', {}),
  startUrl: () => postApi<{ authorizationUrl: string }>('/api/kyc/aadhaar/start-url', {}),
  
  preRegisterStart: (payload: { consent: boolean; mobile: string; aadhaarNumber?: string; vid?: string; redirectPath?: string }) => 
    postApi<{ authorizationUrl: string; kycSessionToken: string }>('/api/kyc/aadhaar/pre-register/start', payload),
  preRegisterStatus: (token: string) => 
    getApi<AadhaarKycStatus>(`/api/kyc/aadhaar/pre-register/status?token=${encodeURIComponent(token)}`, true),
};
