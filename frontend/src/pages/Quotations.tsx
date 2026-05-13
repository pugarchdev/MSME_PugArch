import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Search,
  Send,
  Trophy,
  XCircle,
  LayoutGrid,
  List,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';
import { cn } from '../lib/utils';

type BidStatus = 'pending' | 'accepted' | 'rejected';

interface Quotation {
  id: number;
  sellerId: number;
  tenderId: number;
  unitPrice: number;
  quantity: number;
  deliveryDays: number;
  warranty?: string;
  validTill?: string;
  status: BidStatus;
  note?: string;
  isLowest?: boolean;
  tender?: {
    id?: number;
    tenderId?: string;
    title?: string;
    category?: string;
    budget?: number;
    status?: string;
    closesAt?: string;
  };
  seller?: {
    name: string;
    sellerProfile?: {
      businessName?: string;
      offices?: Array<{ city?: string; state?: string }>;
    };
  };
}

const statusStyles: Record<BidStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-red-200 bg-red-50 text-red-800'
};

const statusIcons: Record<BidStatus, React.ElementType> = {
  pending: Clock,
  accepted: CheckCircle2,
  rejected: XCircle
};

const formatMoney = (value?: number) => `Rs. ${Number(value || 0).toLocaleString('en-IN')}`;

export default function Quotations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedSellerBids = user?.role === 'seller' ? api.peek('/api/bids/my', authOptions) : null;
  const cachedBuyerTenders = user?.role === 'buyer' ? api.peek('/api/tenders', authOptions) : null;

  const [quotes, setQuotes] = useState<Quotation[]>(cachedSellerBids || []);
  const [tenders, setTenders] = useState<any[]>(cachedBuyerTenders || []);
  const [loading, setLoading] = useState(!(cachedSellerBids || cachedBuyerTenders));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BidStatus>('all');
  const [selectedTenderId, setSelectedTenderId] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    if (user?.role === 'seller') fetchMyBids();
    if (user?.role === 'buyer') fetchMyTenders();
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'buyer' && tenders.length > 0) fetchBuyerBids();
  }, [user?.role, tenders.length, selectedTenderId]);

  const fetchMyTenders = async () => {
    if (tenders.length === 0) setLoading(true);
    try {
      const res = await api.get('/api/tenders', authOptions);
      if (!res.ok) throw new Error('Failed to load tenders');
      const data = await res.json();
      setTenders(data || []);
      if ((data || []).length === 0) setQuotes([]);
    } catch {
      toast.error('Failed to load your tenders');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyBids = async () => {
    if (quotes.length === 0) setLoading(true);
    try {
      const res = await api.get('/api/bids/my', authOptions);
      if (!res.ok) throw new Error('Failed to load bids');
      const data = await res.json();
      setQuotes(data || []);
    } catch {
      toast.error('Failed to load your bids');
    } finally {
      setLoading(false);
    }
  };

  const fetchBuyerBids = async () => {
    if (quotes.length === 0) setLoading(true);
    try {
      const tenderIds = selectedTenderId === 'all'
        ? tenders.map(tender => tender.id)
        : [Number(selectedTenderId)];
      let allBids: Quotation[] = [];

      for (const tenderId of tenderIds) {
        const res = await api.get(`/api/tenders/${tenderId}/bids`, authOptions);
        if (!res.ok) continue;
        const data = await res.json();
        const tender = tenders.find(item => item.id === tenderId);
        const prices = (data || []).map((bid: Quotation) => Number(bid.unitPrice || 0)).filter(Boolean);
        const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
        allBids = [
          ...allBids,
          ...(data || []).map((bid: Quotation) => ({
            ...bid,
            tender,
            isLowest: lowestPrice !== null && Number(bid.unitPrice) === lowestPrice && data.length > 1
          }))
        ];
      }
      setQuotes(allBids);
    } catch {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (id: number, status: BidStatus) => {
    try {
      const res = await api.post(`/api/bids/${id}/status`, { status }, authOptions);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Update failed');
      }
      toast.success(`Quotation ${status === 'accepted' ? 'accepted' : 'rejected'} successfully`);
      fetchBuyerBids();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    }
  };

  const filteredQuotes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return quotes.filter((quote) => {
      const tenderText = `${quote.tender?.tenderId || ''} ${quote.tender?.title || ''} ${quote.tender?.category || ''}`.toLowerCase();
      const sellerText = `${quote.seller?.name || ''} ${quote.seller?.sellerProfile?.businessName || ''}`.toLowerCase();
      const matchesSearch = !query || tenderText.includes(query) || sellerText.includes(query);
      const matchesStatus = statusFilter === 'all' || quote.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [quotes, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    const total = quotes.length;
    const pending = quotes.filter(quote => quote.status === 'pending').length;
    const accepted = quotes.filter(quote => quote.status === 'accepted').length;
    const rejected = quotes.filter(quote => quote.status === 'rejected').length;
    const totalValue = quotes.reduce((sum, quote) => sum + Number(quote.unitPrice || 0) * Number(quote.quantity || 0), 0);
    return { total, pending, accepted, rejected, totalValue };
  }, [quotes]);

  return (
    <div className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 sm:px-5 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {user?.role === 'buyer' ? 'Bid Evaluation' : 'Market Participation'}
            </p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#071632] md:text-3xl">
              {user?.role === 'buyer' ? 'Quotations' : 'My Bids'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">
              {user?.role === 'buyer'
                ? 'Review submitted quotations, compare pricing, and record procurement decisions.'
                : 'Track the status and performance of your submitted tender quotations.'}
            </p>
          </div>

          <Button
            onClick={() => navigate(user?.role === 'seller' ? '/seller/tenders' : '/buyer/tenders')}
            className="h-10 rounded-md bg-[#12335f] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]"
          >
            <Send className="mr-2 h-4 w-4" />
            {user?.role === 'seller' ? 'Find Tenders' : 'View Tenders'}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile label={user?.role === 'buyer' ? 'Total Quotations' : 'Submitted Bids'} value={stats.total} icon={ClipboardCheck} />
          <SummaryTile label="Pending Review" value={stats.pending} icon={Clock} tone="amber" />
          <SummaryTile label="Accepted" value={stats.accepted} icon={CheckCircle2} tone="green" />
          <SummaryTile label={user?.role === 'buyer' ? 'Quoted Value' : 'Bid Value'} value={formatMoney(stats.totalValue)} icon={FileText} />
        </div>

        <Card className="rounded-lg border border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={user?.role === 'buyer' ? 'Search by seller, tender ID, or category' : 'Search by tender ID, title, or category'}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-[#12335f]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {user?.role === 'buyer' && (
                  <select
                    value={selectedTenderId}
                    onChange={(event) => setSelectedTenderId(event.target.value)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:ring-2 focus:ring-[#12335f]"
                  >
                    <option value="all">All tenders</option>
                    {tenders.map(tender => (
                      <option key={tender.id} value={tender.id}>{tender.tenderId} - {tender.title}</option>
                    ))}
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as 'all' | BidStatus)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:ring-2 focus:ring-[#12335f]"
                >
                  <option value="all">All status</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>

                <div className="h-10 w-px bg-slate-200 mx-1 hidden md:block" />

                <div className="flex items-center gap-1 rounded-lg bg-[#f1f3f4] p-1 border border-[#dadce0] h-10">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      "flex h-8 w-9 items-center justify-center rounded transition-all",
                      viewMode === 'grid' ? "bg-white shadow-sm border border-[#dadce0] text-[#12335f]" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      "flex h-8 w-9 items-center justify-center rounded transition-all",
                      viewMode === 'list' ? "bg-white shadow-sm border border-[#dadce0] text-[#12335f]" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && quotes.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-slate-200 bg-white">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#12335f] border-t-transparent" />
              <p className="text-sm font-semibold text-slate-600">Loading bid records...</p>
            </div>
          </div>
        ) : filteredQuotes.length === 0 ? (
          <EmptyState
            role={user?.role}
            hasQuotes={quotes.length > 0}
            onPrimary={() => navigate(user?.role === 'seller' ? '/seller/tenders' : '/buyer/tenders')}
          />
        ) : viewMode === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-12">Sr.No</th>
                    <th className="px-4 py-3 w-24">Bid ID</th>
                    <th className="px-4 py-3">Tender</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Net Value</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    {user?.role === 'buyer' && <th className="px-4 py-3 text-right">Manage</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredQuotes.map((quote, index) => {
                    const StatusIcon = statusIcons[quote.status] || Clock;
                    const totalValue = Number(quote.unitPrice || 0) * Number(quote.quantity || 0);
                    return (
                      <tr key={quote.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-4 font-black text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-4 font-mono font-bold text-[#12335f]">
                          BID-{String(quote.id).padStart(4, '0')}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-800 line-clamp-1">{quote.tender?.title || '-'}</div>
                          <div className="text-[10px] font-medium text-slate-500">{quote.tender?.tenderId} | {quote.tender?.category}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-700">{quote.seller?.sellerProfile?.businessName || quote.seller?.name || '-'}</div>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-600">{formatMoney(quote.unitPrice)}</td>
                        <td className="px-4 py-4 text-center font-medium">{quote.quantity}</td>
                        <td className="px-4 py-4 text-right font-black text-[#12335f]">
                          <div className="flex items-center justify-end gap-1">
                            {quote.isLowest && <Trophy className="h-3 w-3 text-amber-500" />}
                            {formatMoney(totalValue)}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase border shadow-sm', statusStyles[quote.status])}>
                            {quote.status}
                          </span>
                        </td>
                        {user?.role === 'buyer' && (
                          <td className="px-4 py-4 text-right">
                            {quote.status === 'pending' ? (
                              <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleStatusUpdate(quote.id, 'rejected')} className="h-7 w-7 rounded border border-red-200 bg-white flex items-center justify-center text-red-600 hover:bg-red-50">
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleStatusUpdate(quote.id, 'accepted')} className="h-7 w-7 rounded border border-emerald-200 bg-white flex items-center justify-center text-emerald-600 hover:bg-emerald-50">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="text-[10px] font-bold text-slate-400">-</div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {filteredQuotes.map((quote, index) => (
              <React.Fragment key={quote.id}>
                <QuotationCard
                  quote={quote}
                  role={user?.role}
                  index={index}
                  onAccept={() => handleStatusUpdate(quote.id, 'accepted')}
                  onReject={() => handleStatusUpdate(quote.id, 'rejected')}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = 'blue'
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone?: 'blue' | 'amber' | 'green';
}) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-blue-50 text-[#12335f]';

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-0.5 text-lg font-black text-slate-900 tracking-tight">{value}</p>
        </div>
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-md shrink-0', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function QuotationCard({
  quote,
  role,
  index,
  onAccept,
  onReject
}: {
  quote: Quotation;
  role?: string;
  index: number;
  onAccept: () => void;
  onReject: () => void;
}) {
  const StatusIcon = statusIcons[quote.status] || Clock;
  const sellerName = quote.seller?.sellerProfile?.businessName || quote.seller?.name || 'Submitted Bid';
  const totalValue = Number(quote.unitPrice || 0) * Number(quote.quantity || 0);

  return (
    <Card className={cn(
      'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:shadow-md relative',
      quote.status === 'accepted' && 'border-emerald-300'
    )}>
      <CardContent className="p-0">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black text-[#12335f] bg-slate-200/70 px-1.5 py-0.5 rounded min-w-[20px] text-center">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className="font-mono text-[11px] font-bold uppercase text-slate-500">
                  BID-{String(quote.id).padStart(4, '0')}
                </p>
                {quote.isLowest && (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    <Trophy className="h-3 w-3" />
                    Lowest
                  </span>
                )}
              </div>
              <h3 className="mt-2 truncate text-base font-extrabold text-[#071632]">
                {role === 'buyer' ? sellerName : quote.tender?.title || 'Tender Quotation'}
              </h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {quote.tender?.tenderId || `Tender #${quote.tenderId}`} | {quote.tender?.category || 'General Procurement'}
              </p>
            </div>
            <span className={cn('inline-flex shrink-0 items-center gap-1 rounded border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide', statusStyles[quote.status])}>
              <StatusIcon className="h-3.5 w-3.5" />
              {quote.status}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <InfoBox label="Unit Price" value={formatMoney(quote.unitPrice)} />
            <InfoBox label="Quantity" value={quote.quantity || 0} />
            <InfoBox label="Total Value" value={formatMoney(totalValue)} strong />
            <InfoBox label="Delivery" value={`${quote.deliveryDays || 0} days`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBox label="Warranty" value={quote.warranty || 'Not Provided'} />
            <InfoBox label="Valid Till" value={quote.validTill ? new Date(quote.validTill).toLocaleDateString() : 'Not Provided'} />
          </div>

          {quote.note && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Seller Note</p>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">{quote.note}</p>
            </div>
          )}

          {role === 'buyer' ? (
            quote.status === 'pending' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" onClick={onReject} className="h-10 rounded-md border-red-200 font-bold text-red-700 hover:bg-red-50">
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
                <Button onClick={onAccept} className="h-10 rounded-md bg-[#12335f] font-bold text-white hover:bg-[#0b2445]">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Accept
                </Button>
              </div>
            ) : (
              <div className={cn('flex h-10 items-center justify-center rounded-md border text-sm font-bold', statusStyles[quote.status])}>
                <StatusIcon className="mr-2 h-4 w-4" />
                {quote.status === 'accepted' ? 'Quotation Accepted' : 'Quotation Rejected'}
              </div>
            )
          ) : (
            <div className={cn('flex h-10 items-center justify-center rounded-md border text-sm font-bold', statusStyles[quote.status])}>
              <StatusIcon className="mr-2 h-4 w-4" />
              {quote.status === 'pending' ? 'Pending buyer review' : quote.status === 'accepted' ? 'Accepted by buyer' : 'Not selected'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoBox({ label, value, strong = false }: { label: string; value: string | number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cn('mt-1 break-words text-sm font-bold text-slate-800', strong && 'text-[#12335f]')}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  role,
  hasQuotes,
  onPrimary
}: {
  role?: string;
  hasQuotes: boolean;
  onPrimary: () => void;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-blue-50 text-[#12335f]">
        {hasQuotes ? <Search className="h-7 w-7" /> : <AlertCircle className="h-7 w-7" />}
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-slate-900">
        {hasQuotes ? 'No matching bid records' : role === 'buyer' ? 'No quotations received yet' : 'No bids submitted yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-medium text-slate-600">
        {hasQuotes
          ? 'Adjust the search or status filter to view more bid records.'
          : role === 'buyer'
            ? 'Published tenders will show supplier quotations here once sellers submit their bids.'
            : 'Participate in active tenders to build your bid history and track procurement outcomes from this page.'}
      </p>
      {!hasQuotes && (
        <Button onClick={onPrimary} className="mt-5 h-10 rounded-md bg-[#12335f] px-5 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]">
          {role === 'buyer' ? 'View Tenders' : 'Find Active Tenders'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
