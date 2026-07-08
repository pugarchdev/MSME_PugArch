import { getApi, postApi, putApi, deleteApi, patchApi, normalizeList, unwrap } from '../shared/apiClient';
import { api } from '../../lib/api';
import type { CatalogueItemDto, CategoryDto, ListParams } from '../shared/types';

const query = (params: ListParams = {}) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString();

export type ImportPreviewResult = {
  batchId: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  warnings: string[];
  rowErrors: Array<{ rowNumber: number; field?: string; message: string }>;
  preview: Record<string, unknown>[];
};

export type ImportBatchDto = {
  id: number;
  type: 'PRODUCT' | 'SERVICE';
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  status: string;
  createdAt: string;
  _count?: { errors: number };
};

const uploadFile = async (path: string, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await api.fetch(path, { method: 'POST', body: fd, skipCache: true });
  return unwrap<ImportPreviewResult>(res);
};

export const downloadCatalogueFile = async (path: string, filename: string) => {
  const res = await api.fetch(path, { method: 'GET', skipCache: true });

  if (!res.ok) {
    let message = 'Download failed';
    try {
      const body = await res.clone().json();
      message = body?.message || body?.error || message;
    } catch {
      // Keep generic message when backend returns non-JSON error.
    }
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    let message = 'Download failed';
    try {
      const body = await res.clone().json();
      message = body?.message || body?.error || message;
    } catch {
      // Keep generic message when JSON cannot be parsed.
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

export const catalogueApi = {
  categories: async () => normalizeList<CategoryDto>(await getApi<unknown>('/api/categories'))
    .filter(category => Number(category?.id) > 0 && String(category?.name || '').trim())
    .map(category => ({ ...category, id: Number(category.id), name: String(category.name).trim() })),
  searchProducts: (params: ListParams = {}, skipCache = false) => getApi<CatalogueItemDto[]>(`/api/products/search?${query(params)}`, skipCache),
  searchServices: (params: ListParams = {}, skipCache = false) => getApi<CatalogueItemDto[]>(`/api/services/search?${query(params)}`, skipCache),
  sellerProducts: (skipCache = false) => getApi<CatalogueItemDto[]>('/api/seller/products', skipCache),
  getProduct: (id: number) => getApi<CatalogueItemDto>(`/api/seller/products/${id}`),
  createProduct: (payload: unknown) => postApi<CatalogueItemDto>('/api/seller/products', payload),
  updateProduct: (id: number, payload: unknown) => putApi<CatalogueItemDto>(`/api/seller/products/${id}`, payload),
  deleteProduct: (id: number) => deleteApi<CatalogueItemDto>(`/api/seller/products/${id}`),
  sellerServices: (skipCache = false) => getApi<CatalogueItemDto[]>('/api/seller/services', skipCache),
  getService: (id: number) => getApi<CatalogueItemDto>(`/api/seller/services/${id}`),
  createService: (payload: unknown) => postApi<CatalogueItemDto>('/api/seller/services', payload),
  updateService: (id: number, payload: unknown) => putApi<CatalogueItemDto>(`/api/seller/services/${id}`, payload),
  deleteService: (id: number) => deleteApi<CatalogueItemDto>(`/api/seller/services/${id}`),
  duplicateProduct: (id: number) => postApi<CatalogueItemDto>(`/api/seller/products/${id}/duplicate`, {}),
  duplicateService: (id: number) => postApi<CatalogueItemDto>(`/api/seller/services/${id}/duplicate`, {}),
  setProductStatus: (id: number, status: string) => patchApi<CatalogueItemDto>(`/api/seller/products/${id}/status`, { status }),
  setServiceStatus: (id: number, status: string) => patchApi<CatalogueItemDto>(`/api/seller/services/${id}/status`, { status }),
  importProductsPreview: (file: File) => uploadFile('/api/catalogue/import/products', file),
  importServicesPreview: (file: File) => uploadFile('/api/catalogue/import/services', file),
  importHistory: (skipCache = false) => getApi<ImportBatchDto[]>('/api/catalogue/import/history', skipCache),
  importErrors: (batchId: number) => getApi<unknown[]>(`/api/catalogue/import/${batchId}/errors`),
  confirmImport: (batchId: number, publish = false) => postApi<{ imported: number }>(`/api/catalogue/import/${batchId}/confirm`, { publish }),
  adminProducts: (params: ListParams = {}, skipCache = false) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/products?${query(params)}`, skipCache),
  adminServices: (params: ListParams = {}, skipCache = false) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/services?${query(params)}`, skipCache)
};
