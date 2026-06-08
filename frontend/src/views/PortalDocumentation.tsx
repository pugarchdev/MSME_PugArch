import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  FileText,
  Filter,
  Landmark,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store,
  UserCog,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';

type RoleKey = 'admin' | 'seller' | 'buyer';
type SortKey = 'role' | 'module' | 'permission' | 'duty';

interface WorkflowStep {
  title: string;
  action: string;
  example: string;
}

interface RoleGuide {
  id: RoleKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  entryPath: string;
  registrationPath: string;
  onboarding: WorkflowStep[];
  dailyWorkflow: WorkflowStep[];
}

interface ProcurementFlow {
  type: string;
  bestFor: string;
  buyerSteps: string[];
  sellerSteps: string[];
  example: string;
}

interface PermissionRow {
  role: string;
  module: string;
  duty: string;
  permission: string;
  example: string;
}

const roleGuides: RoleGuide[] = [
  {
    id: 'admin',
    title: 'Admin / Platform Operator',
    icon: ShieldCheck,
    summary: 'Controls registrations, organization approval, RBAC, compliance, fraud review, delivery supervision, MIS reporting, and catalogue governance.',
    entryPath: '/admin/onboarding',
    registrationPath: '/admin/register',
    onboarding: [
      {
        title: 'Create admin account',
        action: 'Open Admin Control Center, enter official identity details, verify credentials, and submit the registration form.',
        example: 'Example: A District Industry Centre officer registers with a government email and mobile number to manage MSME approvals.',
      },
      {
        title: 'Complete admin profile and access setup',
        action: 'Log in, open Admin Console, confirm profile details, and verify assigned administrative scope.',
        example: 'Example: The officer is assigned to Jharsuguda district procurement monitoring and marketplace governance.',
      },
      {
        title: 'Review organizations and users',
        action: 'Use Organizations, Users, RBAC Control, and Governance Desk to approve, reject, unlock, or update compliant records.',
        example: 'Example: Admin approves “Sunrise Fabricators” after checking GST, PAN, Udyam, bank, and address documents.',
      },
    ],
    dailyWorkflow: [
      {
        title: 'Monitor registrations and onboarding queues',
        action: 'Check pending buyer and seller organizations, verify documents, add remarks, and approve or send back for correction.',
        example: 'Example: A seller upload has a mismatched GST address; admin returns it with a note to upload the current GST certificate.',
      },
      {
        title: 'Maintain role permissions',
        action: 'Open RBAC Control to map permissions by role and keep access aligned with duties.',
        example: 'Example: Admin enables tender evaluation permission for a buyer procurement officer but not for a finance-only user.',
      },
      {
        title: 'Track compliance, fraud, delivery, and MIS',
        action: 'Review fraud alerts, compliance rules, delivery console, payments, escrow, and MIS reports for operational exceptions.',
        example: 'Example: Admin investigates repeated high-value bid withdrawals before allowing the supplier to participate again.',
      },
    ],
  },
  {
    id: 'seller',
    title: 'Seller / MSME Supplier',
    icon: Store,
    summary: 'Registers a business, completes KYB onboarding, publishes catalogue items, responds to tenders/RFQs, manages POs, delivery, invoices, ratings, and disputes.',
    entryPath: '/seller/onboarding',
    registrationPath: '/seller/register',
    onboarding: [
      {
        title: 'Register as seller',
        action: 'Choose Join as Seller, enter owner/contact details, business identifiers, and secure login credentials.',
        example: 'Example: “Sunrise Fabricators” signs up using owner mobile, GSTIN, PAN, and Udyam registration details.',
      },
      {
        title: 'Upload business documents',
        action: 'Open Seller Hub and complete KYB: GST, PAN, Udyam, address proof, bank details, product/service capability, and declarations.',
        example: 'Example: Seller uploads Udyam certificate, cancelled cheque, workshop address proof, and fabrication category details.',
      },
      {
        title: 'Wait for approval and publish offerings',
        action: 'After admin approval, add products/services in Marketplace with price, tax, specifications, stock, and delivery terms.',
        example: 'Example: Seller lists “MS flange plate fabrication” with unit rate, lead time, HSN/SAC, and accepted delivery locations.',
      },
    ],
    dailyWorkflow: [
      {
        title: 'Find opportunities',
        action: 'Open Seller Tenders, Seller RFQ, or Direct Purchase to view buyer demand and eligibility details.',
        example: 'Example: Seller finds an RFQ for 500 safety helmets with delivery required within 10 days.',
      },
      {
        title: 'Submit quotation or bid',
        action: 'Review specifications, upload technical/commercial documents, quote price, taxes, delivery dates, and submit before deadline.',
        example: 'Example: Seller quotes ₹430 per helmet, GST extra, with 7-day dispatch and ISO certificate attached.',
      },
      {
        title: 'Fulfil order and close transaction',
        action: 'Accept PO, update delivery milestones, submit invoice, respond to inspection/GRN queries, and follow payment/escrow status.',
        example: 'Example: After GRN acceptance for 500 helmets, seller uploads invoice and tracks escrow release.',
      },
    ],
  },
  {
    id: 'buyer',
    title: 'Buyer / Procuring Organization',
    icon: Building2,
    summary: 'Registers an organization, creates requirements, shops marketplace items, raises RFQs/tenders/direct purchases, evaluates bids, issues POs, records GRN, and manages payments.',
    entryPath: '/buyer/onboarding',
    registrationPath: '/buyer/register',
    onboarding: [
      {
        title: 'Register as buyer',
        action: 'Choose Join as Buyer, enter department/company details, authorized contact, and login credentials.',
        example: 'Example: “Jharsuguda Plant Stores” registers with procurement head details and official purchase department email.',
      },
      {
        title: 'Complete organization onboarding',
        action: 'Open Buyer Hub, add statutory details, billing/shipping locations, approval hierarchy, procurement categories, and required documents.',
        example: 'Example: Buyer configures Stores Officer as requester, Technical Head as reviewer, and Finance Manager as payment approver.',
      },
      {
        title: 'Invite users and define internal roles',
        action: 'Use Team Management to invite requesters, technical reviewers, approvers, finance users, and goods-receipt users.',
        example: 'Example: A plant adds three users: requester creates carts, technical reviewer validates specs, and finance releases payment.',
      },
    ],
    dailyWorkflow: [
      {
        title: 'Create requirement or cart',
        action: 'Search marketplace, add items to cart, create requirement, or start RFQ/tender/direct purchase based on value and policy.',
        example: 'Example: Buyer creates a requirement for 2,000 PPE kits with size mix, delivery schedule, and inspection conditions.',
      },
      {
        title: 'Run approvals and supplier selection',
        action: 'Send cart for approval, run technical review, compare bids, evaluate vendors, and approve the recommended supplier.',
        example: 'Example: Technical reviewer rejects non-compliant PPE fabric GSM; procurement selects the lowest technically qualified seller.',
      },
      {
        title: 'Issue PO, receive goods, and pay',
        action: 'Generate PO, track delivery, create GRN after inspection, process invoice, resolve disputes, and rate seller.',
        example: 'Example: Buyer receives 1,950 accepted PPE kits, records short delivery in GRN, and pays only accepted quantity.',
      },
    ],
  },
];

const procurementFlows: ProcurementFlow[] = [
  {
    type: 'Marketplace / Catalogue Purchase',
    bestFor: 'Standard goods or services already listed with clear price, specification, and delivery terms.',
    buyerSteps: ['Search catalogue', 'Compare sellers', 'Add to cart', 'Route approvals', 'Create PO', 'Record delivery and GRN', 'Process invoice and payment'],
    sellerSteps: ['Maintain catalogue', 'Confirm PO', 'Dispatch item/service', 'Update delivery', 'Submit invoice', 'Track payment'],
    example: 'Buyer purchases 50 office chairs from an approved seller catalogue after internal cart approval.',
  },
  {
    type: 'RFQ / Quotation Procurement',
    bestFor: 'Defined requirement where the buyer needs competitive commercial offers from eligible sellers.',
    buyerSteps: ['Create RFQ', 'Invite or publish to sellers', 'Receive quotations', 'Compare price/tax/delivery', 'Approve quote', 'Issue PO'],
    sellerSteps: ['Open RFQ', 'Confirm eligibility', 'Submit quotation', 'Clarify if asked', 'Accept PO if awarded'],
    example: 'Buyer raises RFQ for 500 safety helmets; three sellers quote and the buyer awards to the lowest compliant offer.',
  },
  {
    type: 'Tender Procurement',
    bestFor: 'Higher value, technical, or governed purchases needing formal bid submission, evaluation, and audit trail.',
    buyerSteps: ['Create tender', 'Publish documents', 'Handle clarifications', 'Open bids', 'Technical evaluation', 'Commercial evaluation', 'Award and generate PO'],
    sellerSteps: ['Review tender', 'Prepare technical bid', 'Prepare financial bid', 'Submit before deadline', 'Respond to evaluation queries', 'Fulfil award'],
    example: 'Buyer publishes a tender for plant maintenance services with technical scoring and commercial L1 evaluation.',
  },
  {
    type: 'Direct Purchase',
    bestFor: 'Low-value or policy-approved urgent procurement from approved marketplace vendors.',
    buyerSteps: ['Select approved item/vendor', 'Record justification', 'Get approval', 'Generate direct PO', 'Track delivery and payment'],
    sellerSteps: ['Keep availability updated', 'Accept direct PO', 'Deliver quickly', 'Invoice against accepted GRN'],
    example: 'Buyer directly purchases emergency welding rods from a verified local MSME due to urgent plant repair.',
  },
  {
    type: 'Auction / Live Competitive Event',
    bestFor: 'Time-bound competitive discovery where pricing or ranking updates live during the event.',
    buyerSteps: ['Create auction event', 'Invite eligible sellers', 'Monitor live bids', 'Close event', 'Award as per rules'],
    sellerSteps: ['Join live event', 'Place compliant bids', 'Track rank', 'Confirm final offer if awarded'],
    example: 'Buyer runs a reverse auction for bulk packaging material and awards after the auction closes.',
  },
];

const permissions: PermissionRow[] = [
  { role: 'Admin', module: 'Users & Organizations', duty: 'Approve, reject, unlock, and supervise portal participants.', permission: 'users:read, users:review, users:unlock, onboarding:review', example: 'Admin approves a buyer organization after checking statutory files.' },
  { role: 'Admin', module: 'RBAC & Governance', duty: 'Configure permissions, monitor audit signals, and enforce policy.', permission: 'audit:read, compliance:override, role mapping', example: 'Admin grants bid evaluation access only to authorized buyer officers.' },
  { role: 'Admin', module: 'Marketplace', duty: 'Moderate catalogue, categories, compliance rules, fraud alerts, reports, and delivery console.', permission: 'compliance:read, vendors:read, admin reports', example: 'Admin reviews a suspicious supplier rating spike before action.' },
  { role: 'Buyer', module: 'Requirements', duty: 'Create purchase requirements, carts, RFQs, tenders, and direct purchase requests.', permission: 'tenders:read, tenders:write, quotations:write', example: 'Requester creates an RFQ for helmets and sends it to approval.' },
  { role: 'Buyer', module: 'Evaluation & Orders', duty: 'Review bids, approve selected supplier, issue PO, inspect goods, and create GRN.', permission: 'tenders:bids:read, bids:status:write', example: 'Technical reviewer marks one bid non-compliant due to missing certification.' },
  { role: 'Buyer', module: 'Finance & Closure', duty: 'Verify invoice, release payment/escrow, manage disputes, and rate seller.', permission: 'payment approvals by org role', example: 'Finance releases payment after accepted GRN and invoice match.' },
  { role: 'Seller', module: 'Onboarding & Catalogue', duty: 'Complete KYB, maintain products/services, prices, taxes, and stock/service capacity.', permission: 'onboarding:write:self, files:write', example: 'Seller updates delivery lead time for fabricated parts from 5 to 7 days.' },
  { role: 'Seller', module: 'Bidding', duty: 'Read opportunities and submit compliant quotations or tender bids.', permission: 'tenders:read, bids:write, quotations:read', example: 'Seller uploads technical sheet and commercial quote before deadline.' },
  { role: 'Seller', module: 'Fulfilment', duty: 'Accept PO, update dispatch, upload invoices, respond to GRN disputes, and track payment.', permission: 'delivery update and invoice submit by org role', example: 'Seller marks shipment dispatched and attaches invoice after delivery.' },
];

const lifecycleSteps = [
  { title: 'Registration', detail: 'User selects Admin, Seller, or Buyer registration and submits identity, contact, organization, and credential details.' },
  { title: 'Onboarding', detail: 'Organization completes statutory, document, category, location, bank, and declaration details.' },
  { title: 'Admin verification', detail: 'Admin checks documents, sends corrections if required, or approves portal access.' },
  { title: 'Team setup', detail: 'Buyer/seller organization owners invite users and map internal duties like requester, reviewer, finance, delivery, and approver.' },
  { title: 'Procurement execution', detail: 'Buyer uses marketplace, RFQ, tender, direct purchase, or auction; seller responds and fulfils awarded orders.' },
  { title: 'Order-to-payment closure', detail: 'PO, delivery, inspection, GRN, invoice, payment/escrow, dispute, and rating close the transaction with audit history.' },
];

function joinSteps(steps: string[]) {
  return steps.map((step, index) => `${index + 1}. ${step}`).join(' → ');
}

export default function PortalDocumentation() {
  const [activeRole, setActiveRole] = useState<RoleKey | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('role');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const filteredPermissions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = permissions.filter(row => {
      const matchesRole = activeRole === 'all' || row.role.toLowerCase() === activeRole;
      const searchable = `${row.role} ${row.module} ${row.duty} ${row.permission} ${row.example}`.toLowerCase();
      return matchesRole && (!normalizedQuery || searchable.includes(normalizedQuery));
    });

    return [...rows].sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey])));
  }, [activeRole, query, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredPermissions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPermissions = filteredPermissions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleFilterChange = (role: RoleKey | 'all') => {
    setActiveRole(role);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <section className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-amber-50 shadow-sm">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1.2fr_0.8fr] lg:p-9">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#0b2447] shadow-sm">
              <BookOpen className="h-4 w-4 text-[#c8a45c]" /> Portal User Documentation
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-black tracking-tight text-[#0b2447] sm:text-4xl lg:text-5xl">
                Stepwise operating guide for admins, sellers, and buyers
              </h1>
              <p className="max-w-3xl text-sm font-medium leading-7 text-slate-600 sm:text-base">
                Use this guide to understand registration, onboarding, procurement methods, order-to-payment flow, organization roles, duties, permissions, and live business examples across the MSME Portal.
              </p>
            </div>

          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {roleGuides.map(({ id, title, icon: Icon, summary }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleFilterChange(id)}
                className={cn(
                  'rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md',
                  activeRole === id ? 'border-[#c8a45c] ring-2 ring-amber-100' : 'border-slate-200'
                )}
              >
                <Icon className="mb-3 h-6 w-6 text-[#c8a45c]" />
                <h2 className="text-sm font-black text-[#0b2447]">{title}</h2>
                <p className="mt-1 line-clamp-3 text-xs font-medium leading-5 text-slate-500">{summary}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lifecycleSteps.map((step, index) => (
          <article key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0b2447] text-sm font-black text-white">{index + 1}</span>
              <h2 className="text-base font-black text-[#0b2447]">{step.title}</h2>
            </div>
            <p className="text-sm font-medium leading-6 text-slate-600">{step.detail}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c8a45c]">Role-wise walkthrough</p>
            <h2 className="text-2xl font-black text-[#0b2447]">Registration, onboarding, and daily operations</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'admin', 'seller', 'buyer'] as const).map(role => (
              <Button
                key={role}
                variant={activeRole === role ? 'primary' : 'outline'}
                onClick={() => handleFilterChange(role)}
                className={cn('capitalize', activeRole === role && 'bg-[#0b2447] hover:bg-[#12335f]')}
              >
                {role}
              </Button>
            ))}
          </div>
        </div>

        {(activeRole === 'all' ? roleGuides : roleGuides.filter(role => role.id === activeRole)).map(role => {
          const Icon = role.icon;
          return (
            <article key={role.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-[#c8a45c]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[#0b2447]">{role.title}</h3>
                    <p className="mt-1 max-w-3xl text-sm font-medium leading-6 text-slate-600">{role.summary}</p>
                  </div>
                </div>

              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-[#0b2447]"><BadgeCheck className="h-4 w-4" /> Onboarding steps</h4>
                  <div className="space-y-3">
                    {role.onboarding.map((step, index) => (
                      <div key={step.title} className="rounded-xl bg-white p-4 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-wide text-[#c8a45c]">Step {index + 1}</p>
                        <h5 className="mt-1 font-black text-slate-900">{step.title}</h5>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{step.action}</p>
                        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">{step.example}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-black text-[#0b2447]"><CheckCircle2 className="h-4 w-4" /> Full workflow after approval</h4>
                  <div className="space-y-3">
                    {role.dailyWorkflow.map((step, index) => (
                      <div key={step.title} className="rounded-xl bg-white p-4 shadow-sm">
                        <p className="text-xs font-black uppercase tracking-wide text-[#c8a45c]">Operation {index + 1}</p>
                        <h5 className="mt-1 font-black text-slate-900">{step.title}</h5>
                        <p className="mt-1 text-sm font-medium leading-6 text-slate-600">{step.action}</p>
                        <p className="mt-2 rounded-lg bg-blue-50 p-3 text-xs font-semibold leading-5 text-blue-900">{step.example}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <ShoppingCart className="mt-1 h-6 w-6 text-[#c8a45c]" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c8a45c]">Procurement types</p>
            <h2 className="text-2xl font-black text-[#0b2447]">End-to-end procurement workflows with live examples</h2>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {procurementFlows.map(flow => (
            <article key={flow.type} className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-lg font-black text-[#0b2447]">{flow.type}</h3>
              <p className="mt-1 text-sm font-medium leading-6 text-slate-600"><strong>Best for:</strong> {flow.bestFor}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-blue-900">Buyer workflow</p>
                  <p className="text-xs font-semibold leading-5 text-blue-900">{joinSteps(flow.buyerSteps)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-amber-900">Seller workflow</p>
                  <p className="text-xs font-semibold leading-5 text-amber-900">{joinSteps(flow.sellerSteps)}</p>
                </div>
              </div>
              <p className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700"><strong>Live example:</strong> {flow.example}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#c8a45c]">Organization roles and permissions</p>
            <h2 className="text-2xl font-black text-[#0b2447]">Duties, allowed actions, and examples</h2>
            <p className="mt-1 text-sm font-medium text-slate-600">Use search, filter, sorting, and pagination to review role responsibilities.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px] lg:min-w-[620px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={event => handleSearchChange(event.target.value)}
                placeholder="Search duty, module, permission..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="relative">
              <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={activeRole}
                onChange={event => handleFilterChange(event.target.value as RoleKey | 'all')}
                className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm font-bold capitalize outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-blue-100"
              >
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="seller">Seller</option>
                <option value="buyer">Buyer</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </label>
            <label className="relative">
              <select
                value={sortKey}
                onChange={event => setSortKey(event.target.value as SortKey)}
                className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm font-bold outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-blue-100"
              >
                <option value="role">Sort by role</option>
                <option value="module">Sort by module</option>
                <option value="permission">Sort by permission</option>
                <option value="duty">Sort by duty</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </label>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Sr. No.</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Duty</th>
                  <th className="px-4 py-3">Permission / Access</th>
                  <th className="px-4 py-3">Live example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPermissions.length > 0 ? paginatedPermissions.map((row, index) => (
                  <tr key={`${row.role}-${row.module}-${row.duty}`} className="align-top hover:bg-blue-50/30">
                    <td className="px-4 py-4 font-black text-[#0b2447]">{(currentPage - 1) * pageSize + index + 1}</td>
                    <td className="px-4 py-4 font-bold text-slate-900">{row.role}</td>
                    <td className="px-4 py-4 font-semibold text-slate-700">{row.module}</td>
                    <td className="px-4 py-4 font-medium leading-6 text-slate-600">{row.duty}</td>
                    <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.permission}</span></td>
                    <td className="px-4 py-4 font-medium leading-6 text-slate-600">{row.example}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center font-bold text-slate-500">No documentation records found. Clear filters or try another search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-500">
            Showing {paginatedPermissions.length ? (currentPage - 1) * pageSize + 1 : 0}-{Math.min(currentPage * pageSize, filteredPermissions.length)} of {filteredPermissions.length} records
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>Previous</Button>
            <Button variant="outline" disabled={currentPage === totalPages} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>Next</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { icon: Users, title: 'Organization owner', text: 'Owns organization profile, invites team members, ensures documents remain current, and coordinates approval hierarchy.' },
          { icon: UserCog, title: 'Requester / procurement user', text: 'Creates requirements, carts, RFQs, direct purchases, and tender drafts according to internal policy.' },
          { icon: FileCheck2, title: 'Technical reviewer', text: 'Checks specifications, bid documents, compliance certificates, inspection outcomes, and quality acceptance.' },
          { icon: Landmark, title: 'Finance approver', text: 'Checks invoice, PO, GRN, tax, deductions, escrow, and payment release readiness.' },
          { icon: PackageCheck, title: 'Delivery / GRN user', text: 'Tracks shipment, records received quantity, rejects damaged items, and closes goods receipt notes.' },
          { icon: FileText, title: 'Audit discipline', text: 'Every approval, rejection, correction, bid, PO, GRN, invoice, payment, and dispute action should leave a clear audit trail.' },
        ].map(item => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon className="mb-3 h-6 w-6 text-[#c8a45c]" />
              <h3 className="font-black text-[#0b2447]">{item.title}</h3>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{item.text}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
