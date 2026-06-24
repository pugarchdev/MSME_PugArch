import type { BidType, PacketType } from '../types/steps';

export const BID_TYPE_LABELS: Record<BidType, string> = {
  PRODUCT_BID: 'Product Bid',
  SERVICE_BID: 'Service Bid',
  CUSTOM_BID: 'Custom Bid',
  BOQ_BID: 'BOQ Based Bid',
  BID_WITH_RA: 'Bid with Reverse Auction',
  REVERSE_AUCTION: 'Reverse Auction',
  PAC_BID: 'PAC / Proprietary Bid',
};

export const BID_TYPE_OPTIONS = Object.entries(BID_TYPE_LABELS).map(([value, label]) => ({ value, label })) as Array<{ value: BidType; label: string }>;

export const PROCUREMENT_METHOD_OPTIONS = [
  { value: 'E_BID', label: 'Open Tender / Public Bid (e-Bid)' },
  { value: 'LIMITED_TENDER', label: 'Limited Tender / Restricted Bid' },
  { value: 'PAC_PROCUREMENT', label: 'Single Tender / Proprietary (PAC)' },
  { value: 'RFQ', label: 'Request for Quote (RFQ)' },
  { value: 'DIRECT_PURCHASE', label: 'Direct Purchase' },
  { value: 'L1_PURCHASE', label: 'L1 Purchase / Comparison Sourcing' },
  { value: 'E_BID_WITH_RA', label: 'e-Bid / Open Tender with Reverse Auction' },
  { value: 'REVERSE_AUCTION', label: 'Reverse Auction' },
] as const;

export const PACKET_TYPE_OPTIONS: Array<{ value: PacketType; label: string }> = [
  { value: 'SINGLE_PACKET', label: 'Single Packet' },
  { value: 'TWO_PACKET', label: 'Two Packet' },
];

export const BID_CREATION_MODE_OPTIONS = [
  { value: 'FRESH_BID', label: 'Fresh Bid' },
  { value: 'RE_BID', label: 'Re-Bid' },
  { value: 'CORRIGENDUM', label: 'Corrigendum' },
  { value: 'CANCELLED_RECREATED', label: 'Cancelled and Recreated' },
] as const;

export const MAHARASHTRA_DISTRICTS = [
  'Ahmednagar', 'Akola', 'Amravati', 'Aurangabad / Chhatrapati Sambhajinagar',
  'Beed', 'Bhandara', 'Buldhana', 'Chandrapur', 'Dhule', 'Gadchiroli',
  'Gondia', 'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur',
  'Mumbai City', 'Mumbai Suburban', 'Nagpur', 'Nanded', 'Nandurbar',
  'Nashik', 'Osmanabad / Dharashiv', 'Palghar', 'Parbhani', 'Pune',
  'Raigad', 'Ratnagiri', 'Sangli', 'Satara', 'Sindhudurg', 'Solapur',
  'Thane', 'Wardha', 'Washim', 'Yavatmal',
] as const;

export const FINANCIAL_YEAR_OPTIONS = ['2025-26', '2026-27', '2027-28', '2028-29'];
export const PRIORITY_OPTIONS = ['Normal', 'Urgent', 'Emergency'];
export const YES_NO_OPTIONS = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
export const PRODUCT_CATEGORIES = ['Office Equipment', 'IT Hardware', 'Electrical', 'Furniture', 'Safety Equipment', 'Medical Supplies', 'Other'];
export const SERVICE_CATEGORIES = ['Housekeeping', 'Security Services', 'Consultancy', 'IT Services', 'AMC Services', 'Manpower Supply', 'Other'];
export const PROCUREMENT_CATEGORIES = ['Goods', 'Services', 'Works', 'Consultancy', 'BOQ', 'PAC', 'Other'];
export const SECTOR_OPTIONS = ['Administration', 'IT', 'Operations', 'Maintenance', 'Projects', 'Finance', 'Health', 'Education', 'Other'];
export const UNIT_OPTIONS = ['Nos', 'Kg', 'MT', 'Set', 'Pair', 'Litre', 'Meter', 'SqMeter', 'Unit', 'Other'];
export const EVALUATION_METHOD_OPTIONS = ['L1', 'QCBS', 'Technical then Financial', 'Item-wise L1', 'Lot-wise L1', 'Other'];
export const PAYMENT_TERMS_OPTIONS = ['100% after delivery', 'Milestone based', 'Monthly billing', 'Against invoice', 'Other'];
export const DOCUMENT_OPTIONS = ['GST', 'PAN', 'Udyam', 'Experience certificate', 'Turnover certificate', 'OEM authorization', 'Other'];

export const STEP_TITLES = [
  'Bid Type',
  'Buyer Details',
  'Basic Details',
  'Item / Service',
  'Delivery',
  'Eligibility',
  'Terms & Documents',
  'Special Conditions',
  'Preview & Publish',
];
