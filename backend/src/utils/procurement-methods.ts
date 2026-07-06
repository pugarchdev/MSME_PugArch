export const CANONICAL_PROCUREMENT_METHODS = [
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
  'BOQ_BASED_BID'
] as const;

export type CanonicalProcurementMethod = typeof CANONICAL_PROCUREMENT_METHODS[number];
export type BroadProcurementMethod = 'DIRECT_PURCHASE' | 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT';

const canonicalSet = new Set<string>(CANONICAL_PROCUREMENT_METHODS);

const legacyAliases: Record<string, CanonicalProcurementMethod> = {
  CATALOGUE_PURCHASE: 'CATALOG_PURCHASE',
  CATALOG_PURCHASE: 'CATALOG_PURCHASE',
  CATALOG_PURCHASES: 'CATALOG_PURCHASE',
  L1_COMPARISON: 'RFQ',
  L1_PURCHASE: 'RFQ',
  COMPARISON: 'RFQ',
  REQUEST_FOR_QUOTATION: 'RFQ',
  REQUEST_FOR_PROPOSAL: 'RFP',
  EXPRESSION_OF_INTEREST: 'RFI',
  E_BID: 'OPEN_TENDER',
  CUSTOM_PRODUCT_BID: 'OPEN_TENDER',
  PRODUCT_BID: 'OPEN_TENDER',
  CUSTOM_BID: 'OPEN_TENDER',
  TENDER: 'OPEN_TENDER',
  CUSTOM_SERVICE_BID: 'RFP',
  SERVICE_BID: 'RFP',
  SINGLE_TENDER: 'SINGLE_SOURCE',
  PAC_BID: 'PAC',
  PAC_PROCUREMENT: 'PAC',
  BOQ_BID: 'BOQ_BASED_BID',
  BOQ: 'BOQ_BASED_BID',
  EMERGENCY: 'EMERGENCY_PURCHASE',
  EMERGENCY_PROCUREMENT: 'EMERGENCY_PURCHASE',
  BID_WITH_RA: 'BID_WITH_REVERSE_AUCTION',
  E_BID_WITH_RA: 'BID_WITH_REVERSE_AUCTION'
};

const normalizeToken = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeCanonicalMethod = (rawMethod: unknown, fallback: CanonicalProcurementMethod = 'OPEN_TENDER'): CanonicalProcurementMethod => {
  const token = normalizeToken(rawMethod);
  if (canonicalSet.has(token)) return token as CanonicalProcurementMethod;
  return legacyAliases[token] || fallback;
};

export const broadMethodForCanonical = (value: unknown): BroadProcurementMethod => {
  const canonical = normalizeCanonicalMethod(value);
  switch (canonical) {
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

export const methodSlugForCanonical = (value: unknown) =>
  normalizeCanonicalMethod(value).toLowerCase().replace(/_/g, '-');

export const canonicalMethodFromRecord = (record: {
  canonicalMethod?: unknown;
  methodSlug?: unknown;
  procurementMethod?: unknown;
  payload?: unknown;
  items?: Array<{ specifications?: unknown }>;
}) => {
  const payload = record.payload && typeof record.payload === 'object'
    ? record.payload as Record<string, unknown>
    : null;
  const firstMeta = Array.isArray(record.items)
    ? record.items.find(item => item?.specifications)?.specifications
    : null;
  const firstMetaRecord = firstMeta && typeof firstMeta === 'object'
    ? firstMeta as Record<string, unknown>
    : null;
  const draftMeta = firstMetaRecord?.draftMeta && typeof firstMetaRecord.draftMeta === 'object'
    ? firstMetaRecord.draftMeta as Record<string, unknown>
    : null;
  const draftPayload = draftMeta?.payload && typeof draftMeta.payload === 'object'
    ? draftMeta.payload as Record<string, unknown>
    : null;

  return normalizeCanonicalMethod(
    record.canonicalMethod ||
      payload?.fullProcurementMethod ||
      payload?.type ||
      draftPayload?.fullProcurementMethod ||
      draftPayload?.type ||
      firstMetaRecord?.procurementMethodSlug ||
      record.methodSlug ||
      record.procurementMethod
  );
};
