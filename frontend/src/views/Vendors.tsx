import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  Star,
  Building2,
  ChevronDown,
  CheckCircle2,
  X,
  Phone,
  Mail,
  Globe,
  Briefcase,
  FileText,
  Send,
  Loader2,
  Info,
  ShieldCheck,
  Clock,
  Upload,
  Paperclip,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { compressImage } from '../lib/compress';
import { indiaStatesDistricts } from '../data/indiaStatesDistricts';
import { Pagination } from '../features/shared/Pagination';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { usePagination, useResponsiveViewMode } from '../features/shared/hooks';
import { useSupplierSummary } from '../features/ratings/hooks';
import { Star as StarIcon } from 'lucide-react';

interface Vendor {
  _id: string;
  id: number;
  name: string;
  email: string;
  sellerProfile: {
    businessName: string;
    state: string;
    city: string;
    productCategories: string[];
    msmeCategory: string;
    gst: string;
    organizationType: string;
    dateOfIncorporation: string;
    pan: string;
    msmeType?: string;
    vendorType?: string;
    registrationTypes?: string[];
    offices?: any[];
    bankAccounts?: any[];
  };
}

const Vendors = () => {
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedVendors = api.peek('/api/vendors', authOptions);
  const [vendors, setVendors] = useState<Vendor[]>(cachedVendors || []);
  const [loading, setLoading] = useState(!cachedVendors);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All categories');
  const [selectedSize, setSelectedSize] = useState('All MSME categories');
  const [selectedStateFilter, setSelectedStateFilter] = useState('All states');
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState('All districts');
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [sortKey, setSortKey] = useState<'name' | 'region' | 'gst' | 'capability'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modal states
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  // Quote form state
  const [quoteForm, setQuoteForm] = useState({
    subject: '',
    message: '',
    documentUrl: ''
  });
  const [submittingQuote, setSubmittingQuote] = useState(false);
  const [isUploadingQuoteDoc, setIsUploadingQuoteDoc] = useState(false);

  const handleUploadQuoteDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingQuoteDoc(true);
    const optimizedFile = await compressImage(file);
    const formData = new FormData();
    formData.append('file', optimizedFile);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setQuoteForm(prev => ({ ...prev, documentUrl: data.url }));
        toast.success('Specifications document attached');
      } else {
        toast.error('Upload failed');
      }
    } catch (err) {
      toast.error('Upload error');
    } finally {
      setIsUploadingQuoteDoc(false);
    }
  };

  const categories = [
    'All categories',
    'IT Hardware',
    'Software & Cloud',
    'Office Supplies',
    'Furniture',
    'Industrial Equipment',
    'Medical Supplies',
    'Construction',
    'Logistics',
    'Consulting',
    'Catering'
  ];

  const msmeCategories = [
    'All MSME categories',
    'Micro',
    'Small',
    'Medium',
    'Large'
  ];

  const statesList = [
    'All states', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu & Kashmir', 'Ladakh'
  ];

  const districtOptions = selectedStateFilter === 'All states'
    ? []
    : indiaStatesDistricts[selectedStateFilter.toUpperCase()] || [];

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const res = await api.get('/api/vendors', authOptions);
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
      } else {
        toast.error('Failed to fetch vendors');
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast.error('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProfile = async (vendor: Vendor) => {
    setFetchingDetails(true);
    try {
      const res = await api.get(`/api/vendors/${vendor.id || vendor._id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const detailedVendor = await res.json();
        setSelectedVendor(detailedVendor);
        setIsProfileModalOpen(true);
      } else {
        toast.error('Could not load profile details');
      }
    } catch (error) {
      toast.error('Network error');
    } finally {
      setFetchingDetails(false);
    }
  };

  const handleOpenQuoteModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsQuoteModalOpen(true);
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;

    setSubmittingQuote(true);
    try {
      const res = await api.post('/api/quote-requests', {
        sellerId: selectedVendor.id || selectedVendor._id,
        ...quoteForm
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success(`Quote request sent to ${selectedVendor.sellerProfile?.businessName || selectedVendor.name}`);
        setIsQuoteModalOpen(false);
        setQuoteForm({ subject: '', message: '', documentUrl: '' });
      } else {
        const error = await res.json();
        toast.error(error.message || 'Failed to send request');
      }
    } catch (error) {
      toast.error('Server error');
    } finally {
      setSubmittingQuote(false);
    }
  };

  const toggleSort = (key: typeof sortKey) => {
    setSortDirection(prev => sortKey === key && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const SortHeader = ({ label, field, align = 'left' }: { label: string; field: typeof sortKey; align?: 'left' | 'right' }) => {
    const isActive = sortKey === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#12335f] hover:text-[#0b2445] transition-colors ${align === 'right' ? 'justify-end' : ''}`}
      >
        {label}
        {isActive ? (
          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  const filteredVendors = vendors.filter(vendor => {
    const profile = vendor.sellerProfile || {};
    const matchesSearch = (profile.businessName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (profile.city || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (vendor.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'All categories' ||
      (profile.productCategories || []).includes(selectedCategory);

    const matchesSize = selectedSize === 'All MSME categories' ||
      (profile.msmeCategory || '') === selectedSize;

    const matchesState = selectedStateFilter === 'All states' ||
      (profile.state || '').toLowerCase() === selectedStateFilter.toLowerCase();

    const profileDistrict = String((profile as any).district || profile.city || '').toLowerCase();
    const matchesDistrict = selectedDistrictFilter === 'All districts' ||
      profileDistrict === selectedDistrictFilter.toLowerCase();

    const matchesVerification = !verifiedOnly || Boolean(profile.gst || profile.pan);
    return matchesSearch && matchesCategory && matchesSize && matchesState && matchesDistrict && matchesVerification;
  }).sort((a, b) => {
    const valueFor = (vendor: Vendor) => {
      const profile = (vendor.sellerProfile || {}) as Partial<Vendor['sellerProfile']>;
      if (sortKey === 'region') return `${profile.state || ''} ${profile.city || ''}`;
      if (sortKey === 'gst') return profile.gst || profile.pan || '';
      if (sortKey === 'capability') return (profile.productCategories || []).join(', ');
      return profile.businessName || vendor.name || '';
    };
    return valueFor(a).localeCompare(valueFor(b)) * (sortDirection === 'asc' ? 1 : -1);
  });
  const { page, pageSize, pageItems: pagedVendors, total, setPage, setPageSize } = usePagination(filteredVendors, 18);

  return (
    <div className="min-h-screen bg-[#f1f3f5] text-[#1a1c21]">
      {/* Main Header Container */}
      <div className="bg-white border-b border-[#dfe3e8] px-6 py-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#1a1c21] uppercase">Supplier Registry</h1>
            <p className="text-xs text-slate-500 font-medium">Locate and engage verified MSME vendors across nationwide sectors.</p>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>
      </div>

      <div className="p-3 md:p-4 flex flex-col lg:flex-row gap-4 items-start">
        {/* Sidebar Filters (Government Style: Boxy, Rigid, Informative) */}
        <div className="w-full lg:w-64 bg-white border border-[#dadce0] rounded-lg overflow-hidden flex-shrink-0 sticky top-3">
          <div className="bg-[#f8f9fa] border-b border-[#dadce0] px-3 py-2.5 flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#12335f]" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">Search Parameters</h3>
          </div>

          <div className="p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Keyword Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Name, city, or ID..."
                  className="pl-9 h-8 bg-white border-[#dadce0] rounded text-xs placeholder:text-slate-400 focus:ring-1 focus:ring-[#12335f]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Product Category</label>
              <select
                className="w-full h-8 px-2 bg-white border border-[#dadce0] rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] cursor-pointer"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">State</label>
              <select
                className="w-full h-8 px-2 bg-white border border-[#dadce0] rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] cursor-pointer"
                value={selectedStateFilter}
                onChange={(e) => {
                  setSelectedStateFilter(e.target.value);
                  setSelectedDistrictFilter('All districts');
                }}
              >
                {statesList.map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">District</label>
              <select
                className="w-full h-8 px-2 bg-white border border-[#dadce0] rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
                value={selectedDistrictFilter}
                onChange={(e) => setSelectedDistrictFilter(e.target.value)}
                disabled={selectedStateFilter === 'All states'}
              >
                <option value="All districts">{selectedStateFilter === 'All states' ? 'Select state first' : 'All districts'}</option>
                {districtOptions.map(district => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">MSME Category</label>
              <select
                className="w-full h-8 px-2 bg-white border border-[#dadce0] rounded text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] cursor-pointer"
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
              >
                {msmeCategories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-[#f1f3f4]">
              <button
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className="flex items-center gap-2 w-full text-left"
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center transition-all ${verifiedOnly ? 'bg-[#12335f] border-[#12335f]' : 'border-[#dadce0]'}`}>
                  {verifiedOnly && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                <span className="text-[11px] font-bold text-slate-700 uppercase">Show Verified Only</span>
              </button>
            </div>
          </div>
        </div>

        {/* Results Space */}
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>Found {filteredVendors.length} registered vendors matching criteria</span>}
            </div>
          </div>

          {loading ? (
            <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-3"}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-white border border-[#dadce0] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="bg-white border border-[#dadce0] rounded-xl p-12 text-center">
              <div className="h-16 w-16 bg-[#f8f9fa] border border-[#dadce0] rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="h-8 w-8 text-[#12335f]/30" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tight text-[#1a1c21]">No results returned</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Try relaxing the search criteria or expanding state selection.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagedVendors.map((vendor) => (
                <div key={vendor._id} className="bg-white border border-[#dadce0] rounded-xl p-5 flex flex-col shadow-sm hover:shadow transition-all">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-10 w-10 shrink-0 rounded bg-[#f1f3f5] border border-[#dadce0] flex items-center justify-center text-[#12335f] font-black text-sm uppercase">
                      {vendor.sellerProfile?.businessName?.charAt(0) || vendor.name?.charAt(0) || 'V'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 className="font-black text-xs uppercase tracking-tight text-wrap-anywhere text-[#1a1c21]">{vendor.sellerProfile?.businessName || vendor.name}</h3>
                        {vendor.sellerProfile?.gst && <CheckCircle2 className="h-3 w-3 text-[#12335f] shrink-0" />}
                      </div>
                      <div className="mt-1 mb-1">
                        <EntityIdLink label={`VND-${String(vendor.id || vendor._id).padStart(5, '0')}`} id={vendor.id || vendor._id} size="sm" onClick={() => handleViewProfile(vendor)} />
                      </div>
                      <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 uppercase">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />
                        {vendor.sellerProfile?.city || 'City'}, {vendor.sellerProfile?.state || 'State'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1 mb-2.5">
                    {vendor.sellerProfile?.msmeType && (
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-full px-2 py-0.5 text-[9px] uppercase font-black tracking-wider">
                        {vendor.sellerProfile.msmeType.replace(/_/g, ' ')}
                      </span>
                    )}
                    {vendor.sellerProfile?.vendorType && (
                      <span className="bg-blue-50 text-blue-700 border border-blue-200/50 rounded-full px-2 py-0.5 text-[9px] uppercase font-black tracking-wider">
                        {vendor.sellerProfile.vendorType.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-600 mb-4 flex-1 line-clamp-2 border-t border-b border-[#f1f3f5] py-3 my-2">
                    Specialized provider in {(vendor.sellerProfile?.productCategories || []).join(', ') || 'Enterprise Supplies'}. Recognized for reliability.
                  </p>

                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase bg-[#f8f9fa] border border-[#dadce0] px-2 py-0.5 rounded">
                      {vendor.sellerProfile?.gst || 'NOT AVAILABLE'}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] font-black text-[#1a1c21]">
                      <Star className="h-3 w-3 text-amber-500 fill-current" />
                      4.6
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleViewProfile(vendor)}
                      disabled={fetchingDetails}
                      className="h-8 border border-[#dadce0] text-[#12335f] rounded text-[10px] font-black uppercase tracking-wider hover:bg-[#f8f9fa] transition-all flex items-center justify-center"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => handleOpenQuoteModal(vendor)}
                      className="h-8 bg-[#12335f] text-white rounded text-[10px] font-black uppercase tracking-wider hover:bg-[#0b2445] shadow-sm shadow-[#12335f]/20 transition-all flex items-center justify-center"
                    >
                      Request Quote
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* LIST VIEW (Table style high density) */
            <div className="overflow-x-auto bg-white border border-[#dadce0] rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="bg-[#f8f9fa] border-b border-[#dadce0]">
                  <tr>
                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-[#12335f]">Sr. No.</th>
                    <th className="p-3"><SortHeader label="Vendor Identity" field="name" /></th>
                    <th className="p-3"><SortHeader label="Region" field="region" /></th>
                    <th className="p-3"><SortHeader label="Registration (GST)" field="gst" /></th>
                    <th className="p-3"><SortHeader label="Capability" field="capability" /></th>
                    <th className="p-3 text-right text-[10px] font-black uppercase tracking-wider text-[#12335f]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f3f5]">
                  {pagedVendors.map((vendor, index) => (
                    <tr key={vendor._id} className="hover:bg-[#fcfcfd] transition-colors">
                      <td className="p-3 font-mono text-[11px] font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded bg-[#f1f3f5] border border-[#dadce0] flex items-center justify-center text-[#12335f] font-black text-xs shrink-0">
                            {vendor.sellerProfile?.businessName?.charAt(0) || 'V'}
                          </div>
                          <div>
                            <p className="font-black text-xs uppercase tracking-tight text-[#1a1c21] text-wrap-anywhere">{vendor.sellerProfile?.businessName || vendor.name}</p>
                            <div className="mt-1">
                              <EntityIdLink label={`VND-${String(vendor.id || vendor._id).padStart(5, '0')}`} id={vendor.id || vendor._id} size="sm" onClick={() => handleViewProfile(vendor)} />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-[9px] font-bold text-[#12335f] uppercase">
                                {vendor.sellerProfile?.msmeCategory || 'Registered'} Enterprise
                              </p>
                              {vendor.sellerProfile?.msmeType && (
                                <span className="bg-emerald-50 text-emerald-700 px-1 py-0.2 rounded text-[8px] uppercase font-black">
                                  {vendor.sellerProfile.msmeType.replace(/_/g, ' ')}
                                </span>
                              )}
                              {vendor.sellerProfile?.vendorType && (
                                <span className="bg-blue-50 text-blue-700 px-1 py-0.2 rounded text-[8px] uppercase font-black">
                                  {vendor.sellerProfile.vendorType.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-[11px] font-bold text-slate-600 uppercase">
                        {vendor.sellerProfile?.city || 'N/A'}, {vendor.sellerProfile?.state || 'N/A'}
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-mono font-bold text-slate-600 uppercase bg-[#f1f3f5] border border-[#dadce0] px-2 py-0.5 rounded inline-block">
                          {vendor.sellerProfile?.gst || 'PENDING'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {(vendor.sellerProfile?.productCategories || []).slice(0, 2).map(c => (
                            <span key={c} className="text-[9px] font-bold text-slate-500 border border-[#dadce0] rounded px-1.5 py-0.5 uppercase">{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewProfile(vendor)}
                            className="h-7 px-3 border border-[#dadce0] text-[#12335f] rounded text-[9px] font-black uppercase tracking-wider hover:bg-[#f8f9fa]"
                          >
                            Info
                          </button>
                          <button
                            onClick={() => handleOpenQuoteModal(vendor)}
                            className="h-7 px-3 bg-[#12335f] text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-[#0b2445]"
                          >
                            Quote
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredVendors.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-[#dadce0] bg-white">
              <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="vendors" />
            </div>
          )}
        </div>
      </div>


      {/* Vendor Profile Modal */}
      {isProfileModalOpen && selectedVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-[#12335f] flex items-center justify-center text-white font-black text-xl shadow shadow-slate-900/10">
                  {selectedVendor.sellerProfile?.businessName?.charAt(0) || selectedVendor.name?.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    {selectedVendor.sellerProfile?.businessName || selectedVendor.name}
                    <CheckCircle2 className="h-4 w-4 text-[#12335f]" />
                  </h2>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{selectedVendor.sellerProfile?.organizationType || 'Private Limited'} · {selectedVendor.sellerProfile?.msmeCategory || 'Medium'} Enterprise</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="h-6 w-6 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <VendorRatingTile sellerId={Number(selectedVendor.id)} />
                {[
                  { label: 'City', value: selectedVendor.sellerProfile?.city || selectedVendor.sellerProfile?.offices?.find((o: any) => o.gstNumber)?.city || selectedVendor.sellerProfile?.offices?.[0]?.city || 'N/A', icon: MapPin, color: 'text-blue-500' },
                  { label: 'Established', value: selectedVendor.sellerProfile?.dateOfIncorporation ? new Date(selectedVendor.sellerProfile.dateOfIncorporation).getFullYear() : '2018', icon: Building2, color: 'text-teal-500' },
                  { label: 'PAN Verified', value: 'Yes', icon: ShieldCheck, color: 'text-emerald-500' }
                ].map(stat => (
                  <div key={stat.label} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-1">
                      <stat.icon className={`h-3 w-3 ${stat.color}`} />
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{stat.label}</span>
                    </div>
                    <div className="text-xs font-black text-slate-900 uppercase">{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Bio/Info */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-black uppercase text-[#12335f] tracking-[0.1em] flex items-center gap-2">
                  <Info className="h-3.5 w-3.5" />
                  Business Overview
                </h3>
                <p className="text-xs font-medium text-slate-600 leading-relaxed border-l-2 border-slate-200 pl-4 py-0.5">
                  {selectedVendor.sellerProfile?.businessName || selectedVendor.name} is a leading provider in the {selectedVendor.sellerProfile?.productCategories?.[0] || 'MSME'} sector, specializing in high-quality deliverables for enterprise-grade procurement. With a focus on compliance and efficiency, we ensure seamless supply chain integration for our buyer partners.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Business Details */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Business Details</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'GST Number', value: selectedVendor.sellerProfile?.gst, icon: FileText },
                      { label: 'Business PAN', value: selectedVendor.sellerProfile?.pan, icon: Briefcase },
                      { label: 'Email Address', value: selectedVendor.email, icon: Mail },
                      { label: 'Incorporation', value: selectedVendor.sellerProfile?.dateOfIncorporation ? new Date(selectedVendor.sellerProfile.dateOfIncorporation).toLocaleDateString() : 'N/A', icon: Clock },
                      { label: 'MSME Type', value: selectedVendor.sellerProfile?.msmeType?.replace(/_/g, ' '), icon: Building2 },
                      { label: 'Vendor Type', value: selectedVendor.sellerProfile?.vendorType?.replace(/_/g, ' '), icon: Briefcase }
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3 group font-medium">
                        <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-[#12335f] transition-colors">
                          <item.icon className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">{item.label}</p>
                          <p className="text-xs font-bold text-slate-800">{item.value || 'Verified'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Categories & Offices */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.1em]">Categories & Reach</h3>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {selectedVendor.sellerProfile?.productCategories?.map(cat => (
                        <span key={cat} className="px-2 py-1 rounded-md bg-slate-50 text-[#12335f] text-[10px] font-black uppercase border border-slate-200">
                          {cat}
                        </span>
                      ))}
                    </div>
                    {selectedVendor.sellerProfile?.registrationTypes && selectedVendor.sellerProfile.registrationTypes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Certifications / Registrations</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedVendor.sellerProfile.registrationTypes.map((reg: string) => (
                            <span key={reg} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase border border-emerald-100">
                              {reg.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Registered Offices</p>
                      {selectedVendor.sellerProfile?.offices && selectedVendor.sellerProfile.offices.length > 0 ? (
                        <div className="space-y-2">
                          {selectedVendor.sellerProfile.offices.map((office: any) => (
                            <div key={office.id} className="flex gap-2">
                              <MapPin className="h-3.5 w-3.5 text-[#12335f] mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-bold text-slate-800">{office.name}</p>
                                <p className="text-[10px] text-slate-500">{office.address}, {office.city}, {office.state}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-medium">{selectedVendor.sellerProfile?.city || selectedVendor.sellerProfile?.offices?.[0]?.city || 'N/A'}, {selectedVendor.sellerProfile?.state || selectedVendor.sellerProfile?.offices?.[0]?.state || 'N/A'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsProfileModalOpen(false)}
                className="rounded-lg h-9 px-5 font-bold uppercase text-[11px] tracking-wider text-slate-600 hover:text-slate-900 border-slate-200"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setIsProfileModalOpen(false);
                  setIsQuoteModalOpen(true);
                }}
                className="bg-[#12335f] hover:bg-[#0b2445] text-white rounded-lg h-9 px-5 font-bold uppercase text-[11px] tracking-wider shadow shadow-slate-200"
              >
                Request Quote
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Quote Modal */}
      {isQuoteModalOpen && selectedVendor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 space-y-5">
              <div className="space-y-1">
                <div className="h-9 w-9 rounded-lg bg-slate-50 text-[#12335f] flex items-center justify-center mb-2">
                  <Send className="h-4 w-4" />
                </div>
                <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">Send Request</h2>
                <p className="text-[11px] text-slate-500 font-bold">Requesting a quote from <span className="text-[#12335f]">{selectedVendor.sellerProfile?.businessName || selectedVendor.name}</span></p>
              </div>

              <form onSubmit={handleSubmitQuote} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 ml-1">Subject</label>
                  <input
                    required
                    value={quoteForm.subject}
                    onChange={(e) => setQuoteForm({ ...quoteForm, subject: e.target.value })}
                    placeholder="e.g. Bulk Procurement for IT Hardware"
                    className="w-full bg-slate-50 border-slate-200 border rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all text-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 ml-1">Message Details</label>
                  <textarea
                    required
                    value={quoteForm.message}
                    onChange={(e) => setQuoteForm({ ...quoteForm, message: e.target.value })}
                    placeholder="Describe your requirements..."
                    rows={3}
                    className="w-full bg-slate-50 border-slate-200 border rounded-lg py-2 px-3 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all resize-none text-slate-900"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 ml-1">Specifications (Optional)</label>
                  <div className={`relative flex items-center justify-between w-full bg-slate-50 border border-slate-200 border-dashed rounded-lg p-3 transition-all ${quoteForm.documentUrl ? 'bg-emerald-50/40 border-emerald-200' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-md ${quoteForm.documentUrl ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                        <Paperclip className="h-3.5 w-3.5" />
                      </div>
                      <span className={`text-xs font-semibold ${quoteForm.documentUrl ? 'text-emerald-700' : 'text-slate-600'}`}>
                        {quoteForm.documentUrl ? "Document attached" : "Attach requirement PDF"}
                      </span>
                    </div>

                    <input
                      type="file"
                      id="quote-doc"
                      accept=".pdf,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={handleUploadQuoteDoc}
                      disabled={isUploadingQuoteDoc}
                    />
                    <label
                      htmlFor="quote-doc"
                      className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wide cursor-pointer transition-all ${quoteForm.documentUrl
                        ? "bg-white border border-emerald-200 text-emerald-700"
                        : "bg-[#12335f] text-white hover:bg-[#0b2445]"
                        }`}
                    >
                      {isUploadingQuoteDoc ? "Wait..." : quoteForm.documentUrl ? "Change" : "Upload"}
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsQuoteModalOpen(false)}
                    className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    Cancel
                  </button>
                  <Button
                    disabled={submittingQuote}
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white border-0 h-9 px-6 rounded-lg font-bold uppercase text-[11px] tracking-wide transition-all shadow shadow-slate-200"
                  >
                    {submittingQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Send Request'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function VendorRatingTile({ sellerId }: { sellerId: number }) {
  const summary = useSupplierSummary(sellerId);
  const value = summary.data && summary.data.count > 0
    ? `${summary.data.average.toFixed(1)} / 5`
    : 'New';
  const sublabel = summary.data && summary.data.count > 0
    ? `${summary.data.count} ratings`
    : 'No ratings yet';
  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div className="flex items-center gap-2 mb-1">
        <StarIcon className="h-3 w-3 text-amber-500" />
        <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Rating</span>
      </div>
      <div className="text-xs font-black text-slate-900 uppercase">{value}</div>
      <div className="text-[9px] font-bold text-slate-500 uppercase">{sublabel}</div>
    </div>
  );
}

export default Vendors;
