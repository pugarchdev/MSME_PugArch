import type { ProcurementMethodId } from './procurementMethodsConfig';

export type BroadProcurementMethod = 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT';

const CANONICAL_METHODS: ProcurementMethodId[] = [
  'RFQ',
  'RFP',
  'OPEN_TENDER',
  'LIMITED_TENDER',
  'REVERSE_AUCTION',
  'RATE_CONTRACT',
  'REPEAT_ORDER',
];

const canonicalSet = new Set<string>(CANONICAL_METHODS);

const aliases: Record<string, ProcurementMethodId> = {
  CATALOGUE_PURCHASE: 'RFQ',
  CATALOG_PURCHASE: 'RFQ',
  CATALOG: 'RFQ',
  L1_COMPARISON: 'RFQ',
  L1_PURCHASE: 'RFQ',
  REQUEST_FOR_QUOTATION: 'RFQ',
  REQUEST_FOR_PROPOSAL: 'RFP',
  EOI: 'RFP',
  TENDER: 'OPEN_TENDER',
  CUSTOM_PRODUCT: 'OPEN_TENDER',
  CUSTOM_PRODUCT_BID: 'OPEN_TENDER',
  PRODUCT_BID: 'OPEN_TENDER',
  CUSTOM_BID: 'OPEN_TENDER',
  CUSTOM_SERVICE: 'RFP',
  CUSTOM_SERVICE_BID: 'RFP',
  SERVICE_BID: 'RFP',
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
    case 'RFQ':
    case 'REPEAT_ORDER':
      return 'RFQ';
    case 'REVERSE_AUCTION':
      return 'REVERSE_AUCTION';
    case 'RATE_CONTRACT':
      return 'RATE_CONTRACT';
    case 'RFP':
    case 'OPEN_TENDER':
    case 'LIMITED_TENDER':
    default:
      return 'TENDER';
  }
};

export const slugForCanonical = (value: unknown) =>
  normalizeProcurementMethod(value).toLowerCase().replace(/_/g, '-');

const acronymLabels: Partial<Record<ProcurementMethodId, string>> = {
  RFQ: 'RFQ',
  RFP: 'RFP',
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
