const sensitiveKeys = new Set([
  'password',
  'token',
  'authorization',
  'jwt',
  'secret',
  'apiKey',
  'api_key',
  'aadhaar',
  'accountNumber'
]);

// Some JSON columns legitimately use property names that collide with
// PII regexes (e.g. the per-section approval map stored on User.sectionStatus
// has a `pan` key whose value is a workflow status like `"approved"` /
// `"rejected"` — not an actual PAN number). Walking those subtrees with the
// masker would corrupt the values (`"approved"` -> `"****OVED"`), which then
// breaks downstream equality checks like `sectionStatus.pan === "approved"`
// on the admin scrutiny screen. Treat the whole subtree as opaque so the
// admin UI sees the persisted status verbatim.
const passthroughKeys = new Set([
  'sectionStatus',
  'sectionRejectionReasons'
]);

export const maskValue = (value: unknown, visibleSuffix = 4) => {
  const text = String(value ?? '');
  if (text.length <= visibleSuffix) return '*'.repeat(text.length);
  return `${'*'.repeat(Math.max(0, text.length - visibleSuffix))}${text.slice(-visibleSuffix)}`;
};

const compact = (value: unknown) => String(value ?? '').replace(/\s+/g, '').toUpperCase();

export const maskPAN = (value: unknown) => {
  const text = compact(value);
  if (!text) return '';
  return text.length >= 10 ? `${text.slice(0, 2)}***${text.slice(-2)}` : maskValue(text);
};

export const maskGST = (value: unknown) => {
  const text = compact(value);
  if (!text) return '';
  return text.length >= 15 ? `${text.slice(0, 2)}***********${text.slice(-2)}` : maskValue(text);
};

export const maskGSTIN = maskGST;

export const maskAadhaar = (value: unknown) => maskValue(compact(value), 4);

export const maskBankAccount = (value: unknown) => maskValue(String(value ?? '').replace(/\s+/g, ''), 4);

export const maskSensitive = <T>(input: T): T => {
  if (!input || typeof input !== 'object') return input;
  if (input instanceof Date) return input;
  if (input.constructor && (input.constructor.name === 'Decimal' || (input as any)._isDecimal === true || (typeof (input as any).toNumber === 'function' && typeof (input as any).toFixed === 'function'))) return input;
  if (Array.isArray(input)) return input.map(item => maskSensitive(item)) as T;

  return Object.entries(input as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (passthroughKeys.has(key)) {
      acc[key] = value;
    } else if (/^aadhaar$/i.test(key)) {
      acc[key] = value ? maskAadhaar(value) : value;
    } else if (key !== 'bankAccounts' && /accountNumber|bankAccount/i.test(key)) {
      acc[key] = value ? maskBankAccount(value) : value;
    } else if (sensitiveKeys.has(key) || /password|secret|token/i.test(key)) {
      acc[key] = value ? maskValue(value) : value;
    } else {
      acc[key] = maskSensitive(value);
    }
    return acc;
  }, {}) as T;
};
