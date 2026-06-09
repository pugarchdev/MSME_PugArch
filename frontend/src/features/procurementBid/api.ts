import { api, readJsonResponse, unwrapApiData, BASE_URL } from '../../lib/api';
import type { ProcurementBid, ProcurementBidParticipation } from './data';

export const isProcurementDemoDataEnabled = () => {
  const value = process.env.NEXT_PUBLIC_ENABLE_PROCUREMENT_DEMO_DATA || process.env.VITE_ENABLE_PROCUREMENT_DEMO_DATA;
  return String(value).toLowerCase() === 'true';
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getApiBaseUrl = () => BASE_URL;

const readApiBody = async (res: Response) => {
  const body = await readJsonResponse(res);
  if (!res.ok) {
    throw new Error(body?.message || body?.error || 'Unable to complete procurement request');
  }
  return unwrapApiData(body);
};

const uploadFormData = (
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number) => void
) => new Promise<any>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${getApiBaseUrl()}${endpoint}`, true);

  for (const [key, value] of Object.entries(authHeaders())) {
    xhr.setRequestHeader(key, value);
  }

  xhr.upload.addEventListener('progress', event => {
    if (!event.lengthComputable || !onProgress) return;
    onProgress(Math.round((event.loaded / event.total) * 100));
  });

  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4) return;
    let body: any = {};
    try {
      body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
    } catch {
      reject(new Error('Backend API returned a non-JSON response.'));
      return;
    }
    if (xhr.status >= 200 && xhr.status < 300) {
      resolve(unwrapApiData(body));
      return;
    }
    reject(new Error(body?.message || body?.error || `Upload failed (${xhr.status})`));
  };

  xhr.onerror = () => reject(new Error('Network error during upload'));
  xhr.ontimeout = () => reject(new Error('Upload timed out'));
  xhr.onabort = () => reject(new Error('Upload aborted'));
  xhr.send(formData);
});

const toUiStatus = (status?: string): ProcurementBid['status'] => {
  if (status === 'AWARDED') return 'Awarded';
  if (status === 'CLOSED' || status === 'EXPIRED' || status === 'CANCELLED') return 'Closed';
  if (['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED'].includes(String(status))) return 'Under Evaluation';
  return 'Open';
};

const toUiStage = (stage?: string): ProcurementBid['currentStage'] => {
  if (stage === 'FINANCIAL_EVALUATION' || stage === 'L1_SELECTION' || stage === 'L1_GENERATED') return 'Financial Evaluation';
  if (stage === 'AWARD_RECOMMENDED') return 'Qualified';
  if (stage === 'AWARDED') return 'Awarded';
  if (stage === 'TECHNICAL_EVALUATION' || stage === 'TECHNICAL_EVALUATION_COMPLETED') return 'Technical Evaluation';
  if (stage === 'SELLER_PARTICIPATION') return 'Pending';
  return 'Pending';
};

const toUiRank = (rank?: number | null): ProcurementBid['results'][number]['finalRank'] => {
  if (rank === 1) return 'L1';
  if (rank === 2) return 'L2';
  if (rank === 3) return 'L3';
  if (rank === 4) return 'L4';
  return 'NA';
};

const buildQueryString = (params: Record<string, string | number | undefined> = {}) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== '' && value !== undefined)
      .map(([key, value]) => [key, String(value)])
  ).toString();

export const normalizeBid = (raw: any): ProcurementBid => {
  const participations = raw.participations || [];
  const results = participations.length ? participations.map((p: any, index: number) => ({
    participationId: p.id,
    sellerName: p.seller?.name || `Seller ${index + 1}`,
    sellerType: p.seller?.role === 'seller' ? 'Verified Seller' : p.seller?.role || 'Verified Seller',
    offeredItem: p.offeredItemDescription || raw.title || 'Procurement requirement',
    makeBrand: p.makeBrand || 'As quoted',
    model: p.model || 'Standard',
    technicalStatus: p.technicalStatus === 'DISQUALIFIED' ? 'Disqualified' : p.technicalStatus === 'QUALIFIED' ? 'Qualified' : 'Pending',
    financialStatus: p.financialStatus === 'OPENED' || p.financialStatus === 'EVALUATED' ? 'Opened' : 'Pending',
    totalPrice: Number(p.totalAmount || p.quotedAmount || 0),
    finalRank: toUiRank(p.rank),
    resultStatus: p.finalStatus === 'AWARDED' ? 'Awarded' : p.finalStatus === 'REJECTED' ? 'Rejected' : p.rank ? 'Responsive' : 'Under Review',
  })) : [];

  return {
    id: raw.bidNumber || String(raw.id || ''),
    title: raw.title || 'Untitled procurement bid',
    itemName: raw.category || raw.title || 'Procurement requirement',
    buyerName: raw.buyerOrganizationName || raw.buyerOrganization?.organizationName || 'Buyer organization',
    buyerType: (raw.buyerType || 'Private Enterprise') as ProcurementBid['buyerType'],
    departmentName: raw.departmentName || 'Procurement',
    bidType: (raw.bidType || 'Product') as ProcurementBid['bidType'],
    procurementType: raw.procurementType || raw.bidType || 'Open Bid',
    category: raw.category || 'General procurement',
    location: [raw.district, raw.state].filter(Boolean).join(', ') || raw.deliveryLocation || 'Location not specified',
    deliveryLocation: raw.deliveryLocation || 'Delivery location not specified',
    quantity: raw.quantity ? `${raw.quantity} ${raw.unit || ''}`.trim() : 'Not specified',
    estimatedValue: Number(raw.estimatedValue || 0),
    startDate: String(raw.startDate || raw.createdAt || new Date().toISOString()).slice(0, 10),
    endDate: String(raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10),
    status: toUiStatus(raw.status),
    approvalStatus: raw.approvalStatus,
    lifecycleStage: raw.lifecycleStage,
    participantsCount: Number(raw.participantsCount || participations.length || 0),
    rejectedReason: raw.rejectedReason,
    technicalStatus: toUiStage(raw.lifecycleStage),
    clarificationStatus: raw.clarifications?.[0]?.status === 'RESPONDED' ? 'Responded' : raw.clarifications?.[0]?.status === 'COMPLETED' ? 'Completed' : 'Pending',
    participated: Boolean(raw.myParticipation || participations.length),
    description: raw.description || 'No description provided.',
    eligibility: raw.eligibilityCriteria || [],
    requiredDocuments: raw.requiredDocuments || [],
    importantDates: [
      { label: 'Bid published', date: String(raw.startDate || raw.createdAt || new Date().toISOString()).slice(0, 10) },
      { label: 'Submission closes', date: String(raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10) },
      { label: 'Technical opening', date: String(raw.technicalOpeningDate || raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10) },
      { label: 'Financial opening', date: String(raw.financialOpeningDate || raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10) },
    ],
    terms: raw.termsAndConditions || [],
    lifecycle: ['Pending', 'Technical Evaluation', 'Financial Evaluation', 'Qualified', 'Awarded'],
    currentStage: toUiStage(raw.lifecycleStage),
    clarifications: (raw.clarifications || []).map((c: any) => ({
      requestNumber: c.requestNumber,
      requestedAt: c.requestedAt,
      type: c.clarificationType,
      description: c.question,
      sellerResponse: c.response || 'Awaiting seller response',
      buyerResponse: c.status,
      status: c.status === 'RESPONDED' ? 'Responded' : c.status === 'COMPLETED' ? 'Completed' : 'Pending',
      uploadedDocument: c.files?.[0]?.fileName || 'No file',
    })),
    results,
    participations: participations as ProcurementBidParticipation[],
    awards: raw.awards || [],
    bidDocuments: (raw.documents || []).map((doc: any) => ({
      id: doc.id,
      name: doc.fileName || doc.documentType || 'Bid document',
      meta: [doc.documentType, doc.mimeType].filter(Boolean).join(' - ') || 'Uploaded document',
      fileAssetId: doc.fileAssetId,
    })),
  };
};

export const procurementBidApi = {
  async list(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.get(`/api/bids${qs ? `?${qs}` : ''}`, { headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    const data = unwrapApiData(body);
    return { ...data, items: (data.items || []).map(normalizeBid) };
  },
  async detail(id: string) {
    const res = await api.get(`/api/bids/${encodeURIComponent(id)}`, { headers: authHeaders() });
    const body = await readJsonResponse(res);
    return normalizeBid(unwrapApiData(body));
  },
  async participate(id: string) {
    const res = await api.post(`/api/bids/${encodeURIComponent(id)}/participate`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async submitParticipation(id: string, participationId: number) {
    const res = await api.post(`/api/bids/${encodeURIComponent(id)}/participation/${participationId}/submit`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async createBid(payload: Record<string, unknown>) {
    const res = await api.post('/api/buyer/bids', payload, { headers: authHeaders() });
    return readApiBody(res);
  },
  async createBuyerBid(payload: Record<string, unknown>) {
    return this.createBid(payload);
  },
  async updateBuyerBid(bidId: string, payload: Record<string, unknown>) {
    const res = await api.put(`/api/buyer/bids/${encodeURIComponent(bidId)}`, payload, { headers: authHeaders() });
    return readApiBody(res);
  },
  async uploadBuyerBidDocuments(
    bidId: string,
    files: File[],
    metadata: { documentType?: string; visibility?: 'PUBLIC' | 'SELLER_AFTER_LOGIN' | 'BUYER_ADMIN_ONLY' } = {},
    onProgress?: (fileIndex: number, percent: number) => void
  ) {
    const uploaded: any[] = [];
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', metadata.documentType || 'TENDER_DOCUMENT');
      formData.append('visibility', metadata.visibility || 'PUBLIC');
      uploaded.push(await uploadFormData(
        `/api/buyer/bids/${encodeURIComponent(bidId)}/documents`,
        formData,
        percent => onProgress?.(index, percent)
      ));
    }
    return uploaded;
  },
  async submitBidForApproval(bidId: string) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/submit-for-approval`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async getBuyerBids(_params: Record<string, string | number> = {}) {
    const res = await api.fetch('/api/buyer/bids', { method: 'GET', headers: authHeaders(), skipCache: true });
    const data = await readApiBody(res);
    return (data || []).map(normalizeBid);
  },
  async getAdminBids(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.fetch(`/api/admin/bids${qs ? `?${qs}` : ''}`, { method: 'GET', headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    const data = unwrapApiData(body);
    return (data || []).map(normalizeBid);
  },
  async adminList() {
    return this.getAdminBids();
  },
  async approve(id: string) {
    const res = await api.post(`/api/admin/bids/${encodeURIComponent(id)}/approve`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async approveBid(bidId: string) {
    return this.approve(bidId);
  },
  async reject(id: string, reason: string) {
    const res = await api.post(`/api/admin/bids/${encodeURIComponent(id)}/reject`, { reason }, { headers: authHeaders() });
    return readApiBody(res);
  },
  async rejectBid(bidId: string, reason: string) {
    return this.reject(bidId, reason);
  },
  async getBidAuditLogs(bidId: string) {
    const res = await api.fetch(`/api/admin/bids/${encodeURIComponent(bidId)}/audit`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res);
  },
  async getAdminBidParticipants(bidId: string) {
    const res = await api.fetch(`/api/admin/bids/${encodeURIComponent(bidId)}/participants`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res) as Promise<ProcurementBidParticipation[]>;
  },
  async approveFinalAward(bidId: string, data: { awardId?: number; remarks?: string }) {
    const res = await api.post(`/api/admin/bids/${encodeURIComponent(bidId)}/final-award-approval`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async getProcurementReports(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.fetch(`/api/admin/procurement/reports${qs ? `?${qs}` : ''}`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res);
  },
  async getBidParticipants(bidId: string) {
    const res = await api.fetch(`/api/buyer/bids/${encodeURIComponent(bidId)}/participants`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res) as Promise<ProcurementBidParticipation[]>;
  },
  async raiseClarification(bidId: string, data: { participationId: number; clarificationType: string; question: string; dueDate?: string }) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/clarifications`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async submitTechnicalEvaluation(bidId: string, data: { evaluations: Array<{ participationId: number; status: 'QUALIFIED' | 'DISQUALIFIED'; remarks?: string; score?: number }> }) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/technical-evaluation`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async completeTechnicalEvaluation(bidId: string) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/complete-technical-evaluation`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async openFinancialEvaluation(bidId: string) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/open-financial-evaluation`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async recommendAward(bidId: string, data: { participationId: number; remarks?: string; adminOverrideReason?: string }) {
    const res = await api.post(`/api/buyer/bids/${encodeURIComponent(bidId)}/recommend-award`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async getBidResults(bidId: string) {
    return this.detail(bidId);
  },
  async getFinancialRanking(bidId: string) {
    const bid = await this.detail(bidId);
    return [...bid.results].sort((a, b) => {
      const rankA = a.finalRank === 'NA' ? 999 : Number(a.finalRank.slice(1));
      const rankB = b.finalRank === 'NA' ? 999 : Number(b.finalRank.slice(1));
      if (rankA !== rankB) return rankA - rankB;
      return (a.totalPrice || Number.MAX_SAFE_INTEGER) - (b.totalPrice || Number.MAX_SAFE_INTEGER);
    });
  },
  async startBidParticipation(bidId: string) {
    return this.participate(bidId);
  },
  async uploadTechnicalDocuments(
    bidId: string,
    participationId: number,
    files: File[],
    metadata: { documentCategory?: string; documentName?: string } = {},
    onProgress?: (fileIndex: number, percent: number) => void
  ) {
    const uploaded: any[] = [];
    for (const [index, file] of files.entries()) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentCategory', metadata.documentCategory || 'TECHNICAL_COMPLIANCE');
      formData.append('documentName', metadata.documentName || file.name);
      uploaded.push(await uploadFormData(
        `/api/bids/${encodeURIComponent(bidId)}/participation/${participationId}/technical-documents`,
        formData,
        percent => onProgress?.(index, percent)
      ));
    }
    return uploaded;
  },
  async uploadFinancialQuote(
    bidId: string,
    participationId: number,
    data: {
      file?: File | null;
      quotedAmount: number | string;
      gstPercentage?: number | string;
      totalAmount?: number | string;
      makeBrand?: string;
      model?: string;
      offeredItemDescription?: string;
    },
    onProgress?: (percent: number) => void
  ) {
    const formData = new FormData();
    if (data.file) formData.append('file', data.file);
    formData.append('quotedAmount', String(data.quotedAmount));
    if (data.gstPercentage !== undefined) formData.append('gstPercentage', String(data.gstPercentage));
    if (data.totalAmount !== undefined) formData.append('totalAmount', String(data.totalAmount));
    if (data.makeBrand) formData.append('makeBrand', data.makeBrand);
    if (data.model) formData.append('model', data.model);
    if (data.offeredItemDescription) formData.append('offeredItemDescription', data.offeredItemDescription);
    return uploadFormData(`/api/bids/${encodeURIComponent(bidId)}/participation/${participationId}/financial-quote`, formData, onProgress);
  },
  async submitBidParticipation(bidId: string, participationId: number, _declarationData?: Record<string, unknown>) {
    return this.submitParticipation(bidId, participationId);
  },
  async getSellerBidStatus(bidId: string) {
    const res = await api.fetch(`/api/seller/bids/${encodeURIComponent(bidId)}/status`, { method: 'GET', headers: authHeaders(), skipCache: true });
    const data = await readApiBody(res);
    return {
      ...data,
      bid: data?.bid ? normalizeBid(data.bid) : null
    };
  },
};
