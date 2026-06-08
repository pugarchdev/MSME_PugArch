'use client';
/**
 * useGuestCart — lightweight in-memory cart for unauthenticated marketplace visitors.
 *
 * Stored in localStorage so it survives page refreshes.
 * On login, the items can be transferred to the real org cart.
 */
import { useState, useEffect, useCallback } from 'react';

export interface GuestCartItem {
    id: number;          // product.id
    name: string;
    price?: number;
    unit?: string;
    imageUrl?: string;
    category?: string;
    quantity: number;
    type: 'product' | 'service';
}

const STORAGE_KEY = 'jsg_guest_cart';

function loadCart(): GuestCartItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveCart(items: GuestCartItem[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// Module-level listeners so all hook instances stay in sync
type Listener = (items: GuestCartItem[]) => void;
const listeners = new Set<Listener>();
let _items: GuestCartItem[] = [];

function broadcast(items: GuestCartItem[]) {
    _items = items;
    saveCart(items);
    listeners.forEach(fn => fn(items));
}

export function addGuestItem(item: Omit<GuestCartItem, 'quantity'>) {
    const existing = _items.findIndex(i => i.id === item.id && i.type === item.type);
    if (existing >= 0) {
        const next = _items.map((i, idx) => idx === existing ? { ...i, quantity: i.quantity + 1 } : i);
        broadcast(next);
    } else {
        broadcast([..._items, { ...item, quantity: 1 }]);
    }
}

export function removeGuestItem(id: number, type: 'product' | 'service') {
    broadcast(_items.filter(i => !(i.id === id && i.type === type)));
}

export function updateGuestItemQty(id: number, type: 'product' | 'service', quantity: number) {
    if (quantity <= 0) { removeGuestItem(id, type); return; }
    broadcast(_items.map(i => i.id === id && i.type === type ? { ...i, quantity } : i));
}

export function clearGuestCart() {
    broadcast([]);
}

export function getGuestCartCount(): number {
    return _items.reduce((sum, i) => sum + i.quantity, 0);
}

export function useGuestCart() {
    const [items, setItems] = useState<GuestCartItem[]>(() => {
        _items = loadCart();
        return _items;
    });

    useEffect(() => {
        // Sync on mount in case another tab updated storage
        _items = loadCart();
        setItems([..._items]);

        const fn: Listener = updated => setItems([...updated]);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);

    const add = useCallback((item: Omit<GuestCartItem, 'quantity'>) => addGuestItem(item), []);
    const remove = useCallback((id: number, type: 'product' | 'service') => removeGuestItem(id, type), []);
    const update = useCallback((id: number, type: 'product' | 'service', qty: number) => updateGuestItemQty(id, type, qty), []);
    const clear = useCallback(() => clearGuestCart(), []);
    const count = items.reduce((s, i) => s + i.quantity, 0);

    return { items, count, add, remove, update, clear };
}
