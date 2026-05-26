/**
 * Rating module - shared frontend types matching the backend ratings service.
 */

export interface RatingDistributionBucket {
    star: 1 | 2 | 3 | 4 | 5;
    count: number;
}

export interface RatingSummary {
    count: number;
    average: number;
    distribution: RatingDistributionBucket[];
    averages: {
        quality: number;
        delivery: number;
        communication: number;
        paymentTimeliness: number;
    };
}

export interface SupplierRatingDto {
    id: number;
    sellerId: number;
    buyerId: number;
    purchaseOrderId?: number | null;
    rating: number;
    review?: string | null;
    qualityScore?: number | null;
    deliveryScore?: number | null;
    communicationScore?: number | null;
    createdAt?: string;
    updatedAt?: string;
    buyer?: { id?: number; name?: string };
}

export interface BuyerRatingDto {
    id: number;
    sellerId: number;
    buyerId: number;
    purchaseOrderId?: number | null;
    rating: number;
    review?: string | null;
    paymentTimelinessScore?: number | null;
    communicationScore?: number | null;
    createdAt?: string;
    updatedAt?: string;
    seller?: { id?: number; name?: string };
}

export interface RatingsListResult<T> {
    records: T[];
    total: number;
    skip?: number;
    take?: number;
    summary: RatingSummary;
}

export interface MyRatingForPO {
    kind: 'supplier' | 'buyer' | null;
    rating: SupplierRatingDto | BuyerRatingDto | null;
}

export interface NewSupplierRatingPayload {
    sellerId: number;
    purchaseOrderId?: number;
    rating: number;
    review?: string;
    qualityScore?: number;
    deliveryScore?: number;
    communicationScore?: number;
}

export interface NewBuyerRatingPayload {
    buyerId: number;
    purchaseOrderId?: number;
    rating: number;
    review?: string;
    paymentTimelinessScore?: number;
    communicationScore?: number;
}
