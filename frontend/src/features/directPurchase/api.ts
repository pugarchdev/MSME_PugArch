import { deleteApi, getApi, postApi, putApi, patchApi } from '../shared/apiClient';
import type {
    DirectPurchaseDto,
    DirectPurchasesListResponse,
    NewDirectPurchasePayload
} from './types';

const buildQuery = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
};

export const fetchDirectPurchases = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    getApi<DirectPurchasesListResponse>(`/api/direct-purchases${buildQuery(params)}`);

export const fetchDirectPurchaseById = (id: number) =>
    getApi<DirectPurchaseDto>(`/api/direct-purchases/${id}`);

export const createDirectPurchase = (payload: NewDirectPurchasePayload) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases`, payload);

export const updateDirectPurchase = (id: number, payload: Partial<NewDirectPurchasePayload> & { status?: string }) =>
    putApi<DirectPurchaseDto>(`/api/direct-purchases/${id}`, payload);

export const deleteDirectPurchase = (id: number) =>
    deleteApi<{ success: boolean }>(`/api/direct-purchases/${id}`);

export const generatePoFromDirectPurchase = (id: number) =>
    postApi<{ purchaseOrder: { id: number; poNumber?: string } }>(`/api/direct-purchases/${id}/generate-po`, {});

export const acceptDirectPurchase = (id: number) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases/${id}/accept`, {});

export const rejectDirectPurchase = (id: number) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases/${id}/reject`, {});

export interface DirectPurchaseCheckoutPayload {
    deliveryAddressId?: number | null;
    deliveryAddressText?: string | null;
    department: string;
    budgetHead: string;
    costCenter: string;
    justification: string;
    remarks?: string | null;
    deliveryInstructions?: string | null;
    requiredDeliveryDate?: string | null;
}

export const directPurchaseCheckout = (payload: DirectPurchaseCheckoutPayload) =>
    postApi<DirectPurchaseDto[]>(`/api/direct-purchases/checkout`, payload);

export const sendDirectPurchaseToSeller = (id: number) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases/${id}/send-to-seller`, {});

// ─── Delivery Address Book APIs ──────────────────────────────────────────────

export interface DeliveryAddressDto {
    id: number;
    buyerId: number;
    organizationId?: number | null;
    addressGroupId?: number | null;
    addressLabel: string;
    organizationName?: string | null;
    contactPersonName: string;
    mobileNumber: string;
    alternateMobileNumber?: string | null;
    email?: string | null;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    district: string;
    state: string;
    pincode: string;
    landmark?: string | null;
    gstState?: string | null;
    placeOfSupply?: string | null;
    addressType: string;
    isDefault: boolean;
    isActive: boolean;
}

export interface AddressGroupDto {
    id: number;
    buyerId: number;
    organizationId?: number | null;
    groupName: string;
    groupDescription?: string | null;
    isDefaultGroup: boolean;
    isActive: boolean;
    addresses?: DeliveryAddressDto[];
}

export const fetchDeliveryAddresses = () =>
    getApi<DeliveryAddressDto[]>(`/api/buyer/delivery-addresses`);

export const createDeliveryAddress = (payload: Partial<DeliveryAddressDto>) =>
    postApi<DeliveryAddressDto>(`/api/buyer/delivery-addresses`, payload);

export const updateDeliveryAddress = (id: number, payload: Partial<DeliveryAddressDto>) =>
    patchApi<DeliveryAddressDto>(`/api/buyer/delivery-addresses/${id}`, payload);

export const deleteDeliveryAddress = (id: number) =>
    deleteApi<{ success: boolean }>(`/api/buyer/delivery-addresses/${id}`);

export const setAddressAsDefault = (id: number) =>
    postApi<{ message: string }>(`/api/buyer/delivery-addresses/${id}/default`, {});

export const fetchAddressGroups = () =>
    getApi<AddressGroupDto[]>(`/api/buyer/address-groups`);

export const createAddressGroup = (payload: Partial<AddressGroupDto>) =>
    postApi<AddressGroupDto>(`/api/buyer/address-groups`, payload);

