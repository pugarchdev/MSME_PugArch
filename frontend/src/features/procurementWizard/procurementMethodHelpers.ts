import type { ProcurementMethodId } from './procurementMethodsConfig';

export type BroadProcurementMethod = 'DIRECT_PURCHASE' | 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT';

const CANONICAL_METHODS: ProcurementMethodId[] = [
  'DIRECT_PURCHASE',
  'CATALOG_PURCHASE',
  'RFQ',
  'RFP',
  'RFI',
  'SEALED_TENDER',
  'OPEN_TENDER',
  'LIMITED_TENDER',
  'TWO_PACKET_BID',
  'REVERSE_AUCTION',
  'BID_WITH_REVERSE_AUCTION',
  'RATE_CONTRACT',
  'REPEAT_ORDER',
  'SINGLE_SOURCE',
  'PAC',
  'EMERGENCY_PURCHASE',
  'BOQ_BASED_BID',
];

const canonicalSet = new Set<string>(CANONICAL_METHODS);

const aliases: Record<string, ProcurementMethodId> = {
  CATALOGUE_PURCHASE: 'CATALOG_PURCHASE',
  CATALOG_PURCHASE: 'CATALOG_PURCHASE',
  CATALOG: 'CATALOG_PURCHASE',
  L1_COMPARISON: 'RFQ',
  L1_PURCHASE: 'RFQ',
  REQUEST_FOR_QUOTATION: 'RFQ',
  REQUEST_FOR_PROPOSAL: 'RFP',
  EXPRESSION_OF_INTEREST: 'RFI',
  TENDER: 'OPEN_TENDER',
  CUSTOM_PRODUCT: 'OPEN_TENDER',
  CUSTOM_PRODUCT_BID: 'OPEN_TENDER',
  PRODUCT_BID: 'OPEN_TENDER',
  CUSTOM_BID: 'OPEN_TENDER',
  CUSTOM_SERVICE: 'RFP',
  CUSTOM_SERVICE_BID: 'RFP',
  SERVICE_BID: 'RFP',
  SINGLE_TENDER: 'SINGLE_SOURCE',
  PAC_BID: 'PAC',
  PAC_PROCUREMENT: 'PAC',
  BOQ: 'BOQ_BASED_BID',
  BOQ_BID: 'BOQ_BASED_BID',
  EMERGENCY: 'EMERGENCY_PURCHASE',
  EMERGENCY_PROCUREMENT: 'EMERGENCY_PURCHASE',
  BID_WITH_RA: 'BID_WITH_REVERSE_AUCTION',
  E_BID_WITH_RA: 'BID_WITH_REVERSE_AUCTION',
};

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeProcurementMethod = (value: unknown, fallback: ProcurementMethodId = 'RFQ'): ProcurementMethodId => {
  const token = normalizeToken(value);
  if (canonicalSet.has(token)) return token as ProcurementMethodId;
  return aliases[token] || fallback;
};

export const broadMethodForCanonical = (value: unknown): BroadProcurementMethod => {
  const method = normalizeProcurementMethod(value);
  switch (method) {
    case 'DIRECT_PURCHASE':
    case 'CATALOG_PURCHASE':
    case 'REPEAT_ORDER':
    case 'SINGLE_SOURCE':
    case 'EMERGENCY_PURCHASE':
      return 'DIRECT_PURCHASE';
    case 'RFQ':
    case 'RFI':
      return 'RFQ';
    case 'REVERSE_AUCTION':
    case 'BID_WITH_REVERSE_AUCTION':
      return 'REVERSE_AUCTION';
    case 'RATE_CONTRACT':
      return 'RATE_CONTRACT';
    case 'RFP':
    case 'SEALED_TENDER':
    case 'OPEN_TENDER':
    case 'LIMITED_TENDER':
    case 'TWO_PACKET_BID':
    case 'PAC':
    case 'BOQ_BASED_BID':
    default:
      return 'TENDER';
  }
};

export const slugForCanonical = (value: unknown) =>
  normalizeProcurementMethod(value).toLowerCase().replace(/_/g, '-');

const acronymLabels: Partial<Record<ProcurementMethodId, string>> = {
  RFQ: 'RFQ',
  RFP: 'RFP',
  RFI: 'RFI',
  PAC: 'PAC',
  BOQ_BASED_BID: 'BOQ Based Bid',
};

export const labelForCanonical = (value: unknown) => {
  const method = normalizeProcurementMethod(value);
  const acronym = acronymLabels[method];
  if (acronym) return acronym;
  return method
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};
