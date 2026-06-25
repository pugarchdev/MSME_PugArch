/**
 * SellerDeliveryManagementPage — sellers manage active deliveries.
 *
 * Route: /seller/delivery-management
 * Workflow buttons (status-aware):
 *   PENDING_ACCEPTANCE → Accept | Reject
 *   SELLER_ACCEPTED    → Mark Packed
 *   PACKED             → Add Dispatch Details → Ready for Pickup
 *   READY_FOR_PICKUP   → Mark Dispatched
 *   DISPATCHED         → Update Status (in-transit / out-for-delivery / delivered)
 */
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, FileText, Package, RefreshCw, Send, Truck, Upload, X, XCircle } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import {
    useDeliveries, useLogisticsPartners, useLogisticsStatusUpdate, useMarkDispatched,
    useMarkPacked, useMarkReadyForPickup, useSellerAccept, useSellerReject,
    useUpdateDispatchDetails
} from '../hooks';
import type { DeliveryDto, DeliveryStatus, LogisticsPartner } from '../api';

const STATUS_TONE: Record<string, string> = {
    CREATED: 'border-amber-200 bg-amber-50 text-amber-800',
    PENDING_ACCEPTANCE: 'border-amber-200 bg-amber-50 text-amber-800',
    SELLER_ACCEPTED: 'border-blue-200 bg-blue-50 text-blue-800',
    SELLER_REJECTED: 'border-red-200 bg-red-50 text-red-800',
    PACKED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    READY_FOR_PICKUP: 'border-purple-200 bg-purple-50 text-purple-800',
    DISPATCHED: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    IN_TRANSIT: 'border-blue-200 bg-blue-50 text-blue-800',
    OUT_FOR_DELIVERY: 'border-blue-200 bg-blue-50 text-blue-800',
    DELIVERED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-700',
    DISPUTED: 'border-red-200 bg-red-50 text-red-800',
    RETURNED: 'border-orange-200 bg-orange-50 text-orange-800'
};

export default function SellerDeliveryManagementPage() {
    const { data, isLoading, error, refetch, isFetching } = useDeliveries({ role: 'seller' });
    const [actionTarget, setActionTarget] = useState<{ kind: string; delivery: DeliveryDto } | null>(null);

    const items = (data?.records || data?.items || []) as DeliveryDto[];
    const total = data?.total ?? items.length;
    const pendingCount = items.filter(item => item.status === 'CREATED' || item.status === 'PENDING_ACCEPTANCE').length;
    const inTransitCount = items.filter(item => ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(String(item.status))).length;
    const completedCount = items.filter(item => ['DELIVERED', 'COMPLETED', 'CLOSED'].includes(String(item.status))).length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Fulfillment</p>
                    <h1 className="text-2xl font-black text-slate-950">Delivery Management</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Accept POs, mark packed, add tracking details, and update dispatch status.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SummaryTile label="Visible Deliveries" value={total} icon={Truck} />
                <SummaryTile label="Awaiting Acceptance" value={pendingCount} icon={Clock} />
                <SummaryTile label="In Transit" value={inTransitCount} icon={Send} />
                <SummaryTile label="Completed" value={completedCount} icon={CheckCircle2} />
            </div>

            {error ? <InlineError message={(error as Error).message} onRetry={() => refetch()} /> :
                isLoading ? <LoadingState label="Loading deliveries..." /> :
                    items.length === 0 ? (
                        <Card><CardContent className="py-12">
                            <EmptyState title="No deliveries" description="No delivery records are linked to your seller account yet. Accepted purchase orders are converted into delivery tracking records before dispatch." />
                        </CardContent></Card>
                    ) : (
                        <div className="grid gap-3 lg:grid-cols-2">
                            {items.map(delivery => (
                                <DeliveryCard key={delivery.id} delivery={delivery} onAction={(kind) => setActionTarget({ kind, delivery })} />
                            ))}
                        </div>
                    )
            }

            {actionTarget && (
                <ActionDialog
                    kind={actionTarget.kind}
                    delivery={actionTarget.delivery}
                    onClose={() => setActionTarget(null)}
                />
            )}
        </div>
    );
}

function SummaryTile({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
    return (
        <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

function DeliveryCard({ delivery, onAction }: { delivery: DeliveryDto; onAction: (kind: string) => void }) {
    const status = String(delivery.status);

    const stage = (s: string) => {
        if (s === 'CREATED' || s === 'PENDING_ACCEPTANCE') return { label: 'Awaiting Acceptance', icon: Clock };
        if (s === 'SELLER_ACCEPTED') return { label: 'Pack & Ship', icon: Package };
        if (['PACKED', 'READY_FOR_PICKUP'].includes(s)) return { label: 'Ready to Dispatch', icon: Truck };
        if (['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s)) return { label: 'In Transit', icon: Truck };
        if (s === 'DELIVERED') return { label: 'Delivered', icon: CheckCircle2 };
        return { label: s.replace(/_/g, ' '), icon: AlertCircle };
    };

    const { label, icon: Icon } = stage(status);

    return (
        <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
                <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <EntityIdLink label={`DLV-${delivery.id}`} id={delivery.id} size="sm" to={`/delivery/${delivery.id}`} />
                                {delivery.purchaseOrder?.poNumber && (
                                    <EntityIdLink label={delivery.purchaseOrder.poNumber} id={delivery.purchaseOrder.id} size="sm" to="/orders" />
                                )}
                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[status] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                    {status.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-black text-slate-900 text-wrap-anywhere">{delivery.purchaseOrder?.title || 'Delivery'}</p>
                            <p className="text-xs font-semibold text-slate-500 text-wrap-anywhere">
                                Buyer: <span className="font-black text-slate-700">{delivery.purchaseOrder?.buyer?.name || `#${delivery.purchaseOrder?.buyerId}`}</span>
                            </p>
                            {delivery.purchaseOrder?.amount !== undefined && (
                                <p className="text-[11px] text-slate-500">Value: {formatCurrency(delivery.purchaseOrder.amount)}</p>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <Icon className="ml-auto h-5 w-5 text-[#12335f]" />
                            <p className="mt-1 text-[10px] font-black uppercase text-slate-500">{label}</p>
                        </div>
                    </div>
                </div>

                {(delivery.trackingNumber || delivery.expectedDelivery || delivery.carrierName) && (
                    <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-2 text-[11px] font-semibold text-slate-700 grid grid-cols-3 gap-2">
                        {delivery.trackingNumber && <div><span className="text-slate-400">Tracking:</span> {delivery.trackingNumber}</div>}
                        {delivery.carrierName && <div><span className="text-slate-400">Carrier:</span> {delivery.carrierName}</div>}
                        {delivery.expectedDelivery && <div><span className="text-slate-400">ETA:</span> {formatRelative(delivery.expectedDelivery)}</div>}
                    </div>
                )}

                <div className="px-4 py-3 flex flex-wrap gap-2">
                    {(status === 'CREATED' || status === 'PENDING_ACCEPTANCE') && (
                        <>
                            <Button size="sm" onClick={() => onAction('accept')} className="bg-emerald-600 text-white hover:bg-emerald-700">
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accept
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onAction('reject')} className="border-red-200 text-red-700 hover:bg-red-50">
                                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                            </Button>
                        </>
                    )}
                    {status === 'SELLER_ACCEPTED' && (
                        <Button size="sm" onClick={() => onAction('packed')} className="bg-[#12335f] text-white">
                            <Package className="mr-1 h-3.5 w-3.5" /> Mark Packed
                        </Button>
                    )}
                    {['SELLER_ACCEPTED', 'PACKED', 'READY_FOR_PICKUP'].includes(status) && (
                        <Button size="sm" variant="outline" onClick={() => onAction('dispatch-details')}>
                            <Truck className="mr-1 h-3.5 w-3.5" /> Tracking & Carrier
                        </Button>
                    )}
                    {status === 'PACKED' && (
                        <Button size="sm" onClick={() => onAction('ready')} className="bg-purple-600 text-white">
                            Ready for Pickup
                        </Button>
                    )}
                    {status === 'READY_FOR_PICKUP' && (
                        <Button size="sm" onClick={() => onAction('dispatched')} className="bg-cyan-600 text-white">
                            <Send className="mr-1 h-3.5 w-3.5" /> Mark Dispatched
                        </Button>
                    )}
                    {['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(status) && (
                        <Button size="sm" onClick={() => onAction('status')} className="bg-blue-600 text-white">
                            Update Status
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => onAction('upload-doc')}>
                        <Upload className="mr-1 h-3.5 w-3.5" /> Upload Doc
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Action Dialog (multi-purpose modal) ─────────────────────────────────────

function ActionDialog({ kind, delivery, onClose }: { kind: string; delivery: DeliveryDto; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">{kindToLabel(kind)}</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">DLV-{delivery.id} · {delivery.purchaseOrder?.poNumber || ''}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                    {kind === 'accept' && <AcceptForm delivery={delivery} onDone={onClose} />}
                    {kind === 'reject' && <RejectForm delivery={delivery} onDone={onClose} />}
                    {kind === 'packed' && <PackedForm delivery={delivery} onDone={onClose} />}
                    {kind === 'dispatch-details' && <DispatchDetailsForm delivery={delivery} onDone={onClose} />}
                    {kind === 'ready' && <ReadyForm delivery={delivery} onDone={onClose} />}
                    {kind === 'dispatched' && <DispatchedForm delivery={delivery} onDone={onClose} />}
                    {kind === 'status' && <StatusUpdateForm delivery={delivery} onDone={onClose} />}
                    {kind === 'upload-doc' && <UploadDocForm delivery={delivery} onDone={onClose} />}
                </div>
            </div>
        </div>
    );
}

function kindToLabel(kind: string): string {
    const map: Record<string, string> = {
        accept: 'Accept Order',
        reject: 'Reject Order',
        packed: 'Mark as Packed',
        'dispatch-details': 'Tracking & Carrier Details',
        ready: 'Ready for Pickup',
        dispatched: 'Mark as Dispatched',
        status: 'Update Delivery Status',
        'upload-doc': 'Upload Document'
    };
    return map[kind] || 'Action';
}

function AcceptForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const [remarks, setRemarks] = useState('');
    const [eta, setEta] = useState('');
    const mut = useSellerAccept();
    return (
        <div className="space-y-3">
            <Field label="Expected Delivery Date">
                <input type="date" value={eta} onChange={e => setEta(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" />
            </Field>
            <Field label="Remarks (optional)">
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync({ id: delivery.id, data: { remarks: remarks.trim() || undefined, expectedDelivery: eta || undefined } }), {
                            loading: 'Accepting...', success: 'Order accepted', error: 'Accept failed'
                        });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-emerald-600 text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Accept Order
                </Button>
            </div>
        </div>
    );
}

function RejectForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const [reason, setReason] = useState('');
    const mut = useSellerReject();
    return (
        <div className="space-y-3">
            <Field label="Rejection Reason">
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Why are you rejecting this order?" required className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold" />
                <p className="text-[10px] text-slate-400">Buyer will be notified.</p>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        if (reason.trim().length < 3) { toast.error('Provide a reason'); return; }
                        await runWithToast(() => mut.mutateAsync({ id: delivery.id, reason: reason.trim() }), {
                            loading: 'Rejecting...', success: 'Order rejected', error: 'Reject failed'
                        });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-red-600 text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                    Confirm Rejection
                </Button>
            </div>
        </div>
    );
}

function PackedForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const [weight, setWeight] = useState<number | ''>('');
    const [dim, setDim] = useState('');
    const [count, setCount] = useState<number | ''>('');
    const [remarks, setRemarks] = useState('');
    const mut = useMarkPacked();
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
                <Field label="Weight (kg)">
                    <input type="number" step="0.01" value={weight} onChange={e => setWeight(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
                </Field>
                <Field label="Packages">
                    <input type="number" value={count} onChange={e => setCount(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
                </Field>
                <Field label="Dimensions">
                    <input type="text" value={dim} onChange={e => setDim(e.target.value)} placeholder="LxWxH cm" className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" />
                </Field>
            </div>
            <Field label="Remarks (optional)">
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync({
                            id: delivery.id, data: {
                                packageWeightKg: weight === '' ? undefined : weight,
                                packageDimensions: dim.trim() || undefined,
                                packageCount: count === '' ? undefined : count,
                                remarks: remarks.trim() || undefined
                            }
                        }), { loading: 'Saving...', success: 'Marked packed', error: 'Failed' });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-[#12335f] text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                    Mark Packed
                </Button>
            </div>
        </div>
    );
}

function DispatchDetailsForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const partners = useLogisticsPartners();
    const [trackingNumber, setTrackingNumber] = useState(delivery.trackingNumber || '');
    const [carrierName, setCarrierName] = useState(delivery.carrierName || '');
    const [partnerId, setPartnerId] = useState<number | ''>(delivery.logisticsPartnerId || '');
    const [eway, setEway] = useState(delivery.ewayBillNumber || '');
    const [eta, setEta] = useState((delivery.expectedDelivery || '').slice(0, 10));
    const mut = useUpdateDispatchDetails();
    return (
        <div className="space-y-3">
            <Field label="Tracking Number">
                <input type="text" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
                <Field label="Carrier Name">
                    <input type="text" value={carrierName} onChange={e => setCarrierName(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" />
                </Field>
                <Field label="Logistics Partner">
                    <select value={partnerId} onChange={e => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-bold">
                        <option value="">— Manual / None —</option>
                        {(partners.data || []).map((p: LogisticsPartner) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Field label="E-way Bill #">
                    <input type="text" value={eway} onChange={e => setEway(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
                </Field>
                <Field label="Expected Delivery">
                    <input type="date" value={eta} onChange={e => setEta(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" />
                </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync({
                            id: delivery.id, data: {
                                trackingNumber: trackingNumber.trim() || undefined,
                                carrierName: carrierName.trim() || undefined,
                                logisticsPartnerId: partnerId === '' ? undefined : partnerId,
                                ewayBillNumber: eway.trim() || undefined,
                                expectedDelivery: eta || undefined
                            }
                        }), { loading: 'Saving...', success: 'Dispatch details saved', error: 'Failed' });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-[#12335f] text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                    Save Dispatch Details
                </Button>
            </div>
        </div>
    );
}

function ReadyForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const mut = useMarkReadyForPickup();
    return (
        <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">
                Confirm the package is ready for pickup. Make sure tracking & carrier details are saved first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync(delivery.id), {
                            loading: 'Saving...', success: 'Marked ready for pickup', error: 'Failed'
                        });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-purple-600 text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                    Confirm Ready
                </Button>
            </div>
        </div>
    );
}

function DispatchedForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const mut = useMarkDispatched();
    return (
        <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">
                Confirm the package has left your warehouse. Buyer will be notified.
            </p>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync(delivery.id), {
                            loading: 'Saving...', success: 'Marked dispatched', error: 'Failed'
                        });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-cyan-600 text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Confirm Dispatched
                </Button>
            </div>
        </div>
    );
}

function StatusUpdateForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    const [status, setStatus] = useState('IN_TRANSIT');
    const [location, setLocation] = useState('');
    const [remarks, setRemarks] = useState('');
    const mut = useLogisticsStatusUpdate();
    const options = [
        { value: 'IN_TRANSIT', label: 'In Transit' },
        { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
        { value: 'DELIVERED', label: 'Delivered' }
    ];
    return (
        <div className="space-y-3">
            <Field label="New Status">
                <select value={status} onChange={e => setStatus(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-bold">
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </Field>
            <Field label="Location (optional)">
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Mumbai sorting hub" className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" />
            </Field>
            <Field label="Remarks (optional)">
                <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Cancel</Button>
                <Button
                    onClick={async () => {
                        await runWithToast(() => mut.mutateAsync({
                            id: delivery.id, data: { status, location: location.trim() || undefined, remarks: remarks.trim() || undefined }
                        }), { loading: 'Saving...', success: 'Status updated', error: 'Update failed' });
                        onDone();
                    }}
                    disabled={mut.isPending}
                    className="bg-blue-600 text-white"
                >
                    {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Update Status
                </Button>
            </div>
        </div>
    );
}

function UploadDocForm({ delivery, onDone }: { delivery: DeliveryDto; onDone: () => void }) {
    return (
        <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-700">
                Upload delivery documents (POD, e-way bill, photos). For now, files must be uploaded via the parcel tracking page first.
            </p>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
                <FileText className="inline h-4 w-4 mr-1" />
                Use the existing /seller/delivery parcel tracking page to upload — documents you add there are automatically linked to this delivery.
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onDone}>Close</Button>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
            {children}
        </div>
    );
}
