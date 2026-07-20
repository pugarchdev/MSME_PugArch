import { api, readJsonResponse, unwrapApiData, BASE_URL } from '../../lib/api';
import type { ProcurementBid, ProcurementBidParticipation } from './data';
import { getCookieValue } from '../../lib/auth';

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
  xhr.withCredentials = true;

  for (const [key, value] of Object.entries(authHeaders())) {
    xhr.setRequestHeader(key, value);
  }

  const csrfToken = getCookieValue('csrfToken');
  if (csrfToken) {
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
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
      // XHR bypasses api.fetch, so mirror its mutation-invalidation manually:
      // uploads change bid/participation state and cached GETs must not go stale.
      api.invalidate('/api/procurement-bids');
      api.invalidate('/api/buyer/procurement-bids');
      api.invalidate('/api/seller/procurement-bids');
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
  const results = participations.length ? participations.map((p: any, index: number) => {
    let details: any = {};
    let offeredItem = p.offeredItemDescription || raw.title || 'Procurement requirement';
    try {
      if (p.offeredItemDescription && (p.offeredItemDescription.startsWith('{') || p.offeredItemDescription.startsWith('['))) {
        details = JSON.parse(p.offeredItemDescription);
        if (details.offeredItemDescription) {
          offeredItem = details.offeredItemDescription;
        }
      }
    } catch (e) {
      // Ignore
    }

    return {
      ...p,
      participationId: p.id,
      sellerName: p.seller?.name || p.seller?.organization?.organizationName || `Seller ${index + 1}`,
      sellerType: p.seller?.role === 'seller' ? 'Verified Seller' : p.seller?.role || 'Verified Seller',
      offeredItem,
      makeBrand: p.makeBrand || details.makeBrand || 'As quoted',
      model: p.model || details.model || 'Standard',
      technicalStatus: p.technicalStatus === 'DISQUALIFIED' ? 'Disqualified' : p.technicalStatus === 'QUALIFIED' ? 'Qualified' : 'Pending',
      financialStatus: p.financialStatus === 'OPENED' || p.financialStatus === 'EVALUATED' ? 'Opened' : 'Pending',
      totalPrice: Number(p.totalAmount || p.quotedAmount || 0),
      quotedAmount: Number(p.quotedAmount || 0),
      gstPercentage: Number(p.gstPercentage || 0),
      totalAmount: Number(p.totalAmount || 0),
      documents: p.documents || [],
      details,
      finalRank: toUiRank(p.rank),
      resultStatus: p.finalStatus === 'AWARDED' ? 'Awarded' : p.finalStatus === 'REJECTED' ? 'Rejected' : p.rank ? 'Responsive' : 'Under Review',
    };
  }) : [];

  // Extract rich data from technicalPacket / consigneeDetails / wizardData
  const pkt = raw.technicalPacket && typeof raw.technicalPacket === 'object' ? raw.technicalPacket : null;
  const wizardData = raw.consigneeDetails || pkt?.wizardData || pkt || {};
  const basics = pkt?.basics || wizardData?.basics || {};
  const schedule = pkt?.schedule || {};
  const termsPayload = pkt?.terms || {};
  const internal = pkt?.internal || {};

  // Title: prefer direct title, then payload basics
  const title = raw.title || basics.title || '';

  // Buyer name: prefer direct, then from organization, then payload
  const buyerName = raw.buyerOrganizationName
    || raw.buyerOrganization?.organizationName
    || internal.orgName
    || basics.buyerOrganizationName
    || '';

  // Category: prefer direct category, then from basics
  const category = raw.category || basics.category || '';

  // Delivery location
  const deliveryLocation = raw.deliveryLocation
    || basics.deliveryLocation
    || internal.deliveryAddress
    || [raw.district, raw.state].filter(Boolean).join(', ')
    || '';

  // Quantity
  const rawQty = raw.quantity || basics.quantity;
  const rawUnit = raw.unit || basics.unit || '';
  const quantity = rawQty ? `${rawQty} ${rawUnit}`.trim() : '';

  // Estimated value
  const estimatedValue = Number(raw.estimatedValue || basics.estimatedValue || 0);

  // Description
  const description = raw.description || basics.description || '';

  // Items from requirement
  const items = raw.items || [];
  const itemName = category || title || (items.length ? items[0]?.itemName || items[0]?.description : '') || '';

  // Terms and eligibility
  const termsArr = raw.termsAndConditions?.length ? raw.termsAndConditions : (termsPayload.termsAndConditions || []);
  const eligArr = raw.eligibilityCriteria?.length ? raw.eligibilityCriteria : (termsPayload.eligibilityCriteria || basics.eligibilityCriteria || []);
  const reqDocs = raw.requiredDocuments?.length ? raw.requiredDocuments : (pkt?.requiredDocs || []);

  // Important dates
  const startDate = String(raw.startDate || raw.createdAt || new Date().toISOString()).slice(0, 10);
  const endDate = String(raw.endDate || schedule.submissionDate || raw.startDate || new Date().toISOString()).slice(0, 10);
  const techDate = String(raw.technicalOpeningDate || schedule.technicalOpeningDate || raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10);
  const finDate = String(raw.financialOpeningDate || schedule.financialOpeningDate || raw.endDate || raw.startDate || new Date().toISOString()).slice(0, 10);

  return {
    id: raw.bidNumber || String(raw.id || ''),
    sourceModel: raw.sourceModel || 'PROCUREMENT_BID',
    sourceId: raw.sourceId || raw.id,
    title: title || 'Untitled procurement bid',
    itemName: itemName || 'Procurement requirement',
    buyerName: buyerName || 'Buyer organization',
    buyerType: (raw.buyerType || basics.buyerType || 'Private Enterprise') as ProcurementBid['buyerType'],
    departmentName: raw.departmentName || raw.buyer?.buyerProfile?.departmentName || internal.departmentName || 'Procurement',
    bidType: (raw.bidType || basics.whatAreYouBuying || 'Product') as ProcurementBid['bidType'],
    procurementType: raw.procurementType || raw.bidType || 'Open Bid',
    category: category || 'General procurement',
    location: [raw.district, raw.state].filter(Boolean).join(', ') || deliveryLocation || 'Location not specified',
    deliveryLocation: deliveryLocation || 'Delivery location not specified',
    quantity: quantity || 'Not specified',
    estimatedValue,
    startDate,
    endDate,
    status: toUiStatus(raw.status),
    approvalStatus: raw.approvalStatus,
    lifecycleStage: raw.lifecycleStage,
    participantsCount: Number(raw.participantsCount || participations.length || 0),
    rejectedReason: raw.rejectedReason,
    technicalStatus: toUiStage(raw.lifecycleStage),
    clarificationStatus: raw.clarifications && raw.clarifications.length > 0
      ? (raw.clarifications[0].status === 'RESPONDED' ? 'Responded' : raw.clarifications[0].status === 'COMPLETED' ? 'Completed' : 'Pending')
      : 'None',
    participated: Boolean(raw.myParticipation || participations.length),
    description: description || 'No description provided.',
    eligibility: eligArr,
    requiredDocuments: reqDocs,
    importantDates: [
      { label: 'Bid published', date: startDate },
      { label: 'Submission closes', date: endDate },
      { label: 'Technical opening', date: techDate },
      { label: 'Financial opening', date: finDate },
    ],
    terms: termsArr,
    emdAmount: raw.emdAmount ? Number(raw.emdAmount) : 0,
    isEmdRequired: Boolean(raw.isEmdRequired),
    evaluationMethod: raw.evaluationMethod || 'L1',
    allowClarification: Boolean(raw.allowClarification),
    allowReverseAuction: Boolean(raw.allowReverseAuction),
    packetType: raw.packetType || 'SINGLE_PACKET',
    consigneeDetails: raw.consigneeDetails || null,
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
      url: doc.fileUrl || doc.url,
    })),
    technicalPacket: pkt || undefined,
    buyer: raw.buyer || null,
    buyerOrganization: raw.buyerOrganization || raw.organization || null,
  };
};

export const procurementBidApi = {
  async list(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.get(`/api/procurement-bids${qs ? `?${qs}` : ''}`, { headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    const data = unwrapApiData(body);
    return { ...data, items: (data.items || []).map(normalizeBid) };
  },
  async detail(id: string) {
    const res = await api.get(`/api/procurement-bids/${encodeURIComponent(id)}`, { headers: authHeaders() });
    const body = await readJsonResponse(res);
    return normalizeBid(unwrapApiData(body));
  },
  async askClarification(id: string, question: string) {
    const res = await api.post(`/api/procurement-bids/${encodeURIComponent(id)}/clarifications/ask`, { question }, { headers: authHeaders() });
    return readApiBody(res);
  },
  async participate(id: string) {
    const res = await api.post(`/api/procurement-bids/${encodeURIComponent(id)}/participate`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async submitParticipation(id: string, participationId: number, body: Record<string, unknown> = {}) {
    const res = await api.post(`/api/procurement-bids/${encodeURIComponent(id)}/participation/${participationId}/submit`, body, { headers: authHeaders() });
    return readApiBody(res);
  },
  async createBid(payload: Record<string, unknown>) {
    const res = await api.post('/api/buyer/procurement-bids', payload, { headers: authHeaders() });
    return readApiBody(res);
  },
  async createBuyerBid(payload: Record<string, unknown>) {
    return this.createBid(payload);
  },
  async updateBuyerBid(bidId: string, payload: Record<string, unknown>) {
    const res = await api.put(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}`, payload, { headers: authHeaders() });
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
        `/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/documents`,
        formData,
        percent => onProgress?.(index, percent)
      ));
    }
    return uploaded;
  },
  async submitBidForApproval(bidId: string) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/submit-for-approval`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async getBuyerBids(_params: Record<string, string | number> = {}) {
    const res = await api.fetch('/api/buyer/procurement-bids', { method: 'GET', headers: authHeaders(), skipCache: true });
    const data = await readApiBody(res);
    return (data || []).map(normalizeBid);
  },
  async getAdminBids(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.fetch(`/api/admin/procurement-bids${qs ? `?${qs}` : ''}`, { method: 'GET', headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    const data = unwrapApiData(body);
    return (data || []).map(normalizeBid);
  },
  async getAdminProcurementIntake(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.fetch(`/api/admin/procurement/intake${qs ? `?${qs}` : ''}`, { method: 'GET', headers: authHeaders(), skipCache: true });
    const data = await readApiBody(res);
    return data?.records || data?.items || data || [];
  },
  async updateProcurementIntakeStatus(id: number | string, status: string) {
    const res = await api.patch(`/api/procurement/${encodeURIComponent(String(id))}/status`, { status }, { headers: authHeaders() });
    return readApiBody(res);
  },
  async adminList() {
    return this.getAdminBids();
  },
  async approve(id: string) {
    const res = await api.post(`/api/admin/procurement-bids/${encodeURIComponent(id)}/approve`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async approveBid(bidId: string) {
    return this.approve(bidId);
  },
  async reject(id: string, reason: string) {
    const res = await api.post(`/api/admin/procurement-bids/${encodeURIComponent(id)}/reject`, { reason }, { headers: authHeaders() });
    return readApiBody(res);
  },
  async rejectBid(bidId: string, reason: string) {
    return this.reject(bidId, reason);
  },
  async getBidAuditLogs(bidId: string) {
    const res = await api.fetch(`/api/admin/procurement-bids/${encodeURIComponent(bidId)}/audit`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res);
  },
  async getAdminBidParticipants(bidId: string) {
    const res = await api.fetch(`/api/admin/procurement-bids/${encodeURIComponent(bidId)}/participants`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res) as Promise<ProcurementBidParticipation[]>;
  },
  async approveFinalAward(bidId: string, data: { awardId?: number; remarks?: string }) {
    const res = await api.post(`/api/admin/procurement-bids/${encodeURIComponent(bidId)}/final-award-approval`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async getProcurementReports(params: Record<string, string | number> = {}) {
    const qs = buildQueryString(params);
    const res = await api.fetch(`/api/admin/procurement/reports${qs ? `?${qs}` : ''}`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res);
  },
  async getBidParticipants(bidId: string) {
    const res = await api.fetch(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/participants`, { method: 'GET', headers: authHeaders(), skipCache: true });
    return readApiBody(res) as Promise<ProcurementBidParticipation[]>;
  },
  async raiseClarification(bidId: string, data: { participationId: number; clarificationType: string; question: string; dueDate?: string }) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/clarifications`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async submitTechnicalEvaluation(bidId: string, data: { evaluations: Array<{ participationId: number; status: 'QUALIFIED' | 'DISQUALIFIED'; remarks?: string; score?: number }> }) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/technical-evaluation`, data, { headers: authHeaders() });
    return readApiBody(res);
  },
  async completeTechnicalEvaluation(bidId: string) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/complete-technical-evaluation`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async openFinancialEvaluation(bidId: string) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/open-financial-evaluation`, {}, { headers: authHeaders() });
    return readApiBody(res);
  },
  async recommendAward(bidId: string, data: { participationId: number; remarks?: string; adminOverrideReason?: string }) {
    const res = await api.post(`/api/buyer/procurement-bids/${encodeURIComponent(bidId)}/recommend-award`, data, { headers: authHeaders() });
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
    files: Array<File | { file: File; documentName?: string }>,
    metadata: { documentCategory?: string; documentName?: string } = {},
    onProgress?: (fileIndex: number, percent: number) => void
  ) {
    const uploaded: any[] = [];
    for (const [index, entry] of files.entries()) {
      const file = entry instanceof File ? entry : entry.file;
      const documentName = entry instanceof File ? undefined : entry.documentName;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentCategory', metadata.documentCategory || 'TECHNICAL_COMPLIANCE');
      formData.append('documentName', documentName || metadata.documentName || file.name);
      uploaded.push(await uploadFormData(
        `/api/procurement-bids/${encodeURIComponent(bidId)}/participation/${participationId}/technical-documents`,
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
    return uploadFormData(`/api/procurement-bids/${encodeURIComponent(bidId)}/participation/${participationId}/financial-quote`, formData, onProgress);
  },
  async submitBidParticipation(bidId: string, participationId: number, declarationData?: Record<string, unknown>) {
    // The declaration checkbox doubles as acceptance of buyer terms & eligibility criteria.
    const accepted = Boolean(declarationData?.declaration ?? declarationData?.acceptedTerms);
    return this.submitParticipation(bidId, participationId, { acceptedTerms: accepted });
  },
  async getSellerBids() {
    const res = await api.get('/api/seller/procurement-bids', { headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    return unwrapApiData(body) || [];
  },
  async getSellerMarketplaceResponses() {
    const res = await api.get('/api/seller/requirement-responses', { headers: authHeaders(), skipCache: true });
    const body = await readJsonResponse(res);
    const unwrapped = unwrapApiData(body);
    return Array.isArray(unwrapped?.responses) ? unwrapped.responses : Array.isArray(unwrapped) ? unwrapped : [];
  },
  async getSellerBidStatus(bidId: string) {
    const res = await api.fetch(`/api/seller/procurement-bids/${encodeURIComponent(bidId)}/status`, { method: 'GET', headers: authHeaders(), skipCache: true });
    const data = await readApiBody(res);
    return {
      ...data,
      bid: data?.bid ? normalizeBid(data.bid) : null
    };
  },
};
