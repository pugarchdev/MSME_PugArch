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
  | 'DIRECT_PURCHASE'
  | 'CATALOG_PURCHASE'
  | 'RFQ'
  | 'RFP'
  | 'RFI'
  | 'SEALED_TENDER'
  | 'OPEN_TENDER'
  | 'LIMITED_TENDER'
  | 'TWO_PACKET_BID'
  | 'REVERSE_AUCTION'
  | 'BID_WITH_REVERSE_AUCTION'
  | 'RATE_CONTRACT'
  | 'REPEAT_ORDER'
  | 'SINGLE_SOURCE'
  | 'PAC'
  | 'EMERGENCY_PURCHASE'
  | 'BOQ_BASED_BID';

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
    id: 'CATALOG_PURCHASE',
    title: 'Catalogue Purchase',
    subtitle: 'Directly buy a pre-approved catalogue item with fixed pricing',
    icon: ShoppingCart,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    badge: 'Fast-Track',
    valueHint: 'Best for standard items under policy limits',
    fit: ['Pre-negotiated catalog prices', 'Low transaction value', 'Immediate requirement'],
    gates: ['Catalog item match', 'Cost center approval', 'Funds confirmation'],
    complexity: 'Low',
    estimatedTime: '1-2 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['L1 total value']
  },
  {
    id: 'DIRECT_PURCHASE',
    title: 'Direct Purchase',
    subtitle: 'Purchase directly from a selected supplier without comparative quotes',
    icon: ShoppingCart,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    badge: 'Direct Buy',
    valueHint: 'Below regulatory limits (e.g. Rs. 25,000 for government)',
    fit: ['Very low value procurement', 'Standard off-the-shelf items', 'Urgent office needs'],
    gates: ['Supplier active & verified', 'Price reasonability note', 'Budget check'],
    complexity: 'Low',
    estimatedTime: '1-3 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['L1 total value']
  },
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
    id: 'RFI',
    title: 'Request for Information (RFI)',
    subtitle: 'Gather market capabilities and information prior to sourcing',
    icon: Search,
    accent: 'border-slate-200 bg-slate-50 text-slate-800',
    badge: 'Market Research',
    valueHint: 'Used for vendor research and spec drafting only',
    fit: ['Unclear technical options', 'New technology evaluation', 'Budget estimate research'],
    gates: ['Questionnaire details', 'Target industries', 'No commercial bidding allowed'],
    complexity: 'Low',
    estimatedTime: '7-10 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title'],
    allowedEvaluations: ['Lowest landed cost']
  },
  {
    id: 'SEALED_TENDER',
    title: 'Sealed Tender',
    subtitle: 'Secure formal envelope bidding with blind submission opening',
    icon: ClipboardCheck,
    accent: 'border-slate-350 bg-slate-50 text-slate-900',
    badge: 'Confidential',
    valueHint: 'Strict formal submission without price exposure',
    fit: ['High-value purchases', 'Strict compliance requirements', 'Sealed price bids opening'],
    gates: ['Tender document publication', 'Envelope opening committee', 'Audit logs activation'],
    complexity: 'High',
    estimatedTime: '15-30 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'submissionDate'],
    allowedEvaluations: ['L1 total value', 'Technical qualification then L1']
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
    id: 'TWO_PACKET_BID',
    title: 'Two Packet Bid',
    subtitle: 'Separate technical and financial packet submissions and openings',
    icon: Layers,
    accent: 'border-violet-200 bg-violet-50 text-violet-850',
    badge: 'Separated Evaluation',
    valueHint: 'Financial opening is locked until technical pass',
    fit: ['Custom products or services', 'Strict technical qualifying marks', 'Audit-compliant separation'],
    gates: ['Technical evaluation checklist', 'Separate opening committees', 'Financial decrypt key'],
    complexity: 'High',
    estimatedTime: '20-30 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation', 'submissionDate', 'technicalOpeningDate', 'financialOpeningDate'],
    allowedEvaluations: ['Technical qualification then L1', 'QCBS / weighted technical-commercial score']
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
    id: 'BID_WITH_REVERSE_AUCTION',
    title: 'Bid with Reverse Auction',
    subtitle: 'Standard bid followed by a reverse auction for top-ranked L1/L2 bidders',
    icon: Gavel,
    accent: 'border-rose-300 bg-rose-50 text-rose-900',
    badge: 'Hybrid Sourcing',
    valueHint: 'Maximizes price compression for large volume buys',
    fit: ['Large-scale item supply', 'High value sourcing', 'Standardised technical specs'],
    gates: ['Bid opening schedule', 'Reverse auction trigger threshold', 'Qualified bidders shortlist'],
    complexity: 'High',
    estimatedTime: '25-40 Days',
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
  },
  {
    id: 'SINGLE_SOURCE',
    title: 'Single Source',
    subtitle: 'Direct negotiation with a single vendor due to technical lock-in',
    icon: UserCheck,
    accent: 'border-rose-250 bg-rose-50 text-rose-900',
    badge: 'Exception Procurement',
    valueHint: 'Requires strong technical lock-in justification',
    fit: ['OEM maintenance or spares', 'Compatibility restrictions', 'Urgent specialized software license'],
    gates: ['Technical justification certificate', 'Reasonable price audit note', 'High-level board approval'],
    complexity: 'High',
    estimatedTime: '5-10 Days',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'justification', 'selectedSellerId'],
    allowedEvaluations: ['L1 total value']
  },
  {
    id: 'PAC',
    title: 'PAC / Proprietary Bid',
    subtitle: 'Proprietary Article Certificate procurement from specific OEM',
    icon: ShieldCheck,
    accent: 'border-rose-200 bg-rose-50 text-rose-800',
    badge: 'PAC Standard',
    valueHint: 'Requires mandatory statutory PAC Certificate',
    fit: ['OEM specific hardware parts', 'No replacement alternative exists', 'Patented products'],
    gates: ['Statutory PAC upload', 'OEM authorization validation', 'Approval authority validation'],
    complexity: 'Medium',
    estimatedTime: '5-10 Days',
    buyerTypes: ['GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'justification', 'selectedSellerId'],
    allowedEvaluations: ['L1 total value']
  },
  {
    id: 'EMERGENCY_PURCHASE',
    title: 'Emergency Purchase',
    subtitle: 'Bypassing timelines for sudden, unforeseen requirements',
    icon: AlertTriangle,
    accent: 'border-orange-200 bg-orange-50 text-orange-950',
    badge: 'Urgent Pass',
    valueHint: 'Shortened workflow for operational threat issues',
    fit: ['Natural disaster or safety threat', 'Major plant shutdown threat', 'Critical medical supply shortage'],
    gates: ['Emergency justification certificate', 'Audit note registration', 'Retrospective validation approval'],
    complexity: 'Low',
    estimatedTime: '1 Day',
    buyerTypes: ['PRIVATE_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'justification'],
    allowedEvaluations: ['L1 total value']
  },
  {
    id: 'BOQ_BASED_BID',
    title: 'BOQ Based Bid',
    subtitle: 'Procurement with multiple line items using an uploaded template spreadsheet',
    icon: Package,
    accent: 'border-slate-200 bg-slate-50 text-slate-800',
    badge: 'BOQ Sheet',
    valueHint: 'Allows fast upload of large bill-of-materials tables',
    fit: ['Dozens of different line items', 'Construction/works project bills', 'AMC services price schedules'],
    gates: ['BOQ excel format preparation', 'Total rate sum formula check', 'Custom item specs validation'],
    complexity: 'Medium',
    estimatedTime: '10-15 Days',
    buyerTypes: ['PRIVATE_BUYER', 'GOVERNMENT_BUYER'],
    requiredFields: ['title', 'estimatedValue', 'deliveryLocation'],
    allowedEvaluations: ['Item-wise L1', 'Package-wise L1']
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

  // 12. Early Market Research / RFI
  if (marketResearchOnly || !isSpecClear) {
    if (!isGov) {
      result.id = 'RFI';
      result.reason = 'RFI is recommended because you need to gather market capabilities, options, and estimated pricing before committing to a formal sourcing event.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['RFQ', 'RFP'];
      return result;
    } else {
      result.id = 'RFI';
      result.reason = 'RFI (Request for Information) is recommended to conduct fair market research and draft neutral specifications, avoiding single-vendor locking in tender notices.';
      result.confidence = 'MEDIUM';
      result.alternativeMethods = ['LIMITED_TENDER'];
      result.warnings.push('GFR rules prohibit purchasing directly via RFI; you must initiate a tender afterwards.');
      return result;
    }
  }

  // 8. Single Vendor / Proprietary
  if (isOnlyOneVendor) {
    if (isGov) {
      result.id = 'PAC';
      result.reason = 'PAC (Proprietary Article Certificate) is recommended because only a specific OEM is allowed, requiring statutory certification.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['LIMITED_TENDER'];
      result.requiredJustifications.push('Statutory Proprietary Article Certificate (PAC) signed by a competent officer must be uploaded.');
      result.requiredJustifications.push('Market availability search report confirming no other compatible replacements.');
      return result;
    } else {
      result.id = 'SINGLE_SOURCE';
      result.reason = 'Single Source is recommended because compatibility constraints or specialized licenses lock you to a single manufacturer.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['RFQ'];
      result.requiredJustifications.push('Approval from internal director or board stating technical justification for single-sourcing.');
      return result;
    }
  }

  // 9. Emergency Sourcing
  if (priority === 'EMERGENCY') {
    if (isGov) {
      result.id = 'EMERGENCY_PURCHASE';
      result.reason = 'Emergency purchase is recommended to bypass standard advertising timelines due to sudden, unforeseen threats to safety or operational continuity.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['DIRECT_PURCHASE'];
      result.warnings.push('Timelines are compressed to 1-3 days. Requires retrospective validation approval.');
      result.requiredJustifications.push('Competent authority emergency declaration certificate.');
      return result;
    } else {
      result.id = 'EMERGENCY_PURCHASE';
      result.reason = 'Emergency Purchase is recommended because operational line shutdowns require immediate supply bypassing regular RFQ delays.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['DIRECT_PURCHASE'];
      result.requiredJustifications.push('CEO/CSO emergency budget sanction authorization.');
      return result;
    }
  }

  // 1. Catalogue item available
  if (isCatalogueAvailable) {
    if (!isGov) {
      result.id = 'CATALOG_PURCHASE';
      result.reason = 'Catalogue Purchase is recommended since pre-negotiated contracts or items are already in your corporate catalogue.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['DIRECT_PURCHASE', 'RFQ'];
      return result;
    } else {
      result.id = 'DIRECT_PURCHASE';
      result.reason = 'Direct Purchase is recommended because the items are standard catalogued goods within direct buy thresholds.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['CATALOG_PURCHASE'];
      result.warnings.push('Ensure the selected catalogue price is reasonable and compares with the L1 market pricing.');
      return result;
    }
  }

  // 10. Repeated supply / rate contract
  if (isRepeatedSupply) {
    result.id = 'RATE_CONTRACT';
    result.reason = 'Rate Contract is recommended because you have a recurring demand for identical consumables throughout the fiscal year.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFQ', 'RATE_CONTRACT'];
    if (isGov) {
      result.warnings.push('Ensure price variation clauses are added if the contract exceeds 12 months.');
    }
    return result;
  }

  // 5. BOQ / many line items
  if (lineItemsCount > 5 || isBoq) {
    result.id = 'BOQ_BASED_BID';
    result.reason = 'BOQ Based Bid is recommended because you are procuring multiple distinct line items. Suppliers can quote on a structured spreadsheet.';
    result.confidence = 'HIGH';
    result.alternativeMethods = isGov ? ['OPEN_TENDER'] : ['RFQ'];
    return result;
  }

  // 7. Reverse Auction needed
  if (isReverseAuctionNeeded) {
    if (isTechnicalEvaluationNeeded || estimatedValue > 10000000) {
      result.id = 'BID_WITH_REVERSE_AUCTION';
      result.reason = 'Bid with Reverse Auction is recommended. Candidates undergo formal technical opening, followed by a live reverse auction among qualified bidders.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['REVERSE_AUCTION', 'TWO_PACKET_BID'];
      return result;
    } else {
      result.id = 'REVERSE_AUCTION';
      result.reason = 'Reverse Auction is recommended because you want to drive real-time price compression for commodity products with a pre-qualified vendor pool.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['RFQ'];
      result.warnings.push('Verify that a competitive pool of at least 3 suppliers will participate, otherwise the auction may fail.');
      return result;
    }
  }

  // 2. Low value + known product (value <= 25000)
  if (estimatedValue > 0 && estimatedValue <= 25000) {
    result.id = 'DIRECT_PURCHASE';
    result.reason = 'Direct Purchase is recommended because the value is below formal comparative quotation limits (under Rs. 25,000).';
    result.confidence = 'HIGH';
    result.alternativeMethods = isGov ? ['DIRECT_PURCHASE'] : ['RFQ'];
    return result;
  }

  // 4. Service or complex solution
  if (isServiceOrWorks) {
    if (isGov) {
      result.id = 'TWO_PACKET_BID';
      result.reason = 'Two Packet Bid is recommended because technical eligibility, SLAs, and capabilities must be evaluated before financial bid opening.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['OPEN_TENDER'];
      result.warnings.push('Ensure the technical criteria, mandatory criteria, and bid opening committee are defined.');
      return result;
    } else {
      result.id = 'RFP';
      result.reason = 'RFP is recommended because services, deliverables, and SOW contracts require qualitative proposal evaluation (QCBS).';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['RFQ'];
      return result;
    }
  }

  // 6. Technical evaluation needed
  if (isTechnicalEvaluationNeeded) {
    if (isGov) {
      result.id = 'TWO_PACKET_BID';
      result.reason = 'Two Packet Bid is recommended to enforce strict regulatory division between technical qualifications and price evaluation.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['OPEN_TENDER'];
      return result;
    } else {
      result.id = 'RFP';
      result.reason = 'RFP is recommended because you have checked technical opening requirements, which necessitates double envelop technical/commercial scoring.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['SEALED_TENDER'];
      return result;
    }
  }

  // 11. High estimated value
  if (isGov && estimatedValue > 2500000) {
    result.id = 'OPEN_TENDER';
    result.reason = 'Open Tender is recommended to satisfy GFR Rule 161 guidelines for public procurement exceeding Rs. 25 Lakhs.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['TWO_PACKET_BID'];
    return result;
  } else if (!isGov && estimatedValue > 5000000) {
    result.id = 'SEALED_TENDER';
    result.reason = 'Sealed Tender is recommended because high budget capital expenditures require formal compliance and blind envelope openings.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['RFP', 'RFQ'];
    return result;
  }

  // 3. General low-to-mid value clear specifications
  if (isGov) {
    if (estimatedValue <= 500000) {
      result.id = 'DIRECT_PURCHASE';
      result.reason = 'Direct Purchase/L1 purchase is recommended for items under Rs. 5 Lakhs using approved online comparison tools.';
      result.confidence = 'MEDIUM';
      result.alternativeMethods = ['LIMITED_TENDER'];
      return result;
    } else {
      result.id = 'LIMITED_TENDER';
      result.reason = 'Limited Tender is recommended because the estimated value falls below GFR open tender limits, allowing selective invites to registered vendors.';
      result.confidence = 'HIGH';
      result.alternativeMethods = ['OPEN_TENDER'];
      return result;
    }
  } else {
    result.id = 'RFQ';
    result.reason = 'RFQ is recommended because your specifications are clear and you primarily need fast price collections from multiple suppliers.';
    result.confidence = 'HIGH';
    result.alternativeMethods = ['SEALED_TENDER'];
    return result;
  }
};

// Database enum compatibility map
export const mapToDatabaseMethod = (method: ProcurementMethodId): 'DIRECT_PURCHASE' | 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT' => {
  return broadMethodForCanonical(method);
};
