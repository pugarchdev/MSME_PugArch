/**
 * Delivery Tracking module - frontend API client.
 *
 * Thin wrapper over the shared apiClient that exposes type-safe helpers for
 * each backend route. Components import these functions instead of crafting
 * URLs ad hoc, so route changes only need to be applied in one place.
 */

import { deleteApi, getApi, postApi, putApi } from '../shared/apiClient';
import type {
  BuyerAcceptanceDto,
  DeliveryDetailDto,
  DeliveryDocumentDto,
  DeliveryDocumentType,
  DeliveryListResult,
  DeliveryParticipantRole,
  DeliveryReportSummary,
  DeliveryStatus,
  LogisticsPartnerDto
} from './types';

// Re-export for legacy importers from features/delivery/api.
export { getApi, postApi, putApi, deleteApi } from '../shared/apiClient';

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const listDeliveries = (
  params: {
    status?: DeliveryStatus;
    q?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
    role?: 'seller' | 'buyer' | 'consignee' | 'logistics' | 'finance' | 'admin';
  } = {}
) => getApi<DeliveryListResult>(`/api/delivery${buildQuery(params)}`);

export const getDeliveryById = (id: number) => getApi<DeliveryDetailDto>(`/api/delivery/${id}`);

export const getDeliveryByPurchaseOrder = (purchaseOrderId: number) =>
  getApi<DeliveryDetailDto | null>(`/api/delivery/by-purchase-order/${purchaseOrderId}`);

export const ensureDeliveryForPurchaseOrder = (
  purchaseOrderId: number,
  payload: Partial<{
    trackingNumber: string;
    carrierName: string;
    expectedDelivery: string;
    currentLocation: string;
    logisticsPartnerId: number;
    logisticsPartnerName: string;
    remarks: string;
  }> = {}
) => postApi<DeliveryDetailDto>(`/api/delivery/by-purchase-order/${purchaseOrderId}`, payload);

export const getDeliveryTimeline = (id: number) =>
  getApi<{ delivery: DeliveryDetailDto; events: any[]; statusLogs: any[] }>(`/api/delivery/${id}/timeline`);

export const sellerAcceptDelivery = (id: number, payload: { remarks?: string; expectedDelivery?: string } = {}) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/accept`, payload);

export const sellerRejectDelivery = (id: number, payload: { reason: string }) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/reject`, payload);

export const markDeliveryPacked = (
  id: number,
  payload: { packageWeightKg?: number; packageDimensions?: string; packageCount?: number; remarks?: string } = {}
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/packed`, payload);

export const updateDispatchDetails = (
  id: number,
  payload: Partial<{
    trackingNumber: string;
    carrierName: string;
    logisticsPartnerId: number;
    logisticsPartnerName: string;
    logisticsContact: string;
    ewayBillNumber: string;
    courierReceiptNumber: string;
    expectedDelivery: string;
    remarks: string;
  }>
) => putApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/dispatch-details`, payload);

export const markReadyForPickup = (id: number, remarks?: string) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/ready-for-pickup`, { remarks });

export const markDispatched = (id: number, payload: { location?: string; remarks?: string } = {}) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/seller/dispatched`, payload);

export const logisticsStatusUpdate = (
  id: number,
  payload: { status: DeliveryStatus; location?: string; remarks?: string; occurredAt?: string }
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/logistics/status`, payload);

export const buyerAcceptance = (id: number, payload: Partial<BuyerAcceptanceDto> & { accepted: boolean }) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/buyer/acceptance`, payload);

export const initiateReturn = (id: number, payload: { reason: string; type?: 'RETURN' | 'REPLACEMENT' | 'REFUND'; remarks?: string }) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/buyer/return`, payload);

export const raiseDeliveryDispute = (id: number, payload: { category: string; reason: string; evidenceFileAssetIds?: number[] }) =>
  postApi<{ id: number; status: string; reason: string }>(`/api/delivery/${id}/dispute`, payload);

export const resolveDeliveryDispute = (
  id: number,
  payload: { resolutionRemarks: string; outcome?: 'RESOLVED_FOR_BUYER' | 'RESOLVED_FOR_SELLER' | 'PARTIAL' | 'REJECTED' }
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/dispute/resolve`, payload);

export const verifyInvoice = (id: number, payload: { invoiceId: number; remarks?: string }) =>
  postApi<DeliveryDetailDto>(`/api/delivery/${id}/finance/verify-invoice`, payload);

export const paymentDecision = (
  id: number,
  payload: { approve: boolean; rejectionReason?: string; deductionAmount?: number; penaltyAmount?: number; remarks?: string }
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/finance/payment-decision`, payload);

export const releaseDeliveryPayment = (
  id: number,
  payload: { transactionReference: string; netReleasedAmount?: number; paymentProofFileAssetId?: number; remarks?: string }
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/finance/release-payment`, payload);

export const adminOverrideStatus = (
  id: number,
  payload: { status: DeliveryStatus; reason: string; location?: string }
) => postApi<DeliveryDetailDto>(`/api/delivery/${id}/admin/override`, payload);

export const listDeliveryDocuments = (id: number) =>
  getApi<DeliveryDocumentDto[]>(`/api/delivery/${id}/documents`);

export const addDeliveryDocument = (
  id: number,
  payload: { documentType: DeliveryDocumentType; fileAssetId: number; description?: string }
) => postApi<DeliveryDocumentDto>(`/api/delivery/${id}/documents`, payload);

export const assignDeliveryParticipant = (
  id: number,
  payload: { userId: number; participantRole: DeliveryParticipantRole; notes?: string }
) => postApi<{ id: number }>(`/api/delivery/${id}/participants`, payload);

export const removeDeliveryParticipant = (id: number, participantId: number) =>
  deleteApi<{ id: number; isActive: boolean }>(`/api/delivery/${id}/participants/${participantId}`);

export const listLogisticsPartners = () =>
  getApi<LogisticsPartnerDto[]>(`/api/delivery/logistics-partners`);

export const createLogisticsPartner = (payload: Partial<LogisticsPartnerDto> & { name: string }) =>
  postApi<LogisticsPartnerDto>(`/api/delivery/logistics-partners`, payload);

export const fetchDeliveryReport = (
  params: { fromDate?: string; toDate?: string; sellerId?: number; buyerId?: number; status?: DeliveryStatus } = {}
) => getApi<DeliveryReportSummary>(`/api/delivery/reports/summary${buildQuery(params)}`);
