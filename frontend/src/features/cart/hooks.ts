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
    updateCartItem
} from './api';

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
        staleTime: 10_000
    });

export const useCartHistory = () =>
    useQuery({
        queryKey: [...KEY, 'history'] as const,
        queryFn: fetchCartHistory,
        staleTime: 30_000
    });

export const useCartDetail = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchCartById(id as number),
        enabled: !!id && id > 0,
        staleTime: 15_000
    });

export const usePendingApprovals = () =>
    useQuery({
        queryKey: APPROVAL_KEY,
        queryFn: fetchPendingApprovals,
        staleTime: 15_000
    });

export const usePendingTechReview = () =>
    useQuery({
        queryKey: TECH_KEY,
        queryFn: fetchPendingTechReview,
        staleTime: 15_000
    });

export const useAddToCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: addItemToCart,
        onSuccess: () => invalidate(qc)
    });
};

export const useUpdateCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, quantity }: { id: number; quantity: number }) => updateCartItem(id, quantity),
        onSuccess: () => invalidate(qc)
    });
};

export const useRemoveCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => removeCartItem(id),
        onSuccess: () => invalidate(qc)
    });
};

export const useSubmitCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (notes: string | undefined) => submitCart(notes),
        onSuccess: () => invalidate(qc)
    });
};

export const useApproveCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => approveCart(id),
        onSuccess: () => invalidate(qc)
    });
};

export const useRejectCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => rejectCart(id, note),
        onSuccess: () => invalidate(qc)
    });
};

export const useTechApproveItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note?: string }) => techApproveItem(id, note),
        onSuccess: () => invalidate(qc)
    });
};

export const useTechRejectItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => techRejectItem(id, note),
        onSuccess: () => invalidate(qc)
    });
};
