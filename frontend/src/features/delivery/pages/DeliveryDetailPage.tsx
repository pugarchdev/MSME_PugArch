/**
 * DeliveryDetailPage - role-aware single source of truth for one delivery.
 * Powered by React Query + sonner toast helpers so:
 *   - The detail view is cached and reopens instantly
 *   - Action panels show optimistic feedback via toasts (no inline banners
 *     that pile up across actions)
 *   - Document uploads show real progress + drag-drop
 *   - When the delivery is closed, the user can rate the counterparty in one click
 */

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  RefreshCw,
  ShieldAlert,
  Star,
  Truck,
  Upload,
  UploadCloud,
  X
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { CardSkeleton, ListSkeleton } from '../../../components/ui/skeleton';
import { formatCurrency, formatDate } from '../../shared/format';
import { cn } from '../../../lib/utils';
import { runWithToast, notify } from '../../../lib/toast';
import { DeliveryStatusBadge } from '../components/DeliveryStatusBadge';
import { DeliveryTimeline } from '../components/DeliveryTimeline';
import { DELIVERY_STATUS_LABELS } from '../status';
import { RatingComposer } from '../../ratings/components/RatingComposer';
import { useMyRatingForPO } from '../../ratings/hooks';
import {
  useAddDeliveryDocument,
  useAdminOverride,
  useBuyerAcceptance,
  useDeliveryDetail,
  useInitiateReturn,
  useLogisticsPartners,
  useLogisticsStatusUpdate,
  useMarkDeliveryPacked,
  useMarkDispatched,
  useMarkReadyForPickup,
  usePaymentDecision,
  useRaiseDispute,
  useReleaseDeliveryPayment,
  useResolveDispute,
  useSellerAcceptDelivery,
  useSellerRejectDelivery,
  useUpdateDispatchDetails,
  useVerifyInvoice
} from '../hooks';
import { uploadDeliveryFile } from '../upload';
import type {
  DeliveryDetailDto,
  DeliveryDocumentType,
  DeliveryStatus,
  LogisticsPartnerDto
} from '../types';

const ALL_STATUSES = Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[];

const fieldLabel = 'text-[10px] font-black uppercase tracking-widest text-slate-500';
const sectionHeader = 'text-[11px] font-black uppercase tracking-widest text-[#12335f]';
const inputBase = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30';
const textareaBase = `${inputBase} h-24 py-2`;

interface DeliveryDetailPageProps {
  deliveryId: number;
  onClose?: () => void;
}

export function DeliveryDetailPage({ deliveryId, onClose }: DeliveryDetailPageProps) {
  const { user } = useAuth();
  const detailQuery = useDeliveryDetail(deliveryId);
  const partnersQuery = useLogisticsPartners();

  const delivery = detailQuery.data;
  const partners = partnersQuery.data || [];

  const accessRole = useMemo(() => {
    if (!user || !delivery) return null;
    if (user.role === 'admin') return 'admin';
    if (delivery.purchaseOrder?.sellerId === Number(user.id)) return 'seller';
    if (delivery.purchaseOrder?.buyerId === Number(user.id)) return 'buyer';
    const participant = (delivery.participants || []).find(p => p.userId === Number(user.id) && p.isActive);
    if (participant?.participantRole === 'CONSIGNEE') return 'consignee';
    if (participant?.participantRole === 'LOGISTICS_PARTNER') return 'logistics';
    if (participant?.participantRole === 'FINANCE_OFFICER') return 'finance';
    if (participant?.participantRole === 'DISPUTE_OFFICER') return 'dispute';
    return null;
  }, [user, delivery]);

  if (detailQuery.isLoading && !detailQuery.data) {
    return (
      <div className="space-y-4">
        <CardSkeleton rows={4} />
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (detailQuery.error) {
    return (
      <InlineError
        message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Failed to load delivery'}
        onRetry={() => detailQuery.refetch()}
      />
    );
  }
  if (!delivery) return <EmptyState title="Delivery not found" />;

  const po = delivery.purchaseOrder;
  const docs = delivery.documents || [];
  const isFetching = detailQuery.isFetching;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Delivery Tracking</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 break-words">
            {po?.title || po?.poNumber || `Delivery #${delivery.id}`}
          </h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
            {po?.poNumber} · {po?.seller?.name || 'Seller'} → {po?.buyer?.name || 'Buyer'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose} className="h-10 rounded-lg text-xs font-black uppercase">
              Close
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => detailQuery.refetch()}
            className="h-10 rounded-lg text-xs font-black uppercase"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
          <Info label="Status">
            <DeliveryStatusBadge status={delivery.status} />
          </Info>
          <Info label="Tracking #" value={delivery.trackingNumber || `DLV-${delivery.id}`} />
          <Info label="Carrier" value={delivery.carrierName || delivery.logisticsPartnerName || 'Pending'} />
          <Info label="Expected" value={formatDate(delivery.expectedDelivery || po?.expectedDelivery)} />
          <Info label="Current Location" value={delivery.currentLocation || 'Pending'} />
          <Info label="Address" value={po?.deliveryAddress || 'Address not set'} />
          <Info label="PO Value" value={formatCurrency(po?.amount || po?.totalValue)} />
          <Info label="Settlement" value={delivery.settlement?.status || 'PENDING'} />
        </CardContent>
      </Card>

      {/* Rating CTA - only when delivery is in a rate-able state. */}
      {(accessRole === 'buyer' || accessRole === 'seller') && delivery.purchaseOrderId && (
        <RatingCTACard
          deliveryStatus={delivery.status}
          accessRole={accessRole}
          purchaseOrderId={delivery.purchaseOrderId}
          counterpartyId={
            accessRole === 'buyer'
              ? delivery.purchaseOrder?.sellerId
              : delivery.purchaseOrder?.buyerId
          }
          counterpartyName={
            accessRole === 'buyer'
              ? delivery.purchaseOrder?.seller?.name
              : delivery.purchaseOrder?.buyer?.name
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className={sectionHeader}>Tracking Timeline</h2>
              <DeliveryTimeline status={delivery.status} events={delivery.events} statusLogs={delivery.statusLogs} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className={sectionHeader}>Documents</h2>
                <span className="text-[10px] font-bold uppercase text-slate-400">{docs.length} files</span>
              </div>
              {docs.length === 0 ? (
                <p className="text-xs font-semibold text-slate-500">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-[#12335f] shrink-0" />
                        <div className="min-w-0">
                          <p className="font-black uppercase tracking-wide text-slate-700 truncate">{doc.documentType.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] font-semibold text-slate-500 truncate">{doc.fileAsset?.originalName || `File #${doc.fileAsset?.id}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{doc.uploaderRole}</span>
                        {doc.fileAsset?.id && (
                          <a
                            href={`/api/files/${doc.fileAsset.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {accessRole && accessRole !== 'dispute' && (
                <DocumentUploadForm deliveryId={delivery.id} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {accessRole === 'seller' && (
            <SellerActions delivery={delivery} partners={partners} />
          )}
          {(accessRole === 'logistics' || accessRole === 'admin') && (
            <LogisticsActions delivery={delivery} />
          )}
          {(accessRole === 'buyer' || accessRole === 'consignee') && (
            <BuyerActions delivery={delivery} />
          )}
          {(accessRole === 'finance' || accessRole === 'admin') && (
            <FinanceActions delivery={delivery} />
          )}
          {accessRole === 'admin' && <AdminActions delivery={delivery} />}
          {accessRole && (
            <DisputeActions delivery={delivery} accessRole={accessRole} />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className={fieldLabel}>{label}</p>
      <div className="mt-1 break-words text-xs font-black text-slate-900">{children ?? value ?? '—'}</div>
    </div>
  );
}

/* ================== Rating CTA ================== */

const RATEABLE_STATUSES: DeliveryStatus[] = ['ACCEPTED', 'INVOICE_VERIFIED', 'PAYMENT_APPROVED', 'PAYMENT_RELEASED', 'CLOSED'];

function RatingCTACard({
  deliveryStatus,
  accessRole,
  purchaseOrderId,
  counterpartyId,
  counterpartyName
}: {
  deliveryStatus: DeliveryStatus;
  accessRole: 'buyer' | 'seller';
  purchaseOrderId: number;
  counterpartyId?: number;
  counterpartyName?: string;
}) {
  const myRating = useMyRatingForPO(purchaseOrderId);
  const [open, setOpen] = useState(false);

  const isRateable = RATEABLE_STATUSES.includes(deliveryStatus);
  if (!isRateable) return null;
  if (!counterpartyId) return null;

  const existing = myRating.data?.rating;
  const hasRated = !!existing;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Star className="h-4 w-4 fill-current" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                {hasRated ? 'You rated this transaction' : 'Rate this transaction'}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-700">
                {hasRated
                  ? `Your rating: ${existing?.rating}/5 - feel free to update it.`
                  : `Help others by sharing your experience with ${counterpartyName || 'the counterparty'}.`}
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-amber-600 text-white hover:bg-amber-700">
            {hasRated ? 'Edit rating' : 'Rate now'}
          </Button>
        </CardContent>
      </Card>
      <RatingComposer
        open={open}
        mode={accessRole === 'buyer' ? 'supplier' : 'buyer'}
        subjectId={counterpartyId}
        subjectName={counterpartyName}
        purchaseOrderId={purchaseOrderId}
        existing={existing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/* ================== Role-specific action panels ================== */

function SellerActions({ delivery, partners }: { delivery: DeliveryDetailDto; partners: LogisticsPartnerDto[] }) {
  const [rejectReason, setRejectReason] = useState('');
  const [packForm, setPackForm] = useState({ packageWeightKg: '', packageDimensions: '', packageCount: '' });
  const [dispatchForm, setDispatchForm] = useState({
    trackingNumber: delivery.trackingNumber || '',
    carrierName: delivery.carrierName || '',
    logisticsPartnerId: delivery.logisticsPartnerId ? String(delivery.logisticsPartnerId) : '',
    ewayBillNumber: delivery.ewayBillNumber || '',
    courierReceiptNumber: delivery.courierReceiptNumber || '',
    expectedDelivery: delivery.expectedDelivery ? delivery.expectedDelivery.split('T')[0] : ''
  });

  const acceptMut = useSellerAcceptDelivery(delivery.id);
  const rejectMut = useSellerRejectDelivery(delivery.id);
  const packMut = useMarkDeliveryPacked(delivery.id);
  const dispatchMut = useUpdateDispatchDetails(delivery.id);
  const readyMut = useMarkReadyForPickup(delivery.id);
  const dispatchedMut = useMarkDispatched(delivery.id);

  const accept = () =>
    runWithToast(() => acceptMut.mutateAsync({}), {
      loading: 'Accepting order...',
      success: 'Order accepted',
      error: 'Failed to accept order'
    });

  const reject = () =>
    runWithToast(() => rejectMut.mutateAsync({ reason: rejectReason }), {
      loading: 'Rejecting order...',
      success: 'Order rejected',
      error: 'Failed to reject order'
    }).then(() => setRejectReason(''));

  const submitPack = () =>
    runWithToast(
      () =>
        packMut.mutateAsync({
          packageWeightKg: packForm.packageWeightKg ? Number(packForm.packageWeightKg) : undefined,
          packageDimensions: packForm.packageDimensions || undefined,
          packageCount: packForm.packageCount ? Number(packForm.packageCount) : undefined
        }),
      { loading: 'Marking as packed...', success: 'Order packed', error: 'Failed to mark packed' }
    );

  const submitDispatch = () =>
    runWithToast(
      () =>
        dispatchMut.mutateAsync({
          trackingNumber: dispatchForm.trackingNumber || undefined,
          carrierName: dispatchForm.carrierName || undefined,
          logisticsPartnerId: dispatchForm.logisticsPartnerId ? Number(dispatchForm.logisticsPartnerId) : undefined,
          ewayBillNumber: dispatchForm.ewayBillNumber || undefined,
          courierReceiptNumber: dispatchForm.courierReceiptNumber || undefined,
          expectedDelivery: dispatchForm.expectedDelivery || undefined
        }),
      { loading: 'Saving dispatch details...', success: 'Dispatch details saved', error: 'Failed to save details' }
    );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h2 className={sectionHeader}>Seller Actions</h2>
        {delivery.status === 'CREATED' && (
          <div className="space-y-2">
            <Button
              className="w-full h-10 rounded-lg bg-[#0f5132] text-xs font-black uppercase text-white"
              onClick={accept}
              disabled={acceptMut.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Accept Order
            </Button>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Rejection reason"
              className={textareaBase}
            />
            <Button
              variant="outline"
              className="w-full h-10 rounded-lg border-red-200 text-xs font-black uppercase text-red-700"
              onClick={reject}
              disabled={!rejectReason.trim() || rejectMut.isPending}
            >
              Reject Order
            </Button>
          </div>
        )}

        {(delivery.status === 'SELLER_ACCEPTED' || delivery.status === 'PACKED') && (
          <div className="space-y-2">
            <p className={fieldLabel}>Mark as packed</p>
            <Input placeholder="Weight (kg)" value={packForm.packageWeightKg} onChange={e => setPackForm(s => ({ ...s, packageWeightKg: e.target.value }))} />
            <Input placeholder="Dimensions (LxWxH)" value={packForm.packageDimensions} onChange={e => setPackForm(s => ({ ...s, packageDimensions: e.target.value }))} />
            <Input placeholder="Package count" value={packForm.packageCount} onChange={e => setPackForm(s => ({ ...s, packageCount: e.target.value }))} />
            <Button
              className="w-full h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white"
              onClick={submitPack}
              disabled={packMut.isPending}
            >
              Confirm Packed
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className={fieldLabel}>Dispatch details</p>
          <Input placeholder="Tracking number" value={dispatchForm.trackingNumber} onChange={e => setDispatchForm(s => ({ ...s, trackingNumber: e.target.value }))} />
          <Input placeholder="Carrier name" value={dispatchForm.carrierName} onChange={e => setDispatchForm(s => ({ ...s, carrierName: e.target.value }))} />
          <Select value={dispatchForm.logisticsPartnerId} onChange={e => setDispatchForm(s => ({ ...s, logisticsPartnerId: e.target.value }))}>
            <option value="">Select logistics partner</option>
            {partners.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Input placeholder="E-Way bill" value={dispatchForm.ewayBillNumber} onChange={e => setDispatchForm(s => ({ ...s, ewayBillNumber: e.target.value }))} />
          <Input placeholder="Courier receipt #" value={dispatchForm.courierReceiptNumber} onChange={e => setDispatchForm(s => ({ ...s, courierReceiptNumber: e.target.value }))} />
          <Input type="date" value={dispatchForm.expectedDelivery} onChange={e => setDispatchForm(s => ({ ...s, expectedDelivery: e.target.value }))} />
          <Button
            variant="outline"
            className="w-full h-10 rounded-lg text-xs font-black uppercase"
            onClick={submitDispatch}
            disabled={dispatchMut.isPending}
          >
            Save Dispatch Details
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-lg text-xs font-black uppercase"
            onClick={() =>
              runWithToast(() => readyMut.mutateAsync(undefined), {
                loading: 'Marking ready...',
                success: 'Ready for pickup',
                error: 'Action failed'
              })
            }
            disabled={!['SELLER_ACCEPTED', 'PACKED'].includes(delivery.status) || readyMut.isPending}
          >
            Ready
          </Button>
          <Button
            className="h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white"
            onClick={() =>
              runWithToast(() => dispatchedMut.mutateAsync({}), {
                loading: 'Dispatching...',
                success: 'Dispatched',
                error: 'Action failed'
              })
            }
            disabled={!['PACKED', 'READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'PICKED_UP', 'SELLER_ACCEPTED'].includes(delivery.status) || dispatchedMut.isPending}
          >
            <Truck className="mr-2 h-4 w-4" /> Dispatch
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LogisticsActions({ delivery }: { delivery: DeliveryDetailDto }) {
  const [form, setForm] = useState<{ status: DeliveryStatus | ''; location: string; remarks: string }>({
    status: '',
    location: '',
    remarks: ''
  });
  const updateMut = useLogisticsStatusUpdate(delivery.id);

  const submit = () => {
    if (!form.status) return;
    runWithToast(
      () =>
        updateMut.mutateAsync({
          status: form.status as DeliveryStatus,
          location: form.location || undefined,
          remarks: form.remarks || undefined
        }),
      { loading: 'Updating status...', success: 'Status updated', error: 'Update failed' }
    );
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className={sectionHeader}>Logistics Update</h2>
        <Select value={form.status} onChange={e => setForm(s => ({ ...s, status: e.target.value as DeliveryStatus }))}>
          <option value="">Select status</option>
          {(['PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'DELIVERY_FAILED', 'REATTEMPT_SCHEDULED'] as DeliveryStatus[]).map(s => (
            <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
          ))}
        </Select>
        <Input placeholder="Location" value={form.location} onChange={e => setForm(s => ({ ...s, location: e.target.value }))} />
        <textarea
          className={textareaBase}
          placeholder="Remarks"
          value={form.remarks}
          onChange={e => setForm(s => ({ ...s, remarks: e.target.value }))}
        />
        <Button
          className="w-full h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white"
          disabled={!form.status || updateMut.isPending}
          onClick={submit}
        >
          <ChevronRight className="mr-2 h-4 w-4" /> Update Status
        </Button>
      </CardContent>
    </Card>
  );
}

function BuyerActions({ delivery }: { delivery: DeliveryDetailDto }) {
  const [accept, setAccept] = useState(true);
  const [rejectReason, setRejectReason] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [missingQty, setMissingQty] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnType, setReturnType] = useState<'RETURN' | 'REPLACEMENT' | 'REFUND'>('RETURN');

  const acceptanceMut = useBuyerAcceptance(delivery.id);
  const returnMut = useInitiateReturn(delivery.id);

  const canAcceptStage = ['DELIVERED', 'DELIVERY_CONFIRMATION_PENDING', 'DISPUTE_RESOLVED'].includes(delivery.status);
  const canReturnStage = ['ACCEPTED', 'REJECTED', 'DELIVERED'].includes(delivery.status);

  const submitDecision = () =>
    runWithToast(
      () =>
        acceptanceMut.mutateAsync({
          accepted: accept,
          rejectionReason: accept ? undefined : rejectReason,
          damageNotes: accept ? undefined : damageNotes,
          missingQuantity: missingQty ? Number(missingQty) : undefined
        }),
      {
        loading: 'Submitting decision...',
        success: accept ? 'Delivery accepted' : 'Delivery rejected',
        error: 'Failed to submit decision'
      }
    );

  const submitReturn = () =>
    runWithToast(
      () => returnMut.mutateAsync({ type: returnType, reason: returnReason }),
      { loading: 'Initiating return...', success: 'Return initiated', error: 'Action failed' }
    );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h2 className={sectionHeader}>Receipt &amp; Acceptance</h2>
        {!canAcceptStage && (
          <p className="text-xs font-semibold text-slate-500">
            Acceptance becomes available once the delivery is marked as delivered.
          </p>
        )}
        {canAcceptStage && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button variant={accept ? 'primary' : 'outline'} className="flex-1 h-10 rounded-lg text-xs font-black uppercase" onClick={() => setAccept(true)}>
                Accept
              </Button>
              <Button variant={!accept ? 'primary' : 'outline'} className="flex-1 h-10 rounded-lg text-xs font-black uppercase" onClick={() => setAccept(false)}>
                Reject
              </Button>
            </div>
            {!accept && (
              <>
                <textarea className={textareaBase} placeholder="Rejection reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                <textarea className={textareaBase} placeholder="Damage / wrong item notes (optional)" value={damageNotes} onChange={e => setDamageNotes(e.target.value)} />
                <Input placeholder="Missing quantity" value={missingQty} onChange={e => setMissingQty(e.target.value)} />
              </>
            )}
            <Button
              className="w-full h-10 rounded-lg bg-[#0f5132] text-xs font-black uppercase text-white"
              disabled={(!accept && !rejectReason.trim()) || acceptanceMut.isPending}
              onClick={submitDecision}
            >
              Submit Decision
            </Button>
          </div>
        )}

        {canReturnStage && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className={fieldLabel}>Return / Replacement</p>
            <Select value={returnType} onChange={e => setReturnType(e.target.value as any)}>
              <option value="RETURN">Return</option>
              <option value="REPLACEMENT">Replacement</option>
              <option value="REFUND">Refund</option>
            </Select>
            <textarea className={textareaBase} placeholder="Reason" value={returnReason} onChange={e => setReturnReason(e.target.value)} />
            <Button
              variant="outline"
              className="w-full h-10 rounded-lg text-xs font-black uppercase"
              disabled={!returnReason.trim() || returnMut.isPending}
              onClick={submitReturn}
            >
              Initiate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FinanceActions({ delivery }: { delivery: DeliveryDetailDto }) {
  const invoices = delivery.purchaseOrder?.invoices || [];

  const defaultInvoiceId = useMemo(() => {
    if (invoices.length === 0) return '';
    const ranked = [...invoices].sort((a, b) => {
      const score = (inv: typeof a) => {
        const status = String(inv.invoiceStatus || inv.status || '').toLowerCase();
        if (status === 'approved') return 3;
        if (status === 'submitted') return 2;
        if (status === 'under_review') return 1;
        return 0;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return String(ranked[0].id);
  }, [invoices]);

  const [invoiceId, setInvoiceId] = useState<string>(defaultInvoiceId);
  const [decision, setDecision] = useState({ approve: true, rejectionReason: '', deductionAmount: '', penaltyAmount: '' });
  const [release, setRelease] = useState({ transactionReference: '', netReleasedAmount: '', remarks: '' });

  const verifyMut = useVerifyInvoice(delivery.id);
  const decisionMut = usePaymentDecision(delivery.id);
  const releaseMut = useReleaseDeliveryPayment(delivery.id);

  const selectedInvoice = invoices.find(inv => String(inv.id) === invoiceId);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h2 className={sectionHeader}>Finance / Payment</h2>

        {delivery.status === 'ACCEPTED' && (
          <div className="space-y-2">
            <p className={fieldLabel}>Verify invoice</p>
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-700">
                No invoices submitted yet. The seller must raise an invoice for this PO before payment can be released.
              </div>
            ) : (
              <>
                <Select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
                  {invoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {(inv.invoiceNumber || `Invoice #${inv.id}`)}
                      {inv.amount ? ` · ${formatCurrency(inv.amount)}` : ''}
                      {inv.invoiceStatus || inv.status ? ` · ${(inv.invoiceStatus || inv.status || '').toString().toUpperCase()}` : ''}
                    </option>
                  ))}
                </Select>
                {selectedInvoice && (
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] font-semibold text-slate-600 space-y-1">
                    <Row label="Number" value={selectedInvoice.invoiceNumber || `#${selectedInvoice.id}`} />
                    {selectedInvoice.amount !== undefined && (
                      <Row label="Amount" value={formatCurrency(selectedInvoice.amount)} />
                    )}
                    <Row
                      label="Status"
                      value={(selectedInvoice.invoiceStatus || selectedInvoice.status || 'submitted').toString().toUpperCase()}
                    />
                    {selectedInvoice.invoiceFile?.id && (
                      <a
                        href={`/api/files/${selectedInvoice.invoiceFile.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline"
                      >
                        <FileText className="h-3 w-3" /> Preview invoice
                      </a>
                    )}
                  </div>
                )}
                <Button
                  className="w-full h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white"
                  disabled={!invoiceId || verifyMut.isPending}
                  onClick={() =>
                    runWithToast(() => verifyMut.mutateAsync({ invoiceId: Number(invoiceId) }), {
                      loading: 'Verifying invoice...',
                      success: 'Invoice verified',
                      error: 'Verification failed'
                    })
                  }
                >
                  Mark Invoice Verified
                </Button>
              </>
            )}
          </div>
        )}

        {delivery.status === 'INVOICE_VERIFIED' && (
          <div className="space-y-2">
            <p className={fieldLabel}>Approve / Reject Payment</p>
            <Select value={decision.approve ? 'approve' : 'reject'} onChange={e => setDecision(s => ({ ...s, approve: e.target.value === 'approve' }))}>
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
            </Select>
            <Input placeholder="Deduction amount" value={decision.deductionAmount} onChange={e => setDecision(s => ({ ...s, deductionAmount: e.target.value }))} />
            <Input placeholder="Penalty amount" value={decision.penaltyAmount} onChange={e => setDecision(s => ({ ...s, penaltyAmount: e.target.value }))} />
            {!decision.approve && (
              <textarea className={textareaBase} placeholder="Rejection reason" value={decision.rejectionReason} onChange={e => setDecision(s => ({ ...s, rejectionReason: e.target.value }))} />
            )}
            <Button
              className="w-full h-10 rounded-lg bg-[#0f5132] text-xs font-black uppercase text-white"
              disabled={(!decision.approve && !decision.rejectionReason.trim()) || decisionMut.isPending}
              onClick={() =>
                runWithToast(
                  () =>
                    decisionMut.mutateAsync({
                      approve: decision.approve,
                      rejectionReason: decision.approve ? undefined : decision.rejectionReason,
                      deductionAmount: decision.deductionAmount ? Number(decision.deductionAmount) : undefined,
                      penaltyAmount: decision.penaltyAmount ? Number(decision.penaltyAmount) : undefined
                    }),
                  {
                    loading: decision.approve ? 'Approving payment...' : 'Rejecting payment...',
                    success: decision.approve ? 'Payment approved' : 'Payment rejected',
                    error: 'Decision failed'
                  }
                )
              }
            >
              Submit Decision
            </Button>
          </div>
        )}

        {delivery.status === 'PAYMENT_APPROVED' && (
          <div className="space-y-2">
            <p className={fieldLabel}>Release payment</p>
            <Input placeholder="Transaction reference" value={release.transactionReference} onChange={e => setRelease(s => ({ ...s, transactionReference: e.target.value }))} />
            <Input placeholder="Net released amount" value={release.netReleasedAmount} onChange={e => setRelease(s => ({ ...s, netReleasedAmount: e.target.value }))} />
            <textarea className={textareaBase} placeholder="Remarks" value={release.remarks} onChange={e => setRelease(s => ({ ...s, remarks: e.target.value }))} />
            <Button
              className="w-full h-10 rounded-lg bg-[#0f5132] text-xs font-black uppercase text-white"
              disabled={!release.transactionReference.trim() || releaseMut.isPending}
              onClick={() =>
                runWithToast(
                  () =>
                    releaseMut.mutateAsync({
                      transactionReference: release.transactionReference,
                      netReleasedAmount: release.netReleasedAmount ? Number(release.netReleasedAmount) : undefined,
                      remarks: release.remarks || undefined
                    }),
                  { loading: 'Releasing payment...', success: 'Payment released', error: 'Release failed' }
                )
              }
            >
              Release &amp; Close
            </Button>
          </div>
        )}

        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
          <p className={fieldLabel}>Settlement Snapshot</p>
          <p className="mt-1 text-slate-700 font-bold">Status: {delivery.settlement?.status || 'PENDING'}</p>
          {delivery.settlement?.transactionReference && (
            <p className="text-[10px] text-slate-500 font-semibold">
              Reference: {delivery.settlement.transactionReference}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-black text-slate-900">{value}</span>
    </div>
  );
}

function AdminActions({ delivery }: { delivery: DeliveryDetailDto }) {
  const [override, setOverride] = useState({ status: delivery.status, reason: '', location: '' });
  const overrideMut = useAdminOverride(delivery.id);
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className={sectionHeader}>
          <ShieldAlert className="inline mr-1 h-3.5 w-3.5" /> Admin Override
        </h2>
        <Select value={override.status} onChange={e => setOverride(s => ({ ...s, status: e.target.value as DeliveryStatus }))}>
          {ALL_STATUSES.map(status => (
            <option key={status} value={status}>{DELIVERY_STATUS_LABELS[status]}</option>
          ))}
        </Select>
        <Input placeholder="Location (optional)" value={override.location} onChange={e => setOverride(s => ({ ...s, location: e.target.value }))} />
        <textarea className={textareaBase} placeholder="Reason (required)" value={override.reason} onChange={e => setOverride(s => ({ ...s, reason: e.target.value }))} />
        <Button
          variant="outline"
          className="w-full h-10 rounded-lg border-amber-200 bg-amber-50 text-xs font-black uppercase text-amber-700"
          disabled={!override.reason.trim() || overrideMut.isPending}
          onClick={() =>
            runWithToast(() => overrideMut.mutateAsync(override), {
              loading: 'Applying override...',
              success: 'Status overridden',
              error: 'Override failed'
            })
          }
        >
          Apply Override
        </Button>
      </CardContent>
    </Card>
  );
}

function DisputeActions({ delivery, accessRole }: { delivery: DeliveryDetailDto; accessRole: string }) {
  const [category, setCategory] = useState('Damaged Goods');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');

  const raiseMut = useRaiseDispute(delivery.id);
  const resolveMut = useResolveDispute(delivery.id);

  const canRaise = ['buyer', 'seller', 'consignee'].includes(accessRole) && delivery.status !== 'DISPUTE_RAISED' && delivery.status !== 'CLOSED';
  const canResolve = accessRole === 'admin' && delivery.status === 'DISPUTE_RAISED';

  if (!canRaise && !canResolve) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className={sectionHeader}>
          <AlertTriangle className="inline mr-1 h-3.5 w-3.5" /> Dispute
        </h2>
        {canRaise && (
          <div className="space-y-2">
            <Select value={category} onChange={e => setCategory(e.target.value)}>
              <option>Damaged Goods</option>
              <option>Wrong Item</option>
              <option>Missing Quantity</option>
              <option>Delayed Payment</option>
              <option>Other</option>
            </Select>
            <textarea className={textareaBase} placeholder="Describe the issue" value={reason} onChange={e => setReason(e.target.value)} />
            <Button
              variant="outline"
              className="w-full h-10 rounded-lg border-red-200 text-xs font-black uppercase text-red-700"
              disabled={!reason.trim() || raiseMut.isPending}
              onClick={() =>
                runWithToast(() => raiseMut.mutateAsync({ category, reason }), {
                  loading: 'Raising dispute...',
                  success: 'Dispute raised',
                  error: 'Failed to raise dispute'
                })
              }
            >
              Raise Dispute
            </Button>
          </div>
        )}
        {canResolve && (
          <div className="space-y-2">
            <textarea className={textareaBase} placeholder="Resolution remarks" value={resolution} onChange={e => setResolution(e.target.value)} />
            <Button
              className="w-full h-10 rounded-lg bg-[#0f5132] text-xs font-black uppercase text-white"
              disabled={!resolution.trim() || resolveMut.isPending}
              onClick={() =>
                runWithToast(() => resolveMut.mutateAsync({ resolutionRemarks: resolution }), {
                  loading: 'Resolving dispute...',
                  success: 'Dispute resolved',
                  error: 'Failed to resolve'
                })
              }
            >
              Resolve Dispute
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================== Document upload with drag-drop + progress ================== */

function DocumentUploadForm({ deliveryId }: { deliveryId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DeliveryDocumentType>('OTHER');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const addDocMut = useAddDeliveryDocument(deliveryId);

  const submit = useCallback(async () => {
    if (!file) return;
    setProgress(0);
    const id = notify.loading(`Uploading ${file.name}...`);
    try {
      const asset = await uploadDeliveryFile(file, {
        onProgress: pct => setProgress(pct)
      });
      await addDocMut.mutateAsync({ documentType: docType, fileAssetId: asset.id, description: description || undefined });
      notify.success('Document attached', { description: file.name });
      setFile(null);
      setDescription('');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      notify.dismiss(id);
      setProgress(null);
    }
  }, [file, docType, description, addDocMut]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  };

  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={cn(
        'space-y-2 rounded-lg border border-dashed p-3 transition-colors',
        isDragging ? 'border-[#12335f] bg-[#12335f]/5' : 'border-slate-200'
      )}
    >
      <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <Upload className="h-4 w-4 text-[#12335f]" />
        <span>Drag a file here, or pick one below</span>
      </div>
      <Select value={docType} onChange={e => setDocType(e.target.value as DeliveryDocumentType)}>
        {(['DELIVERY_CHALLAN', 'PACKING_SLIP', 'COURIER_RECEIPT', 'EWAY_BILL', 'PROOF_OF_DISPATCH', 'PROOF_OF_DELIVERY', 'INSPECTION_REPORT', 'REJECTION_REPORT', 'RETURN_DOCUMENT', 'TAX_INVOICE', 'PAYMENT_PROOF', 'OTHER'] as DeliveryDocumentType[]).map(t => (
          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
        ))}
      </Select>
      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-xs" />
      {file && (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold">
          <span className="truncate">{file.name}</span>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setFile(null)} aria-label="Remove">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
      {progress !== null && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-[#12335f] to-sky-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] font-bold text-slate-500">{progress}%</p>
        </div>
      )}
      <Button
        variant="outline"
        className="w-full h-10 rounded-lg text-xs font-black uppercase"
        disabled={!file || progress !== null || addDocMut.isPending}
        onClick={() => void submit()}
      >
        <ClipboardList className="mr-2 h-4 w-4" />
        {progress !== null ? 'Uploading...' : 'Attach to delivery'}
      </Button>
    </div>
  );
}

export default DeliveryDetailPage;
