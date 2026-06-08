import { getApi, postApi, putApi, deleteApi, normalizeList } from '../shared/apiClient';
import type { CatalogueItemDto, CategoryDto, ListParams } from '../shared/types';

const query = (params: ListParams = {}) => new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value)])).toString();

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
  adminProducts: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/products?${query(params)}`),
  adminServices: (params: ListParams = {}) => getApi<CatalogueItemDto[]>(`/api/admin/catalogue/services?${query(params)}`)
};
