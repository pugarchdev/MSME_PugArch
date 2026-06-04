'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    MapPin, Package, Wrench, Clock, ArrowRight,
    Flame, CheckCircle, Eye, ChevronRight, Landmark
} from 'lucide-react';
import { BidDetailModal } from './BidDetailModal';
import type { BuyerRequirement } from '../api';
import { isProcurementDemoDataEnabled } from '../../procurementBid/api';

/* ─── Sample bids ────────────────────────────────────────────────────────── */
const SAMPLE_BIDS: BuyerRequirement[] = [
    { id: 101, title: 'Supply of MS Steel Plates & Structural Steel', requirementType: 'PRODUCT', description: 'Requirement of IS 2062 grade MS steel plates, angles, channels and structural sections for plant expansion project. Material should conform to IS 2062 Grade A/B specifications. Inspection at supplier\'s works. Delivery at Jharsuguda plant site.', quantity: '250', unit: 'MT', location: 'Jharsuguda, Odisha', budgetMin: 1200000, budgetMax: 1800000, lastDate: new Date(Date.now() + 5 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: true, isUrgent: false, requiredDocuments: ['GST Certificate', 'ISO 9001 Certificate', 'Mill Test Certificate'], category: { id: 1, name: 'Raw Materials' }, buyerOrganization: { id: 1, organizationName: 'JSW Steel Limited', organizationType: 'PUBLIC_LIMITED', city: 'Jharsuguda', state: 'Odisha', verificationStatus: 'VERIFIED' }, _count: { responses: 4 } },
    { id: 102, title: 'Annual Maintenance Contract – Industrial HVAC Systems', requirementType: 'SERVICE', description: 'AMC for 34 industrial HVAC units across factory premises. Scope includes preventive maintenance (quarterly), corrective maintenance (on-call), spare parts supply, and emergency breakdown support within 4 hours. Contract period: 1 year extendable to 3 years.', quantity: null, unit: null, location: 'Jharsuguda, Odisha', budgetMin: 480000, budgetMax: 720000, lastDate: new Date(Date.now() + 2 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: true, isUrgent: true, requiredDocuments: ['HVAC Service License', 'GST Certificate', 'PAN Card'], category: { id: 2, name: 'Repair & Maintenance' }, buyerOrganization: { id: 2, organizationName: 'NTPC Lara Super Thermal Power', organizationType: 'PSU', city: 'Raigarh', state: 'Chhattisgarh', verificationStatus: 'VERIFIED' }, _count: { responses: 7 } },
    { id: 103, title: 'Supply of Safety Equipment & PPE Kit – Annual Rate Contract', requirementType: 'PRODUCT', description: 'Safety helmets (IS 2925), safety shoes (IS 15298), leather gloves, high-visibility vests (EN 471), ear muffs, and full-face shields. Delivery to 3 plant sites in Jharsuguda district. Rate contract for 12 months.', quantity: '1500', unit: 'Sets', location: 'Jharsuguda, Odisha', budgetMin: 600000, budgetMax: 900000, lastDate: new Date(Date.now() + 9 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: false, isUrgent: false, requiredDocuments: ['BIS License', 'GST Certificate', 'Udyam Certificate'], category: { id: 3, name: 'Safety Equipment' }, buyerOrganization: { id: 3, organizationName: 'Vedanta Aluminium Ltd', organizationType: 'PUBLIC_LIMITED', city: 'Jharsuguda', state: 'Odisha', verificationStatus: 'VERIFIED' }, _count: { responses: 2 } },
    { id: 104, title: 'Office Furniture & Modular Workstation Supply', requirementType: 'PRODUCT', description: 'Requirement of modular office workstations (L-shape), executive chairs, glass-top conference table (12 seater), lateral filing cabinets, and storage units. Delivery and installation at District Collectorate, Sambalpur.', quantity: '80', unit: 'Units', location: 'Sambalpur, Odisha', budgetMin: 350000, budgetMax: 520000, lastDate: new Date(Date.now() + 14 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: false, isUrgent: false, requiredDocuments: ['GST Certificate', 'PAN Card'], category: { id: 4, name: 'Furniture' }, buyerOrganization: { id: 4, organizationName: 'District Collectorate, Sambalpur', organizationType: 'GOVERNMENT', city: 'Sambalpur', state: 'Odisha', verificationStatus: 'VERIFIED' }, _count: { responses: 1 } },
    { id: 105, title: 'Electrical Wiring & Switchgear for New Workshop', requirementType: 'SERVICE', description: 'Complete electrical wiring, main LT panel (250A TPN), sub-distribution boards, MCBs, isolators, earthing system (IS 3043), and lighting installation for a 4000 sq ft workshop. Licensed electrical contractor required.', quantity: null, unit: null, location: 'Jharsuguda, Odisha', budgetMin: 280000, budgetMax: 420000, lastDate: new Date(Date.now() + 4 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: false, isUrgent: true, requiredDocuments: ['Electrical Contractor License', 'GST Certificate'], category: { id: 5, name: 'Electrical & Electronics' }, buyerOrganization: { id: 5, organizationName: 'Bhushan Power & Steel Ltd', organizationType: 'PUBLIC_LIMITED', city: 'Jharsuguda', state: 'Odisha', verificationStatus: 'VERIFIED' }, _count: { responses: 3 } },
    { id: 106, title: 'IT Infrastructure – Server & Networking Equipment', requirementType: 'PRODUCT', description: 'Dell PowerEdge R750 servers (×4), Cisco Catalyst 2960-X managed switches (×8), APC Smart-UPS 3kVA (×6), structured cabling (Cat 6A), 42U server racks for data center upgrade. Full installation and configuration required. OEM warranty mandatory.', quantity: '1', unit: 'Lot', location: 'Bhubaneswar, Odisha', budgetMin: 2400000, budgetMax: 3600000, lastDate: new Date(Date.now() + 20 * 86400000).toISOString(), visibility: 'PUBLIC', status: 'OPEN', isFeatured: true, isUrgent: false, requiredDocuments: ['OEM Authorization', 'ISO 27001', 'GST Certificate'], category: { id: 6, name: 'IT Hardware & Software' }, buyerOrganization: { id: 6, organizationName: 'Odisha Computer Application Centre', organizationType: 'GOVERNMENT', city: 'Bhubaneswar', state: 'Odisha', verificationStatus: 'VERIFIED' }, _count: { responses: 9 } },
];

function daysLeft(iso: string) { return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000); }

function statusBadge(req: BuyerRequirement) {
    const d = daysLeft(req.lastDate);
    if (req.isUrgent || d <= 3) return { label: 'Closing Soon', cls: 'bg-red-50 text-red-700 border-red-200', icon: <Flame className="h-3 w-3" /> };
    if (d <= 0) return { label: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: null };
    if ((req._count?.responses || 0) < 2) return { label: 'New', cls: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle className="h-3 w-3" /> };
    return { label: 'Open', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: null };
}

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.08 });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return { ref, visible };
}

function BidCard({ bid, index, visible, onView }: { bid: BuyerRequirement; index: number; visible: boolean; onView: (b: BuyerRequirement) => void }) {
    const badge = statusBadge(bid);
    const days = daysLeft(bid.lastDate);
    const isSvc = bid.requirementType === 'SERVICE';
    return (
        <div
            className="group bg-white rounded-xl border border-slate-200 hover:border-[#0b2447]/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col overflow-hidden"
            style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.5s ease ${80 + index * 70}ms, transform 0.5s ease ${80 + index * 70}ms, box-shadow 0.25s, border-color 0.25s, translate 0.25s` }}
        >
            <div className={`h-1 w-full ${isSvc ? 'bg-purple-400' : 'bg-[#0b2447]'}`} />
            <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSvc ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                            {isSvc ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        </div>
                        <h3 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug group-hover:text-[#0b2447] transition">{bid.title}</h3>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold shrink-0 ${badge.cls}`}>{badge.icon}{badge.label}</span>
                </div>
                {bid.buyerOrganization && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0"><Landmark className="h-3 w-3 text-slate-500" /></div>
                        <p className="text-[10px] font-semibold text-slate-600 truncate">{bid.buyerOrganization.organizationName}</p>
                        {bid.buyerOrganization.verificationStatus === 'VERIFIED' && <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />}
                    </div>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {bid.category && <span className="text-[9px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{bid.category.name}</span>}
                    {bid.location && <span className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{bid.location}</span>}
                    {bid.quantity && bid.unit && <span className="text-[9px] text-slate-400">{bid.quantity} {bid.unit}</span>}
                </div>
                {(bid.budgetMin || bid.budgetMax) && (
                    <p className="text-[10px]">
                        <span className="font-bold text-[#0b2447]">₹{Number(bid.budgetMin || bid.budgetMax).toLocaleString('en-IN')}{bid.budgetMax && bid.budgetMin && bid.budgetMax !== bid.budgetMin && <> – ₹{Number(bid.budgetMax).toLocaleString('en-IN')}</>}</span>
                        <span className="text-slate-400 ml-1">est. budget</span>
                    </p>
                )}
                {(bid._count?.responses || 0) > 0 && <p className="text-[9px] text-slate-400">{bid._count?.responses} response{(bid._count?.responses || 0) !== 1 ? 's' : ''} received</p>}
                <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-auto">
                    <span className={`flex items-center gap-1 text-[10px] font-semibold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                        <Clock className="h-3 w-3" />{days <= 0 ? 'Closed' : `${days}d left`}
                        <span className="text-[9px] font-normal text-slate-400 ml-0.5">· {new Date(bid.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    </span>
                    <button onClick={() => onView(bid)} className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0b2447] text-white text-[10px] font-bold hover:bg-[#12335f] active:scale-95 transition [&:not(:disabled):hover]:translate-y-0">
                        <Eye className="h-3 w-3" /> View Details
                    </button>
                </div>
            </div>
        </div>
    );
}

interface Props { requirements?: BuyerRequirement[]; }

export function LatestBids({ requirements }: Props) {
    const { ref, visible } = useFadeIn();
    const demoEnabled = isProcurementDemoDataEnabled();
    const bids = (requirements && requirements.length > 0) ? requirements : demoEnabled ? SAMPLE_BIDS : [];
    const isSampleData = demoEnabled && (!requirements || requirements.length === 0);
    const [selected, setSelected] = useState<BuyerRequirement | null>(null);

    return (
        <>
            {selected && <BidDetailModal bid={selected} onClose={() => setSelected(null)} />}
            <section ref={ref} className="mt-2 bg-[#f8fafc] border-b border-slate-100" aria-labelledby="bids-heading">
                <div className="max-w-7xl mx-auto px-4 py-10 sm:py-12">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-7"
                        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-10px)', transition: 'opacity 0.5s, transform 0.5s' }}>
                        <div>
                            <span className="inline-block px-3 py-1 rounded-full bg-[#0b2447]/5 border border-[#0b2447]/10 text-[9px] font-bold text-[#0b2447] uppercase tracking-widest mb-2">Live Requirements</span>
                            <h2 id="bids-heading" className="text-lg sm:text-xl font-bold text-[#0b2447]">Latest Buyer Requirements &amp; Bids</h2>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Open procurement requirements from verified buyers — submit your response today.
                                {isSampleData && <span className="ml-1.5 text-[10px] text-amber-600 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">Sample data · live bids appear once connected to backend</span>}
                            </p>
                        </div>
                        <Link href="/bids" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-[#0b2447] text-[#0b2447] text-xs font-bold hover:bg-[#0b2447] hover:text-white active:scale-95 transition shrink-0 self-start sm:self-end">
                            View All Bids <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                    {bids.length ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {bids.map((bid, i) => <BidCard key={bid.id} bid={bid} index={i} visible={visible} onView={setSelected} />)}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                            <p className="text-sm font-bold text-slate-700">No bids available currently.</p>
                            <p className="mt-1 text-xs text-slate-500">Live buyer requirements will appear here once the backend returns published records.</p>
                        </div>
                    )}
                    <div className="mt-6 text-center" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 600ms' }}>
                        <Link href="/bids" className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-[#0b2447] text-white text-xs font-bold hover:bg-[#12335f] active:scale-95 transition">
                            View All Buyer Requirements &amp; Bids <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
