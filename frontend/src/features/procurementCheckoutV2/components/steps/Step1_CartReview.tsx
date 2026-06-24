'use client';

import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { formatCurrency } from '../../../shared/format';
import type { CartDto } from '../../../cart/api';

export default function Step1_CartReview({
  cart,
  onUpdateQty,
  onRemove,
  isUpdating,
}: {
  cart: CartDto;
  onUpdateQty: (id: number, qty: number) => void;
  onRemove: (id: number) => void;
  isUpdating?: boolean;
}) {
  const total = cart.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0);
  const sellerCount = new Set(cart.items.map(i => i.sellerId)).size;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 1 — Cart Review</h2>
      <p className="text-xs text-slate-500">Cart #{cart.id} · {cart.items.length} line(s) · {sellerCount} seller(s)</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left font-black uppercase tracking-wide text-slate-600">
            <tr>
              <th className="p-3">Item</th>
              <th className="p-3">Seller</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Unit</th>
              <th className="p-3">Total</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {cart.items.map(item => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="p-3 font-semibold">{item.itemName}</td>
                <td className="p-3">{item.seller?.name || `#${item.sellerId}`}</td>
                <td className="p-3">
                  {cart.status === 'ACTIVE' ? (
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={item.id < 0 || Number(item.quantity) <= 1} onClick={() => onUpdateQty(item.id, Math.max(1, Number(item.quantity) - 1))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-bold">{item.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={item.id < 0} onClick={() => onUpdateQty(item.id, Number(item.quantity) + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className="p-3">{formatCurrency(Number(item.unitPrice))}</td>
                <td className="p-3 font-bold">{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</td>
                <td className="p-3">
                  {cart.status === 'ACTIVE' && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" disabled={item.id < 0} onClick={() => onRemove(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <span className="font-bold">Estimated total: {formatCurrency(total)}</span>
        <Link
          href="/marketplace/compare"
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Compare sellers
        </Link>
      </div>
    </div>
  );
}
