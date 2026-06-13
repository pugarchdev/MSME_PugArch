import { useCallback, useEffect, useMemo, useState } from 'react';

export type CompareItemRef = { type: 'product' | 'service'; id: number; categoryId?: number | null };

const key = 'jsg_marketplace_compare';

const readStored = (): CompareItemRef[] => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
};

const emit = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('marketplace:compare-updated'));
};

const persist = (next: CompareItemRef[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(next.slice(0, 4)));
    emit();
  }
};

export const useCompare = () => {
  const [items, setItems] = useState<CompareItemRef[]>([]);

  useEffect(() => {
    const sync = () => setItems(readStored());
    sync();
    window.addEventListener('marketplace:compare-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('marketplace:compare-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(key, JSON.stringify(items.slice(0, 4)));
  }, [items]);

  const ids = useMemo(() => items.map(item => `${item.type}:${item.id}`), [items]);
  const has = useCallback((type: CompareItemRef['type'], id: number) => items.some(item => item.type === type && item.id === id), [items]);
  const add = useCallback((item: CompareItemRef) => {
    setItems(current => {
      if (current.some(existing => existing.type === item.type && existing.id === item.id)) return current;
      if (current.length >= 4) return current;
      const compatible = current.length === 0 || current.every(existing => existing.type === item.type && (!existing.categoryId || !item.categoryId || existing.categoryId === item.categoryId));
      if (!compatible) return current;
      const next = [...current, item];
      persist(next);
      return next;
    });
  }, []);
  const remove = useCallback((type: CompareItemRef['type'], id: number) => {
    setItems(current => {
      const next = current.filter(item => item.type !== type || item.id !== id);
      persist(next);
      return next;
    });
  }, []);
  const toggle = useCallback((item: CompareItemRef) => {
    if (has(item.type, item.id)) remove(item.type, item.id);
    else add(item);
  }, [add, has, remove]);
  const clear = useCallback(() => {
    setItems([]);
    persist([]);
  }, []);

  return { items, ids, has, add, remove, toggle, clear, limit: 4 };
};
