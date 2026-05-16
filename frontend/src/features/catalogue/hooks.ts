import { useFeatureQuery } from '../shared/hooks';
import type { CatalogueItemDto, CategoryDto } from '../shared/types';

export const useCategories = () => useFeatureQuery<CategoryDto[]>('/api/categories', []);
export const useProductSearch = () => useFeatureQuery<CatalogueItemDto[]>('/api/products/search', []);
export const useServiceSearch = () => useFeatureQuery<CatalogueItemDto[]>('/api/services/search', []);
export const useSellerProducts = () => useFeatureQuery<CatalogueItemDto[]>('/api/seller/products', []);
export const useSellerServices = () => useFeatureQuery<CatalogueItemDto[]>('/api/seller/services', []);
