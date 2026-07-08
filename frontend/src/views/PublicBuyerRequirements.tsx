import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import {
  Building2,
  MapPin,
  Search,
  ArrowLeft,
  Download,
  CheckCircle2,
  Globe,
  Phone,
  Mail,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv } from '../features/shared/exportUtils';

interface PublicBuyerRequirementsProps {
  buyerId: number;
}

export default function PublicBuyerRequirements({ buyerId }: PublicBuyerRequirementsProps) {
  const [profile, setProfile] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchProfile = async () => {
    try {
      const res = await api.fetch(`/api/buyer-showcase/public/organizations/${buyerId}`);
      if (res.ok) {
        const body = await res.json();
        setProfile(body.data);
      } else {
        toast.error('Failed to load organization profile');
      }
    } catch (err) {
      console.error('Failed to fetch profile', err);
      toast.error('Network error loading profile');
    }
  };

  const fetchItems = async () => {
    setItemsLoading(true);
    try {
      const query = new URLSearchParams();
      if (searchTerm) query.append('search', searchTerm);
      if (selectedCategory) query.append('category', selectedCategory);

      const res = await api.fetch(`/api/buyer-showcase/public/organizations/${buyerId}/items?${query.toString()}`);
      if (res.ok) {
        const body = await res.json();
        const itemsList = body.data || [];
        setItems(itemsList);

        // Extract unique categories from items for filtering if categories not already set
        if (categories.length === 0) {
          const uniqueCats: string[] = Array.from(
            new Set(itemsList.map((item: any) => item.category).filter(Boolean))
          ) as string[];
          setCategories(uniqueCats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch items', err);
    } finally {
      setItemsLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [buyerId]);

  useEffect(() => {
    fetchItems();
    setCurrentPage(1); // Reset page on filter change
  }, [buyerId, searchTerm, selectedCategory]);

  const handleExportCSV = () => {
    if (items.length === 0) {
      toast.error('No items to export');
      return;
    }

    const headers = ['Serial No', 'Item Description', 'Category', 'Estimated Monthly Qty', 'Unit', 'Remarks'];
    const rows = items.map(item => [
      item.serialNo || '',
      item.itemDescription || '',
      item.category || '',
      item.estimatedMonthlyRequirement || '',
      item.unit || '',
      item.remarks || ''
    ]);

    downloadCsv(`${profile?.organizationName?.replace(/\s+/g, '_') || 'buyer'}_requirements.csv`, [headers, ...rows]);
    toast.success('Requirements list downloaded successfully');
  };

  // Pagination logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = items.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(items.length / itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-[#12335f] animate-spin" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Loading Showcase...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Building2 className="h-16 w-16 text-slate-300 mb-4 animate-bounce" />
        <h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">Showcase Not Available</h2>
        <p className="text-sm text-slate-500 mt-2 text-center max-w-md font-semibold">
          The requested buyer profile is not verified, not active, or does not exist.
        </p>
        <Button
          onClick={() => window.location.href = '/'}
          className="mt-6 bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest h-11 px-6 rounded-2xl"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Portal
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 pb-20 relative">
      {/* 3-Color Flag Accent Strip */}
      <div className="brand-tricolor-strip w-full absolute top-0 left-0 z-50 h-1.5 bg-gradient-to-r from-orange-500 via-white to-green-600" />

      {/* Hero Banner Area */}
      <div className="w-full relative h-64 md:h-80 lg:h-[360px] bg-[#12335f] overflow-hidden">
        {profile.bannerUrl ? (
          <img
            src={profile.bannerUrl}
            alt="Org Banner"
            className="w-full h-full object-cover opacity-90"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-[#0b2447] via-[#12335f] to-indigo-900 opacity-90" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/30 to-transparent" />
        <div className="absolute top-6 left-6 z-10">
          <Button
            onClick={() => window.history.back()}
            className="bg-white/90 hover:bg-white text-slate-800 hover:text-slate-950 font-black uppercase text-[10px] tracking-wider h-9 px-4 rounded-xl shadow-md border backdrop-blur-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back
          </Button>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Organization Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-3xl border border-slate-200/60 shadow-[0_12px_40px_rgba(0,0,0,0.03)] bg-white/95 backdrop-blur-md relative">
              <div className="p-6 md:p-8 flex flex-col items-center text-center">
                {/* Logo overlapping banner */}
                <div className="w-32 h-32 rounded-3xl bg-white border border-slate-200/80 shadow-xl flex items-center justify-center p-3.5 -mt-24 mb-5 relative z-20 transition-transform duration-300 hover:scale-105">
                  {profile.logoUrl ? (
                    <img src={profile.logoUrl} alt="Org Logo" className="w-full h-full object-contain rounded-2xl bg-white" />
                  ) : (
                    <Building2 className="w-14 h-14 text-slate-350" />
                  )}
                </div>

                <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider mb-4">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Verified Buyer
                </div>

                <h1 className="text-lg font-black text-slate-900 tracking-tight leading-snug uppercase">
                  {profile.organizationName}
                </h1>
                
                {profile.departmentName && profile.departmentName !== 'N/A' && (
                  <p className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wider">
                    {profile.departmentName}
                  </p>
                )}

                <div className="w-full border-t border-slate-100 my-5" />

                <div className="w-full space-y-4 text-left text-xs">
                  {profile.organizationType && profile.organizationType !== 'N/A' && (
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Organization Type</span>
                      <span className="font-extrabold text-slate-800 text-xs">{profile.organizationType}</span>
                    </div>
                  )}

                  {profile.registrationNumber && profile.registrationNumber !== 'N/A' && (
                    <div className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Registration Number (CIN)</span>
                      <span className="font-extrabold text-slate-850 font-mono text-xs">{profile.registrationNumber}</span>
                    </div>
                  )}

                  {profile.address && profile.address !== 'N/A' && (
                    <div className="flex gap-2">
                      <MapPin className="h-4 w-4 text-slate-450 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Address</span>
                        <span className="font-bold text-slate-750 leading-relaxed block text-xs">
                          {profile.address}
                          {(profile.city && profile.city !== 'N/A') || (profile.state && profile.state !== 'N/A') || (profile.pincode && profile.pincode !== 'N/A') ? (
                            <span className="block mt-0.5 text-slate-500 font-semibold">
                              {[profile.city, profile.state, profile.pincode].filter(v => v && v !== 'N/A').join(', ')}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  )}

                  {profile.website && (
                    <div className="flex gap-2">
                      <Globe className="h-4 w-4 text-slate-450 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Website</span>
                        <a
                          href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#12335f] hover:underline text-xs"
                        >
                          {profile.website}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Disclaimer + Table Showcase */}
          <div className="lg:col-span-8 space-y-6">
            {/* Informational Disclaimer Notice */}
            <div className="bg-amber-50/80 border border-amber-200/80 rounded-3xl p-5 md:p-6 flex gap-4 backdrop-blur-md shadow-sm">
              <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">Official Portal Information Notice</h4>
                <p className="text-xs text-amber-900 leading-relaxed font-semibold">
                  This list represents frequently purchased items uploaded by the verified buyer organization. It is for information and supplier awareness only. It is not a tender, bid, RFQ, or purchase order. Suppliers are encouraged to review these requirements to prepare catalog alignments.
                </p>
              </div>
            </div>

            {/* Showcase Items Grid & Filter */}
            <Card className="rounded-3xl border-none shadow-[0_8px_30px_rgb(0,0,0,0.02)] bg-white">
              <CardContent className="p-6 md:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 uppercase">Frequently Bought Requirements</h3>
                    <p className="text-xs font-semibold text-slate-400 mt-1">Total Verified Items: {items.length}</p>
                  </div>
                  <Button
                    onClick={handleExportCSV}
                    className="bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-wider h-10 px-5 rounded-xl flex items-center justify-center shadow-sm"
                  >
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Export CSV
                  </Button>
                </div>

                {/* Filter and Search Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative sm:col-span-2">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search items by description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all placeholder-slate-400"
                    />
                  </div>
                  <div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs font-bold text-slate-850 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all"
                    >
                      <option value="">All Categories</option>
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full border-collapse text-left text-xs font-semibold text-slate-700">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        <th className="p-4 w-20">Sl. No.</th>
                        <th className="p-4">Item Description</th>
                        <th className="p-4 w-32">Category</th>
                        <th className="p-4 w-36">Monthly Requirement</th>
                        <th className="p-4 w-24">Unit</th>
                        <th className="p-4 w-48">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemsLoading ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <div className="h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#12335f] animate-spin" />
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtering items...</span>
                            </div>
                          </td>
                        </tr>
                      ) : currentItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-10 text-center text-slate-400 uppercase text-[10px] font-black tracking-wider">
                            No requirements found matching the search criteria.
                          </td>
                        </tr>
                      ) : (
                        currentItems.map((item, index) => (
                          <tr key={item.id} className="hover:bg-slate-50/40 transition-colors">
                            <td className="p-4 font-bold text-slate-400">
                              {item.serialNo || (indexOfFirstItem + index + 1)}
                            </td>
                            <td className="p-4 font-extrabold text-slate-900 max-w-xs break-words">
                              {item.itemDescription}
                            </td>
                            <td className="p-4">
                              {item.category ? (
                                <span className="bg-slate-100 text-slate-800 rounded-lg px-2 py-0.5 text-[10px] font-bold">
                                  {item.category}
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-900 font-bold">
                              {item.estimatedMonthlyRequirement || '-'}
                            </td>
                            <td className="p-4 font-bold text-slate-500">
                              {item.unit || '-'}
                            </td>
                            <td className="p-4 text-slate-500 font-semibold max-w-xs truncate" title={item.remarks}>
                              {item.remarks || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {!itemsLoading && totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 font-bold">
                      Showing <span className="font-extrabold text-slate-900">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-extrabold text-slate-900">
                        {Math.min(indexOfLastItem, items.length)}
                      </span>{' '}
                      of <span className="font-extrabold text-slate-900">{items.length}</span> items
                    </p>
                    <div className="flex gap-2">
                      <Button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-black uppercase text-[10px] tracking-wider h-8 px-3 rounded-lg"
                      >
                        Prev
                      </Button>
                      <Button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        className="bg-[#12335f] hover:bg-[#0b2447] disabled:opacity-50 text-white font-black uppercase text-[10px] tracking-wider h-8 px-3 rounded-lg"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
