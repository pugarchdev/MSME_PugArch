import { getApi, postApi } from '../shared/apiClient';

export type AadhaarKycStatus = {
  status: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED';
  provider: 'MERIPEHCHAAN';
  verificationType: 'AADHAAR';
  verifiedName?: string | null;
  verifiedAt?: string | null;
  ageVerified?: boolean | null;
  isValid?: boolean;
  used?: boolean;
  verified?: boolean;
  verificationId?: string;
  maskedAadhaar?: string;
  firstName?: string;
  lastName?: string;
};

export const aadhaarKycApi = {
  status: (token?: string) => getApi<AadhaarKycStatus>(token ? `/api/kyc/aadhaar/status?token=${encodeURIComponent(token)}` : '/api/kyc/aadhaar/status', true),
  reset: () => postApi<AadhaarKycStatus>('/api/kyc/aadhaar/reset', {}),
  startUrl: (payload?: { redirectPath?: string; frontendOrigin?: string }) => postApi<{ authorizationUrl: string }>('/api/kyc/aadhaar/start-url', payload || {}),
  
  preRegisterStart: (payload: { consent: boolean; mobile: string; aadhaarNumber?: string; vid?: string; redirectPath?: string; frontendOrigin?: string }) => 
    postApi<{ authorizationUrl: string; kycSessionToken: string }>('/api/kyc/aadhaar/pre-register/start', payload),
  preRegisterStatus: (token: string) => 
    getApi<AadhaarKycStatus>(`/api/kyc/aadhaar/pre-register/status?token=${encodeURIComponent(token)}`, true),
};
