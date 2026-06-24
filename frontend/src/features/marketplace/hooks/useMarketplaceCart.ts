'use client';

import { useAuth } from '../../../hooks/useAuth';
import { useActiveCart, useAddToCart, useUpdateCartItem, useRemoveCartItem } from '../../cart/hooks';
import { removeCartItem, addItemToCart, fetchActiveCart, type CartDto } from '../../cart/api';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useGuestCart } from './useGuestCart';
import { resolveMarketplaceImage } from '../utils/marketplaceImages';
import { marketplaceApi } from '../api';
import { toast } from 'sonner';

export interface UnifiedCartItem {
    id: number; // product.id or service.id
    name: string;
    price?: number;
    unit?: string;
    imageUrl?: string;
    category?: string;
    quantity: number;
    type: 'product' | 'service';
    dbCartItemId?: number; // DB cart item primary key if authenticated
}

export function useMarketplaceCart() {
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';

    // 1. Guest cart hooks
    const guestCart = useGuestCart();

    // 2. Authenticated cart hooks (React Query)
    const activeCartQuery = useActiveCart({ enabled: isBuyer });
    const qc = useQueryClient();
    const addToCartMut = useAddToCart();
    const updateCartItemMut = useUpdateCartItem();
    const removeCartItemMut = useRemoveCartItem();

    if (isBuyer) {
        const dbItems = activeCartQuery.data?.items || [];
        const mappedItems: UnifiedCartItem[] = dbItems.map(item => {
            const type = item.productId ? 'product' : 'service';
            const itemId = item.productId || item.serviceId || 0;
            const subItem = type === 'product' ? item.product : item.service;
            
            return {
                id: itemId,
                name: item.itemName,
                price: Number(item.unitPrice),
                unit: item.unitOfMeasure,
                imageUrl: resolveMarketplaceImage(subItem || item, type),
                category: (subItem as any)?.category?.name || (item as any).product?.category?.name || (item as any).service?.category?.name,
                quantity: Number(item.quantity),
                type,
                dbCartItemId: item.id
            };
        });

        const count = mappedItems.reduce((sum, item) => sum + item.quantity, 0);

        const getQuantity = (itemId: number, type: 'product' | 'service') => {
            return mappedItems.find(i => i.id === itemId && i.type === type)?.quantity || 0;
        };

        const add = (
            item: Omit<UnifiedCartItem, 'quantity' | 'dbCartItemId'>,
            options?: { source?: string; showToast?: boolean }
        ) => {
            addToCartMut.mutate(
                {
                    productId: item.type === 'product' ? item.id : undefined,
                    serviceId: item.type === 'service' ? item.id : undefined,
                    quantity: 1,
                    itemName: item.name,
                    unitPrice: item.price,
                    unitOfMeasure: item.unit
                },
                {
                    onSuccess: () => {
                        if (options?.showToast !== false) {
                            toast.success(`${item.name} added to cart`);
                        }
                    },
                    onError: (err: any) => {
                        toast.error(err?.message || `Failed to add ${item.name} to cart`);
                    }
                }
            );

            // Track interactions
            marketplaceApi.trackInteraction({
                itemId: item.id,
                itemType: item.type === 'service' ? 'SERVICE' : 'PRODUCT',
                action: 'ADD_TO_CART',
                metadata: { source: options?.source || 'marketplace' }
            }).catch(() => undefined);
        };

        const update = (itemId: number, type: 'product' | 'service', qty: number) => {
            const mappedItem = mappedItems.find(i => i.id === itemId && i.type === type);
            if (!mappedItem) return;

            if (qty <= 0) {
                remove(itemId, type);
                return;
            }

            if (mappedItem.dbCartItemId) {
                updateCartItemMut.mutate(
                    { id: mappedItem.dbCartItemId, quantity: qty },
                    {
                        onError: (err: any) => {
                            toast.error(err?.message || 'Failed to update quantity');
                        }
                    }
                );
            }
        };

        const remove = (itemId: number, type: 'product' | 'service') => {
            const mappedItem = mappedItems.find(i => i.id === itemId && i.type === type);
            if (mappedItem?.dbCartItemId) {
                removeCartItemMut.mutate(mappedItem.dbCartItemId, {
                    onSuccess: () => {
                        toast.info(`${mappedItem.name} removed from cart`);
                    },
                    onError: (err: any) => {
                        toast.error(err?.message || 'Failed to remove item');
                    }
                });
            }
        };

        const clear = () => {
            mappedItems.forEach(item => {
                if (item.dbCartItemId) {
                    removeCartItemMut.mutate(item.dbCartItemId);
                }
            });
            toast.info('Cart cleared');
        };

        const buyNow = async (
            item: Omit<UnifiedCartItem, 'quantity' | 'dbCartItemId'>,
            options?: { source?: string; showToast?: boolean }
        ) => {
            // Cancel active cart queries to prevent concurrent refetches from overriding cache
            await qc.cancelQueries({ queryKey: ['cart'] });

            const otherItems = mappedItems.filter(
                (cartItem) => !(cartItem.id === item.id && cartItem.type === item.type)
            );

            // Sequentially remove all other items using raw API to avoid mutation race conditions
            for (const cartItem of otherItems) {
                if (cartItem.dbCartItemId) {
                    try {
                        await removeCartItem(cartItem.dbCartItemId);
                    } catch (err) {
                        console.error(`Failed to remove cart item ${cartItem.dbCartItemId}`, err);
                    }
                }
            }

            const hasTarget = mappedItems.some(
                (cartItem) => cartItem.id === item.id && cartItem.type === item.type
            );

            let finalCart: CartDto;
            if (!hasTarget) {
                // Add the target item using raw API to avoid mutation race conditions
                finalCart = await addItemToCart({
                    productId: item.type === 'product' ? item.id : undefined,
                    serviceId: item.type === 'service' ? item.id : undefined,
                    quantity: 1,
                });
            } else {
                finalCart = await fetchActiveCart();
            }

            // Directly update the query cache with the final cart returned from the server (which has real positive IDs)
            qc.setQueryData(['cart', 'active'], finalCart);
            await qc.invalidateQueries({ queryKey: ['cart'] });

            // Clear the custom API fetch cache so that page navigation doesn't fetch stale cached data
            api.invalidate('/api/cart');

            marketplaceApi.trackInteraction({
                itemId: item.id,
                itemType: item.type === 'service' ? 'SERVICE' : 'PRODUCT',
                action: 'ADD_TO_CART',
                metadata: { source: options?.source || 'marketplace-buy-now', buyNow: true },
            }).catch(() => undefined);

            if (options?.showToast !== false) {
                toast.success(`${item.name} ready for checkout`);
            }
        };

        return {
            items: mappedItems,
            count,
            getQuantity,
            add,
            update,
            remove,
            clear,
            buyNow,
            isLoading: activeCartQuery.isLoading
        };
    }

    // Guest cart mapping
    const mappedGuestItems: UnifiedCartItem[] = guestCart.items.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        imageUrl: item.imageUrl,
        category: item.category,
        quantity: item.quantity,
        type: item.type
    }));

    const getQuantity = (itemId: number, type: 'product' | 'service') => {
        return guestCart.items.find(i => i.id === itemId && i.type === type)?.quantity || 0;
    };

    const guestAdd = (
        item: Omit<UnifiedCartItem, 'quantity' | 'dbCartItemId'>,
        options?: { source?: string; showToast?: boolean }
    ) => {
        guestCart.add({
            id: item.id,
            name: item.name,
            price: item.price,
            unit: item.unit,
            imageUrl: item.imageUrl,
            category: item.category,
            type: item.type
        });

        if (options?.showToast !== false) {
            toast.success(`${item.name} added to cart`);
        }

        // Track interactions
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: item.type === 'service' ? 'SERVICE' : 'PRODUCT',
            action: 'ADD_TO_CART',
            metadata: { source: options?.source || 'marketplace' }
        }).catch(() => undefined);
    };

    const guestUpdate = (itemId: number, type: 'product' | 'service', qty: number) => {
        const item = guestCart.items.find(i => i.id === itemId && i.type === type);
        if (!item) return;

        guestCart.update(itemId, type, qty);

        if (qty <= 0) {
            toast.info(`${item.name} removed from cart`);
        }
    };

    const guestRemove = (itemId: number, type: 'product' | 'service') => {
        const item = guestCart.items.find(i => i.id === itemId && i.type === type);
        if (item) {
            guestCart.remove(itemId, type);
            toast.info(`${item.name} removed from cart`);
        }
    };

    const guestBuyNow = async (
        item: Omit<UnifiedCartItem, 'quantity' | 'dbCartItemId'>,
        options?: { source?: string; showToast?: boolean }
    ) => {
        guestCart.clear();
        guestCart.add({
            id: item.id,
            name: item.name,
            price: item.price,
            unit: item.unit,
            imageUrl: item.imageUrl,
            category: item.category,
            type: item.type,
        });

        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: item.type === 'service' ? 'SERVICE' : 'PRODUCT',
            action: 'ADD_TO_CART',
            metadata: { source: options?.source || 'marketplace-buy-now', buyNow: true },
        }).catch(() => undefined);

        if (options?.showToast !== false) {
            toast.success(`${item.name} ready for checkout`);
        }
    };

    return {
        items: mappedGuestItems,
        count: guestCart.count,
        getQuantity,
        add: guestAdd,
        update: guestUpdate,
        remove: guestRemove,
        clear: guestCart.clear,
        buyNow: guestBuyNow,
        isLoading: false
    };
}
