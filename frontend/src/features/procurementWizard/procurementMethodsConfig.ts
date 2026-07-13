import {
  ShoppingCart,
  FileText,
  Gavel,
  ClipboardCheck,
  ShieldCheck,
  CalendarClock,
  AlertTriangle,
  RotateCcw,
  Package,
  Layers,
  Search,
  UserCheck,
  Users
} from 'lucide-react';
import { broadMethodForCanonical } from './procurementMethodHelpers';

export type BuyerType = 'PRIVATE_BUYER' | 'GOVERNMENT_BUYER';

export type ProcurementMethodId =
  | 'RFQ'
  | 'RFP'
  | 'OPEN_TENDER'
  | 'LIMITED_TENDER'
  | 'REVERSE_AUCTION'
  | 'RATE_CONTRACT'
  | 'REPEAT_ORDER';

export interface MethodDefinition {
  id: ProcurementMethodId;
  title: string;
  subtitle: string;
  icon: any;
  accent: string;
  badge: string;
  valueHint: string;
  fit: string[];
  gates: string[];
  complexity: 'Low' | 'Medium' | 'High';
  estimatedTime: string;
  buyerTypes: BuyerType[];
  requiredFields: string[];
  allowedEvaluations: string[];
}

export const METHOD_DEFINITIONS: MethodDefinition[] = [
  {
    id: 'RFQ',
    title: 'Request for Quotation (RFQ)',
    subtitle: 'Invite quotes for standard items with clear specifications',
    icon: FileText,
    accent: 'border-blue-200 bg-blue-50 text-blue-800',
    badge: 'Standard Sourcing',
    valueHint: 'Ideal for standard goods with price-based competition',
    fit: ['Clear item specification', 'Multiple capable sellers', 'Strictly price-based evaluation'],
    gates: ['Technical specifications sheet', 'Supplier invite list', 'Deadline rules'],
    complexity: 'Medium',
    estimatedTime: '5-7 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'requiredByDate'],
    allowedEvaluations: ['L1 total value', 'Item-wise L1']
  },
  {
    id: 'RFP',
    title: 'Request for Proposal (RFP)',
    subtitle: 'Invite proposals for complex services, projects, or solutions',
    icon: Layers,
    accent: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    badge: 'Strategic Sourcing',
    valueHint: 'For service-heavy or solution-driven requirements',
    fit: ['Complex services or solutions', 'Qualitative evaluation criteria needed', 'Negotiation scope available'],
    gates: ['Detailed scope of work', 'Weighted evaluation matrix (QCBS)', 'Pre-proposal meeting details'],
    complexity: 'High',
    estimatedTime: '14-21 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['QCBS / weighted technical-commercial score']
  },
  {
    id: 'OPEN_TENDER',
    title: 'Open Tender',
    subtitle: 'Public invitation for bids advertised to all eligible sellers',
    icon: ClipboardCheck,
    accent: 'border-amber-200 bg-amber-50 text-amber-900',
    badge: 'Public Audit',
    valueHint: 'Mandatory for high value public funds compliance',
    fit: ['High estimated value (> Rs. 25 Lakhs)', 'Open competitive bidding', 'Non-restrictive specifications'],
    gates: ['Notice Inviting Tender (NIT)', 'Pre-bid clarifications', 'Two-stage opening criteria'],
    complexity: 'High',
    estimatedTime: '21-45 Days',
    buyerTypes: ['GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'submissionDate'],
    allowedEvaluations: ['L1 total value', 'Technical qualification then L1']
  },
  {
    id: 'LIMITED_TENDER',
    title: 'Limited Tender',
    subtitle: 'Direct competitive invites sent to a pre-registered supplier pool',
    icon: Users,
    accent: 'border-sky-200 bg-sky-50 text-sky-800',
    badge: 'Restricted Pool',
    valueHint: 'Used when only few specialty manufacturers exist',
    fit: ['Specialized goods or services', 'Registered vendor list available', 'Value within limited thresholds'],
    gates: ['Select vendor list approval', 'Reason for limiting invites', 'Security clearance'],
    complexity: 'Medium',
    estimatedTime: '10-15 Days',
    buyerTypes: ['GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'submissionDate'],
    allowedEvaluations: ['L1 total value', 'Technical qualification then L1']
  },
  {
    id: 'REVERSE_AUCTION',
    title: 'Reverse Auction',
    subtitle: 'Dynamic real-time online price competition among qualified sellers',
    icon: Gavel,
    accent: 'border-rose-200 bg-rose-50 text-rose-800',
    badge: 'Price Discovery',
    valueHint: 'Best to push pricing down for commodity items',
    fit: ['High quantity commodities', 'Pre-qualified active pool', 'Transparent rank / lowest bid rules'],
    gates: ['Start price & decrement rules', 'Auction window definition', 'Auto-extension rules'],
    complexity: 'High',
    estimatedTime: '3-5 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'submissionDate'],
    allowedEvaluations: ['Reverse auction final rank']
  },
  {
    id: 'RATE_CONTRACT',
    title: 'Rate Contract',
    subtitle: 'Establish rate schedules for recurring demands over a fixed period',
    icon: CalendarClock,
    accent: 'border-teal-200 bg-teal-50 text-teal-800',
    badge: 'Standing Agreement',
    valueHint: 'Avoids repetitive sourcing exercises',
    fit: ['Recurring monthly consumables', 'Price validity needed (e.g. 1 year)', 'Slab-based supply rules'],
    gates: ['Estimated annual quantity', 'Price adjustment formula', 'Renewal triggers'],
    complexity: 'Medium',
    estimatedTime: '10-20 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['L1 total value', 'Item-wise L1']
  },
  {
    id: 'REPEAT_ORDER',
    title: 'Repeat Order',
    subtitle: 'Duplicate a previous successful order at original contract terms',
    icon: RotateCcw,
    accent: 'border-lime-200 bg-lime-50 text-lime-800',
    badge: 'Quick Reorder',
    valueHint: 'Repeat purchase of identical item with prior seller',
    fit: ['Identical item specifications', 'Recent previous order (e.g. < 90 days)', 'Value within reorder policy limits'],
    gates: ['Original order ID reference', 'No price escalation proof', 'Approval for repeat order'],
    complexity: 'Low',
    estimatedTime: '2-4 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['L1 total value']
  }
];

export interface SuggestionCriteria {
  buyerType: BuyerType;
  estimatedValue: number;
  whatAreYouBuying: 'GOODS' | 'SERVICES' | 'WORKS' | 'BOQ' | 'CATALOG_ITEM' | string;
  isCatalogueAvailable: boolean;
  isOnlyOneVendor: boolean;
  isReverseAuctionNeeded: boolean;
  isTechnicalEvaluationNeeded: boolean;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'EMERGENCY' | string;
  lineItemsCount: number;
  isSpecClear?: boolean;
  isRepeatedSupply?: boolean;
  marketResearchOnly?: boolean;
}

export interface RecommendationResult {
  id: ProcurementMethodId;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  alternativeMethods: ProcurementMethodId[];
  warnings: string[];
  requiredJustifications: string[];
}

export const suggestProcurementMethod = (criteria: SuggestionCriteria): RecommendationResult => {
  const {
    buyerType,
    estimatedValue,
    whatAreYouBuying,
    isCatalogueAvailable,
    isOnlyOneVendor,
    isReverseAuctionNeeded,
    isTechnicalEvaluationNeeded,
    urgency,
    lineItemsCount,
    isSpecClear = true,
    isRepeatedSupply = false,
    marketResearchOnly = false
  } = criteria;

  const isGov = buyerType === 'GOVERNMENT_BUYER';
  const requirementType = String(whatAreYouBuying || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const priority = String(urgency || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const isBoq = requirementType === 'BOQ';
  const isServiceOrWorks = ['SERVICES', 'SERVICE', 'SERVICE_CONTRACT', 'WORKS', 'WORK', 'WORKS_CONTRACT'].includes(requirementType);

  const result: RecommendationResult = {
    id: 'RFQ',
    reason: '',
    confidence: 'HIGH',
    alternativeMethods: [],
    warnings: [],
    requiredJustifications: []
  };

  // Market research / spec clarification
  if (marketResearchOnly || !isSpecClear) {
    result.id = 'RFQ';
    result.reason = 'RFQ is recommended because specifications need further clarity. Market sounding can be done before formal sourcing.';
    result.confidence = 'MEDIUM';
    result.alternativeMethods = ['RFP'];
    result.warnings.push('Run a market sounding exercise before launching the formal event.');
    return result;
  }

  // Single Vendor
  if (isOnlyOneVendor) {
    result.id = 'LIMITED_TENDER';
    result.reason = 'Limited Tender is recommended because only a limited set of vendors are available, requiring direct invitation.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFQ'];
    result.requiredJustifications.push('Technical justification for limited vendor availability.');
    return result;
  }

  // Emergency Sourcing
  if (priority === 'EMERGENCY') {
    result.id = 'LIMITED_TENDER';
    result.reason = 'Limited Tender is recommended for expedited processing by inviting known registered suppliers to quote quickly.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFQ'];
    result.warnings.push('Emergency purchases require retrospective validation and audit trail documentation.');
    result.requiredJustifications.push('Emergency justification certificate signed by competent authority.');
    return result;
  }

  // Catalogue item available
  if (isCatalogueAvailable) {
    result.id = 'RFQ';
    result.reason = 'RFQ is recommended to get competitive quotes on catalogue items.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RATE_CONTRACT'];
    return result;
  }

  // Repeated supply / rate contract
  if (isRepeatedSupply) {
    result.id = 'RATE_CONTRACT';
    result.reason = 'Rate Contract is recommended because you have a recurring demand for identical consumables throughout the fiscal year.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFQ'];
    if (isGov) {
      result.warnings.push('Ensure price variation clauses are added if the contract exceeds 12 months.');
    }
    return result;
  }

  // BOQ / many line items
  if (lineItemsCount > 5 || isBoq) {
    result.id = 'OPEN_TENDER';
    result.reason = 'Open Tender is recommended because you have multiple distinct line items best evaluated on a structured price schedule.';
    result.confidence = 'HIGH';
    result.alternativeMethods = isGov ? ['RFQ'] : ['RFQ'];
    return result;
  }

  // Reverse Auction needed
  if (isReverseAuctionNeeded) {
    result.id = 'REVERSE_AUCTION';
    result.reason = 'Reverse Auction is recommended because you want to drive real-time price compression for commodity products with a pre-qualified vendor pool.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFQ'];
    result.warnings.push('Verify that a competitive pool of at least 3 suppliers will participate, otherwise the auction may fail.');
    return result;
  }

  // Low value (value <= 25000)
  if (estimatedValue > 0 && estimatedValue <= 25000) {
    result.id = 'RFQ';
    result.reason = 'RFQ is recommended for low value procurement to get competitive quotes.';
    result.confidence = 'HIGH';
    result.alternativeMethods = isGov ? ['LIMITED_TENDER'] : ['REPEAT_ORDER'];
    return result;
  }

  // Service or complex solution
  if (isServiceOrWorks) {
    result.id = 'RFP';
    result.reason = 'RFP is recommended because services, deliverables, and SOW contracts require qualitative proposal evaluation.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['OPEN_TENDER'];
    return result;
  }

  // Technical evaluation needed
  if (isTechnicalEvaluationNeeded) {
    result.id = 'RFP';
    result.reason = 'RFP is recommended because technical evaluation and weighted scoring are needed.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['OPEN_TENDER'];
    return result;
  }

  // High estimated value
  if (isGov && estimatedValue > 2500000) {
    result.id = 'OPEN_TENDER';
    result.reason = 'Open Tender is recommended to satisfy GFR guidelines for public procurement exceeding Rs. 25 Lakhs.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['LIMITED_TENDER'];
    return result;
  } else if (!isGov && estimatedValue > 5000000) {
    result.id = 'RFP';
    result.reason = 'RFP is recommended for high budget capital expenditures requiring structured evaluation.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['OPEN_TENDER'];
    return result;
  }

  // General low-to-mid value clear specifications
  if (isGov) {
    if (estimatedValue <= 500000) {
      result.id = 'LIMITED_TENDER';
      result.reason = 'Limited Tender is recommended for lower-value government procurement.';
      result.confidence = 'MEDIUM';
      result.alternativeMethods = ['RFQ'];
      return result;
    } else {
      result.id = 'LIMITED_TENDER';
      result.reason = 'Limited Tender is recommended because the estimated value allows selective invites to registered vendors.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['OPEN_TENDER'];
      return result;
    }
  } else {
    result.id = 'RFQ';
    result.reason = 'RFQ is recommended because your specifications are clear and you primarily need fast price collections from multiple suppliers.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['REPEAT_ORDER'];
  }

  return result;
};

// Database enum compatibility map
export const mapToDatabaseMethod = (method: ProcurementMethodId): 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT' => {
  return broadMethodForCanonical(method);
};
