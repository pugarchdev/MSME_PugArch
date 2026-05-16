export type FeatureStatus = string | null | undefined;

export type ListParams = {
  q?: string;
  status?: string;
  categoryId?: number;
  skip?: number;
  take?: number;
};

export type ApiList<T> = T[];

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
export type CatalogueItemDto = { id: number; name: string; description?: string; price?: number | string; basePrice?: number | string; status?: string; category?: CategoryDto };
