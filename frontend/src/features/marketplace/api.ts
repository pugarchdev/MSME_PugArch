import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

export interface MarketplaceBanner {
    id: number;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    ctaText?: string;
    ctaLink?: string;
    displayOrder: number;
}

export interface MarketplaceCategory {
    id: number;
    name: string;
    slug: string;
    type: string;
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
    city?: string;
    district?: string;
    state?: string;
    verificationStatus: string;
    logoUrl?: string | null;
    logoFile?: MarketplaceLogoFile | null;
    profile?: MarketplaceOrganizationProfile | null;
}

export interface MarketplaceProduct {
    id: number;
    name: string;
    description?: string;
    price?: number;
    currency: string;
    unitOfMeasure?: string;
    brand?: string;
    status: string;
    category?: { id: number; name: string };
    seller?: { id: number; name: string; onboardingStatus: string };
    organization?: MarketplaceOrganizationSummary;
    images?: Array<{ id: number; fileAsset?: { id: number; url: string } }>;
    imageUrl?: string;
}

export interface MarketplaceService {
    id: number;
    name: string;
    description?: string;
    pricingModel: string;
    basePrice?: number;
    currency: string;
    serviceArea?: string;
    status: string;
    category?: { id: number; name: string };
    seller?: { id: number; name: string; onboardingStatus: string };
    organization?: MarketplaceOrganizationSummary;
    imageUrl?: string;
}

export interface MarketplaceSeller {
    id: number;
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
        buyerProfile?: { organizationName?: string; state?: string; district?: string } | null;
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
        const res = await api.get('/api/marketplace/home', { headers: headers(), skipCache: true });
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
        const res = await api.get(`/api/marketplace/requirements?${qs}`, { headers: headers(), skipCache: true });
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
    }
};
