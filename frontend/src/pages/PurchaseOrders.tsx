import { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  X,
  XCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface PurchaseOrder {
  id: string;
  vendorName: string;
  itemDescription: string;
  category: string;
  value: number;
  expectedDate: string;
  status: 'In transit' | 'Pending approval' | 'Out for delivery' | 'Delivered' | 'Cancelled';
  department: string;
  paymentMode: string;
  consignee: string;
}

const SAMPLE_ORDERS: PurchaseOrder[] = [
  {
    id: 'PO-2026-0091',
    vendorName: 'Bharat Office Solutions',
    itemDescription: 'Supply of 500 ergonomic office chairs',
    category: 'Office Furniture',
    value: 2400000,
    expectedDate: '14 May 2026',
    status: 'In transit',
    department: 'Administration',
    paymentMode: 'PFMS',
    consignee: 'Regional Office, Pune'
  },
  {
    id: 'PO-2026-0089',
    vendorName: 'Green Earth Catering',
    itemDescription: 'Quarterly catering services - HQ campus',
    category: 'Facility Services',
    value: 4200000,
    expectedDate: '11 May 2026',
    status: 'Pending approval',
    department: 'General Services',
    paymentMode: 'Treasury',
    consignee: 'Head Office Campus'
  },
  {
    id: 'PO-2026-0088',
    vendorName: 'Heritage Furniture Co.',
    itemDescription: 'Modular workstations - Phase II',
    category: 'Workspace',
    value: 11400000,
    expectedDate: '5 May 2026',
    status: 'Out for delivery',
    department: 'Infrastructure',
    paymentMode: 'PFMS',
    consignee: 'Procurement Store, Mumbai'
  },
  {
    id: 'PO-2026-0085',
    vendorName: 'Narmada IT Systems',
    itemDescription: 'Network switches and installation support',
    category: 'IT Equipment',
    value: 18000000,
    expectedDate: '1 May 2026',
    status: 'Delivered',
    department: 'Information Technology',
    paymentMode: 'PFMS',
    consignee: 'Data Centre, Delhi'
  }
];

const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0
}).format(value);

const openStatuses = ['In transit', 'Pending approval', 'Out for delivery'];

export default function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>(SAMPLE_ORDERS);
  const [activeTab, setActiveTab] = useState<'Open' | 'Delivered' | 'Cancelled' | 'All'>('Open');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [trackingOrder, setTrackingOrder] = useState<PurchaseOrder | null>(null);

  const categories = useMemo(() => Array.from(new Set(orders.map(order => order.category))), [orders]);
  const paymentModes = useMemo(() => Array.from(new Set(orders.map(order => order.paymentMode))), [orders]);

  const toggleSort = (key: string) => {
    const directionMap: Record<string, string> = {
      id: 'newest',
      vendor: 'vendor',
      value: sortBy === 'value_high' ? 'value_low' : 'value_high',
      expected: 'expected',
      status: 'status',
      department: 'department'
    };
    setSortBy(directionMap[key] || 'newest');
  };

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: string; className?: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-[#12335f]", className)}
    >
      {label}
      <span className="text-[9px] text-slate-400">SORT</span>
    </button>
  );

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter(order => {
      const matchesTab =
        activeTab === 'All' ||
        (activeTab === 'Open' && openStatuses.includes(order.status)) ||
        order.status === activeTab;
      const matchesSearch = !term ||
        order.id.toLowerCase().includes(term) ||
        order.vendorName.toLowerCase().includes(term) ||
        order.itemDescription.toLowerCase().includes(term) ||
        order.department.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || order.category === categoryFilter;
      const matchesPayment = paymentFilter === 'all' || order.paymentMode === paymentFilter;
      return matchesTab && matchesSearch && matchesCategory && matchesPayment;
    }).sort((a, b) => {
      if (sortBy === 'value_high') return b.value - a.value;
      if (sortBy === 'value_low') return a.value - b.value;
      if (sortBy === 'vendor') return a.vendorName.localeCompare(b.vendorName);
      if (sortBy === 'department') return a.department.localeCompare(b.department);
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      if (sortBy === 'expected') return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime();
      return b.id.localeCompare(a.id);
    });
  }, [activeTab, categoryFilter, orders, paymentFilter, searchTerm, sortBy]);

  const openCount = orders.filter(order => openStatuses.includes(order.status)).length;
  const deliveredCount = orders.filter(order => order.status === 'Delivered').length;
  const pendingCount = orders.filter(order => order.status === 'Pending approval').length;
  const totalSpend = orders.filter(order => order.status !== 'Cancelled').reduce((sum, order) => sum + order.value, 0);

  const handleApprove = (id: string) => {
    setOrders(current => current.map(order => order.id === id ? { ...order, status: 'In transit' } : order));
    toast.success(`${id} approved and released for fulfilment.`);
  };

  const handleCancel = (id: string) => {
    setOrders(current => current.map(order => order.id === id ? { ...order, status: 'Cancelled' } : order));
    toast.success(`${id} cancelled.`);
  };

  const handleDownloadPDF = (order: PurchaseOrder) => {
    const doc = new jsPDF();
    doc.setFillColor(18, 51, 95);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('PURCHASE ORDER', 14, 18);
    doc.setFontSize(10);
    doc.text(order.id, 165, 18);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.text(`Vendor: ${order.vendorName}`, 14, 45);
    doc.text(`Department: ${order.department}`, 14, 53);
    doc.text(`Consignee: ${order.consignee}`, 14, 61);
    doc.text(`Expected Delivery: ${order.expectedDate}`, 120, 45);
    doc.text(`Payment Mode: ${order.paymentMode}`, 120, 53);
    doc.text(`Status: ${order.status}`, 120, 61);

    autoTable(doc, {
      startY: 75,
      head: [['Sr. No.', 'Description', 'Category', 'Value']],
      body: [[1, order.itemDescription, order.category, formatCurrency(order.value)]],
      foot: [['', '', 'Grand Total', formatCurrency(order.value)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [18, 51, 95] },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] }
    });

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('System generated document for MSME Portal procurement workflow.', 14, 285);
    doc.save(`${order.id}.pdf`);
    toast.success(`Downloaded ${order.id}.pdf`);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setPaymentFilter('all');
    setSortBy('newest');
    setActiveTab('Open');
  };

  const stats = [
    { label: 'Open POs', value: openCount, hint: `${pendingCount} awaiting approval`, icon: Clock, tab: 'Open' as const },
    { label: 'Delivered', value: deliveredCount, hint: 'Completed fulfilment', icon: CheckCircle2, tab: 'Delivered' as const },
    { label: 'Total Spend', value: formatCurrency(totalSpend), hint: 'Excluding cancelled POs', icon: ArrowUpRight, tab: 'All' as const },
  ];

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-50 px-3 py-4 text-slate-900 sm:px-4 md:px-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
          
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Purchase Orders</h1>
            <p className="max-w-2xl text-xs font-semibold text-slate-500">
              Monitor approved quotations, PO release, delivery status, and procurement spend from one compact register.
            </p>
          </div>
        
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {stats.map((stat) => (
            <button key={stat.label} type="button" onClick={() => setActiveTab(stat.tab)} className="text-left">
              <Card className={cn(
                "rounded-xl border-slate-200 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                activeTab === stat.tab && "border-[#12335f] ring-1 ring-[#12335f]/10"
              )}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{stat.value}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{stat.hint}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
                    <stat.icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-[#12335f]">
              <Filter className="h-4 w-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">PO Register Filters</p>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">{filteredOrders.length} records</span>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_160px_160px_auto]">
              <div className="relative">
                <Search className="absolute inset-y-0 left-3 h-full w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search PO, vendor, item, department..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none transition-all focus:ring-2 focus:ring-[#12335f]/20"
                />
              </div>
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none">
                <option value="all">All Categories</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none">
                <option value="all">All Payments</option>
                {paymentModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none">
                <option value="newest">Newest PO</option>
                <option value="value_high">Value High</option>
                <option value="value_low">Value Low</option>
                <option value="vendor">Vendor A-Z</option>
              </select>
              <Button variant="outline" onClick={resetFilters} className="h-10 rounded-lg border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-600">
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Reset
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {(['Open', 'Delivered', 'Cancelled', 'All'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-[10px] font-black uppercase tracking-wide transition-all",
                    activeTab === tab ? "bg-[#12335f] text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="w-full overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[13%]" />
                <col className="w-[22%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-[#f8fafc]">
                  <th className="break-words px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:px-4">Sr. No.</th>
                  <th className="break-words px-3 py-3 sm:px-4"><SortHeader label="PO No." sortKey="id" /></th>
                  <th className="break-words px-3 py-3 sm:px-4"><SortHeader label="Vendor / Item" sortKey="vendor" /></th>
                  <th className="break-words px-3 py-3 sm:px-4"><SortHeader label="Department" sortKey="department" /></th>
                  <th className="break-words px-3 py-3 sm:px-4"><SortHeader label="Value" sortKey="value" /></th>
                  <th className="break-words px-3 py-3 sm:px-4"><SortHeader label="Expected" sortKey="expected" /></th>
                  <th className="break-words px-3 py-3 text-center sm:px-4"><SortHeader label="Status" sortKey="status" /></th>
                  <th className="break-words px-3 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400 sm:px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
                      No purchase orders match the selected filters.
                    </td>
                  </tr>
                ) : filteredOrders.map((order, index) => (
                  <tr key={order.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="break-words px-3 py-4 font-mono text-xs font-black text-slate-400 sm:px-4">{String(index + 1).padStart(2, '0')}</td>
                    <td className="break-words px-3 py-4 font-mono text-[11px] font-bold text-[#12335f] sm:px-4">{order.id}</td>
                    <td className="min-w-0 px-3 py-4 sm:px-4">
                      <p className="break-words text-sm font-black leading-snug text-slate-900">{order.vendorName}</p>
                      <p className="mt-1 break-words text-[10px] font-semibold leading-snug text-slate-500">{order.itemDescription}</p>
                      <p className="mt-1 break-words text-[9px] font-black uppercase tracking-wide text-slate-400">{order.category}</p>
                    </td>
                    <td className="min-w-0 px-3 py-4 sm:px-4">
                      <p className="break-words text-xs font-bold leading-snug text-slate-700">{order.department}</p>
                      <p className="mt-1 break-words text-[10px] font-bold uppercase tracking-wide text-slate-400">{order.paymentMode}</p>
                    </td>
                    <td className="break-words px-3 py-4 text-xs font-black leading-snug text-slate-900 sm:px-4">{formatCurrency(order.value)}</td>
                    <td className="break-words px-3 py-4 text-xs font-bold leading-snug text-slate-500 sm:px-4">{order.expectedDate}</td>
                    <td className="px-3 py-4 text-center sm:px-4">
                      <StatusPill status={order.status} />
                    </td>
                    <td className="px-3 py-4 sm:px-4">
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                        {order.status === 'Pending approval' && (
                          <Button onClick={() => handleApprove(order.id)} className="h-auto min-h-8 whitespace-normal rounded-lg bg-[#008080] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-[#006b6b]">
                            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                            Approve
                          </Button>
                        )}
                        {order.status !== 'Pending approval' && order.status !== 'Cancelled' && (
                          <Button variant="outline" onClick={() => setTrackingOrder(order)} className="h-auto min-h-8 whitespace-normal rounded-lg border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600">
                            <Truck className="mr-1.5 h-3.5 w-3.5" />
                            Track
                            <ChevronRight className="ml-1 h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => handleDownloadPDF(order)} className="h-auto min-h-8 whitespace-normal rounded-lg border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600">
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          PDF
                        </Button>
                        {order.status !== 'Cancelled' && order.status !== 'Delivered' && (
                          <Button variant="outline" onClick={() => handleCancel(order.id)} className="h-auto min-h-8 whitespace-normal rounded-lg border-red-100 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-red-600 hover:bg-red-50">
                            <XCircle className="mr-1.5 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {trackingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-[#12335f] px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Fulfilment Tracking</p>
                <h2 className="text-base font-black">{trackingOrder.id}</h2>
              </div>
              <button onClick={() => setTrackingOrder(null)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-900">{trackingOrder.vendorName}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{trackingOrder.itemDescription}</p>
                <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-[#12335f]">Consignee: {trackingOrder.consignee}</p>
              </div>
              <div className="space-y-3">
                {['PO issued', 'Vendor acknowledged', trackingOrder.status === 'Delivered' ? 'Delivered' : trackingOrder.status, `Expected: ${trackingOrder.expectedDate}`].map((step, index) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className={cn("flex h-8 w-8 items-center justify-center rounded-full border text-[10px] font-black", index < 3 ? "border-[#12335f] bg-[#12335f] text-white" : "border-slate-200 bg-white text-slate-400")}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800">{step}</p>
                      <p className="text-[10px] font-semibold text-slate-400">Procurement fulfilment log</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: PurchaseOrder['status'] }) {
  return (
    <span className={cn(
      "inline-flex rounded-lg border px-3 py-1 text-[10px] font-black uppercase tracking-wide",
      status === 'Delivered' && "border-green-200 bg-green-50 text-green-700",
      status === 'Cancelled' && "border-red-200 bg-red-50 text-red-700",
      status === 'Pending approval' && "border-amber-200 bg-amber-50 text-amber-700",
      (status === 'In transit' || status === 'Out for delivery') && "border-teal-200 bg-teal-50 text-teal-700"
    )}>
      {status}
    </span>
  );
}
