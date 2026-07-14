import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

const headers = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const json = async <T>(response: Response): Promise<T> => unwrapApiData<T>(await readJsonResponse(response));

export type ReverseAuction = {
  id: number;
  auctionCode?: string;
  referenceNo?: string | null;
  title?: string;
  description?: string;
  procurementMethod?: 'REVERSE_AUCTION' | 'BID_WITH_REVERSE_AUCTION' | string | null;
  category?: string | null;
  subCategory?: string | null;
  auctionType?: 'ENGLISH_REVERSE' | 'RANK_BASED_REVERSE' | string | null;
  auctionMode?: 'ONLINE' | string | null;
  auctionDurationMinutes?: number | null;
  purchaseGroup?: string | null;
  purchaseOrganization?: string | null;
  status: string;
  statusEnum?: string;
  startTime: string;
  endTime: string;
  startPrice: number;
  currentBid?: number | string | null;
  currentLowestBid?: number | string | null;
  currentLowestAmount?: number | string | null;
  minDecrementAmount?: number | string | null;
  minDecrement?: number | string | null;
  minDecrementPercent?: number | string | null;
  reservePrice?: number | string | null;
  autoExtensionEnabled?: boolean;
  autoExtensionWindowMinutes?: number | null;
  autoExtensionByMinutes?: number | null;
  maxAutoExtensions?: number | null;
  extensionCount?: number | null;
  visibilityMode?: string | null;
  allowCompetitorNames?: boolean | null;
  remarks?: string | null;
  buyerOrgId?: number | null;
  linkedBidId?: number | null;
  tenderId?: number | null;
  currency?: string | null;
  rankVisibility?: 'SHOW_RANK_ONLY' | 'SHOW_LOWEST_PRICE' | 'HIDDEN' | string | null;
  minimumQualifiedBidders?: number | null;
  termsDocumentFileId?: number | null;
  termsDocumentName?: string | null;
  buyerMonitorSettings?: Record<string, unknown> | null;
  auctionConfig?: Record<string, unknown> | null;
  preBidStage?: Record<string, unknown> | null;
  auctionTrigger?: string | null;
  linkedRequirementId?: number | null;
  isPublic?: boolean | null;
  hasJoined?: boolean | null;
  /** Read-only summary of the procurement the buyer created this auction from. */
  linkedRequirement?: {
    id: number;
    requirementNumber?: string | null;
    title?: string | null;
    description?: string | null;
    canonicalMethod?: string | null;
    status?: string | null;
    estimatedValue?: number | string | null;
    currency?: string | null;
    requiredBy?: string | null;
    category?: string | null;
    deliveryLocation?: string | null;
    items?: Array<{ itemName?: string; description?: string | null; quantity?: number | string | null; unitOfMeasure?: string | null; estimatedUnitPrice?: number | string | null }>;
    documents?: Array<{ name?: string; fileName?: string | null; required?: boolean }>;
    consigneeDetails?: Array<{ name?: string; location?: string; quantity?: number | string }>;
    paymentTerms?: string | null;
    bidStartDate?: string | null;
    bidClosingDate?: string | null;
  } | null;
};

export type ReverseAuctionParticipant = {
  id: number;
  auctionId: number;
  sellerOrgId?: number | null;
  sellerUserId?: number | null;
  status?: string | null;
  currentRank?: number | null;
  lastBidAmount?: number | string | null;
  invitedAt?: string | null;
  sellerOrgName?: string | null;
  disqualificationReason?: string | null;
};

export type ReverseAuctionBid = {
  id: number;
  auctionId: number;
  sellerOrgId?: number | null;
  sellerId?: number | null;
  sellerOrgName?: string | null;
  bidAmount?: number | string | null;
  amount?: number | string | null;
  rankAtSubmission?: number | null;
  submittedAt?: string | null;
  isValid?: boolean | null;
};

export const reverseAuctionApi = {
  list: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
    return api.get(`/api/reverse-auctions?${qs}`, { headers: headers(), skipCache: true }).then(res => json<{ auctions: ReverseAuction[]; total: number }>(res));
  },
  get: (id: number) =>
    api.get(`/api/reverse-auctions/${id}`, { headers: headers(), skipCache: true }).then(res => json<ReverseAuction & { bids?: any[] }>(res)),
  create: (data: Record<string, unknown>) =>
    api.post('/api/reverse-auctions', data, { headers: headers() }).then(res => json<ReverseAuction>(res)),
  inviteSellers: (id: number, sellers: Array<{ sellerOrgId: number; sellerUserId?: number }>) =>
    api.post(`/api/reverse-auctions/${id}/invite-sellers`, { sellers }, { headers: headers() }).then(res => json<any>(res)),
  join: (id: number) =>
    api.post(`/api/reverse-auctions/${id}/join`, {}, { headers: headers() }).then(res => json<any>(res)),
  transition: (id: number, action: 'schedule' | 'start' | 'pause' | 'resume' | 'close' | 'cancel', body: Record<string, unknown> = {}) =>
    api.post(`/api/reverse-auctions/${id}/${action}`, body, { headers: headers() }).then(res => json<ReverseAuction>(res)),
  liveSummary: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/live-summary`, { headers: headers(), skipCache: true }).then(res => json<any>(res)),
  participants: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/participants`, { headers: headers(), skipCache: true }).then(res => json<{ participants: ReverseAuctionParticipant[] }>(res)),
  bids: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/bids`, { headers: headers(), skipCache: true }).then(res => json<{ bids: ReverseAuctionBid[] }>(res)),
  placeBid: (id: number, amount: number) =>
    api.post(`/api/reverse-auctions/${id}/bids`, { amount }, { headers: headers() }).then(res => json<any>(res)),
  result: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/result`, { headers: headers(), skipCache: true }).then(res => json<any>(res)),
  recommendAward: (id: number, participantId?: number) =>
    api.post(`/api/reverse-auctions/${id}/award-recommendation`, { participantId }, { headers: headers() }).then(res => json<any>(res))
};
