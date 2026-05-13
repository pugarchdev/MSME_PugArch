import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
  Paperclip
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface Tender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  status: 'draft' | 'approved' | 'published' | 'bid_submission' | 'tech_bid_opening' | 'tech_evaluation' | 'financial_bid_opening' | 'financial_opening' | 'financial_evaluation' | 'awarded' | 'po_generated' | 'closed';
  bidsCount: number;
  closesAt: string;
  description: string;
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

export default function Tenders() {
  const navigate = useNavigate();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedTenders = api.peek('/api/tenders', authOptions);
  const [tenders, setTenders] = useState<Tender[]>(cachedTenders || []);
  const [loading, setLoading] = useState(!cachedTenders);
  const [activeTab, setActiveTab] = useState<string>('published');
  const [searchText, setSearchText] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [budgetFilter, setBudgetFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'created', direction: 'desc' });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTender, setNewTender] = useState({
    title: '',
    category: '',
    budget: '',
    description: '',
    documentUrl: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formDataUpload
      });

      if (res.ok) {
        const data = await res.json();
        setNewTender(prev => ({ ...prev, documentUrl: data.url }));
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
        setTenders(data);
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
    setSubmitting(true);
    try {
      const res = await api.post('/api/tenders', {
        ...newTender,
        budget: Number(newTender.budget),
        status: 'draft' // Initial status as per screenshot "Save as draft"
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Tender created successfully');
        setIsModalOpen(false);
        setNewTender({ title: '', category: '', budget: '', description: '', documentUrl: '' });
        fetchTenders();
      } else {
        toast.error('Failed to create tender');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const getDaysLeft = (date: string) => {
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

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: string; className?: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortKey)}
      className={cn("inline-flex items-center gap-1 text-xs font-bold uppercase text-slate-500 hover:text-[#12335f]", className)}
    >
      {label}
      <span className="text-[9px]">{sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? 'ASC' : 'DESC') : 'SORT'}</span>
    </button>
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
              <option value="Furniture">Furniture</option>
              <option value="Software & Cloud">Software & Cloud</option>
              <option value="Catering">Catering</option>
              <option value="Construction">Construction</option>
              <option value="Services">Services</option>
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
        <div className="border border-[#dadce0] rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
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
                [1,2,3].map(i => (
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
                currentTenders.map((tender, index) => (
                  <tr key={tender.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-4 text-xs font-mono font-bold text-slate-400">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">
                      {tender.tenderId || `T-2026-01${tender.id}`}
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
                      {tender.status === 'draft' ? (
                        <Button 
                          className="bg-[#12335f] hover:bg-[#0b2445] text-white text-sm font-bold h-10 px-5 rounded-md shadow-sm transition-all flex items-center gap-2 ml-auto"
                          onClick={() => handlePublish(tender.id)}
                          disabled={publishingId === tender.id}
                        >
                          {publishingId === tender.id ? 'Publishing...' : 'Publish Now'}
                          <Plus className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          variant="outline"
                          className="bg-white border border-[#dadce0] text-slate-900 text-sm font-bold h-10 px-5 rounded-md hover:bg-slate-50 flex items-center gap-2 ml-auto"
                          onClick={() => navigate('/quotations')}
                        >
                          View bids
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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
                    onChange={(e) => setNewTender({...newTender, title: e.target.value})}
                    placeholder="Supply of 500 ergonomic office chairs"
                    className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Category</label>
                    <select 
                      required
                      value={newTender.category}
                      onChange={(e) => setNewTender({...newTender, category: e.target.value})}
                      className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all appearance-none text-slate-900"
                    >
                      <option value="">Select Category</option>
                      <option value="Furniture">Furniture</option>
                      <option value="Software & Cloud">Software & Cloud</option>
                      <option value="Catering">Catering</option>
                      <option value="Construction">Construction</option>
                      <option value="Services">Services</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Budget (Rs.)</label>
                    <input 
                      required
                      type="number"
                      value={newTender.budget}
                      onChange={(e) => setNewTender({...newTender, budget: e.target.value})}
                      placeholder="2500000"
                      className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all text-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ml-1">Brief Description</label>
                  <textarea 
                    required
                    value={newTender.description}
                    onChange={(e) => setNewTender({...newTender, description: e.target.value})}
                    placeholder="Specifications, delivery timelines, etc."
                    rows={4}
                    className="w-full bg-slate-50 border-slate-200 border rounded-md py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all resize-none text-slate-900"
                  />
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
      </div>
    </div>
  );
}
