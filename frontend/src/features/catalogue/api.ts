import { getApi, postApi, putApi, deleteApi, patchApi, normalizeList, authHeaders, unwrap } from '../shared/apiClient';
import { BASE_URL } from '../../lib/api';
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
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers: authHeaders(), body: fd });
  return unwrap<ImportPreviewResult>(res);
};

export const catalogueApi = {
  categories: async () => normalizeList<CategoryDto>(await getApi<unknown>('/api/categories'))
    .filter(category => Number(category?.id) > 0 && String(category?.name || '').trim())
    .map(category => ({ ...category, id: Number(category.id), name: String(category.name).trim() })),
  searchProducts: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/products/search?${query(params)}`),
  searchServices: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/services/search?${query(params)}`),
  sellerProducts: () => getApi<CatalogueItemDto[]>('/api/seller/products'),
  getProduct: (id: number) => getApi<CatalogueItemDto>(`/api/seller/products/${id}`),
  createProduct: (payload: unknown) => postApi<CatalogueItemDto>('/api/seller/products', payload),
  updateProduct: (id: number, payload: unknown) => putApi<CatalogueItemDto>(`/api/seller/products/${id}`, payload),
  deleteProduct: (id: number) => deleteApi<CatalogueItemDto>(`/api/seller/products/${id}`),
  sellerServices: () => getApi<CatalogueItemDto[]>('/api/seller/services'),
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
  importHistory: () => getApi<ImportBatchDto[]>('/api/catalogue/import/history'),
  importErrors: (batchId: number) => getApi<unknown[]>(`/api/catalogue/import/${batchId}/errors`),
  confirmImport: (batchId: number, publish = false) => postApi<{ imported: number }>(`/api/catalogue/import/${batchId}/confirm`, { publish }),
  adminProducts: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/products?${query(params)}`),
  adminServices: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/services?${query(params)}`)
};
