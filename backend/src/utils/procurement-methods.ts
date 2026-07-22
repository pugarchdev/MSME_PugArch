export const CANONICAL_PROCUREMENT_METHODS = [
  'RFQ',
  'RFP',
  'OPEN_TENDER',
  'LIMITED_TENDER',
  'REVERSE_AUCTION',
  'RATE_CONTRACT',
  'REPEAT_ORDER'
] as const;

export type CanonicalProcurementMethod = typeof CANONICAL_PROCUREMENT_METHODS[number];
export type BroadProcurementMethod = 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT' | 'DIRECT_PURCHASE';

export type IsolatedProcurementType = 'RFQ' | 'RFP' | 'OPEN_TENDER' | 'LIMITED_TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT';

const canonicalSet = new Set<string>(CANONICAL_PROCUREMENT_METHODS);

const legacyAliases: Record<string, CanonicalProcurementMethod> = {
  CATALOGUE_PURCHASE: 'RFQ',
  L1_COMPARISON: 'RFQ',
  L1_PURCHASE: 'RFQ',
  COMPARISON: 'RFQ',
  REQUEST_FOR_QUOTATION: 'RFQ',
  REQUEST_FOR_PROPOSAL: 'RFP',
  E_BID: 'OPEN_TENDER',
  CUSTOM_PRODUCT_BID: 'OPEN_TENDER',
  PRODUCT_BID: 'OPEN_TENDER',
  CUSTOM_BID: 'OPEN_TENDER',
  TENDER: 'OPEN_TENDER',
  CUSTOM_SERVICE_BID: 'RFP',
  SERVICE_BID: 'RFP'
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

export const getIsolatedProcurementType = (value: unknown): IsolatedProcurementType => {
  const canonical = normalizeCanonicalMethod(value);
  switch (canonical) {
    case 'RFQ':
    case 'REPEAT_ORDER':
      return 'RFQ';
    case 'RFP':
      return 'RFP';
    case 'OPEN_TENDER':
    case 'LIMITED_TENDER':
    default:
      return 'OPEN_TENDER';
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
