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

export const useActiveCart = (options?: { enabled?: boolean }) => {
    const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('token') : false;
    return useQuery({
        queryKey: [...KEY, 'active'] as const,
        queryFn: fetchActiveCart,
        enabled: options?.enabled !== undefined ? options.enabled : hasToken,
        placeholderData: (previous) => previous ?? peekApi<CartDto>('/api/cart') ?? undefined
    });
};

export const useCartHistory = (options?: { enabled?: boolean }) => {
    const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('token') : false;
    return useQuery({
        queryKey: [...KEY, 'history'] as const,
        queryFn: fetchCartHistory,
        enabled: options?.enabled !== undefined ? options.enabled : hasToken,
        placeholderData: (previous) => previous ?? peekApi<CartDto[]>('/api/cart/history') ?? undefined
    });
};

export const useCartDetail = (id: number | undefined, options?: { enabled?: boolean }) => {
    const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('token') : false;
    return useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchCartById(id as number),
        enabled: (options?.enabled !== undefined ? options.enabled : true) && !!id && id > 0 && hasToken,
        placeholderData: (previous) => previous ?? (id ? peekApi<CartDto>(`/api/cart/${id}`) : null) ?? undefined
    });
};

export const usePendingApprovals = (options?: { enabled?: boolean }) => {
    const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('token') : false;
    return useQuery({
        queryKey: APPROVAL_KEY,
        queryFn: fetchPendingApprovals,
        enabled: options?.enabled !== undefined ? options.enabled : hasToken,
        placeholderData: (previous) => previous ?? peekApi<CartDto[]>('/api/cart/pending-approval') ?? undefined
    });
};

export const usePendingTechReview = (options?: { enabled?: boolean }) => {
    const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('token') : false;
    return useQuery({
        queryKey: TECH_KEY,
        queryFn: fetchPendingTechReview,
        enabled: options?.enabled !== undefined ? options.enabled : hasToken,
        placeholderData: (previous) => previous ?? peekApi<CartItemDto[]>('/api/cart/pending-tech-review') ?? undefined
    });
};

export const useAddToCart = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (variables: { productId?: number; serviceId?: number; quantity: number; itemName?: string; unitPrice?: number; unitOfMeasure?: string }) =>
            addItemToCart({ productId: variables.productId, serviceId: variables.serviceId, quantity: variables.quantity }),
        onMutate: async (newItem) => {
            await qc.cancelQueries({ queryKey: KEY });
            const previousActiveCart = qc.getQueryData<CartDto>([...KEY, 'active']);

            if (previousActiveCart) {
                const tempId = -Date.now();
                const optimisticItem: CartItemDto = {
                    id: tempId,
                    cartId: previousActiveCart.id,
                    productId: newItem.productId || null,
                    serviceId: newItem.serviceId || null,
                    sellerId: 0,
                    itemName: newItem.itemName || 'Adding item...',
                    quantity: newItem.quantity,
                    unitOfMeasure: newItem.unitOfMeasure || 'units',
                    unitPrice: newItem.unitPrice || 0,
                    currency: 'INR',
                    technicalApproved: null,
                    createdAt: new Date().toISOString()
                };

                qc.setQueryData<CartDto>([...KEY, 'active'], {
                    ...previousActiveCart,
                    items: [...previousActiveCart.items, optimisticItem]
                });
            }

            return { previousActiveCart };
        },
        onError: (err, variables, context) => {
            if (context?.previousActiveCart) {
                qc.setQueryData([...KEY, 'active'], context.previousActiveCart);
            }
        },
        onSuccess: (data) => {
            if (data) {
                qc.setQueryData([...KEY, 'active'], data);
            }
        },
        onSettled: () => {
            void invalidate(qc);
        }
    });
};

export const useUpdateCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, quantity }: { id: number; quantity: number }) => updateCartItem(id, quantity),
        onMutate: async ({ id, quantity }) => {
            await qc.cancelQueries({ queryKey: KEY });
            const previousActiveCart = qc.getQueryData<CartDto>([...KEY, 'active']);
            const detailQueries = qc.getQueryCache().findAll({ queryKey: [...KEY, 'detail'] });
            const previousDetails = detailQueries.map(query => ({
                queryKey: query.queryKey,
                data: query.state.data as CartDto | undefined
            }));

            if (previousActiveCart) {
                qc.setQueryData<CartDto>([...KEY, 'active'], {
                    ...previousActiveCart,
                    items: previousActiveCart.items.map(item => item.id === id ? { ...item, quantity } : item)
                });
            }

            previousDetails.forEach(({ queryKey, data }) => {
                if (data) {
                    qc.setQueryData<CartDto>(queryKey, {
                        ...data,
                        items: data.items.map(item => item.id === id ? { ...item, quantity } : item)
                    });
                }
            });

            return { previousActiveCart, previousDetails };
        },
        onError: (err, variables, context) => {
            if (context?.previousActiveCart) {
                qc.setQueryData([...KEY, 'active'], context.previousActiveCart);
            }
            if (context?.previousDetails) {
                context.previousDetails.forEach(({ queryKey, data }) => {
                    if (data) {
                        qc.setQueryData(queryKey, data);
                    }
                });
            }
        },
        onSettled: () => {
            void invalidate(qc);
        }
    });
};

export const useRemoveCartItem = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => removeCartItem(id),
        onMutate: async (id: number) => {
            await qc.cancelQueries({ queryKey: KEY });

            const previousActiveCart = qc.getQueryData<CartDto>([...KEY, 'active']);
            const detailQueries = qc.getQueryCache().findAll({ queryKey: [...KEY, 'detail'] });
            const previousDetails = detailQueries.map(query => ({
                queryKey: query.queryKey,
                data: query.state.data as CartDto | undefined
            }));

            if (previousActiveCart) {
                qc.setQueryData<CartDto>([...KEY, 'active'], {
                    ...previousActiveCart,
                    items: previousActiveCart.items.filter(item => item.id !== id)
                });
            }

            previousDetails.forEach(({ queryKey, data }) => {
                if (data) {
                    qc.setQueryData<CartDto>(queryKey, {
                        ...data,
                        items: data.items.filter(item => item.id !== id)
                    });
                }
            });

            return { previousActiveCart, previousDetails };
        },
        onError: (err, id, context) => {
            if (context?.previousActiveCart) {
                qc.setQueryData([...KEY, 'active'], context.previousActiveCart);
            }
            if (context?.previousDetails) {
                context.previousDetails.forEach(({ queryKey, data }) => {
                    if (data) {
                        qc.setQueryData(queryKey, data);
                    }
                });
            }
        },
        onSettled: () => {
            void invalidate(qc);
        }
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
