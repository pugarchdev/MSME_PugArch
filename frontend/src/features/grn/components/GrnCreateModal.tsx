/**
 * GrnCreateModal — pick a PO, then enter line item receive/accept/reject quantities.
 */
import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { getApi } from '../../shared/apiClient';
import { runWithToast } from '../../../lib/toast';
import { useCreateGrn, useGrnEligibility } from '../hooks';
import type { GrnDto, GrnItemDto } from '../api';

interface PurchaseOrderOption {
    id: number;
    poNumber: string;
    title: string;
    amount: string | number;
    status: string;
    seller?: { id: number; name: string };
    items: Array<{
        id: number;
        productId?: number | null;
        itemName?: string;
        product?: { name: string; unitOfMeasure?: string } | null;
        quantity: string | number;
        unitPrice: string | number;
        unitOfMeasure?: string;
    }>;
}

interface Props {
    onClose: () => void;
    onCreated: (grn: GrnDto) => void;
}

export function GrnCreateModal({ onClose, onCreated }: Props) {
    const [pos, setPos] = useState<PurchaseOrderOption[]>([]);
    const [loadingPos, setLoadingPos] = useState(true);
    const [selectedPoId, setSelectedPoId] = useState<number | null>(null);
    const [items, setItems] = useState<Array<Omit<GrnItemDto, 'id' | 'grnId'>>>([]);
    const [remarks, setRemarks] = useState('');
    const [inspectionNote, setInspectionNote] = useState('');
    const createMut = useCreateGrn();
    const eligibility = useGrnEligibility(selectedPoId || undefined);

    useEffect(() => {
        void (async () => {
            try {
                const data = await getApi<any>('/api/purchase-orders');
                const list = Array.isArray(data) ? data : data?.data || data?.records || [];
                // Only show POs in active states
                const active = list.filter((po: any) =>
                    ['accepted', 'in_fulfillment', 'delivered', 'generated', 'inspection_accepted'].includes(String(po.status || '').toLowerCase())
                );
                setPos(active);
            } catch {
                toast.error('Failed to load Purchase Orders');
            } finally {
                setLoadingPos(false);
            }
        })();
    }, []);

    const selectedPo = pos.find(p => p.id === selectedPoId);

    const handleSelectPo = (po: PurchaseOrderOption) => {
        setSelectedPoId(po.id);
        // Pre-populate items from PO
        const newItems = (po.items || []).map(item => ({
            purchaseOrderItemId: item.id,
            itemName: item.itemName || item.product?.name || `Item ${item.id}`,
            orderedQty: Number(item.quantity),
            receivedQty: Number(item.quantity),
            acceptedQty: Number(item.quantity),
            rejectedQty: 0,
            rejectionReason: '',
            unitOfMeasure: item.unitOfMeasure || item.product?.unitOfMeasure || 'Nos'
        }));
        setItems(newItems);
    };

    const updateItem = (idx: number, patch: Partial<typeof items[0]>) => {
        setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    };

    const removeItem = (idx: number) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
    };

    const addItem = () => {
        setItems(prev => [...prev, {
            itemName: '',
            orderedQty: 0,
            receivedQty: 0,
            acceptedQty: 0,
            rejectedQty: 0,
            rejectionReason: '',
            unitOfMeasure: 'Nos'
        }]);
    };

    const validate = () => {
        if (!selectedPoId) return 'Select a Purchase Order';
        if (items.length === 0) return 'Add at least one line item';
        for (const [idx, it] of items.entries()) {
            if (!it.itemName.trim()) return `Item ${idx + 1}: name required`;
            const recv = Number(it.receivedQty);
            const acc = Number(it.acceptedQty);
            const rej = Number(it.rejectedQty);
            if (Math.abs(acc + rej - recv) > 0.001) {
                return `Item ${idx + 1}: accepted + rejected must equal received`;
            }
            if (rej > 0 && !it.rejectionReason?.trim()) {
                return `Item ${idx + 1}: rejection reason required when rejected qty > 0`;
            }
        }
        return null;
    };

    const handleSubmit = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }

        try {
            const result = await runWithToast(
                () => createMut.mutateAsync({
                    purchaseOrderId: selectedPoId!,
                    remarks: remarks.trim() || undefined,
                    inspectionNote: inspectionNote.trim() || undefined,
                    items: items.map(it => ({
                        purchaseOrderItemId: it.purchaseOrderItemId,
                        itemName: it.itemName.trim(),
                        orderedQty: Number(it.orderedQty),
                        receivedQty: Number(it.receivedQty),
                        acceptedQty: Number(it.acceptedQty),
                        rejectedQty: Number(it.rejectedQty),
                        rejectionReason: it.rejectionReason?.trim() || undefined,
                        unitOfMeasure: it.unitOfMeasure
                    }))
                }),
                { loading: 'Creating GRN...', success: 'GRN created', error: 'Failed to create GRN' }
            );
            if (result) onCreated(result);
        } catch {
            // Error already shown via toast by runWithToast
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Create Goods Receipt Note</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">Record the goods received against a Purchase Order</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* PO selector */}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Purchase Order</label>
                        {loadingPos ? (
                            <p className="text-xs text-slate-500">Loading POs...</p>
                        ) : pos.length === 0 ? (
                            <p className="text-xs text-slate-500">No active POs available.</p>
                        ) : (
                            <select
                                value={selectedPoId || ''}
                                onChange={e => {
                                    const po = pos.find(p => p.id === Number(e.target.value));
                                    if (po) handleSelectPo(po);
                                }}
                                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                            >
                                <option value="">Select a Purchase Order...</option>
                                {pos.map(po => (
                                    <option key={po.id} value={po.id}>
                                        {po.poNumber} — {po.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {selectedPo && eligibility.data && !eligibility.data.canCreate && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                            This PO already has an approved GRN. Creating another may not be necessary.
                        </div>
                    )}

                    {selectedPo && (
                        <>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Order Summary</p>
                                <p className="mt-1 font-black text-slate-900">{selectedPo.poNumber} · {selectedPo.title}</p>
                                <p className="text-[11px] text-slate-600">Seller: {selectedPo.seller?.name}</p>
                            </div>

                            {/* Line items */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Line Items ({items.length})</p>
                                    <Button type="button" variant="outline" size="sm" onClick={addItem}>
                                        <Plus className="mr-1 h-3 w-3" /> Add
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    {items.map((item, idx) => {
                                        const totalCheck = Math.abs(Number(item.acceptedQty) + Number(item.rejectedQty) - Number(item.receivedQty)) > 0.001;
                                        return (
                                            <div key={idx} className={`rounded-lg border ${totalCheck ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-white'} p-3`}>
                                                <div className="flex items-start gap-2">
                                                    <input
                                                        type="text"
                                                        value={item.itemName}
                                                        onChange={e => updateItem(idx, { itemName: e.target.value })}
                                                        placeholder="Item name"
                                                        className="flex-1 h-8 rounded border border-slate-200 px-2 text-xs font-semibold"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(idx)}
                                                        className="flex h-8 w-8 items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
                                                    <NumberField label="Ordered" value={item.orderedQty} onChange={v => updateItem(idx, { orderedQty: v })} />
                                                    <NumberField label="Received" value={item.receivedQty} onChange={v => updateItem(idx, { receivedQty: v })} />
                                                    <NumberField label="Accepted" value={item.acceptedQty} onChange={v => updateItem(idx, { acceptedQty: v })} />
                                                    <NumberField label="Rejected" value={item.rejectedQty} onChange={v => updateItem(idx, { rejectedQty: v })} />
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">UOM</label>
                                                        <input
                                                            type="text"
                                                            value={item.unitOfMeasure}
                                                            onChange={e => updateItem(idx, { unitOfMeasure: e.target.value })}
                                                            className="h-7 w-full rounded border border-slate-200 px-2 text-xs font-semibold"
                                                        />
                                                    </div>
                                                </div>
                                                {Number(item.rejectedQty) > 0 && (
                                                    <input
                                                        type="text"
                                                        value={item.rejectionReason || ''}
                                                        onChange={e => updateItem(idx, { rejectionReason: e.target.value })}
                                                        placeholder="Reason for rejection (required)"
                                                        className="mt-2 h-8 w-full rounded border border-red-200 bg-red-50/30 px-2 text-xs font-semibold"
                                                    />
                                                )}
                                                {totalCheck && (
                                                    <p className="mt-1 text-[10px] font-black text-red-600">⚠ Accepted + Rejected ≠ Received</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Remarks (optional)</label>
                                <textarea
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    rows={2}
                                    maxLength={2000}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Inspection Note (optional)</label>
                                <textarea
                                    value={inspectionNote}
                                    onChange={e => setInspectionNote(e.target.value)}
                                    rows={2}
                                    maxLength={2000}
                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={createMut.isPending || !selectedPoId} className="bg-[#12335f] text-white">
                        {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Create GRN
                    </Button>
                </div>
            </div>
        </div>
    );
}

function NumberField({ label, value, onChange }: { label: string; value: string | number; onChange: (v: number) => void }) {
    return (
        <div>
            <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</label>
            <input
                type="number"
                step="0.001"
                min="0"
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="h-7 w-full rounded border border-slate-200 px-2 text-xs font-mono font-semibold text-right"
            />
        </div>
    );
}
