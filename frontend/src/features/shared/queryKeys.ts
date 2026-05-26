/**
 * Centralised React Query key factory. Keeps invalidation predictable: any
 * mutation touching deliveries can invalidate `queryKeys.deliveries.all` and
 * every relevant query revalidates without us having to remember which strings
 * to use.
 */

export const queryKeys = {
    deliveries: {
        all: ['deliveries'] as const,
        list: (params: Record<string, unknown> = {}) => ['deliveries', 'list', params] as const,
        detail: (id: number) => ['deliveries', 'detail', id] as const,
        timeline: (id: number) => ['deliveries', 'timeline', id] as const,
        documents: (id: number) => ['deliveries', 'documents', id] as const,
        summary: ['deliveries', 'summary'] as const,
        logisticsPartners: ['deliveries', 'logistics-partners'] as const
    },
    ratings: {
        all: ['ratings'] as const,
        supplier: (sellerId: number, params: Record<string, unknown> = {}) =>
            ['ratings', 'supplier', sellerId, params] as const,
        buyer: (buyerId: number, params: Record<string, unknown> = {}) =>
            ['ratings', 'buyer', buyerId, params] as const,
        supplierSummary: (sellerId: number) => ['ratings', 'supplier-summary', sellerId] as const,
        buyerSummary: (buyerId: number) => ['ratings', 'buyer-summary', buyerId] as const,
        bulkSupplierSummary: (sellerIds: number[]) =>
            ['ratings', 'supplier-bulk-summary', [...sellerIds].sort()] as const,
        forPO: (purchaseOrderId: number) => ['ratings', 'me-for-po', purchaseOrderId] as const
    }
};
