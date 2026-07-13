import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

export interface MarketplaceBanner {
    id: number;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    ctaText?: string;
    ctaLink?: string;
    displayOrder: number;
    targetUrl?: string;
    status?: string;
    priority?: number;
    displayLocation?: string;
}

export interface MarketplaceCategory {
    id: number;
    name: string;
    slug: string;
    type: string;
    icon?: string;
    productCount?: number;
    serviceCount?: number;
    displayOrder?: number;
    _count?: { products: number; services: number };
}

export interface MarketplaceLogoFile {
    id: number;
    url: string;
}

export interface MarketplaceOrganizationProfile {
    logoUrl?: string | null;
    isLargeIndustry?: boolean;
    isBigMsme?: boolean;
    [key: string]: any;
}

export interface MarketplaceOrganizationSummary {
    id: number;
    organizationName: string;
    organizationType?: string;
    gstin?: string | null;
    city?: string;
    district?: string;
    state?: string;
    verificationStatus: string;
    logoUrl?: string | null;
    logoFile?: MarketplaceLogoFile | null;
    profile?: MarketplaceOrganizationProfile | null;
    buyerProfiles?: { id: number; logoUrl?: string | null; bannerUrl?: string | null; }[];
}

export interface MarketplaceProduct {
    id: number;
    name: string;
    description?: string;
    price?: number;
    taxRate?: number;
    discount?: number;
    originalPrice?: number;
    discountPrice?: number;
    discountPercent?: number;
    offerLabel?: string;
    offerStartAt?: string;
    offerEndAt?: string;
    isOfferActive?: boolean;
    bulkDealAvailable?: boolean;
    bulkMinQuantity?: number | string;
    currency: string;
    unitOfMeasure?: string;
    brand?: string;
    sku?: string;
    hsnCode?: string;
    modelNumber?: string;
    itemCondition?: string;
    isMsmeMade?: boolean;
    createdAt?: string;
    updatedAt?: string;
    status: string;
    category?: { id: number; name: string };
    seller?: { id: number; name: string; onboardingStatus: string };
    organization?: MarketplaceOrganizationSummary;
    images?: Array<{ id: number; altText?: string | null; isPrimary?: boolean; fileAsset?: { id: number; url: string; mimeType?: string | null; originalName?: string | null } }>;
    catalogueFiles?: MarketplaceCatalogueFile[];
    specifications?: Array<{ id: number; name: string; value: string; unit?: string | null }>;
    certifications?: MarketplaceCertification[];
    imageUrl?: string;
}

export interface MarketplaceService {
    id: number;
    name: string;
    description?: string;
    pricingModel: string;
    basePrice?: number;
    taxRate?: number;
    discount?: number;
    originalPrice?: number;
    discountPrice?: number;
    discountPercent?: number;
    offerLabel?: string;
    offerStartAt?: string;
    offerEndAt?: string;
    isOfferActive?: boolean;
    bulkDealAvailable?: boolean;
    bulkMinQuantity?: number | string;
    currency: string;
    serviceArea?: string;
    createdAt?: string;
    updatedAt?: string;
    status: string;
    category?: { id: number; name: string };
    seller?: { id: number; name: string; onboardingStatus: string };
    organization?: MarketplaceOrganizationSummary;
    imageUrl?: string;
    images?: Array<{ id: number; fileAsset?: { id: number; url: string; mimeType?: string; originalName?: string } }>;
    catalogueFiles?: MarketplaceCatalogueFile[];
    certifications?: MarketplaceCertification[];
}

export interface MarketplaceCatalogueFile {
    id: number;
    entityId?: number | null;
    url?: string | null;
    mimeType?: string | null;
    originalName?: string | null;
}

export interface MarketplaceCertification {
    id: number;
    name: string;
    issuingAuthority?: string | null;
    certificateNumber?: string | null;
    verificationStatus?: string;
    issuedAt?: string | null;
    expiresAt?: string | null;
    fileAsset?: { id: number; url: string; originalName?: string | null } | null;
}

export interface MarketplaceLayoutItem {
    id: number;
    itemType: 'PRODUCT' | 'SERVICE';
    name: string;
    imageUrl?: string | null;
    categoryId?: number | null;
    categoryName?: string | null;
    categorySlug?: string | null;
    sellerId?: number | null;
    sellerName?: string | null;
    sellerVerified?: boolean;
    price?: number | null;
    originalPrice?: number | null;
    discountPrice?: number | null;
    discountPercent?: number | null;
    unit?: string | null;
    moq?: number | string | null;
    location?: string | null;
    district?: string | null;
    rating?: number | null;
    totalOrders?: number;
    isOfferActive?: boolean;
    detailUrl?: string;
}

export interface MarketplaceLayoutSection {
    key: string;
    title: string;
    subtitle?: string;
    layout: 'carousel' | 'list' | string;
    items: MarketplaceLayoutItem[] | any[];
}

export interface MarketplaceHomeLayoutData {
    banners: MarketplaceBanner[];
    categories: MarketplaceCategory[];
    sections: MarketplaceLayoutSection[];
    verifiedSellers?: MarketplaceSeller[];
}

export interface MarketplaceHomeSectionConfig {
    id?: number;
    key: string;
    title: string;
    enabled: boolean;
    displayOrder: number;
    itemLimit: number;
    ruleType: string;
}

export interface MarketplaceSeller {
    id: number;
    sellerUserId?: number | null;
    organizationName: string;
    organizationType: string;
    city?: string;
    district?: string;
    state?: string;
    verificationStatus: string;
    logoUrl?: string | null;
    logoFile?: MarketplaceLogoFile | null;
    profile?: MarketplaceOrganizationProfile | null;
    _count?: { products: number; services: number };
}

export interface BuyerRequirementItem {
    id: number;
    productId?: number | null;
    itemName: string;
    description?: string | null;
    quantity?: number | string | null;
    unitOfMeasure?: string | null;
    estimatedUnitPrice?: number | string | null;
    specifications?: Record<string, unknown> | null;
    product?: { id: number; name: string; hsnCode?: string; unitOfMeasure?: string } | null;
}

export interface BuyerRequirementDirectPurchase {
    deliveryAddressText?: string | null;
    department?: string | null;
    budgetHead?: string | null;
    costCenter?: string | null;
    justification?: string | null;
    remarks?: string | null;
    deliveryInstructions?: string | null;
    requiredDeliveryDate?: string | null;
    totalAmount?: number | string | null;
}

export interface BuyerRequirement {
    id: number;
    sourceModel?: 'BUYER_REQUIREMENT' | 'REQUIREMENT' | string;
    sourceId?: number;
    title: string;
    requirementType: 'PRODUCT' | 'SERVICE';
    description: string;
    quantity?: number | string | null;
    unit?: string | null;
    location?: string | null;
    budgetMin?: number | string | null;
    budgetMax?: number | string | null;
    lastDate: string;
    createdAt?: string;
    updatedAt?: string;
    approvedAt?: string | null;
    visibility: 'PUBLIC' | 'VERIFIED_SELLERS_ONLY';
    status: string;
    requirementNumber?: string;
    bidStatus?: 'OPEN' | 'CLOSING_SOON' | 'UNDER_EVALUATION' | 'AWARDED' | 'CLOSED' | string;
    computedStatus?: 'OPEN' | 'CLOSING_SOON' | 'UNDER_EVALUATION' | 'AWARDED' | 'CLOSED' | string;
    statusLabel?: 'Open' | 'Closing Soon' | 'Under Evaluation' | 'Awarded' | 'Closed' | string;
    daysRemaining?: number;
    timeRemaining?: string;
    isFeatured: boolean;
    isUrgent: boolean;
    requiredDocuments?: string[];
    contactPerson?: string | null;
    attachmentUrl?: string | null;
    terms?: string | null;
    procurementMethod?: string | null;
    canonicalMethod?: string | null;
    methodSlug?: string | null;
    procurementMethodLabel?: string | null;
    estimatedValue?: number | string | null;
    currency?: string | null;
    items?: BuyerRequirementItem[];
    itemSummary?: string | null;
    directPurchase?: BuyerRequirementDirectPurchase | null;
    payload?: any;
    category?: { id: number; name: string; slug?: string };
    buyerOrganization?: {
        id: number;
        organizationName: string;
        organizationType: string;
        city?: string;
        district?: string;
        state?: string;
        verificationStatus: string;
        logoUrl?: string | null;
        logoFile?: MarketplaceLogoFile | null;
        profile?: any;
    };
    _count?: { responses: number };
}


export interface MarketplaceTender {
    id: number;
    tenderId: string;
    title: string;
    category: string;
    budget?: number | string | null;
    description?: string | null;
    status: string;
    closesAt?: string | null;
    publishedAt?: string | null;
    createdAt: string;
    bidsCount?: number;
    buyer?: {
        id: number;
        name?: string;
        buyerProfile?: { organizationName?: string; city?: string; state?: string; district?: string } | null;
    };
}

export interface MarketplaceBid {
    id: number;
    sourceModel?: 'PROCUREMENT_BID' | 'TENDER' | string;
    sourceId?: number;
    bidNumber: string;
    title: string;
    description?: string | null;
    buyerOrganizationName: string;
    buyerType?: string;
    category: string;
    subCategory?: string | null;
    bidType: string;
    quantity?: number | string | null;
    unit?: string | null;
    estimatedValue?: number | string | null;
    deliveryLocation: string;
    state?: string | null;
    district?: string | null;
    startDate: string;
    endDate: string;
    createdAt?: string;
    status: string;
    approvalStatus: string;
    lifecycleStage: string;
    participantsCount?: number;
    buyerOrganization?: {
        id: number;
        organizationName: string;
        organizationType: string;
        city?: string;
        district?: string;
        state?: string;
        verificationStatus: string;
        logoUrl?: string | null;
    } | null;
}

export interface MarketplaceOrganization extends MarketplaceOrganizationSummary {
    organizationType: string;
    city?: string;
    district?: string;
    state?: string;
    verificationStatus: string;
    logoUrl?: string | null;
    profile?: any;
    _count?: Record<string, number>;
}

export interface MarketplaceNotice {
    id: number;
    title: string;
    description?: string;
    type: string;
    publishedAt: string;
}

export interface MarketplaceStats {
    verifiedSellers: number;
    registeredBuyers: number;
    productsListed: number;
    servicesListed: number;
    categories: number;
}

export interface MarketplaceHomeData {
    banners: MarketplaceBanner[];
    categories: MarketplaceCategory[];
    featuredProducts: MarketplaceProduct[];
    featuredServices: MarketplaceService[];
    featuredRequirements: BuyerRequirement[];
    latestTenders?: MarketplaceTender[];
    latestBids?: MarketplaceBid[];
    verifiedSellers: MarketplaceSeller[];
    largeIndustries: MarketplaceOrganization[];
    bigMsmes: MarketplaceOrganization[];
    notices: MarketplaceNotice[];
    stats: MarketplaceStats;
}

const headers = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getGuestCartToken = () => {
    if (typeof window === 'undefined') return '';
    const key = 'jsg_guest_cart_token';
    let token = localStorage.getItem(key);
    if (!token) {
        token = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem(key, token);
    }
    return token;
};

export const marketplaceApi = {
    getHomeData: async (): Promise<MarketplaceHomeData> => {
        const res = await api.get('/api/marketplace/home', { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getHomeLayout: async (params: Record<string, string | number> = {}): Promise<MarketplaceHomeLayoutData> => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/home-layout${qs ? `?${qs}` : ''}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getFeaturedCategories: async (): Promise<{ categories: MarketplaceCategory[] }> => {
        const res = await api.get('/api/marketplace/categories/featured');
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getProducts: async (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/products?${qs}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getProductDetail: async (id: number) => {
        const res = await api.get(`/api/marketplace/products/${id}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getServices: async (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/services?${qs}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getServiceDetail: async (id: number) => {
        const res = await api.get(`/api/marketplace/services/${id}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getRequirements: async (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/requirements?${qs}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getSellers: async (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/sellers?${qs}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getBuyers: async (params: Record<string, string | number> = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString();
        const res = await api.get(`/api/marketplace/buyers?${qs}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getRequirementDetail: async (id: number) => {
        const res = await api.get(`/api/marketplace/requirements/${id}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    respondToRequirement: async (id: number, data: Record<string, unknown>) => {
        const res = await api.post(`/api/marketplace/requirements/${id}/responses`, data, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    addGuestCartItem: async (data: { productId?: number; serviceId?: number; quantity?: number }) => {
        const res = await api.post('/api/marketplace/guest-cart/items', { cartToken: getGuestCartToken(), quantity: 1, ...data });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    updateGuestCartItem: async (data: { productId?: number; serviceId?: number; quantity: number }) => {
        const res = await api.put('/api/marketplace/guest-cart/items', { cartToken: getGuestCartToken(), ...data });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getGuestCart: async () => {
        const res = await api.get(`/api/marketplace/guest-cart/${getGuestCartToken()}`);
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    search: async (q: string) => {
        const res = await api.get(`/api/marketplace/search?q=${encodeURIComponent(q)}`, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    trackInteraction: async (data: { itemId?: number; itemType?: 'PRODUCT' | 'SERVICE'; categoryId?: number; action: 'VIEW' | 'CATEGORY_CLICK' | 'ADD_TO_CART' | 'COMPARE' | 'ORDER' | 'REQUIREMENT_POSTED' | 'SEARCH'; metadata?: Record<string, unknown> }) => {
        const guestKey = 'jsg_marketplace_guest_interactions';
        if (!headers().Authorization && typeof window !== 'undefined') {
            const current = JSON.parse(localStorage.getItem(guestKey) || '[]');
            localStorage.setItem(guestKey, JSON.stringify([{ ...data, createdAt: new Date().toISOString() }, ...current].slice(0, 80)));
            return { tracked: false, storage: 'guest' };
        }
        const res = await api.post('/api/marketplace/interactions', data, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getRecommendations: async (): Promise<{ sections: MarketplaceLayoutSection[]; categories: MarketplaceCategory[]; fallback?: boolean }> => {
        const res = await api.get('/api/marketplace/recommendations', { headers: headers(), skipCache: true });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    getAdminHomeSections: async (): Promise<{ sections: MarketplaceHomeSectionConfig[] }> => {
        const res = await api.get('/api/admin/marketplace/home-sections', { headers: headers(), skipCache: true });
        const body = await readJsonResponse(res);
        return unwrapApiData(body);
    },

    updateAdminHomeSection: async (key: string, data: Partial<MarketplaceHomeSectionConfig>) => {
        const res = await api.patch(`/api/admin/marketplace/home-sections/${encodeURIComponent(key)}`, data, { headers: headers() });
        const body = await readJsonResponse(res);
        return unwrapApiData<MarketplaceHomeSectionConfig>(body);
    },

    getActiveBanners: async (location = 'HOME_HERO') => {
        const res = await api.get(`/api/banners/active?location=${encodeURIComponent(location)}`);
        const body = await readJsonResponse(res);
        return unwrapApiData<{ banners: MarketplaceBanner[] }>(body);
    },

    getCompareItems: async (ids: string[]) => {
        const res = await api.get(`/api/marketplace/compare?ids=${encodeURIComponent(ids.join(','))}`, { skipCache: true });
        const body = await readJsonResponse(res);
        return unwrapApiData<{ items: any[]; highlights: { lowestPrice?: number | null; highestPrice?: number | null; verifiedCount?: number }; limit: number }>(body);
    }
};
