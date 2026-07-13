import { deleteApi, getApi, postApi, putApi } from '../shared/apiClient';
import type { PurchaseOrderDto } from '../shared/types';

export type RateContractItem = {
  id?: string;
  itemName: string;
  baseRate: number;
  discount: number;
  gst: number;
  estimatedAnnualQuantity: number;
  unitOfMeasure: string;
};

export type SelectedSupplier = {
  supplierUserId: number;
  supplierName?: string;
  supplierBusinessName?: string;
};

export type RateContractMetadata = {
  buyerId: number;
  buyerOrganizationId?: number;
  requirementId: number;
  requirementNumber: string;
  contractTitle: string;
  contractDescription: string;
  contractCategory: string;
  contractSubCategory: string;
  periodStartDate: string;
  periodEndDate: string;
  rateValidityPeriod: string;
  callOffOrderAllowed: boolean;
  minimumOrderQuantity: number;
  maximumOrderQuantityPerCallOff: number;
  deliverySla: string;
  penaltyClause: string;
  selectedSuppliers: SelectedSupplier[];
  itemRateSchedule: RateContractItem[];
  supplierSelectionStrategy: string;
  priceVariationClause: string;
  securityDepositRequired: boolean;
  securityDepositAmount: number;
  pbgRequired: boolean;
  pbgAmount: number;
  approvalWorkflow: string;
  contractDocument: { fileName: string };
  activeState: string;
};

export type RateContractDto = {
  id: number;
  contractNumber: string;
  contractType: string;
  status: string;
  title: string;
  value: number | string;
  currency: string;
  startDate: string;
  endDate: string;
  signedAt?: string;
  metadata?: RateContractMetadata;
  createdAt: string;
  updatedAt: string;
  purchaseOrders?: PurchaseOrderDto[];
};

type RateContractsListResponse = {
  rateContracts: RateContractDto[];
  total: number;
  page: number;
  pageSize: number;
};

export const fetchRateContracts = (params: {
  contractState?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<RateContractsListResponse> => {
  const query = new URLSearchParams();
  if (params.contractState) query.set('contractState', params.contractState);
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  return getApi<RateContractsListResponse>(`/api/procurement/rate-contracts?${query.toString()}`);
};

export const fetchRateContractDetail = (id: number) =>
  getApi<RateContractDto>(`/api/procurement/rate-contracts/${id}`);

export const createCallOffOrder = (contractId: number, payload: {
  sellerId: number;
  title?: string;
  deliveryAddress: string;
  expectedDelivery?: string;
  items: Array<{
    itemName: string;
    quantity: number;
    unitOfMeasure: string;
    unitPrice: number;
    taxRate?: number;
  }>;
}) => postApi<PurchaseOrderDto>(`/api/procurement/rate-contracts/${contractId}/call-off-orders`, payload);
