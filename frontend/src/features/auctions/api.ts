/**
 * Auctions API client.
 */
import { getApi, postApi } from '../shared/apiClient';

export interface AuctionDto {
    id: number;
    tenderId: number;
    startPrice: string | number;
    minDecrement: string | number;
    startTime: string;
    endTime: string;
    status: string;
    currentLowestBid?: string | number | null;
    currentWinnerId?: number | null;
    finalizedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    Tender?: { id: number; tenderId: string; title: string; status: string; buyerId: number };
}

export interface AuctionBidDto {
    id: number;
    auctionId: number;
    sellerId: number;
    bidAmount: string | number;
    createdAt: string;
    seller?: { id: number; name: string };
}

export const fetchAuction = (id: number) => getApi<AuctionDto>(`/api/auctions/${id}`);
export const fetchAuctionHistory = (id: number) => getApi<AuctionBidDto[]>(`/api/auctions/${id}/history`);
export const placeAuctionBid = (id: number, bidAmount: number) =>
    postApi<{ auction: AuctionDto; auctionBid: AuctionBidDto }>(`/api/auctions/${id}/bids`, { bidAmount });
export const finalizeAuction = (id: number) => postApi<{ auction: AuctionDto; winningBid: AuctionBidDto }>(`/api/auctions/${id}/finalize`, {});
export const overrideAuction = (id: number, status: string, reason: string) =>
    postApi<AuctionDto>(`/api/auctions/${id}/override`, { status, reason });
