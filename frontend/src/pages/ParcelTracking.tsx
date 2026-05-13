import { useMemo, useState } from 'react';
import { Card, CardContent, Badge } from '../components/ui/card';
import { Truck, CheckCircle2, Clock, Search, Filter, AlertTriangle, MapPin, PackageCheck, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

type ShipmentStatus = 'Order Confirmed' | 'In Transit' | 'Out for Delivery' | 'Delivered' | 'Delayed';

interface Shipment {
  trackingNumber: string;
  poNumber: string;
  vendorName: string;
  item: string;
  category: string;
  carrier: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  estimatedDelivery: string;
  sla: 'On Time' | 'At Risk' | 'Delayed';
  value: string;
  consignee: string;
  steps: { label: string; date: string; status: 'completed' | 'current' | 'pending' }[];
}

const shipments: Shipment[] = [
  {
    trackingNumber: 'PKG-92837465-IN',
    poNumber: 'PO-2026-0091',
    vendorName: 'Bharat Office Solutions',
    item: 'Ergonomic office chairs',
    category: 'Office Furniture',
    carrier: 'India Post Logistics',
    status: 'Out for Delivery',
    origin: 'Jaipur Warehouse',
    destination: 'Pune Regional Office',
    estimatedDelivery: 'Today, 8 PM',
    sla: 'On Time',
    value: 'Rs. 24,00,000',
    consignee: 'Administration Store',
    steps: [
      { label: 'Order Confirmed', date: '04 May 2026, 10:30 AM', status: 'completed' },
      { label: 'Shipped from Warehouse', date: '05 May 2026, 02:15 PM', status: 'completed' },
      { label: 'Out for Delivery', date: '09 May 2026, 08:00 AM', status: 'current' },
      { label: 'Delivered', date: 'Expected today', status: 'pending' },
    ]
  },
  {
    trackingNumber: 'PKG-77451209-IN',
    poNumber: 'PO-2026-0088',
    vendorName: 'Heritage Furniture Co.',
    item: 'Modular workstations - Phase II',
    category: 'Workspace',
    carrier: 'BlueDart Surface',
    status: 'In Transit',
    origin: 'Mumbai Hub',
    destination: 'Delhi Procurement Store',
    estimatedDelivery: '14 May 2026',
    sla: 'At Risk',
    value: 'Rs. 1,14,00,000',
    consignee: 'Infrastructure Cell',
    steps: [
      { label: 'Order Confirmed', date: '03 May 2026, 11:00 AM', status: 'completed' },
      { label: 'Dispatched', date: '05 May 2026, 06:40 PM', status: 'completed' },
      { label: 'In Transit', date: 'Current location: Nagpur Hub', status: 'current' },
      { label: 'Delivered', date: 'Expected 14 May', status: 'pending' },
    ]
  },
  {
    trackingNumber: 'PKG-55219032-IN',
    poNumber: 'PO-2026-0085',
    vendorName: 'Narmada IT Systems',
    item: 'Network switches and installation support',
    category: 'IT Equipment',
    carrier: 'DHL Government Desk',
    status: 'Delivered',
    origin: 'Bengaluru Facility',
    destination: 'Delhi Data Centre',
    estimatedDelivery: 'Delivered 10 May 2026',
    sla: 'On Time',
    value: 'Rs. 1,80,00,000',
    consignee: 'IT Department',
    steps: [
      { label: 'Order Confirmed', date: '01 May 2026, 09:00 AM', status: 'completed' },
      { label: 'Shipped', date: '02 May 2026, 05:30 PM', status: 'completed' },
      { label: 'Received at Site', date: '10 May 2026, 02:15 PM', status: 'completed' },
      { label: 'Delivered', date: '10 May 2026, 04:00 PM', status: 'completed' },
    ]
  }
];

export default function ParcelTracking() {
  const [selectedShipment, setSelectedShipment] = useState(shipments[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [slaFilter, setSlaFilter] = useState('all');

  const categories = useMemo(() => Array.from(new Set(shipments.map(item => item.category))), []);
  const filteredShipments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return shipments.filter(item => {
      const matchesSearch = !term ||
        item.trackingNumber.toLowerCase().includes(term) ||
        item.poNumber.toLowerCase().includes(term) ||
        item.vendorName.toLowerCase().includes(term) ||
        item.destination.toLowerCase().includes(term);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesSla = slaFilter === 'all' || item.sla === slaFilter;
      return matchesSearch && matchesStatus && matchesCategory && matchesSla;
    });
  }, [categoryFilter, searchTerm, slaFilter, statusFilter]);

  const inTransitCount = shipments.filter(item => ['In Transit', 'Out for Delivery'].includes(item.status)).length;
  const deliveredCount = shipments.filter(item => item.status === 'Delivered').length;
  const riskCount = shipments.filter(item => item.sla !== 'On Time').length;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-50 px-3 py-4 sm:px-4 md:px-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement Logistics</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Shipment Tracking</h1>
            <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
              Monitor PO-linked consignments, delivery SLA, carrier movement, consignee receipt and fulfilment status.
            </p>
          </div>
          <Badge className="w-fit rounded-lg border-blue-100 bg-blue-50 px-3 py-1.5 text-[10px] font-black text-[#12335f]">
            e-Procurement Logistics Desk
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard label="In Movement" value={inTransitCount} hint="Active consignments" icon={Truck} />
          <MetricCard label="Delivered" value={deliveredCount} hint="Receipt completed" icon={PackageCheck} />
          <MetricCard label="SLA Attention" value={riskCount} hint="At risk / delayed" icon={AlertTriangle} />
        </div>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-[#12335f]">
              <Filter className="h-4 w-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Shipment Register Filters</p>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">{filteredShipments.length} records</span>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_160px_auto]">
              <div className="relative">
                <Search className="absolute inset-y-0 left-3 h-full w-4 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search tracking no., PO, vendor, destination..."
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                />
              </div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600">
                <option value="all">All Status</option>
                <option value="Order Confirmed">Order Confirmed</option>
                <option value="In Transit">In Transit</option>
                <option value="Out for Delivery">Out for Delivery</option>
                <option value="Delivered">Delivered</option>
                <option value="Delayed">Delayed</option>
              </select>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600">
                <option value="all">All Categories</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={slaFilter} onChange={(event) => setSlaFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600">
                <option value="all">All SLA</option>
                <option value="On Time">On Time</option>
                <option value="At Risk">At Risk</option>
                <option value="Delayed">Delayed</option>
              </select>
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCategoryFilter('all'); setSlaFilter('all'); }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="p-0">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PO Linked Consignments</p>
              </div>
              <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                {filteredShipments.map((shipment, index) => (
                  <button
                    key={shipment.trackingNumber}
                    type="button"
                    onClick={() => setSelectedShipment(shipment)}
                    className={cn(
                      "w-full p-4 text-left transition-colors hover:bg-slate-50",
                      selectedShipment.trackingNumber === shipment.trackingNumber && "bg-blue-50/70"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-[10px] font-black text-slate-400">{String(index + 1).padStart(2, '0')}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="break-words text-xs font-black text-[#12335f]">{shipment.trackingNumber}</p>
                            <p className="mt-1 break-words text-sm font-black text-slate-900">{shipment.vendorName}</p>
                          </div>
                          <StatusBadge status={shipment.status} />
                        </div>
                        <p className="mt-2 break-words text-[10px] font-semibold text-slate-500">{shipment.item}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          <span>{shipment.poNumber}</span>
                          <span>{shipment.sla}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-xl border-slate-200 shadow-sm">
            <div className="flex flex-col gap-3 bg-[#0f172a] px-5 py-4 text-white md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-blue-300" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest">Live Logistics Tracker</h3>
                  <p className="mt-1 text-[10px] font-semibold text-blue-100">{selectedShipment.poNumber} | {selectedShipment.carrier}</p>
                </div>
              </div>
              <StatusBadge status={selectedShipment.status} dark />
            </div>

            <div className="space-y-5 bg-white p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <InfoBox label="Tracking No." value={selectedShipment.trackingNumber} />
                <InfoBox label="Est. Delivery" value={selectedShipment.estimatedDelivery} />
                <InfoBox label="Consignee" value={selectedShipment.consignee} />
                <InfoBox label="Shipment Value" value={selectedShipment.value} />
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-[#12335f]" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Origin</p>
                    <p className="mt-1 text-xs font-bold text-slate-800">{selectedShipment.origin}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-[#12335f]" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destination</p>
                    <p className="mt-1 text-xs font-bold text-slate-800">{selectedShipment.destination}</p>
                  </div>
                </div>
              </div>

              <div className="relative space-y-6 py-2">
                <div className="absolute bottom-4 left-3 top-4 w-0.5 bg-slate-100" />
                {selectedShipment.steps.map((step) => (
                  <div key={step.label} className="relative flex items-center gap-4">
                    <div className={cn(
                      "z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-sm",
                      step.status === 'completed' ? "bg-slate-500 text-white" :
                      step.status === 'current' ? "bg-[#12335f] text-white ring-4 ring-blue-50" :
                      "border border-slate-200 bg-white text-slate-300"
                    )}>
                      {step.status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                       step.status === 'current' ? <Truck className="h-3.5 w-3.5" /> :
                       <Clock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className={cn("break-words text-[11px] font-black uppercase", step.status === 'pending' ? "text-slate-400" : "text-slate-900")}>{step.label}</p>
                        <p className="break-words text-[10px] font-semibold text-slate-400">{step.date}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
                <InfoBox label="Carrier" value={selectedShipment.carrier} />
                <InfoBox label="Category" value={selectedShipment.category} />
                <InfoBox label="SLA Status" value={selectedShipment.sla} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: number; hint: string; icon: any }) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-black text-slate-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status, dark = false }: { status: ShipmentStatus; dark?: boolean }) {
  return (
    <Badge className={cn(
      "shrink-0 rounded-lg px-3 py-1 text-[9px] font-black uppercase tracking-wide",
      status === 'Delivered' && "border-green-200 bg-green-50 text-green-700",
      status === 'Delayed' && "border-red-200 bg-red-50 text-red-700",
      status === 'Out for Delivery' && "border-teal-200 bg-teal-50 text-teal-700",
      status === 'In Transit' && "border-blue-200 bg-blue-50 text-blue-700",
      status === 'Order Confirmed' && "border-slate-200 bg-slate-50 text-slate-600",
      dark && "border-white/20 bg-white/10 text-white"
    )}>
      {status}
    </Badge>
  );
}
