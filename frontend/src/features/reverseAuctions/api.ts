import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

const headers = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const json = async <T>(response: Response): Promise<T> => unwrapApiData<T>(await readJsonResponse(response));

export type ReverseAuction = {
  id: number;
  auctionCode?: string;
  title?: string;
  description?: string;
  status: string;
  statusEnum?: string;
  startTime: string;
  endTime: string;
  startPrice: number;
  currentLowestAmount?: number | string | null;
  minDecrementAmount?: number | string | null;
  buyerOrgId?: number | null;
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
  transition: (id: number, action: 'schedule' | 'start' | 'pause' | 'resume' | 'close' | 'cancel', body: Record<string, unknown> = {}) =>
    api.post(`/api/reverse-auctions/${id}/${action}`, body, { headers: headers() }).then(res => json<ReverseAuction>(res)),
  liveSummary: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/live-summary`, { headers: headers(), skipCache: true }).then(res => json<any>(res)),
  placeBid: (id: number, amount: number) =>
    api.post(`/api/reverse-auctions/${id}/bids`, { amount }, { headers: headers() }).then(res => json<any>(res)),
  result: (id: number) =>
    api.get(`/api/reverse-auctions/${id}/result`, { headers: headers(), skipCache: true }).then(res => json<any>(res)),
  recommendAward: (id: number, participantId?: number) =>
    api.post(`/api/reverse-auctions/${id}/award-recommendation`, { participantId }, { headers: headers() }).then(res => json<any>(res))
};
