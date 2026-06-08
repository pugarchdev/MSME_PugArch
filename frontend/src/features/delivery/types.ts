/**
 * Delivery Tracking module - shared frontend types.
 *
 * Mirrors the Prisma DeliveryStatus enum and the API contract exposed by
 * /api/delivery. Re-exports DeliveryTrackingDto for backwards compatibility
 * with existing pages that consumed it from features/shared/types.
 */

export type DeliveryStatus =
  | 'CREATED'
  | 'SELLER_ACCEPTED'
  | 'SELLER_REJECTED'
  | 'PACKED'
  | 'READY_FOR_PICKUP'
  | 'PICKUP_SCHEDULED'
  | 'PICKED_UP'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'AT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_CONFIRMATION_PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'RETURN_INITIATED'
  | 'RETURNED'
  | 'REPLACEMENT_REQUESTED'
  | 'DISPUTE_RAISED'
  | 'DISPUTE_RESOLVED'
  | 'INVOICE_VERIFIED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_RELEASED'
  | 'CLOSED'
  | 'DELAYED'
  | 'REATTEMPT_SCHEDULED'
  | 'DELIVERY_FAILED'
  | 'CANCELLED';

export type DeliveryDocumentType =
  | 'PURCHASE_ORDER'
  | 'TAX_INVOICE'
  | 'DELIVERY_CHALLAN'
  | 'PACKING_SLIP'
  | 'COURIER_RECEIPT'
  | 'EWAY_BILL'
  | 'PROOF_OF_DISPATCH'
  | 'PROOF_OF_DELIVERY'
  | 'INSPECTION_REPORT'
  | 'REJECTION_REPORT'
  | 'RETURN_DOCUMENT'
  | 'PAYMENT_PROOF'
  | 'OTHER';

export type DeliveryParticipantRole =
  | 'CONSIGNEE'
  | 'LOGISTICS_PARTNER'
  | 'FINANCE_OFFICER'
  | 'DISPUTE_OFFICER';

export type PaymentSettlementStatus =
  | 'PENDING'
  | 'INVOICE_VERIFIED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RELEASED'
  | 'ON_HOLD';

export interface DeliveryEventDto {
  id: number;
  status: DeliveryStatus;
  location?: string;
  remarks?: string;
  occurredAt?: string;
  createdAt?: string;
}

export interface DeliveryStatusLogDto {
  id: number;
  previousStatus?: DeliveryStatus | null;
  newStatus: DeliveryStatus;
  changedById?: number | null;
  actorRole?: string;
  remarks?: string;
  ipAddress?: string;
  userAgent?: string;
  fileAssetId?: number | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface DeliveryDocumentDto {
  id: number;
  documentType: DeliveryDocumentType;
  description?: string;
  uploaderRole: string;
  uploadedById: number;
  createdAt?: string;
  fileAsset?: {
    id: number;
    originalName?: string;
    mimeType?: string;
    size?: number;
    url?: string;
  };
  uploadedBy?: { id: number; name?: string; role?: string };
}

export interface DeliveryParticipantDto {
  id: number;
  userId: number;
  participantRole: DeliveryParticipantRole;
  isActive: boolean;
  notes?: string;
  assignedAt?: string;
  user?: { id: number; name?: string; email?: string; role?: string };
}

export interface BuyerAcceptanceDto {
  accepted: boolean;
  acceptedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  inspectionStatus?: string;
  damageNotes?: string;
  missingQuantity?: number;
  remarks?: string;
}

export interface PaymentSettlementDto {
  status: PaymentSettlementStatus;
  invoiceVerifiedAt?: string;
  approvedAt?: string;
  releasedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  deductionAmount?: number;
  penaltyAmount?: number;
  netReleasedAmount?: number;
  transactionReference?: string;
  remarks?: string;
}

export interface LogisticsPartnerDto {
  id: number;
  name: string;
  code?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  trackingUrl?: string;
  isActive: boolean;
}

export interface DeliveryDetailDto {
  id: number;
  purchaseOrderId: number;
  trackingNumber?: string;
  carrierName?: string;
  status: DeliveryStatus;
  expectedDelivery?: string;
  actualDelivery?: string;
  currentLocation?: string;
  sellerAcceptedAt?: string;
  sellerRejectedAt?: string;
  sellerRejectReason?: string;
  packedAt?: string;
  pickupScheduledAt?: string;
  pickedUpAt?: string;
  packageWeightKg?: number;
  packageDimensions?: string;
  packageCount?: number;
  logisticsPartnerId?: number;
  logisticsPartnerName?: string;
  logisticsContact?: string;
  ewayBillNumber?: string;
  courierReceiptNumber?: string;
  remarks?: string;
  metadata?: Record<string, unknown>;
  closedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  purchaseOrder?: {
    id: number;
    poNumber?: string;
    title?: string;
    amount?: number | string;
    totalValue?: number;
    status?: string;
    poStatus?: string;
    deliveryAddress?: string;
    expectedDelivery?: string;
    buyerId?: number;
    sellerId?: number;
    buyer?: { id?: number; name?: string; email?: string };
    seller?: { id?: number; name?: string; email?: string };
    invoices?: Array<{
      id: number;
      invoiceNumber?: string;
      amount?: number | string;
      status?: string;
      invoiceStatus?: string;
      approvedAt?: string;
      createdAt?: string;
      invoiceFile?: { id: number; originalName?: string; mimeType?: string } | null;
      invoiceFileId?: number | null;
    }>;
  };
  events?: DeliveryEventDto[];
  statusLogs?: DeliveryStatusLogDto[];
  documents?: DeliveryDocumentDto[];
  participants?: DeliveryParticipantDto[];
  acceptance?: BuyerAcceptanceDto | null;
  settlement?: PaymentSettlementDto | null;
  logisticsPartner?: LogisticsPartnerDto | null;
}

export interface DeliveryListResult {
  records: DeliveryDetailDto[];
  total: number;
  skip?: number;
  take?: number;
}

export interface DeliveryReportSummary {
  total: number;
  delayed: number;
  byStatus: Record<string, number>;
  pending: number;
  delivered: number;
  accepted: number;
  rejected: number;
  returned: number;
  paymentPendingAfterAcceptance: number;
  disputed: number;
  slaBreaches: number;
  inMovement?: number;
  completed?: number;
  risk?: number;
}

// Backwards compatibility alias used by ParcelTracking and others.
export type { DeliveryTrackingDto } from '../shared/types';
