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

const emitAsync = () => {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    window.dispatchEvent(new Event('marketplace:compare-updated'));
  }, 0);
};

const persist = (next: CompareItemRef[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(next.slice(0, 4)));
    emitAsync();
  }
};

export const useCompare = () => {
  const [items, setItems] = useState<CompareItemRef[]>(() => readStored());

  useEffect(() => {
    const sync = () => {
      const stored = readStored();
      setItems(current => {
        const currentKey = JSON.stringify(current);
        const storedKey = JSON.stringify(stored);
        return currentKey === storedKey ? current : stored;
      });
    };
    sync();
    window.addEventListener('marketplace:compare-updated', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('marketplace:compare-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const ids = useMemo(() => items.map(item => `${item.type}:${item.id}`), [items]);
  const has = useCallback((type: CompareItemRef['type'], id: number) => items.some(item => item.type === type && item.id === id), [items]);

  const commit = useCallback((next: CompareItemRef[]) => {
    const limited = next.slice(0, 4);
    setItems(limited);
    persist(limited);
  }, []);

  const add = useCallback((item: CompareItemRef) => {
    const current = readStored();
    if (current.some(existing => existing.type === item.type && existing.id === item.id)) {
      setItems(current);
      return;
    }
    if (current.length >= 4) {
      setItems(current);
      return;
    }
    commit([...current, item]);
  }, [commit]);

  const remove = useCallback((type: CompareItemRef['type'], id: number) => {
    const next = readStored().filter(item => item.type !== type || item.id !== id);
    commit(next);
  }, [commit]);

  const toggle = useCallback((item: CompareItemRef) => {
    const current = readStored();
    if (current.some(existing => existing.type === item.type && existing.id === item.id)) remove(item.type, item.id);
    else add(item);
  }, [add, remove]);

  const clear = useCallback(() => {
    commit([]);
  }, [commit]);

  return { items, ids, has, add, remove, toggle, clear, limit: 4 };
};
