import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Filter, MapPin, PackageCheck, RefreshCw, Search, Truck } from 'lucide-react';
import { Badge, Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { EmptyState, ErrorState, LoadingState } from '../features/shared/FeatureStates';
import { formatCurrency, formatDate } from '../features/shared/format';
import { useFeatureQuery } from '../features/shared/hooks';
import type { DeliveryTrackingDto, PurchaseOrderDto } from '../features/shared/types';

const deliveryFromPO = (order: PurchaseOrderDto): DeliveryTrackingDto | null => {
  const delivery = order.deliveryTrackings?.[0];
  if (!delivery) return null;
  return { ...delivery, purchaseOrder: order };
};

export default function ParcelTracking() {
  const { data: orders, loading, error, reload } = useFeatureQuery<PurchaseOrderDto[]>('/api/purchase-orders', []);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const deliveries = useMemo(() => orders.map(deliveryFromPO).filter(Boolean) as DeliveryTrackingDto[], [orders]);
  const filteredDeliveries = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return deliveries.filter(item => {
      const haystack = [
        item.trackingNumber,
        item.carrierName,
        item.status,
        item.currentLocation,
        item.purchaseOrder?.poNumber,
        item.purchaseOrder?.title,
        item.purchaseOrder?.seller?.name
      ].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (statusFilter === 'all' || item.status === statusFilter);
    });
  }, [deliveries, searchTerm, statusFilter]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = filteredDeliveries.find(item => item.id === selectedId) || filteredDeliveries[0];
  const statuses = useMemo(() => Array.from(new Set(deliveries.map(item => item.status).filter(Boolean))), [deliveries]);
  const inTransitCount = deliveries.filter(item => ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(String(item.status))).length;
  const deliveredCount = deliveries.filter(item => item.status === 'DELIVERED').length;
  const riskCount = deliveries.filter(item => ['DELAYED', 'RETURNED', 'CANCELLED'].includes(String(item.status))).length;

  if (loading) return <LoadingState label="Loading delivery tracking..." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement Logistics</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Shipment Tracking</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">Live PO-linked consignments from delivery tracking APIs.</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="In Movement" value={inTransitCount} hint="Active consignments" icon={Truck} />
        <MetricCard label="Delivered" value={deliveredCount} hint="Receipt completed" icon={PackageCheck} />
        <MetricCard label="SLA Attention" value={riskCount} hint="Delayed / returned / cancelled" icon={AlertTriangle} />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-[#12335f]">
            <Filter className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-widest">Shipment Filters</p>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">{filteredDeliveries.length} records</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
            <div className="relative">
              <Search className="absolute inset-y-0 left-3 h-full w-4 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search tracking no., PO, vendor, location..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </div>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold">
              <option value="all">All Status</option>
              {statuses.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Reset</Button>
          </div>
        </CardContent>
      </Card>

      {filteredDeliveries.length === 0 ? <EmptyState title="No delivery records" description="Delivery tracking records appear after seller shipment creation." /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-slate-100 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PO Linked Consignments</p></div>
              <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                {filteredDeliveries.map((shipment, index) => (
                  <button key={shipment.id} type="button" onClick={() => setSelectedId(shipment.id)} className={cn('w-full p-4 text-left hover:bg-slate-50', selected?.id === shipment.id && 'bg-blue-50/70')}>
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-[10px] font-black text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="break-words text-xs font-black text-[#12335f]">{shipment.trackingNumber || `DLV-${shipment.id}`}</p>
                            <p className="mt-1 break-words text-sm font-black text-slate-900">{shipment.purchaseOrder?.title || shipment.purchaseOrder?.poNumber}</p>
                          </div>
                          <StatusBadge status={shipment.status} />
                        </div>
                        <p className="mt-2 text-[10px] font-semibold text-slate-500">{shipment.carrierName || 'Carrier not assigned'} | {shipment.currentLocation || 'Location pending'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {selected && (
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-3 bg-[#0f172a] px-5 py-4 text-white md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-blue-300" />
                  <div><h3 className="text-xs font-black uppercase tracking-widest">Logistics Tracker</h3><p className="mt-1 text-[10px] font-semibold text-blue-100">{selected.purchaseOrder?.poNumber} | {selected.carrierName || 'Carrier pending'}</p></div>
                </div>
                <StatusBadge status={selected.status} dark />
              </div>
              <div className="space-y-5 bg-white p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <InfoBox label="Tracking No." value={selected.trackingNumber || `DLV-${selected.id}`} />
                  <InfoBox label="Expected" value={formatDate(selected.expectedDelivery || selected.purchaseOrder?.expectedDelivery)} />
                  <InfoBox label="Current Location" value={selected.currentLocation || 'Pending'} />
                  <InfoBox label="PO Value" value={formatCurrency(selected.purchaseOrder?.amount || selected.purchaseOrder?.totalValue)} />
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 text-[#12335f]" />
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Delivery Address</p><p className="mt-1 text-xs font-bold text-slate-800">{selected.purchaseOrder?.deliveryAddress || 'Address not set'}</p></div>
                  </div>
                </div>
                <div className="relative space-y-6 py-2">
                  <div className="absolute bottom-4 left-3 top-4 w-0.5 bg-slate-100" />
                  {(selected.events?.length ? selected.events : [{ id: 0, status: selected.status, location: selected.currentLocation, createdAt: selected.expectedDelivery }]).map(event => (
                    <div key={event.id} className="relative flex items-center gap-4">
                      <div className="z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#12335f] text-white shadow-sm">
                        {event.status === 'DELIVERED' ? <CheckCircle2 className="h-3.5 w-3.5" /> : event.status ? <Truck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1"><p className="break-words text-[11px] font-black uppercase text-slate-900">{event.status || 'Tracking created'}</p><p className="text-[10px] font-semibold text-slate-400">{event.location || event.remarks || formatDate(event.createdAt)}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: number; hint: string; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{hint}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-black text-slate-900">{value}</p></div>;
}

function StatusBadge({ status, dark = false }: { status?: string; dark?: boolean }) {
  const value = String(status || 'CREATED');
  return <Badge className={cn('shrink-0 rounded-lg px-3 py-1 text-[9px] font-black uppercase tracking-wide', value === 'DELIVERED' && 'border-green-200 bg-green-50 text-green-700', value === 'DELAYED' && 'border-red-200 bg-red-50 text-red-700', ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(value) && 'border-blue-200 bg-blue-50 text-blue-700', !dark && !['DELIVERED', 'DELAYED', 'DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(value) && 'border-slate-200 bg-slate-50 text-slate-600', dark && 'border-white/20 bg-white/10 text-white')}>{value.replace(/_/g, ' ')}</Badge>;
}
