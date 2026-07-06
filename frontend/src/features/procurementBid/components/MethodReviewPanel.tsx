import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, FileText, RotateCcw, UserCheck, ShieldCheck, AlertTriangle, Layers, Gavel, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { CANONICAL_METHOD_LABELS } from '../../../types/enums';
import { fetchReviewContext } from '../../audit/api';
import ProcurementCompliancePanel from '../../compliance/ProcurementCompliancePanel';
import type { ProcurementComplianceWarning } from '../../compliance/types';

interface Props {
  requestId: number;
}

const METHOD_ICONS: Record<string, typeof ShoppingCart> = {
  DIRECT_PURCHASE: ShoppingCart,
  CATALOG_PURCHASE: ShoppingCart,
  REPEAT_ORDER: RotateCcw,
  SINGLE_SOURCE: UserCheck,
  PAC: ShieldCheck,
  EMERGENCY_PURCHASE: AlertTriangle,
  TWO_PACKET_BID: Layers,
  REVERSE_AUCTION: Gavel,
  BID_WITH_REVERSE_AUCTION: Gavel,
  RATE_CONTRACT: CalendarClock,
};

export default function MethodReviewPanel({ requestId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['review-context', requestId],
    queryFn: () => fetchReviewContext(requestId),
    enabled: !!requestId,
  });

  if (isLoading) return <div className="py-4 text-center text-xs text-slate-400">Loading review context…</div>;
  if (error || !data) return <div className="py-4 text-center text-xs text-red-500">Failed to load review context.</div>;

  const ctx = data.reviewContext as Record<string, any>;
  const method = String(ctx.method || '');
  const label = CANONICAL_METHOD_LABELS[method] || method;
  const Icon = METHOD_ICONS[method] || FileText;
  const warnings = (ctx.complianceWarnings || []) as ProcurementComplianceWarning[];

  return (
    <div className="space-y-4">
      {/* Method Header */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
          <Icon className="h-5 w-5 text-indigo-700" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>Broad: {ctx.broadMethod}</span>
            {ctx.isException && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">Exception</span>
            )}
            {ctx.methodOverridden && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                Overridden (was: {ctx.recommendedMethod})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Method-Specific Details */}
      <Card>
        <CardContent className="space-y-3 pt-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Method Review Details</p>

          {/* Direct / Catalog Purchase */}
          {(method === 'DIRECT_PURCHASE' || method === 'CATALOG_PURCHASE') && (
            <div className="space-y-2">
              <DetailRow label="Cart Value" value={ctx.cartValue != null ? `₹${Number(ctx.cartValue).toLocaleString('en-IN')}` : 'N/A'} />
              <DetailRow label="Price Reasonability" value={ctx.priceReasonability ? 'Provided' : 'Not provided'} />
            </div>
          )}

          {/* Repeat Order */}
          {method === 'REPEAT_ORDER' && (
            <div className="space-y-2">
              <DetailRow label="Previous PO Reference" value={String(ctx.previousPoReference || 'Not specified')} />
              <DetailRow label="Justification" value={String(ctx.justification || 'Not provided')} />
            </div>
          )}

          {/* Single Source */}
          {method === 'SINGLE_SOURCE' && (
            <div className="space-y-2">
              <DetailRow label="Justification" value={String(ctx.justification || 'Not provided')} highlight={!ctx.justification} />
              <DetailRow label="Selected Supplier" value={ctx.selectedSupplier ? 'Specified' : 'Not specified'} />
            </div>
          )}

          {/* PAC */}
          {method === 'PAC' && (
            <div className="space-y-2">
              <DetailRow label="PAC Certificate" value={ctx.pacCertificate ? 'Uploaded' : 'Missing'} highlight={!ctx.pacCertificate} />
              <DetailRow label="OEM / Dealer Info" value={ctx.oemInfo ? 'Provided' : 'Not provided'} />
            </div>
          )}

          {/* Emergency */}
          {method === 'EMERGENCY_PURCHASE' && (
            <div className="space-y-2">
              <DetailRow label="Emergency Justification" value={String(ctx.emergencyJustification || 'Not provided')} highlight={!ctx.emergencyJustification} />
              <DetailRow label="Retrospective Approval" value={String(ctx.retrospectiveApprovalStatus || 'Pending')} />
            </div>
          )}

          {/* Two Packet */}
          {method === 'TWO_PACKET_BID' && (
            <div className="space-y-2">
              <DetailRow label="Technical Opening" value={ctx.technicalOpeningDate ? new Date(ctx.technicalOpeningDate).toLocaleDateString('en-IN') : 'Not set'} />
              <DetailRow label="Financial Opening" value={ctx.financialOpeningDate ? new Date(ctx.financialOpeningDate).toLocaleDateString('en-IN') : 'Not set'} />
            </div>
          )}

          {/* Reverse Auction */}
          {(method === 'REVERSE_AUCTION' || method === 'BID_WITH_REVERSE_AUCTION') && (
            <div className="space-y-2">
              <DetailRow label="Auction Rules" value={ctx.auctionRules ? 'Configured' : 'Not configured'} />
            </div>
          )}

          {/* Rate Contract */}
          {method === 'RATE_CONTRACT' && (
            <div className="space-y-2">
              <DetailRow label="Contract Validity" value={String(ctx.contractValidity || 'Not specified')} />
              <DetailRow label="Rate Schedule" value={ctx.rateSchedule ? 'Attached' : 'Not attached'} />
            </div>
          )}

          {/* Generic fallback for unlisted methods */}
          {!['DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'SINGLE_SOURCE', 'PAC',
            'EMERGENCY_PURCHASE', 'TWO_PACKET_BID', 'REVERSE_AUCTION', 'BID_WITH_REVERSE_AUCTION',
            'RATE_CONTRACT'].includes(method) && (
            <div className="space-y-2">
              <DetailRow label="Cart Value" value={ctx.cartValue != null ? `₹${Number(ctx.cartValue).toLocaleString('en-IN')}` : 'N/A'} />
            </div>
          )}

          {/* Warnings */}
          {Array.isArray(ctx.warnings) && ctx.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">System Warnings</p>
              <ul className="mt-1 space-y-0.5">
                {ctx.warnings.map((w: string, i: number) => (
                  <li key={i} className="text-[11px] text-amber-900">• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Panel */}
      <ProcurementCompliancePanel warnings={warnings} />
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className={`text-[11px] font-bold ${highlight ? 'text-red-600' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}
