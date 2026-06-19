import { useEffect, useState, useMemo } from 'react';
import { Landmark, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Loader2 } from '../components/ui/loader';
import SellerFactoring from '../features/factoring/SellerFactoring';
import FinancierFactoring from '../features/factoring/FinancierFactoring';

export default function FactoringDashboard() {
  const { token, user } = useAuth();
  const [eligibleInvoices, setEligibleInvoices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState<'seller' | 'financier'>('seller');

  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [eligibleRes, requestsRes] = await Promise.all([
        api.fetch('/api/factoring/eligible?take=100', { method: 'GET', headers }),
        api.fetch('/api/factoring/requests?take=100', { method: 'GET', headers })
      ]);

      if (eligibleRes.ok) {
        const data = await eligibleRes.json();
        setEligibleInvoices(data.items || []);
      }

      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setRequests(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load factoring dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm font-bold text-slate-500">Please log in to access this page.</p>
      </div>
    );
  }

  const userRole = user.role as string;
  const isSeller = userRole === 'seller';
  const isFinancier = userRole === 'financier';
  const isAdmin = userRole === 'admin' || userRole === 'master_admin';

  return (
    <div className="space-y-4">
      {/* Title Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">MSME Bill Discounting</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 flex items-center gap-2">
            <Landmark className="h-6 w-6 text-[#12335f]" /> Invoice Factoring Console
          </h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
              <button
                onClick={() => setAdminTab('seller')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md ${
                  adminTab === 'seller' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                Seller View
              </button>
              <button
                onClick={() => setAdminTab('financier')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md ${
                  adminTab === 'financier' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                Financier View
              </button>
            </div>
          )}
          <Button onClick={loadData} disabled={loading} className="w-fit bg-[#12335f] text-white hover:bg-[#0b2445]">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {loading && !eligibleInvoices.length && !requests.length ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#12335f]" />
            <p className="mt-3 text-sm font-bold text-slate-500">Loading factoring console...</p>
          </div>
        </div>
      ) : (
        <>
          {isSeller && (
            <SellerFactoring
              token={token || ''}
              eligibleInvoices={eligibleInvoices}
              activeRequests={requests}
              loading={loading}
              onRefresh={loadData}
            />
          )}

          {isFinancier && (
            <FinancierFactoring
              token={token || ''}
              financierId={Number(user.id)}
              allRequests={requests}
              loading={loading}
              onRefresh={loadData}
            />
          )}

          {isAdmin && (
            <>
              {adminTab === 'seller' ? (
                <SellerFactoring
                  token={token || ''}
                  eligibleInvoices={eligibleInvoices}
                  activeRequests={requests}
                  loading={loading}
                  onRefresh={loadData}
                />
              ) : (
                <FinancierFactoring
                  token={token || ''}
                  financierId={Number(user.id)}
                  allRequests={requests}
                  loading={loading}
                  onRefresh={loadData}
                />
              )}
            </>
          )}

          {!isSeller && !isFinancier && !isAdmin && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Your role ({user.role}) is not authorized to access factoring features. Only MSME Vendors (Sellers) and Financing Partners (Financiers) can perform factoring actions.
            </div>
          )}
        </>
      )}
    </div>
  );
}
