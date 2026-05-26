import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';
import { QUANTITY_UNITS, PAYMENT_TERMS, DELIVERY_TYPES } from '../constants/dropdowns';
import { compressImage } from '../lib/compress';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ChevronRight,
  FileText,
  AlertCircle,
  X,
  Upload,
  Paperclip,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Edit3,
  Trash2,
  Save,
  List,
  LayoutGrid
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Pagination } from '../features/shared/Pagination';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { usePagination, useResponsiveViewMode } from '../features/shared/hooks';

interface Tender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  status: 'draft' | 'approved' | 'published' | 'bid_submission' | 'tech_bid_opening' | 'tech_evaluation' | 'financial_bid_opening' | 'financial_opening' | 'financial_evaluation' | 'awarded' | 'po_generated' | 'closed';
  bidsCount: number;
  description: string;
  documentUrl?: string;
  closesAt?: string;
  quantityUnit?: string;
  paymentTerms?: string;
  deliveryType?: string;
  createdAt?: string;
  updatedAt?: string;
}

const TENDER_STAGES = [
  { id: 'draft', label: 'Tender Draft' },
  { id: 'approved', label: 'Approve' },
  { id: 'published', label: 'Publish' },
  { id: 'bid_submission', label: 'Bid Submission' },
  { id: 'tech_bid_opening', label: 'Tech Bid Opening' },
  { id: 'tech_evaluation', label: 'Technical Evaluation' },
  { id: 'financial_bid_opening', label: 'Financial Bid Opening' },
  { id: 'financial_opening', label: 'Financial Opening' },
  { id: 'financial_evaluation', label: 'Financial Evaluation' },
  { id: 'awarded', label: 'Award' },
  { id: 'po_generated', label: 'PO Generation' }
];

const TENDER_CATEGORY_OPTIONS = [
  'Construction',
  'Civil Work',
  'Electrical',
  'Mechanical',
  'Hydraulics',
  'Industrial Machinery',
  'Automation',
  'IT & Software',
  'Cloud Services',
  'Networking',
  'Office Equipment',
  'Furniture',
  'Catering',
  'Housekeeping',
  'Security Services',
  'Transportation',
  'Logistics',
  'Packaging',
  'Printing',
  'Medical Supplies',
  'Laboratory Equipment',
  'Chemicals',
  'Refractories',
  'Steel & Metals',
  'Cement & Building Materials',
  'Pipes & Hardware',
  'Safety Equipment',
  'Fire Safety',
  'Mining Equipment',
  'Power & Energy',
  'Oil & Gas',
  'Telecom',
  'Fabrication',
  'Welding Services',
  'Repair & Maintenance',
  'AMC Services',
  'Consultancy Services',
  'Agriculture Supplies',
  'Tyres & Rubber',
  'Pumps & Motors',
  'Bearings & Spare Parts',
  'Industrial Consumables',
  'Cleaning Services',
  'Water Treatment',
  'HVAC',
  'Interior & Furnishing',
  'Event Management',
  'General Services',
  'OEM Supply',
  'Manpower Supply'
];

const normalizeTenderList = (payload: any): Tender[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tenders)) return payload.tenders;
  if (Array.isArray(payload?.data?.tenders)) return payload.data.tenders;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
};

export default function Tenders() {
  const router = useRouter();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedTenders = api.peek('/api/tenders', authOptions);
  const [tenders, setTenders] = useState<Tender[]>(normalizeTenderList(cachedTenders));
  const [loading, setLoading] = useState(!cachedTenders);
  const [activeTab, setActiveTab] = useState<string>('published');
  const [searchText, setSearchText] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [budgetFilter, setBudgetFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'created', direction: 'desc' });
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTender, setNewTender] = useState({
    title: '',
    category: '',
    budget: '',
    description: '',
    documentUrl: '',
    closesAt: '',
    quantityUnit: '',
    paymentTerms: '',
    deliveryType: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const optimizedFile = await compressImage(file);
    const formDataUpload = new FormData();
    formDataUpload.append('file', optimizedFile);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formDataUpload
      });

      if (res.ok) {
        const data = await res.json();
        setNewTender(prev => ({ ...prev, documentUrl: data?.data?.url || data?.url || '' }));
        toast.success('Specifications document uploaded successfully');
      } else {
        toast.error('Failed to upload document');
      }
    } catch (err) {
      toast.error('Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    fetchTenders();
  }, []);

  const fetchTenders = async () => {
    try {
      const res = await api.get('/api/tenders', authOptions);
      if (res.ok) {
        const data = await res.json();
        setTenders(normalizeTenderList(data));
      }
    } catch (err) {
      console.error('Failed to fetch tenders', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (tenderId: number) => {
    setPublishingId(tenderId);
    try {
      const res = await api.put(`/api/tenders/${tenderId}/status`, {
        status: 'published'
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Tender published successfully');
        await fetchTenders();
        setActiveTab('published');
      } else {
        const errorData = await res.json();
        console.error('Publish Failed:', errorData);
        toast.error(errorData.message || 'Failed to publish tender');
      }
    } catch (err: any) {
      console.error('Network Error during Publish:', err);
      toast.error(`Network error: ${err.message || 'Check connection'}`);
    } finally {
      setPublishingId(null);
    }
  };

  const handleCreateTender = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newTender.title.trim().length < 3) {
      toast.error('Title must be at least 3 characters long');
      return;
    }
    if (!newTender.category) {
      toast.error('Please select a category');
      return;
    }
    if (Number(newTender.budget) <= 0) {
      toast.error('Budget must be a positive number');
      return;
    }
    if (newTender.description.trim().length < 5) {
      toast.error('Brief description must be at least 5 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/tenders', {
        ...newTender,
        budget: Number(newTender.budget),
        closesAt: newTender.closesAt ? new Date(newTender.closesAt).toISOString() : undefined,
        status: 'draft' // Initial status as per screenshot "Save as draft"
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Tender created successfully');
        setIsModalOpen(false);
        setNewTender({ title: '', category: '', budget: '', description: '', documentUrl: '', closesAt: '', quantityUnit: '', paymentTerms: '', deliveryType: '' });
        fetchTenders();
      } else {
        const errorData = await res.json().catch(() => null);
        toast.error(errorData?.message || 'Failed to create tender');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTender = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTender) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get('title') || '').trim(),
      category: String(form.get('category') || '').trim(),
      budget: Number(form.get('budget') || 0),
      description: String(form.get('description') || '').trim(),
      documentUrl: editingTender.documentUrl || undefined,
      closesAt: form.get('closesAt') ? new Date(String(form.get('closesAt'))).toISOString() : undefined,
      quantityUnit: String(form.get('quantityUnit') || '').trim() || undefined,
      paymentTerms: String(form.get('paymentTerms') || '').trim() || undefined,
      deliveryType: String(form.get('deliveryType') || '').trim() || undefined
    };
    if (payload.title.length < 3) return toast.error('Title must be at least 3 characters long');
    if (!payload.category) return toast.error('Please select a category');
    if (payload.budget <= 0) return toast.error('Budget must be a positive number');
    if (payload.description.length < 10) return toast.error('Description must be at least 10 characters long');

    setSavingEdit(true);
    try {
      const res = await api.put(`/api/tenders/${editingTender.id}`, payload, authOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to update tender');
      toast.success('Tender updated successfully');
      setEditingTender(null);
      setSelectedTender(data);
      await fetchTenders();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTender = async (tender: Tender) => {
    if (!window.confirm(`Delete tender "${tender.title}"?`)) return;
    try {
      const res = await api.delete(`/api/tenders/${tender.id}`, authOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to delete tender');
      toast.success('Tender deleted successfully');
      setSelectedTender(null);
      setEditingTender(null);
      await fetchTenders();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    }
  };

  const getDaysLeft = (date?: string) => {
    if (!date) return 'Not set';
    const diff = new Date(date).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? `${days}d` : 'Expired';
  };

  const toggleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: string; className?: string }) => {
    const isActive = sortConfig.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={cn("inline-flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500 hover:text-[#12335f] transition-colors", className)}
      >
        {label}
        {isActive ? (
          sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-[#12335f]" /> : <ArrowDown className="h-3.5 w-3.5 text-[#12335f]" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    );
  };

  const renderTenderActions = (tender: Tender) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setSelectedTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-[#12335f] hover:bg-slate-50"
        title="View tender details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setEditingTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-slate-700 hover:bg-slate-50"
        title="Edit tender"
      >
        <Edit3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDeleteTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
        title="Delete tender"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {tender.status === 'draft' ? (
        <Button
          className="bg-[#12335f] hover:bg-[#0b2445] text-white text-xs font-bold h-9 px-3 rounded-md shadow-sm transition-all flex items-center gap-1.5"
          onClick={() => handlePublish(tender.id)}
          disabled={publishingId === tender.id}
        >
          {publishingId === tender.id ? 'Publishing...' : 'Publish'}
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="outline"
          className="bg-white border border-[#dadce0] text-slate-900 text-xs font-bold h-9 px-3 rounded-md hover:bg-slate-50 flex items-center gap-1.5"
          onClick={() => router.push('/quotations')}
        >
          Bids
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  const currentTenders = (activeTab === 'published'
    ? tenders.filter(t => t.status === 'published' || t.status === 'bid_submission' || t.status.startsWith('tech') || t.status.startsWith('fin'))
    : activeTab === 'closed'
      ? tenders.filter(t => t.status === 'closed' || t.status === 'awarded' || t.status === 'po_generated')
      : tenders.filter(t => t.status === activeTab)
  ).filter(t => {
    const matchesSearch = !searchText ||
      t.title.toLowerCase().includes(searchText.toLowerCase()) ||
      (t.tenderId && t.tenderId.toLowerCase().includes(searchText.toLowerCase()));

    const matchesCategory = selectedCategoryFilter === 'All' || t.category === selectedCategoryFilter;
    const matchesBudget =
      budgetFilter === 'All' ||
      (budgetFilter === 'under_10l' && Number(t.budget || 0) < 1000000) ||
      (budgetFilter === '10l_50l' && Number(t.budget || 0) >= 1000000 && Number(t.budget || 0) <= 5000000) ||
      (budgetFilter === 'above_50l' && Number(t.budget || 0) > 5000000);

    return matchesSearch && matchesCategory && matchesBudget;
  }).sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    const valueFor = (tender: Tender) => {
      if (sortConfig.key === 'tenderId') return tender.tenderId || `T-2026-01${tender.id}`;
      if (sortConfig.key === 'title') return tender.title || '';
      if (sortConfig.key === 'category') return tender.category || '';
      if (sortConfig.key === 'budget') return Number(tender.budget || 0);
      if (sortConfig.key === 'bids') return Number(tender.bidsCount || 0);
      if (sortConfig.key === 'closes') return new Date(tender.closesAt || 0).getTime();
      if (sortConfig.key === 'status') return tender.status || '';
      return tender.id;
    };
    const aValue = valueFor(a);
    const bValue = valueFor(b);
    if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
    return String(aValue).localeCompare(String(bValue)) * direction;
  });
  const { page, pageSize, pageItems: pagedTenders, total, setPage, setPageSize } = usePagination(currentTenders, 10);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
      {/* Page Header */}
      <div className="bg-white border-b border-[#dfe3e8] px-6 py-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[#1a1c21] uppercase">Tender Management</h1>
          <p className="text-xs text-slate-500 font-medium">Create and manage your corporate tenders efficiently.</p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#12335f] hover:bg-[#0b2445] text-white h-9 px-4 rounded-md font-black text-[11px] flex items-center gap-2 shadow-sm transition-all uppercase tracking-wide shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Tender
        </Button>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* Actions bar: Tabs and Compact Action Button */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1 bg-[#f1f3f4] p-1 rounded-lg border border-[#e8eaed]">
            {[
              { id: 'draft', label: 'Draft', count: tenders.filter(t => t.status === 'draft').length },
              { id: 'published', label: 'Active', count: tenders.filter(t => t.status === 'published' || t.status === 'bid_submission' || t.status.startsWith('tech') || t.status.startsWith('fin')).length },
              { id: 'closed', label: 'Closed', count: tenders.filter(t => t.status === 'closed' || t.status === 'awarded' || t.status === 'po_generated').length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all",
                  activeTab === tab.id
                    ? "bg-white text-slate-900 shadow-sm border border-[#dadce0]"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {tab.label}
                <span className="text-slate-400 font-medium ml-2">{tab.count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[#e8eaed] bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-all',
                viewMode === 'list' ? 'bg-[#12335f] text-white shadow-sm' : 'hover:bg-slate-50 hover:text-[#12335f]'
              )}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-all',
                viewMode === 'grid' ? 'bg-[#12335f] text-white shadow-sm' : 'hover:bg-slate-50 hover:text-[#12335f]'
              )}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters and Search Row */}
        <div className="grid grid-cols-1 gap-3 pt-1 pb-1 lg:grid-cols-[minmax(260px,1fr)_220px_180px_170px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Quick search by Tender ID or Title..."
              className="pl-9 h-10 border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div>
            <select
              className="w-full bg-white border border-slate-200 rounded-md h-10 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all cursor-pointer"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              {TENDER_CATEGORY_OPTIONS.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              className="w-full bg-white border border-slate-200 rounded-md h-10 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all cursor-pointer"
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value)}
            >
              <option value="All">All Budgets</option>
              <option value="under_10l">Under Rs. 10 Lakh</option>
              <option value="10l_50l">Rs. 10-50 Lakh</option>
              <option value="above_50l">Above Rs. 50 Lakh</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSelectedCategoryFilter('All');
              setBudgetFilter('All');
              setSortConfig({ key: 'created', direction: 'desc' });
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-[#12335f]"
          >
            Reset Filters
          </button>
        </div>

        {/* Tenders Table */}
        <div className={cn('overflow-x-auto border border-[#dadce0] rounded-lg bg-white shadow-sm', viewMode === 'grid' && 'hidden')}>
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead className="bg-white border-b border-[#dadce0]">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500 w-20">Sr. No.</th>
                <th className="px-4 py-3 w-32"><SortHeader label="Tender ID" sortKey="tenderId" /></th>
                <th className="px-4 py-3"><SortHeader label="Title" sortKey="title" /></th>
                <th className="px-4 py-3"><SortHeader label="Category" sortKey="category" /></th>
                <th className="px-4 py-3 text-right"><SortHeader label="Budget" sortKey="budget" className="justify-end" /></th>
                <th className="px-4 py-3 text-center"><SortHeader label="Bids" sortKey="bids" /></th>
                <th className="px-4 py-3"><SortHeader label="Closes" sortKey="closes" /></th>
                <th className="px-4 py-3"><SortHeader label="Status" sortKey="status" /></th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dadce0]">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-8 py-10"><div className="h-4 bg-slate-50 rounded w-full"></div></td>
                  </tr>
                ))
              ) : currentTenders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <FileText className="h-12 w-12" />
                      <p className="text-sm font-bold uppercase tracking-widest">No Tenders Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedTenders.map((tender, index) => (
                  <tr key={tender.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-4 text-xs font-mono font-bold text-slate-400">
                      {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">
                      <EntityIdLink label={tender.tenderId || `T-2026-01${tender.id}`} id={tender.id} size="sm" onClick={() => setSelectedTender(tender)} />
                    </td>
                    <td className="px-4 py-4 w-64">
                      <p className="text-[15px] font-bold text-slate-900 leading-snug">{tender.title}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-bold text-slate-900 px-3 py-1.5 rounded-md border border-[#dadce0] whitespace-nowrap">
                        {tender.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[15px] font-bold text-slate-900 text-right">
                      ₹{tender.budget?.toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-base font-medium text-slate-900 text-center">
                      {tender.bidsCount || 0}
                    </td>
                    <td className="px-4 py-4 text-[15px] font-medium text-slate-500">
                      {getDaysLeft(tender.closesAt)}
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-bold",
                        tender.status === 'draft' ? "bg-slate-100 text-slate-600" :
                          "bg-[#e6f4ea] text-[#1e8e3e]"
                      )}>
                        {tender.status === 'draft' ? 'Draft' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedTender(tender)}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-[#12335f] hover:bg-slate-50"
                          title="View tender details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTender(tender)}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-slate-700 hover:bg-slate-50"
                          title="Edit tender"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTender(tender)}
                          className="flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          title="Delete tender"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {tender.status === 'draft' ? (
                          <Button
                            className="bg-[#12335f] hover:bg-[#0b2445] text-white text-xs font-bold h-9 px-3 rounded-md shadow-sm transition-all flex items-center gap-1.5"
                            onClick={() => handlePublish(tender.id)}
                            disabled={publishingId === tender.id}
                          >
                            {publishingId === tender.id ? 'Publishing...' : 'Publish'}
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="bg-white border border-[#dadce0] text-slate-900 text-xs font-bold h-9 px-3 rounded-md hover:bg-slate-50 flex items-center gap-1.5"
                            onClick={() => router.push('/quotations')}
                          >
                            Bids
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {viewMode === 'grid' && currentTenders.length === 0 && (
          <div className="rounded-lg border border-[#dadce0] bg-white px-8 py-20 text-center shadow-sm">
            <div className="flex flex-col items-center gap-4 opacity-30">
              <FileText className="h-12 w-12" />
              <p className="text-sm font-bold uppercase tracking-widest">No Tenders Found</p>
            </div>
          </div>
        )}

        {viewMode === 'grid' && currentTenders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedTenders.map((tender, index) => (
              <div key={tender.id} className="rounded-lg border border-[#dadce0] bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Sr. No. {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                    </p>
                    <div className="mt-1">
                      <EntityIdLink
                        label={tender.tenderId || `T-2026-01${tender.id}`}
                        id={tender.id}
                        size="sm"
                        onClick={() => setSelectedTender(tender)}
                      />
                    </div>
                  </div>
                  <span className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-bold',
                    tender.status === 'draft' ? 'bg-slate-100 text-slate-600' : 'bg-[#e6f4ea] text-[#1e8e3e]'
                  )}>
                    {tender.status === 'draft' ? 'Draft' : 'Active'}
                  </span>
                </div>

                <h3 className="mt-4 line-clamp-2 text-base font-black leading-snug text-slate-950">{tender.title}</h3>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Category</p>
                    <p className="mt-1 font-bold text-slate-900">{tender.category || '-'}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Budget</p>
                    <p className="mt-1 font-bold text-slate-900">Rs. {tender.budget?.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Bids</p>
                    <p className="mt-1 font-bold text-slate-900">{tender.bidsCount || 0}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Closes</p>
                    <p className="mt-1 font-bold text-slate-900">{getDaysLeft(tender.closesAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                  {renderTenderActions(tender)}
                </div>
              </div>
            ))}
          </div>
        )}

        {currentTenders.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="tenders" />
        )}

        {/* New Tender Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-xl max-h-[calc(100vh-2rem)] bg-white rounded-lg border border-slate-200 shadow-2xl overflow-y-auto animate-in zoom-in-95 duration-300">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>

              <form onSubmit={handleCreateTender} className="p-6 space-y-5">
                <div className="space-y-2">
                  <h2 className="text-xl font-extrabold tracking-tight text-[#12335f]">New Tender</h2>
                  <p className="text-xs text-slate-500 font-medium">Save as draft now. You can add line items and publish from the draft list.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Title</label>
                    <input
                      required
                      value={newTender.title}
                      onChange={(e) => setNewTender({ ...newTender, title: e.target.value })}
                      placeholder="Supply of 500 ergonomic office chairs"
                      className={cn(
                        "w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all text-slate-900",
                        newTender.title && newTender.title.trim().length < 3 && "border-red-500 focus:ring-red-500/20"
                      )}
                    />
                    {newTender.title && newTender.title.trim().length < 3 && (
                      <p className="text-red-500 text-[11px] mt-1 ml-1 font-semibold">Title must be at least 3 characters long.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Category</label>
                      <select
                        required
                        value={newTender.category}
                        onChange={(e) => setNewTender({ ...newTender, category: e.target.value })}
                        className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all appearance-none text-slate-900"
                      >
                        <option value="">Select Category</option>
                        {TENDER_CATEGORY_OPTIONS.map(category => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Budget (Rs.)</label>
                      <input
                        required
                        type="number"
                        value={newTender.budget}
                        onChange={(e) => setNewTender({ ...newTender, budget: e.target.value })}
                        placeholder="2500000"
                        className={cn(
                          "w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all text-slate-900",
                          newTender.budget && Number(newTender.budget) <= 0 && "border-red-500 focus:ring-red-500/20"
                        )}
                      />
                      {newTender.budget && Number(newTender.budget) <= 0 && (
                        <p className="text-red-500 text-[11px] mt-1 ml-1 font-semibold">Budget must be a positive number.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Tender Closing Date</label>
                      <input
                        type="date"
                        value={newTender.closesAt}
                        onChange={(e) => setNewTender({ ...newTender, closesAt: e.target.value })}
                        className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all text-slate-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Brief Description</label>
                      <textarea
                        required
                        value={newTender.description}
                        onChange={(e) => setNewTender({ ...newTender, description: e.target.value })}
                        placeholder="Specifications, delivery timelines, etc."
                        rows={4}
                        className={cn(
                          "w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all resize-none text-slate-900",
                          newTender.description && newTender.description.trim().length < 5 && "border-red-500 focus:ring-red-500/20"
                        )}
                      />
                      {newTender.description && newTender.description.trim().length < 5 && (
                        <p className="text-red-500 text-[11px] mt-1 ml-1 font-semibold">Brief description must be at least 5 characters long.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Quantity Unit</label>
                      <select
                        value={newTender.quantityUnit}
                        onChange={(e) => setNewTender({ ...newTender, quantityUnit: e.target.value })}
                        className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all appearance-none text-slate-900"
                      >
                        <option value="">Select Unit</option>
                        {QUANTITY_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Payment Terms</label>
                      <select
                        value={newTender.paymentTerms}
                        onChange={(e) => setNewTender({ ...newTender, paymentTerms: e.target.value })}
                        className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all appearance-none text-slate-900"
                      >
                        <option value="">Select Payment Terms</option>
                        {PAYMENT_TERMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Delivery Type</label>
                      <select
                        value={newTender.deliveryType}
                        onChange={(e) => setNewTender({ ...newTender, deliveryType: e.target.value })}
                        className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all appearance-none text-slate-900"
                      >
                        <option value="">Select Delivery Type</option>
                        {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Specification Document</label>
                    <div className={cn(
                      "relative flex items-center justify-between w-full bg-slate-50 border border-slate-200 border-dashed rounded-md p-4 transition-all",
                      newTender.documentUrl && "bg-green-50/30 border-green-200"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          newTender.documentUrl ? "bg-green-100 text-green-600" : "bg-slate-200 text-slate-500"
                        )}>
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">
                            {newTender.documentUrl ? "Document attached" : "Upload Specifications PDF"}
                          </p>
                          <p className="text-[10px] font-medium text-slate-500">Maximum size 5MB (PDF/DOC)</p>
                        </div>
                      </div>

                      <input
                        type="file"
                        id="spec-upload"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                      <label
                        htmlFor="spec-upload"
                        className={cn(
                          "px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-all flex items-center gap-2",
                          newTender.documentUrl
                            ? "bg-white border border-green-200 text-green-700 shadow-sm"
                            : "bg-[#12335f] text-white shadow-sm hover:bg-[#0b2445]"
                        )}
                      >
                        {isUploading ? (
                          <>Processing...</>
                        ) : newTender.documentUrl ? (
                          <>Change File</>
                        ) : (
                          <><Upload className="h-3 w-3" /> Select File</>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <Button
                    disabled={submitting}
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white border-0 h-10 px-6 rounded-md font-bold uppercase text-xs tracking-wide transition-all"
                  >
                    {submitting ? 'Saving...' : 'Save as draft'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
        {selectedTender && (
          <TenderDetailsModal
            tender={selectedTender}
            onClose={() => setSelectedTender(null)}
            onEdit={() => {
              setEditingTender(selectedTender);
            }}
            onDelete={() => handleDeleteTender(selectedTender)}
            onViewBids={() => router.push('/quotations')}
          />
        )}
        {editingTender && (
          <TenderEditModal
            tender={editingTender}
            saving={savingEdit}
            onClose={() => setEditingTender(null)}
            onSubmit={handleUpdateTender}
          />
        )}
      </div>
    </div>
  );
}

function TenderDetailsModal({
  tender,
  onClose,
  onEdit,
  onDelete,
  onViewBids
}: {
  tender: Tender;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewBids: () => void;
}) {
  const closesLabel = tender.closesAt ? new Date(tender.closesAt).toLocaleString() : 'Not available';
  const documentName = tender.documentUrl ? tender.documentUrl.split('/').pop() || 'Specification document' : '';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#12335f]">{tender.tenderId || `T-2026-01${tender.id}`}</p>
            <h2 className="mt-1 break-words text-xl font-black text-slate-900">{tender.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{String(tender.status).replace(/_/g, ' ')}</span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase text-slate-600">{tender.category}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TenderInfoBox label="Budget" value={`Rs. ${Number(tender.budget || 0).toLocaleString('en-IN')}`} />
            <TenderInfoBox label="Bids" value={String(tender.bidsCount || 0)} />
            <TenderInfoBox label="Closes" value={closesLabel} />
            <TenderInfoBox label="Days Left" value={getTenderDaysLeft(tender.closesAt)} />
          </div>
          {(tender.quantityUnit || tender.paymentTerms || tender.deliveryType) && (
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
              {tender.quantityUnit && <TenderInfoBox label="Quantity Unit" value={tender.quantityUnit} />}
              {tender.paymentTerms && <TenderInfoBox label="Payment Terms" value={tender.paymentTerms.replace(/_/g, ' ')} />}
              {tender.deliveryType && <TenderInfoBox label="Delivery Type" value={tender.deliveryType.replace(/_/g, ' ')} />}
            </div>
          )}
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{tender.description || 'No description provided.'}</p>
          </div>
          {tender.documentUrl && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Specification Document</p>
              <p className="mt-2 text-sm font-semibold text-slate-700 truncate">{documentName}</p>
              <button type="button" onClick={() => window.open(tender.documentUrl, '_blank', 'noopener,noreferrer')} className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-[#12335f] hover:bg-slate-50">
                <FileText className="h-4 w-4" />
                Open Document
              </button>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={onViewBids} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">View Bids</Button>
            <Button variant="outline" onClick={onEdit} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={onDelete} className="h-10 rounded-md border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TenderEditModal({
  tender,
  saving,
  onClose,
  onSubmit
}: {
  tender: Tender;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Edit Tender</p>
            <h2 className="text-lg font-black text-slate-900">{tender.tenderId || `Tender #${tender.id}`}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Title
            <input name="title" defaultValue={tender.title} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Category
              <select
                name="category"
                defaultValue={tender.category}
                className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20"
              >
                <option value="">Select Category</option>
                {TENDER_CATEGORY_OPTIONS.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Budget
              <input name="budget" type="number" min="1" defaultValue={tender.budget} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Closing Date
              <input name="closesAt" type="date" defaultValue={tender.closesAt ? tender.closesAt.split('T')[0] : ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Quantity Unit
              <select name="quantityUnit" defaultValue={tender.quantityUnit || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Unit</option>
                {QUANTITY_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Payment Terms
              <select name="paymentTerms" defaultValue={tender.paymentTerms || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Payment Terms</option>
                {PAYMENT_TERMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Delivery Type
              <select name="deliveryType" defaultValue={tender.deliveryType || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Delivery Type</option>
                {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Description
            <textarea name="description" rows={5} defaultValue={tender.description} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-10 rounded-md bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TenderInfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function getTenderDaysLeft(date?: string) {
  if (!date) return 'Not set';
  const diff = new Date(date).getTime() - new Date().getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? `${days} days` : 'Expired';
}
