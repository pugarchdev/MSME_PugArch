const sensitiveKeys = new Set([
  'password',
  'token',
  'authorization',
  'jwt',
  'secret',
  'apiKey',
  'api_key',
  'pan',
  'aadhaar',
  'accountNumber',
  'ifsc'
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
  if (input.constructor && (input.constructor.name === 'Decimal' || (input as any)._isDecimal === true)) return input;
  if (Array.isArray(input)) return input.map(item => maskSensitive(item)) as T;

  return Object.entries(input as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (/^pan$|panNumber/i.test(key)) {
      acc[key] = value ? maskPAN(value) : value;
    } else if (/^gst$|gstNumber|gstin/i.test(key)) {
      acc[key] = value ? maskGST(value) : value;
    } else if (/^aadhaar$/i.test(key)) {
      acc[key] = value ? maskAadhaar(value) : value;
    } else if (/accountNumber|bankAccount/i.test(key)) {
      acc[key] = value ? maskBankAccount(value) : value;
    } else if (sensitiveKeys.has(key) || /password|secret|token/i.test(key)) {
      acc[key] = value ? maskValue(value) : value;
    } else {
      acc[key] = maskSensitive(value);
    }
    return acc;
  }, {}) as T;
};
