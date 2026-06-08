/**
 * React Query hooks for cart operations.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addItemToCart,
    approveCart,
    fetchActiveCart,
    fetchCartById,
    fetchCartHistory,
    fetchPendingApprovals,
    fetchPendingTechReview,
    rejectCart,
    removeCartItem,
    submitCart,
    techApproveItem,
    techRejectItem,
    updateCartItem,
    type CartDto,
    type CartItemDto
} from './api';
import { peekApi } from '../shared/apiClient';

const KEY = ['cart'] as const;
const APPROVAL_KEY = ['cart', 'pending-approval'] as const;
const TECH_KEY = ['cart', 'pending-tech-review'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const useActiveCart = () =>
    useQuery({
        queryKey: [...KEY, 'active'] as const,
        queryFn: fetchActiveCart,
        placeholderData: (previous) => previous ?? peekApi<CartDto>('/api/cart') ?? undefined
    });

export const useCartHistory = () =>
    useQuery({
        queryKey: [...KEY, 'history'] as const,
        queryFn: fetchCartHistory,
        placeholderData: (previous) => previous ?? peekApi<CartDto[]>('/api/cart/history') ?? undefined
    });

export const useCartDetail = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchCartById(id as number),
        enabled: !!id && id > 0,
        placeholderData: (previous) => previous ?? (id ? peekApi<CartDto>(`/api/cart/${id}`) : null) ?? undefined
    });

export const usePendingApprovals = () =>
    useQuery({
        queryKey: APPROVAL_KEY,
        queryFn: fetchPendingApprovals,
        placeholderData: (previous) => previous ?? peekApi<CartDto[]>('/api/cart/pending-approval') ?? undefined
    });

export const usePendingTechReview = () =>
    useQuery({
        queryKey: TECH_KEY,
        queryFn: fetchPendingTechReview,
        placeholderData: (previous) => previous ?? peekApi<CartItemDto[]>('/api/cart/pending-tech-review') ?? undefined
    });

export const useAddToCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: addItemToCart,
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, quantity }: { id: number; quantity: number }) => updateCartItem(id, quantity),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useRemoveCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => removeCartItem(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useSubmitCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (notes: string | undefined) => submitCart(notes),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useApproveCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => approveCart(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useRejectCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => rejectCart(id, note),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useTechApproveItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note?: string }) => techApproveItem(id, note),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useTechRejectItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => techRejectItem(id, note),
        onSuccess: () => { void invalidate(qc); }
    });
};
