import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Search, 
  Filter, 
  Clock, 
  MapPin,
  Building2,
  ChevronRight,
  FileText,
  BadgeInfo,
  Users,
  Calendar,
  Paperclip
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface PublicTender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  status: string;
  closesAt: string;
  createdAt?: string;
  description: string;
  bidsCount?: number;
  documentUrl?: string;
  buyer: {
    name: string;
    buyerProfile?: {
      organizationName: string;
      city: string;
      state: string;
    }
  }
}

export default function SellerTenders() {
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedTenders = api.peek('/api/tenders/public', authOptions);
  const [tenders, setTenders] = useState<PublicTender[]>(cachedTenders || []);
  const [loading, setLoading] = useState(!cachedTenders);
  
  // Enhanced Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [budgetRange, setBudgetRange] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  
  const navigate = useNavigate();

  useEffect(() => {
    fetchPublicTenders();
  }, []);

  const fetchPublicTenders = async () => {
    try {
      const res = await api.get('/api/tenders/public', authOptions);
      if (res.ok) {
        const data = await res.json();
        setTenders(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch public tenders', err);
      toast.error(`Could not load tenders: ${err.message || 'Network error'}`);
    } finally {
      setLoading(false);
    }
  };

  const uniqueCategories = ['All', ...Array.from(new Set(tenders.map(t => t.category).filter(Boolean)))];
  const uniqueStates = ['All', ...Array.from(new Set(tenders.map(t => t.buyer.buyerProfile?.state).filter(Boolean)))];

  const filteredTenders = tenders.filter(t => {
    const matchesSearch = 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tenderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.buyer.buyerProfile?.organizationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesState = selectedState === 'All' || t.buyer.buyerProfile?.state === selectedState;
    
    let matchesBudget = true;
    if (budgetRange === 'under_10l') matchesBudget = t.budget < 1000000;
    else if (budgetRange === '10l_50l') matchesBudget = t.budget >= 1000000 && t.budget <= 5000000;
    else if (budgetRange === 'above_50l') matchesBudget = t.budget > 5000000;

    return matchesSearch && matchesCategory && matchesState && matchesBudget;
  }).sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    if (sortBy === 'budget_high') return b.budget - a.budget;
    if (sortBy === 'budget_low') return a.budget - b.budget;
    if (sortBy === 'deadline') return new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime();
    return 0;
  });

  const getDaysLeft = (date: string) => {
    const diff = new Date(date).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    return days > 0 ? `${days}d` : 'Closing soon';
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Compact Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Active Tenders</h1>
              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                {filteredTenders.length} Found
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Discover procurement opportunities.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:flex-nowrap justify-end">
            <div className="relative flex-1 min-w-[200px] max-w-full lg:w-64">
              <Search className="absolute inset-y-0 left-3 flex items-center h-full w-3.5 text-slate-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search keyword, ID or company..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 bg-white border border-slate-200 rounded-lg pl-9 pr-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[110px] cursor-pointer"
            >
              <option value="All">All Sectors</option>
              {uniqueCategories.filter(c => c !== 'All').map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <select
              value={budgetRange}
              onChange={(e) => setBudgetRange(e.target.value)}
              className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[110px] cursor-pointer"
            >
              <option value="All">All Budgets</option>
              <option value="under_10l">Under 10 Lakh</option>
              <option value="10l_50l">10L - 50L</option>
              <option value="above_50l">Above 50L</option>
            </select>

            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="h-9 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[100px] cursor-pointer"
            >
              <option value="All">All Locations</option>
              {uniqueStates.filter(s => s !== 'All').map(st => <option key={st} value={st}>{st}</option>)}
            </select>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 px-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm cursor-pointer tracking-wide"
            >
              <option value="newest">Newest Posted</option>
              <option value="deadline">Expiring Soonest</option>
              <option value="budget_high">Budget (High to Low)</option>
              <option value="budget_low">Budget (Low to High)</option>
            </select>
          </div>
        </div>

        {/* Tenders Grid */}
        <div className="grid grid-cols-1 gap-3">
          {filteredTenders.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center">
              <FileText className="h-10 w-10 text-slate-200 mx-auto mb-2" />
              <p className="text-base font-bold text-slate-900">No active tenders found</p>
            </div>
          ) : (
            filteredTenders.map((tender, index) => (
              <Card key={tender.id} className="border-slate-200 shadow-sm hover:shadow transition-all duration-200 overflow-hidden group">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-stretch">
                    <div className="flex-1 p-4 px-6 relative">
                      {/* Sr.No Indicator */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500/20 group-hover:bg-indigo-500 transition-colors" />
                      
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded min-w-[24px] text-center">
                          {index + 1}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {tender.tenderId}
                        </span>
                        <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                          {tender.category}
                        </span>
                        {tender.documentUrl && (
                          <span className="flex items-center gap-1 text-[9px] font-black bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded border border-emerald-100 uppercase">
                            <Paperclip className="h-2.5 w-2.5" /> Specs
                          </span>
                        )}
                        {(tender.bidsCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-100 uppercase">
                            <Users className="h-2.5 w-2.5" /> {tender.bidsCount} {tender.bidsCount === 1 ? 'Bid' : 'Bids'}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 ml-auto md:ml-0">
                          <Clock className="h-3 w-3" />
                          {getDaysLeft(tender.closesAt)}
                        </span>
                      </div>

                      <h3 className="text-[15px] font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">
                        {tender.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mb-3 font-medium max-w-2xl">
                        {tender.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded bg-slate-100 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <p className="text-[11px] font-semibold text-slate-700 line-clamp-1">
                            {tender.buyer.buyerProfile?.organizationName || tender.buyer.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded bg-slate-100 flex items-center justify-center shrink-0">
                            <MapPin className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <p className="text-[11px] font-semibold text-slate-600">
                            {tender.buyer.buyerProfile?.city}, {tender.buyer.buyerProfile?.state}
                          </p>
                        </div>
                        {tender.createdAt && (
                          <div className="flex items-center gap-2 border-l border-slate-200 pl-6 hidden sm:flex">
                            <div className="h-7 w-7 rounded bg-slate-100 flex items-center justify-center shrink-0">
                              <Calendar className="h-3.5 w-3.5 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase">Posted On</p>
                              <p className="text-[10px] font-bold text-slate-600">
                                {new Date(tender.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-full md:w-60 bg-slate-50/30 border-t md:border-t-0 md:border-l border-slate-100 p-4 flex md:flex-col items-center justify-between md:justify-center gap-4">
                      <div className="text-left md:text-center w-full">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Budget</p>
                        <p className="text-lg font-black text-slate-800">₹{tender.budget?.toLocaleString()}</p>
                      </div>
                      <Button 
                        onClick={() => navigate(`/seller/tenders/${tender.id}/bid`)}
                        className="h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-colors shrink-0"
                      >
                        Participate
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
