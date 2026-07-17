import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  Building2,
  Factory,
  Landmark,
  PackageCheck,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';

export type BidStatus = 'Open' | 'Closing Soon' | 'Under Evaluation' | 'Awarded' | 'Closed';
export type BidType = 'Product' | 'Service' | 'Works' | 'Rate Contract';
export type BuyerType = 'Large Industry' | 'MSME Buyer' | 'Government Buyer' | 'Private Enterprise' | 'PSU Buyer';
export type EvaluationStatus = 'Pending' | 'Technical Evaluation' | 'Financial Evaluation' | 'Qualified' | 'Disqualified' | 'Awarded';
export type ClarificationStatus = 'Pending' | 'Responded' | 'Completed' | 'Reopened' | 'Rejected' | 'None';

export interface ClarificationRecord {
  requestNumber: string;
  requestedAt: string;
  type: string;
  description: string;
  sellerResponse: string;
  buyerResponse: string;
  status: ClarificationStatus;
  uploadedDocument: string;
}

export interface BidResultRow {
  participationId?: number;
  sellerName: string;
  sellerType: string;
  offeredItem: string;
  makeBrand: string;
  model: string;
  technicalStatus: 'Qualified' | 'Disqualified' | 'Pending';
  financialStatus: 'Opened' | 'Pending' | 'Rejected';
  totalPrice: number;
  finalRank: 'L1' | 'L2' | 'L3' | 'L4' | 'NA';
  resultStatus: 'Awarded' | 'Responsive' | 'Under Review' | 'Rejected';
}

export interface ProcurementBid {
  id: string;
  sourceModel?: 'PROCUREMENT_BID' | 'TENDER' | string;
  sourceId?: number;
  buyerId?: number;
  title: string;
  itemName: string;
  buyerName: string;
  buyerType: BuyerType;
  departmentName: string;
  bidType: BidType;
  procurementType?: string;
  category: string;
  location: string;
  deliveryLocation: string;
  quantity: string;
  estimatedValue: number;
  startDate: string;
  endDate: string;
  status: BidStatus;
  approvalStatus?: string;
  lifecycleStage?: string;
  participantsCount?: number;
  rejectedReason?: string;
  technicalStatus: EvaluationStatus;
  clarificationStatus: ClarificationStatus;
  participated: boolean;
  description: string;
  eligibility: string[];
  requiredDocuments: string[];
  importantDates: Array<{ label: string; date: string }>;
  terms: string[];
  lifecycle: EvaluationStatus[];
  currentStage: EvaluationStatus;
  clarifications: ClarificationRecord[];
  results: BidResultRow[];
  bidDocuments?: Array<{ id: number | string; name: string; meta: string; fileAssetId?: number | null }>;
  participations?: ProcurementBidParticipation[];
  awards?: ProcurementBidAward[];
  technicalPacket?: any;
  documents?: any[];
  consigneeDetails?: any;
  emdAmount?: number;
  isEmdRequired?: boolean;
  evaluationMethod?: string;
  allowClarification?: boolean;
  allowReverseAuction?: boolean;
  packetType?: string;
  version?: number;
  buyer?: any;
  buyerOrganization?: any;
}

export interface ProcurementBidDocument {
  id: number | string;
  documentCategory?: string;
  documentName?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  documentStatus?: string;
  uploadedAt?: string;
  fileAssetId?: number | null;
}

export interface ProcurementClarification {
  id?: number;
  requestNumber?: string;
  clarificationType?: string;
  question?: string;
  response?: string;
  status?: string;
  dueDate?: string;
  requestedAt?: string;
}

export interface ProcurementEvaluation {
  id?: number;
  status?: string;
  remarks?: string;
  score?: number;
  createdAt?: string;
}

export interface ProcurementBidAward {
  id?: number;
  participationId?: number;
  status?: string;
  remarks?: string;
  createdAt?: string;
}

export interface ProcurementBidParticipation {
  id: number;
  bidId?: number;
  sellerId?: number;
  seller?: { id?: number; name?: string; role?: string; onboardingStatus?: string };
  participationNumber?: string;
  technicalStatus?: string;
  financialStatus?: string;
  finalStatus?: string;
  rank?: number | null;
  quotedAmount?: number;
  gstPercentage?: number;
  totalAmount?: number;
  makeBrand?: string;
  model?: string;
  offeredItemDescription?: string;
  submissionStatus?: string;
  submittedAt?: string;
  technicalSubmittedAt?: string;
  financialSubmittedAt?: string;
  isWithdrawn?: boolean;
  rejectionReason?: string;
  documents?: ProcurementBidDocument[];
  clarifications?: ProcurementClarification[];
  evaluations?: ProcurementEvaluation[];
  awards?: ProcurementBidAward[];
  averageRating?: {
    rating: number;
    qualityScore: number;
    deliveryScore: number;
    communicationScore: number;
    documentationScore: number;
    count: number;
  };
}

export const buyerNetwork: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Factory, title: 'Large Scale Industries', description: 'Enterprise plants and high-volume procurement teams.' },
  { icon: Building2, title: 'MSME Buyers', description: 'Growing manufacturers and service buyers sourcing locally.' },
  { icon: Landmark, title: 'Government Buyers', description: 'Departments, institutions, utilities, and public offices.' },
  { icon: ShieldCheck, title: 'PSU Buyers', description: 'Public sector units with structured vendor requirements.' },
  { icon: Users, title: 'Corporate Procurement Teams', description: 'Private enterprises managing approved supplier panels.' },
];

export const supplierNetwork: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Store, title: 'MSME Suppliers', description: 'Registered micro, small, and medium sellers.' },
  { icon: Factory, title: 'Manufacturers', description: 'OEMs and production units with verified capability.' },
  { icon: Wrench, title: 'Service Providers', description: 'Maintenance, IT, civil, facility, and professional services.' },
  { icon: BadgeCheck, title: 'Verified Sellers', description: 'GST, Udyam, and portal-approved suppliers.' },
  { icon: Truck, title: 'Logistics Partners', description: 'Local and regional delivery support providers.' },
];

export const procurementBids: ProcurementBid[] = [
  {
    id: 'JSG-BID-2026-0048',
    title: 'Supply of industrial safety equipment and PPE kits',
    itemName: 'Safety helmets, shoes, gloves, vests, shields',
    buyerName: 'Jharsuguda Industrial Cluster Association',
    buyerType: 'Large Industry',
    departmentName: 'Central Stores and Safety',
    bidType: 'Rate Contract',
    category: 'Safety Equipment',
    location: 'Jharsuguda, Odisha',
    deliveryLocation: 'Three plant stores in Jharsuguda district',
    quantity: '1,500 sets',
    estimatedValue: 920000,
    startDate: '2026-06-01',
    endDate: '2026-06-18',
    status: 'Open',
    technicalStatus: 'Technical Evaluation',
    clarificationStatus: 'Responded',
    participated: false,
    description: 'Annual procurement of certified PPE items with batch-wise delivery, conformity certificates, and replacement warranty for rejected lots.',
    eligibility: ['Valid GST registration', 'Udyam registration preferred', 'Minimum 2 similar supplies in last 3 years', 'BIS/ISI compliance where applicable'],
    requiredDocuments: ['GST certificate', 'PAN card', 'Udyam certificate', 'Product compliance certificates', 'Past supply orders'],
    importantDates: [
      { label: 'Bid published', date: '2026-06-01' },
      { label: 'Clarification closes', date: '2026-06-10' },
      { label: 'Submission closes', date: '2026-06-18' },
      { label: 'Technical opening', date: '2026-06-19' },
    ],
    terms: ['Prices must include packing and forwarding.', 'Delivery must be completed within 21 days of purchase order.', 'Buyer may split award across qualified suppliers.'],
    lifecycle: ['Pending', 'Technical Evaluation', 'Financial Evaluation', 'Qualified', 'Awarded'],
    currentStage: 'Technical Evaluation',
    clarifications: [
      {
        requestNumber: 'CLR-0048-01',
        requestedAt: '2026-06-04 11:20',
        type: 'Technical',
        description: 'Please confirm accepted helmet standard and colour coding.',
        sellerResponse: 'Supplier requested accepted BIS standard list.',
        buyerResponse: 'IS 2925 certified helmets accepted. Colour coding is attached in bid corrigendum.',
        status: 'Responded',
        uploadedDocument: 'helmet-colour-coding.pdf',
      },
    ],
    results: [
      { sellerName: 'Odisha Safety Works', sellerType: 'MSME', offeredItem: 'PPE kit set', makeBrand: 'SafePro', model: 'SP-1500', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 884000, finalRank: 'L1', resultStatus: 'Responsive' },
      { sellerName: 'Eastern Industrial Supplies', sellerType: 'Supplier', offeredItem: 'PPE kit set', makeBrand: 'WorkGuard', model: 'WG-X2', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 911500, finalRank: 'L2', resultStatus: 'Responsive' },
      { sellerName: 'Trident Protection LLP', sellerType: 'Manufacturer', offeredItem: 'PPE kit set', makeBrand: 'Trident', model: 'TR-SAFE', technicalStatus: 'Pending', financialStatus: 'Pending', totalPrice: 0, finalRank: 'NA', resultStatus: 'Under Review' },
    ],
  },
  {
    id: 'JSG-BID-2026-0045',
    title: 'Annual maintenance contract for industrial HVAC systems',
    itemName: 'HVAC preventive and breakdown maintenance',
    buyerName: 'Rengali Power Operations Pvt Ltd',
    buyerType: 'Private Enterprise',
    departmentName: 'Plant Engineering',
    bidType: 'Service',
    category: 'Repair and Maintenance',
    location: 'Raigarh, Chhattisgarh',
    deliveryLocation: 'Power plant utility blocks',
    quantity: '34 units',
    estimatedValue: 740000,
    startDate: '2026-05-28',
    endDate: '2026-06-08',
    status: 'Closing Soon',
    technicalStatus: 'Pending',
    clarificationStatus: 'Pending',
    participated: true,
    description: 'One-year AMC for industrial HVAC units including quarterly preventive maintenance, emergency support, spares coordination, and service reports.',
    eligibility: ['Licensed HVAC service team', 'Emergency response within 4 hours', 'At least 5 trained technicians', 'Valid ESI/PF compliance for manpower'],
    requiredDocuments: ['Service licence', 'GST certificate', 'Technician deployment plan', 'Past AMC completion certificate'],
    importantDates: [
      { label: 'Bid published', date: '2026-05-28' },
      { label: 'Clarification closes', date: '2026-06-05' },
      { label: 'Submission closes', date: '2026-06-08' },
      { label: 'Financial opening', date: '2026-06-11' },
    ],
    terms: ['Service log must be uploaded after every visit.', 'Penalty applies for emergency response delay.', 'Spares are payable on approved rate card.'],
    lifecycle: ['Pending', 'Technical Evaluation', 'Financial Evaluation', 'Qualified', 'Awarded'],
    currentStage: 'Pending',
    clarifications: [
      {
        requestNumber: 'CLR-0045-02',
        requestedAt: '2026-06-02 15:45',
        type: 'Commercial',
        description: 'Whether compressor spares should be included in annual price.',
        sellerResponse: 'Seller asked for spare consumption history.',
        buyerResponse: 'Major spares excluded. Minor consumables included in AMC rate.',
        status: 'Completed',
        uploadedDocument: 'amc-scope-note.pdf',
      },
    ],
    results: [
      { sellerName: 'CoolLine Services', sellerType: 'Service Provider', offeredItem: 'HVAC AMC', makeBrand: 'Multi-brand', model: 'AMC-34', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 698000, finalRank: 'L1', resultStatus: 'Responsive' },
      { sellerName: 'PlantCare Solutions', sellerType: 'MSME', offeredItem: 'HVAC AMC', makeBrand: 'Multi-brand', model: 'AMC-PRO', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 725000, finalRank: 'L2', resultStatus: 'Responsive' },
    ],
  },
  {
    id: 'JSG-BID-2026-0039',
    title: 'IT networking equipment for district data centre upgrade',
    itemName: 'Servers, managed switches, UPS, racks, cabling',
    buyerName: 'District Digital Services Cell',
    buyerType: 'Government Buyer',
    departmentName: 'IT Infrastructure',
    bidType: 'Product',
    category: 'IT Hardware and Software',
    location: 'Bhubaneswar, Odisha',
    deliveryLocation: 'District data centre and disaster recovery room',
    quantity: '1 lot',
    estimatedValue: 3600000,
    startDate: '2026-05-15',
    endDate: '2026-06-20',
    status: 'Under Evaluation',
    technicalStatus: 'Financial Evaluation',
    clarificationStatus: 'Completed',
    participated: true,
    description: 'Supply, installation, testing, and handover of enterprise-grade server and network equipment with OEM warranty and implementation support.',
    eligibility: ['OEM authorisation mandatory', 'ISO 27001 preferred', '3 similar IT infrastructure projects', 'Local service support in Odisha'],
    requiredDocuments: ['OEM authorisation', 'ISO certificates', 'Bill of material', 'Warranty undertaking', 'Implementation plan'],
    importantDates: [
      { label: 'Bid published', date: '2026-05-15' },
      { label: 'Pre-bid meeting', date: '2026-05-24' },
      { label: 'Submission closes', date: '2026-06-20' },
      { label: 'Result expected', date: '2026-06-28' },
    ],
    terms: ['All equipment must be new and unused.', 'Installation sign-off required before invoice acceptance.', 'Five-year onsite warranty required for active equipment.'],
    lifecycle: ['Pending', 'Technical Evaluation', 'Financial Evaluation', 'Qualified', 'Awarded'],
    currentStage: 'Financial Evaluation',
    clarifications: [
      {
        requestNumber: 'CLR-0039-03',
        requestedAt: '2026-05-24 12:10',
        type: 'Pre-bid',
        description: 'Request to allow equivalent switch models.',
        sellerResponse: 'Three bidders requested model equivalence.',
        buyerResponse: 'Equivalent enterprise models allowed if throughput and warranty are equal or higher.',
        status: 'Completed',
        uploadedDocument: 'pre-bid-minutes.pdf',
      },
    ],
    results: [
      { sellerName: 'BlueGrid Technologies', sellerType: 'MSME', offeredItem: 'Data centre lot', makeBrand: 'Dell/Cisco/APC', model: 'Enterprise bundle', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 3410000, finalRank: 'L1', resultStatus: 'Responsive' },
      { sellerName: 'Eastern Digital Systems', sellerType: 'Supplier', offeredItem: 'Data centre lot', makeBrand: 'HPE/Aruba/APC', model: 'Enterprise bundle', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 3485000, finalRank: 'L2', resultStatus: 'Responsive' },
      { sellerName: 'NetCore Infotech', sellerType: 'Service Provider', offeredItem: 'Data centre lot', makeBrand: 'Lenovo/Cisco', model: 'DC Pack', technicalStatus: 'Disqualified', financialStatus: 'Rejected', totalPrice: 0, finalRank: 'NA', resultStatus: 'Rejected' },
    ],
  },
  {
    id: 'JSG-BID-2026-0031',
    title: 'Modular workstation and office furniture supply',
    itemName: 'Workstations, chairs, conference table, storage units',
    buyerName: 'Sambalpur Administrative Services Society',
    buyerType: 'Government Buyer',
    departmentName: 'General Administration',
    bidType: 'Product',
    category: 'Furniture',
    location: 'Sambalpur, Odisha',
    deliveryLocation: 'District administrative office',
    quantity: '80 units',
    estimatedValue: 540000,
    startDate: '2026-05-10',
    endDate: '2026-05-30',
    status: 'Awarded',
    technicalStatus: 'Awarded',
    clarificationStatus: 'Completed',
    participated: false,
    description: 'Supply and installation of modular workstations and office furniture with standard warranty and site measurement support.',
    eligibility: ['Furniture manufacturing or authorised dealership', 'Minimum two institutional projects', 'Warranty support within 72 hours'],
    requiredDocuments: ['GST certificate', 'Product catalogue', 'Warranty undertaking', 'Past supply order'],
    importantDates: [
      { label: 'Bid published', date: '2026-05-10' },
      { label: 'Submission closes', date: '2026-05-30' },
      { label: 'Award issued', date: '2026-06-03' },
    ],
    terms: ['Installation must be completed in 10 working days.', 'Material finish samples to be approved before bulk supply.', 'Payment after installation and inspection.'],
    lifecycle: ['Pending', 'Technical Evaluation', 'Financial Evaluation', 'Qualified', 'Awarded'],
    currentStage: 'Awarded',
    clarifications: [],
    results: [
      { sellerName: 'Sambalpur Office Systems', sellerType: 'MSME', offeredItem: 'Modular furniture', makeBrand: 'WorkNest', model: 'WN-80', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 512000, finalRank: 'L1', resultStatus: 'Awarded' },
      { sellerName: 'EastDesk Furniture', sellerType: 'Manufacturer', offeredItem: 'Modular furniture', makeBrand: 'EastDesk', model: 'ED-Pro', technicalStatus: 'Qualified', financialStatus: 'Opened', totalPrice: 529000, finalRank: 'L2', resultStatus: 'Responsive' },
    ],
  },
];

export const publishBidFields = [
  'Bid title',
  'Buyer organization',
  'Buyer type',
  'Department name',
  'Product/service category',
  'Requirement description',
  'Quantity',
  'Estimated budget',
  'Delivery location',
  'Last date',
  'Required documents',
  'Eligibility criteria',
  'Terms and conditions',
  'Upload bid document',
];

export const lifecycleLabels = ['Bid Published', 'Seller Participated', 'Technical Evaluation', 'Financial Evaluation', 'L1 Selection', 'Awarded'];

export const adminActions = [
  'Approve bids',
  'Reject bids',
  'View participating sellers',
  'Monitor clarification requests',
  'View technical evaluation',
  'View financial evaluation',
  'View L1/L2/L3 results',
  'Export reports',
];

export const participationSteps = [
  'View bid',
  'Check eligibility',
  'Upload technical documents',
  'Upload financial quote',
  'Review submission',
  'Submit bid',
  'Track status',
];

export function findBid(id?: string) {
  return procurementBids.find(bid => bid.id === id) || procurementBids[0];
}

export function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const sampleBidDocuments = [
  { icon: PackageCheck, name: 'Technical specification document', meta: 'PDF, 1.8 MB' },
  { icon: ShieldCheck, name: 'Eligibility and compliance checklist', meta: 'XLSX, 420 KB' },
  { icon: BadgeCheck, name: 'Commercial terms and BOQ', meta: 'PDF, 980 KB' },
];
