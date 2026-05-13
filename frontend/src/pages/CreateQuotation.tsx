import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { 
  ChevronLeft, 
  Send, 
  IndianRupee, 
  Package, 
  Truck, 
  ShieldCheck, 
  Calendar,
  Building2,
  FileText,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface Tender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  description: string;
  buyer: {
    name: string;
    buyerProfile?: {
      organizationName: string;
    }
  }
}

export default function CreateQuotation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tender, setTender] = useState<Tender | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    unitPrice: '',
    quantity: '',
    deliveryDays: '',
    warranty: '',
    validTill: '',
    note: ''
  });

  useEffect(() => {
    fetchTenderDetails();
  }, [id]);

  const fetchTenderDetails = async () => {
    try {
      // We'll fetch from public tenders list for simplicity, or add a specific endpoint
      const res = await api.get('/api/tenders/public', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const found = data.find((t: any) => t.id === Number(id));
        if (found) setTender(found);
        else {
          toast.error('Tender not found');
          navigate('/seller/tenders');
        }
      }
    } catch (err) {
      toast.error('Failed to load tender details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.unitPrice || !formData.quantity || !formData.deliveryDays) {
      return toast.error('Please fill in all required fields');
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/tenders/${id}/bids`, {
        unitPrice: Number(formData.unitPrice),
        quantity: Number(formData.quantity),
        deliveryDays: Number(formData.deliveryDays),
        warranty: formData.warranty,
        validTill: formData.validTill ? new Date(formData.validTill).toISOString() : null,
        note: formData.note
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Quotation submitted successfully!');
        navigate('/seller/tenders');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Submission failed');
      }
    } catch (err) {
      toast.error('Network error during submission');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading tender details...</div>;
  if (!tender) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={() => navigate('/seller/tenders')}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-xs uppercase tracking-widest mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Tenders
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Tender Summary */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border border-slate-200 shadow-sm overflow-hidden rounded-xl bg-white">
              <div className="bg-[#12335f] p-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">Target Tender</p>
                <h2 className="text-lg font-bold leading-tight">{tender.title}</h2>
              </div>
              <CardContent className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tender ID</p>
                  <p className="text-sm font-mono font-bold text-[#12335f]">{tender.tenderId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Budget Allocation</p>
                  <p className="text-lg font-bold text-slate-900">₹{tender.budget.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Buyer Organization</p>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <p className="text-xs font-bold text-slate-700">
                      {tender.buyer.buyerProfile?.organizationName || tender.buyer.name}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Requirements</p>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    {tender.description}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-900 mb-0.5">Participation Note</p>
                <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                  Your bid will be visible only to the buyer. Ensure your pricing is competitive and includes all applicable taxes.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Bid Form */}
          <div className="lg:col-span-2">
            <Card className="border border-slate-200 shadow-sm rounded-xl overflow-hidden bg-white">
              <CardHeader className="p-5 pb-0">
                <CardTitle className="text-xl font-bold text-slate-900 uppercase tracking-tight">
                  Create Quotation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unit Price (₹) *</label>
                      <div className="relative">
                        <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="0.00"
                          value={formData.unitPrice}
                          onChange={(e) => setFormData({...formData, unitPrice: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity *</label>
                      <div className="relative">
                        <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="e.g. 500"
                          value={formData.quantity}
                          onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Delivery Time (Days) *</label>
                      <div className="relative">
                        <Truck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="number"
                          placeholder="e.g. 15"
                          value={formData.deliveryDays}
                          onChange={(e) => setFormData({...formData, deliveryDays: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Warranty (Optional)</label>
                      <div className="relative">
                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="text"
                          placeholder="e.g. 1 Year onsite"
                          value={formData.warranty}
                          onChange={(e) => setFormData({...formData, warranty: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Validity Date (Optional)</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input 
                          type="date"
                          value={formData.validTill}
                          onChange={(e) => setFormData({...formData, validTill: e.target.value})}
                          className="w-full h-10 bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Additional Notes</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
                      <textarea 
                        rows={3}
                        placeholder="Mention any special conditions, terms, or specifications..."
                        value={formData.note}
                        onChange={(e) => setFormData({...formData, note: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md pl-9 pr-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <Button 
                      type="button" 
                      variant="ghost"
                      onClick={() => navigate('/seller/tenders')}
                      className="h-9 px-4 rounded-md font-bold uppercase text-[10px] tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      disabled={submitting}
                      className="h-9 px-6 bg-[#12335f] hover:bg-[#0b2445] text-white rounded-md font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
                    >
                      {submitting ? 'Submitting...' : 'Submit Quotation'}
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
