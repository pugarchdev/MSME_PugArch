export interface SavedSupplier {
    id: number;
    sellerUserId?: number | null;
    name: string;
    location?: string;
    verificationStatus?: string;
    email?: string | null;
    mobile?: string | null;
    source?: string;
    savedAt: string;
}

const STORAGE_KEY = 'msme_saved_suppliers';

const normalizeSupplier = (supplier: Omit<SavedSupplier, 'savedAt'> & { savedAt?: string }): SavedSupplier => ({
    ...supplier,
    savedAt: supplier.savedAt || new Date().toISOString(),
});

export const loadSavedSuppliers = (): SavedSupplier[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => normalizeSupplier(item))
            .filter((item) => Number.isFinite(Number(item.id)) && item.name);
    } catch {
        return [];
    }
};

const persistSavedSuppliers = (suppliers: SavedSupplier[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
    window.dispatchEvent(new CustomEvent('msme:saved-suppliers-updated'));
};

export const saveSupplier = (supplier: Omit<SavedSupplier, 'savedAt'> & { savedAt?: string }) => {
    const normalized = normalizeSupplier(supplier);
    const current = loadSavedSuppliers();
    const next = [normalized, ...current.filter((item) => item.id !== normalized.id)];
    persistSavedSuppliers(next);
    return normalized;
};

export const removeSavedSupplier = (id: number) => {
    persistSavedSuppliers(loadSavedSuppliers().filter((item) => item.id !== id));
};

export const isSupplierSaved = (id: number) => loadSavedSuppliers().some((item) => item.id === id);
