/**
 * Cart API client.
 */
import { deleteApi, getApi, postApi, putApi } from '../shared/apiClient';

export type CartStatus =
    | 'ACTIVE'
    | 'SUBMITTED_FOR_APPROVAL'
    | 'APPROVED'
    | 'REJECTED'
    | 'CONVERTED_TO_ORDER'
    | 'ABANDONED';

export interface CartItemDto {
    id: number;
    cartId: number;
    productId?: number | null;
    serviceId?: number | null;
    sellerId: number;
    itemName: string;
    quantity: string | number;
    unitOfMeasure: string;
    unitPrice: string | number;
    currency: string;
    technicalApproved: boolean | null;
    technicalApprovedById?: number | null;
    technicalNote?: string | null;
    technicalDecidedAt?: string | null;
    createdAt: string;
    product?: { id: number; name: string; hsnCode?: string; unitOfMeasure?: string; price?: string | number; description?: string };
    service?: { id: number; name: string; basePrice?: string | number; description?: string };
    seller?: { id: number; name: string; email?: string };
    technicalApprovedBy?: { id: number; name: string };
}

export interface CartDto {
    id: number;
    organizationId: number;
    createdById: number;
    status: CartStatus;
    notes?: string;
    approvedById?: number | null;
    approvedAt?: string | null;
    rejectedById?: number | null;
    rejectedAt?: string | null;
    rejectionNote?: string | null;
    convertedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    items: CartItemDto[];
    createdBy?: { id: number; name: string; email: string };
    approvedBy?: { id: number; name: string; email: string };
    rejectedBy?: { id: number; name: string; email: string };
}

export const fetchActiveCart = () => getApi<CartDto>('/api/cart');
export const fetchCartHistory = () => getApi<CartDto[]>('/api/cart/history');
export const fetchCartById = (id: number) => getApi<CartDto>(`/api/cart/${id}`);
export const fetchPendingApprovals = () => getApi<CartDto[]>('/api/cart/pending-approval');
export const fetchPendingTechReview = () => getApi<CartItemDto[]>('/api/cart/pending-tech-review');

export const addItemToCart = (data: { productId?: number; serviceId?: number; quantity: number }) =>
    postApi<CartDto>('/api/cart/items', data);

export const updateCartItem = (id: number, quantity: number) =>
    putApi<CartItemDto>(`/api/cart/items/${id}`, { quantity });

export const removeCartItem = (id: number) =>
    deleteApi<{ success: boolean }>(`/api/cart/items/${id}`);

export const submitCart = (notes?: string) =>
    postApi<CartDto>('/api/cart/submit', { notes });

export const approveCart = (id: number) =>
    postApi<CartDto>(`/api/cart/${id}/approve`, {});

export const rejectCart = (id: number, rejectionNote: string) =>
    postApi<CartDto>(`/api/cart/${id}/reject`, { rejectionNote });

export const techApproveItem = (id: number, note?: string) =>
    postApi<CartItemDto>(`/api/cart/items/${id}/tech-approve`, { note });

export const techRejectItem = (id: number, note: string) =>
    postApi<CartItemDto>(`/api/cart/items/${id}/tech-reject`, { note });
