export type FeatureStatus = string | null | undefined;

export type ListParams = {
  q?: string;
  status?: string;
  categoryId?: number;
  skip?: number;
  take?: number;
};

export type ApiList<T> = T[];

export type PaginatedResult<T> = {
  records: T[];
  total: number;
  skip?: number;
  take?: number;
  filters?: Record<string, unknown>;
};

export type PurchaseOrderDto = {
  id: number;
  poNumber: string;
  title: string;
  amount?: number | string;
  totalValue?: number;
  status?: string;
  poStatus?: string;
  buyerId?: number;
  sellerId?: number;
  seller?: { name?: string; email?: string };
  buyer?: { name?: string; email?: string };
  expectedDelivery?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  deliveryType?: string;
  createdAt?: string;
  acceptedAt?: string;
  items?: Array<{ itemName?: string; quantity?: number; unitPrice?: number | string; totalAmount?: number | string }>;
  deliveryTrackings?: DeliveryTrackingDto[];
  invoices?: Array<{ id: number; invoiceNumber: string; status?: string; amount?: number | string }>;
};

export type DeliveryTrackingDto = {
  id: number;
  purchaseOrderId: number;
  trackingNumber?: string;
  carrierName?: string;
  status?: string;
  currentLocation?: string;
  expectedDelivery?: string;
  actualDelivery?: string;
  purchaseOrder?: PurchaseOrderDto;
  events?: Array<{ id: number; status?: string; location?: string; remarks?: string; createdAt?: string }>;
};

export type CategoryDto = { id: number; name: string; parentId?: number | null; type?: string; isActive?: boolean };
export type CatalogueItemDto = {
  id: number;
  name: string;
  description?: string;
  price?: number | string;
  basePrice?: number | string;
  taxRate?: number | string;
  discount?: number | string;
  currency?: string;
  status?: string;
  categoryId?: number | null;
  category?: CategoryDto | null;
  seller?: { id?: number | string; name?: string; email?: string; onboardingStatus?: string };
  sellerId?: number | string;
  sku?: string;
  hsnCode?: string;
  brand?: string;
  modelNumber?: string;
  unitOfMeasure?: string;
  itemCondition?: string;
  pricingModel?: string;
  serviceArea?: string;
  images?: Array<{ id?: number; fileAssetId?: number; altText?: string; fileAsset?: CatalogueFileDto }>;
  certifications?: Array<{ id?: number; name?: string; issuingAuthority?: string; fileAssetId?: number | null; fileAsset?: CatalogueFileDto | null }>;
  catalogueFiles?: CatalogueFileDto[];
  createdAt?: string;
  updatedAt?: string;
};

export type CatalogueFileDto = {
  id?: number;
  fileAssetId?: number;
  originalName?: string;
  mimeType?: string;
  size?: number | string;
  createdAt?: string;
  entityType?: string;
  entityId?: number | null;
  status?: string;
};
