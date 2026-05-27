import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { CalendarDays, CheckCircle2, ClipboardList, IndianRupee, RefreshCw, Search, SlidersHorizontal, Grid, List, Eye, Edit3, Trash2, X, XCircle, Save, FileText, Filter, Paperclip } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import { EmptyState, InlineError, LoadingState } from './FeatureStates';
import { Pagination } from './Pagination';
import { EntityIdLink } from './EntityIdLink';
import { ViewModeToggle } from './ViewModeToggle';
import { formatCurrency, formatDate } from './format';
import { usePaginatedFeatureQuery, useResponsiveViewMode } from './hooks';
import { deleteApi, postApi, putApi } from './apiClient';
import { toast } from 'sonner';
import { DocumentPreviewModal } from '../../components/DocumentPreviewModal';
import { getFileAssetPreview, type DocumentPreview } from '../../lib/files';
import { api } from '../../lib/api';
import { compressImage } from '../../lib/compress';


type GenericRecord = Record<string, any>;

const valueOf = (record: GenericRecord, keys: string[]) => keys.map(key => record?.[key]).find(value => value !== undefined && value !== null && value !== '');
const titleOf = (record: GenericRecord) => String(valueOf(record, ['title', 'name', 'subject', 'poNumber', 'invoiceNumber', 'ticketNumber', 'ruleCode']) || `Record #${record.id || '-'}`);
const statusOf = (record: GenericRecord) => String(valueOf(record, ['status', 'statusEnum', 'poStatus', 'invoiceStatus', 'paymentStatus']) || 'active');
const amountOf = (record: GenericRecord) => valueOf(record, ['amount', 'totalAmount', 'totalValue', 'value', 'estimatedValue', 'budget']);
const dateOf = (record: GenericRecord) => valueOf(record, ['requiredBy', 'dueDate', 'closesAt', 'expectedDelivery', 'createdAt', 'updatedAt']);
const partyOf = (record: GenericRecord) => {
  const seller = record.seller?.name || record.supplier?.name || (record.sellerId ? `Seller #${record.sellerId}` : '');
  const buyer = record.buyer?.name || (record.buyerId ? `Buyer #${record.buyerId}` : '');
  return [seller, buyer].filter(Boolean).join(' | ');
};
const detailOf = (record: GenericRecord) => {
  const identifiers = [record.requirementNumber, record.purchaseNumber, record.tenderId, record.responseNumber, record.referenceId, record.trackingNumber].filter(Boolean);
  const method = record.procurementMethod ? String(record.procurementMethod).replace(/_/g, ' ') : '';
  return [identifiers.join(' | '), method, partyOf(record)].filter(Boolean).join(' | ') || record.description || record.message || 'Workflow record';
};

const getCleanFileName = (url?: string, defaultName = 'Specifications') => {
  if (!url) return defaultName;
  const cleanUrl = String(url).split('?')[0];
  const name = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
  if (!name || name.toLowerCase() === 'view') return defaultName;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

export default function GenericFeaturePage({ title, eyebrow, description, endpoint, emptyTitle = 'No records found' }: { title: string; eyebrow: string; description: string; endpoint: string; emptyTitle?: string }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [valueFilter, setValueFilter] = useState('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [selectedRecord, setSelectedRecord] = useState<GenericRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<GenericRecord | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const queryParams = useMemo(() => ({ q: searchTerm.trim(), status: statusFilter }), [searchTerm, statusFilter]);
  const { records, loading, error, reload, page, pageSize, total, setPage, setPageSize } = usePaginatedFeatureQuery<GenericRecord>(endpoint, queryParams, 20);
  const statusOptions = useMemo(() => Array.from(new Set(records.map(statusOf).filter(Boolean))).sort(), [records]);
  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const handlePreviewDocument = async (rec: GenericRecord) => {
    try {
      const label = rec.documentName || rec.fileAsset?.originalName || titleOf(rec);
      setPreviewDocument(await getFileAssetPreview({ ...rec.fileAsset, url: rec.documentUrl, fileId: rec.fileId || rec.fileAssetId }, label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const filtered = useMemo(() => {
    return records.filter(record => {
      const amount = Number(amountOf(record) || 0);
      const matchesValue = !valueFilter || (valueFilter === 'high' ? amount >= 100000 : valueFilter === 'medium' ? amount >= 25000 && amount < 100000 : amount < 25000);
      return matchesValue;
    });
  }, [records, valueFilter]);
  const pageItems = filtered;
  const totalValue = filtered.reduce<number>((sum, record) => sum + Number(amountOf(record) || 0), 0);
  const pendingCount = filtered.filter(record => /pending|draft|requested|sent|generated/i.test(statusOf(record))).length;
  const canMutate = endpoint === '/api/direct-purchases' || endpoint === '/api/quote-requests';
  const isRfqPage = endpoint === '/api/quote-requests';
  const canEditRecord = (record: GenericRecord) => canMutate && !(isRfqPage && Array.isArray(record.quoteResponses) && record.quoteResponses.length > 0);

  const handleDelete = async (record: GenericRecord) => {
    if (!window.confirm(`Delete ${titleOf(record)}?`)) return;
    try {
      await deleteApi(`${endpoint}/${record.id}`);
      toast.success(`${title} record deleted`);
      setSelectedRecord(null);
      setEditingRecord(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to delete ${title.toLowerCase()} record`);
    }
  };

  const handleEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRecord) return;
    const form = new FormData(event.currentTarget);
    const payload = endpoint === '/api/quote-requests'
      ? {
        sellerId: Number(form.get('sellerId') || editingRecord.sellerId),
        subject: String(form.get('subject') || '').trim(),
        message: String(form.get('message') || '').trim(),
        documentUrl: String(form.get('documentUrl') || '').trim() || undefined,
        estimatedValue: form.get('estimatedValue') ? Number(form.get('estimatedValue')) : undefined
      }
      : {
        sellerId: Number(form.get('sellerId') || editingRecord.sellerId),
        totalAmount: Number(form.get('totalAmount') || 0)
      };
    setSaving(true);
    try {
      const updated = await putApi<GenericRecord>(`${endpoint}/${editingRecord.id}`, payload);
      toast.success(`${title} record updated`);
      setEditingRecord(null);
      setSelectedRecord(updated);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to update ${title.toLowerCase()} record`);
    } finally {
      setSaving(false);
    }
  };

  const handleQuoteResponseDecision = async (responseId: number, decision: 'accept' | 'reject') => {
    setSaving(true);
    try {
      await postApi(`/api/quote-responses/${responseId}/${decision}`, {});
      toast.success(`RFQ response ${decision === 'accept' ? 'accepted' : 'rejected'} successfully`);
      setSelectedRecord(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to ${decision} RFQ response`);
    } finally {
      setSaving(false);
    }
  };

  if (loading && records.length === 0) return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Metric label="Records" value={filtered.length} icon={ClipboardList} />
        <Metric label="Pending Action" value={pendingCount} icon={CalendarDays} />
        <Metric label="Tracked Value" value={formatCurrency(totalValue)} icon={IndianRupee} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card className="border-slate-200/80 shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className="lg:hidden h-10 w-full sm:w-auto gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Filter className="h-4 w-4 text-slate-500" />
              <span>Filters {showMobileFilters ? '(Hide)' : '(Show)'}</span>
            </Button>
          </div>

          <div className={cn(
            "grid gap-3 items-center",
            showMobileFilters ? "grid grid-cols-1 sm:grid-cols-2" : "hidden lg:grid lg:grid-cols-[190px_190px] lg:justify-end"
          )}>
            <div className="relative w-full">
              <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">All statuses</option>
                {statusOptions.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <select value={valueFilter} onChange={event => setValueFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 w-full">
              <option value="">All values</option>
              <option value="high">Above Rs. 1 lakh</option>
              <option value="medium">Rs. 25k to 1 lakh</option>
              <option value="low">Below Rs. 25k</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title={emptyTitle} /> : viewMode === 'grid' ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((record, index) => (
              <GenericRecordCard
                key={record.id || titleOf(record)}
                record={record}
                srNo={(page - 1) * pageSize + index + 1}
                canMutate={canEditRecord(record)}
                onView={() => setSelectedRecord(record)}
                onEdit={() => setEditingRecord(record)}
                onDelete={() => handleDelete(record)}
              />
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-clip">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr><th className="p-3 w-20">Sr. No.</th><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Value</th><th className="p-3">Date</th><th className="p-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((record, index) => (
                  <tr key={record.id || titleOf(record)} className="hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                    <td className="p-3">
                      <p className="font-black text-slate-900 text-wrap-anywhere">{titleOf(record)}</p>
                      {record.id && (
                        <div className="mt-1">
                          <EntityIdLink id={record.id} size="sm" onClick={() => setSelectedRecord(record)} />
                        </div>
                      )}
                      <p className="mt-1 max-w-md text-[10px] font-semibold text-slate-500 text-wrap-anywhere line-clamp-2">{detailOf(record)}</p>
                    </td>
                    <td className="p-3"><span className="rounded-lg border border-blue-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-[#12335f]">{statusOf(record).replace(/_/g, ' ')}</span></td>
                    <td className="p-3 text-xs font-black text-slate-900">{amountOf(record) ? formatCurrency(amountOf(record)) : '-'}</td>
                    <td className="p-3 text-xs font-bold text-slate-500">{formatDate(dateOf(record))}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1.5">
                        <IconButton label="View details" icon={Eye} onClick={() => setSelectedRecord(record)} />
                        {canEditRecord(record) && <IconButton label="Edit" icon={Edit3} onClick={() => setEditingRecord(record)} />}
                        {canEditRecord(record) && <IconButton label="Delete" icon={Trash2} tone="red" onClick={() => handleDelete(record)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </div>
      )}
      {selectedRecord && (
        <GenericDetailsModal
          title={title}
          record={selectedRecord}
          canMutate={canEditRecord(selectedRecord)}
          onClose={() => setSelectedRecord(null)}
          onEdit={() => setEditingRecord(selectedRecord)}
          onDelete={() => handleDelete(selectedRecord)}
          onPreviewDocument={handlePreviewDocument}
          onResponseDecision={isRfqPage ? handleQuoteResponseDecision : undefined}
          decisionSaving={saving}
        />
      )}
      {editingRecord && (
        <GenericEditModal title={title} endpoint={endpoint} record={editingRecord} saving={saving} onClose={() => setEditingRecord(null)} onSubmit={handleEdit} />
      )}
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

function GenericRecordCard({ record, srNo, canMutate, onView, onEdit, onDelete }: { record: GenericRecord; srNo: number; canMutate: boolean; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded bg-slate-50 px-2 py-1 font-mono text-[10px] font-black text-[#12335f]">{String(srNo).padStart(2, '0')}</span>
          <span className="rounded-lg border border-blue-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-[#12335f]">{statusOf(record).replace(/_/g, ' ')}</span>
        </div>
        <h3 className="mt-3 line-clamp-2 text-sm font-black text-slate-900">{titleOf(record)}</h3>
        <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">{detailOf(record)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniDetail label="Value" value={amountOf(record) ? formatCurrency(amountOf(record)) : '-'} />
          <MiniDetail label="Date" value={formatDate(dateOf(record))} />
        </div>
        <div className="mt-4 flex justify-end gap-1.5 border-t border-slate-100 pt-3">
          <IconButton label="View details" icon={Eye} onClick={onView} />
          {canMutate && <IconButton label="Edit" icon={Edit3} onClick={onEdit} />}
          {canMutate && <IconButton label="Delete" icon={Trash2} tone="red" onClick={onDelete} />}
        </div>
      </CardContent>
    </Card>
  );
}

function IconButton({ label, icon: Icon, onClick, tone = 'blue' }: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void; tone?: 'blue' | 'red' }) {
  return (
    <button type="button" title={label} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md border bg-white ${tone === 'red' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-200 text-[#12335f] hover:bg-slate-50'}`}>
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2"><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-black text-slate-900">{value}</p></div>;
}

function GenericDetailsModal({ title, record, canMutate, onClose, onEdit, onDelete, onPreviewDocument, onResponseDecision, decisionSaving = false }: { title: string; record: GenericRecord; canMutate: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onPreviewDocument: (rec: GenericRecord) => void; onResponseDecision?: (responseId: number, decision: 'accept' | 'reject') => void; decisionSaving?: boolean }) {
  const entries = Object.entries(record).filter(([key, value]) => !['buyer', 'seller', 'buyerId', 'sellerId', 'quoteResponses', 'requirement', 'documentUrl', 'fileId', 'fileAssetId'].includes(key) && value !== null && value !== undefined && typeof value !== 'object');

  const formatDetailValue = (key: string, value: any) => {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
        }
      } catch { }
    }
    if (key.endsWith('At') || key.endsWith('Date') || key.endsWith('Time')) {
      try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
        }
      } catch { }
    }
    return String(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{title} Details</p><h2 className="mt-1 text-lg font-black text-slate-900">{titleOf(record)}</h2></div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MiniDetail label="Status" value={statusOf(record).replace(/_/g, ' ')} />
            <MiniDetail label="Value" value={amountOf(record) ? formatCurrency(amountOf(record)) : '-'} />
            <MiniDetail label="Date" value={formatDate(dateOf(record))} />
          </div>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{record.message || record.description || record.subject || detailOf(record)}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {entries.map(([key, value]) => <MiniDetail key={key} label={key.replace(/([A-Z])/g, ' $1')} value={formatDetailValue(key, value)} />)}
          </div>
          {record.documentUrl && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Attachment</p>
              <div className="mt-2 flex items-center justify-between bg-white border border-slate-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#12335f]" />
                  <span className="text-xs font-bold text-slate-700 truncate max-w-[280px]">
                    {getCleanFileName(record.documentUrl, 'RFQ Specifications')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onPreviewDocument(record)}
                  className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-black text-[#12335f] hover:bg-slate-50 shadow-sm"
                >
                  Open Document
                </button>
              </div>
            </div>
          )}
          {record.quoteResponses && record.quoteResponses.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Seller Response Details</p>
              <div className="mt-3 space-y-3">
                {record.quoteResponses.map((resp: any, idx: number) => (
                  <div key={resp.id || idx} className="rounded-xl border border-emerald-250 bg-emerald-50/20 p-4 space-y-3">
                    <div className="flex justify-between items-center border-b border-emerald-100/50 pb-2">
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase tracking-wide">
                        Response #{resp.responseNumber || resp.id}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {formatDetailValue('createdAt', resp.createdAt)}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-slate-400">Total Amount Quoted</p>
                        <p className="mt-1 text-sm font-black text-emerald-850">{formatCurrency(resp.totalAmount)}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-slate-400">Delivery Days</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{resp.deliveryDays ? `${resp.deliveryDays} days` : 'Not specified'}</p>
                      </div>
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[9px] font-black uppercase text-slate-400">Validity Date</p>
                        <p className="mt-1 text-sm font-black text-slate-800">{resp.validityDate ? new Date(resp.validityDate).toLocaleDateString() : 'Not specified'}</p>
                      </div>
                    </div>
                    {resp.notes && (
                      <div className="rounded-lg border border-slate-150 bg-white p-3">
                        <p className="text-[9px] font-black uppercase text-slate-400">Seller Notes</p>
                        <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{resp.notes}</p>
                      </div>
                    )}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">Seller Attachment</p>
                      {resp.documentUrl || resp.fileAssetId || resp.fileAsset?.id ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText className="h-5 w-5 shrink-0 text-[#12335f]" />
                            <span className="truncate text-xs font-bold text-slate-700">
                              {resp.documentName || resp.fileAsset?.originalName || getCleanFileName(resp.documentUrl, 'Seller Proposal Document')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onPreviewDocument(resp)}
                            className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#12335f] shadow-sm hover:bg-slate-50"
                          >
                            Open Document
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500">No supporting document was attached by the seller.</p>
                      )}
                    </div>
                    {onResponseDecision && String(resp.status || '').toUpperCase() === 'SUBMITTED' && (
                      <div className="flex justify-end gap-2 border-t border-emerald-100 pt-3">
                        <Button type="button" variant="outline" disabled={decisionSaving} onClick={() => onResponseDecision(Number(resp.id), 'reject')} className="h-9 border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50">
                          <XCircle className="mr-1.5 h-4 w-4" />
                          Reject
                        </Button>
                        <Button type="button" disabled={decisionSaving} onClick={() => onResponseDecision(Number(resp.id), 'accept')} className="h-9 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Accept
                        </Button>
                      </div>
                    )}
                    {onResponseDecision && ['ACCEPTED', 'REJECTED'].includes(String(resp.status || '').toUpperCase()) && (
                      <p className={cn(
                        'rounded-md border px-3 py-2 text-center text-xs font-black uppercase',
                        String(resp.status).toUpperCase() === 'ACCEPTED'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-red-700'
                      )}>
                        Response {String(resp.status).toLowerCase()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {canMutate && <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4"><Button variant="outline" onClick={onEdit} className="h-10 text-xs font-black uppercase"><Edit3 className="mr-2 h-4 w-4" />Edit</Button><Button variant="outline" onClick={onDelete} className="h-10 border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50"><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>}
        </div>
      </div>
    </div>
  );
}

function GenericEditModal({ title, endpoint, record, saving, onClose, onSubmit }: { title: string; endpoint: string; record: GenericRecord; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const isRfq = endpoint === '/api/quote-requests';
  const [uploadedDocUrl, setUploadedDocUrl] = useState(record.documentUrl || '');
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const optimizedFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', optimizedFile);

      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const fileUrl = data?.data?.url || data?.url || '';
        setUploadedDocUrl(fileUrl);
        toast.success('Document uploaded and attached successfully');
      } else {
        toast.error('Upload failed');
      }
    } catch (err) {
      toast.error('Upload error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Edit {title}</p><h2 className="text-lg font-black text-slate-900">{titleOf(record)}</h2></div><button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Seller ID<input name="sellerId" type="number" min="1" defaultValue={record.sellerId || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></label>
          {isRfq ? (
            <>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Subject<input name="subject" defaultValue={record.subject || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Estimated Value<input name="estimatedValue" type="number" min="0" defaultValue={record.estimatedValue || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></label>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Message<textarea name="message" rows={4} defaultValue={record.message || ''} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></label>
              <div className="space-y-1.5">
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Document File</span>
                <div className={`relative flex items-center justify-between w-full bg-slate-50 border border-slate-200 border-dashed rounded-lg p-3 transition-all ${uploadedDocUrl ? 'bg-emerald-50/40 border-emerald-200' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-md ${uploadedDocUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                      <Paperclip className="h-3.5 w-3.5" />
                    </div>
                    <span className={`text-xs font-semibold truncate max-w-[240px] ${uploadedDocUrl ? 'text-emerald-700' : 'text-slate-600'}`}>
                      {uploadedDocUrl ? getCleanFileName(uploadedDocUrl, "Document attached") : "Attach document file (PDF, Doc, Excel)"}
                    </span>
                  </div>

                  <input
                    type="file"
                    id="edit-rfq-doc"
                    accept=".pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={handleUploadDoc}
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="edit-rfq-doc"
                    className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide cursor-pointer transition-all ${uploadedDocUrl
                      ? "bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      : "bg-[#12335f] text-white hover:bg-[#0b2445]"
                      }`}
                  >
                    {isUploading ? "Wait..." : uploadedDocUrl ? "Change" : "Upload"}
                  </label>
                </div>
                <input type="hidden" name="documentUrl" value={uploadedDocUrl} />
              </div>
            </>
          ) : (
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Total Amount<input name="totalAmount" type="number" min="0" defaultValue={amountOf(record) || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></label>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><Button type="button" variant="outline" onClick={onClose} className="h-10 text-xs font-black uppercase">Cancel</Button><Button type="submit" disabled={saving} className="h-10 bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save Changes'}</Button></div>
        </form>
      </div>
    </div>
  );
}


function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
