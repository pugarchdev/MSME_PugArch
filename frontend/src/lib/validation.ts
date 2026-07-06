export const PERSON_NAME_PATTERN = /^[A-Za-z]+\.?(?:[ .'-][A-Za-z]+\.?)*$/;
export const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
const SQL_INJECTION_PATTERN = /\b(?:select\s+\*|drop\s+table|insert\s+into|delete\s+from|update\s+[a-z_][a-z0-9_]*\s+set|union\s+select|alter\s+table|truncate\s+table|exec(?:ute)?\s+|or\s+1\s*=\s*1|and\s+1\s*=\s*1)\b|--|\/\*|\*\//i;
const XSS_PAYLOAD_PATTERN = /<[^>]*>|javascript:|on[a-z]+\s*=|&lt;|&gt;/i;

export const normalizeSingleSpaces = (value: unknown): string =>
  String(value || '').replace(/\s+/g, ' ').trim();

export const sanitizePersonNameInput = (value: unknown): string =>
  String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^A-Za-z .'-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[ .'-]+/, '')
    .slice(0, 100);

export const sanitizeIndianMobileInput = (value: unknown): string => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    return digits.slice(1, 11);
  }
  return digits.slice(0, 10);
};

export const validatePersonName = (value: unknown, label = 'Name'): string | null => {
  const normalized = normalizeSingleSpaces(value);
  if (!normalized) return `${label} is required`;
  if (normalized.length < 2) return `${label} must be at least 2 characters`;
  if (normalized.length > 100) return `${label} cannot exceed 100 characters`;
  if (SQL_INJECTION_PATTERN.test(normalized) || XSS_PAYLOAD_PATTERN.test(String(value || ''))) {
    return `${label} contains unsafe input`;
  }
  if (!PERSON_NAME_PATTERN.test(normalized)) {
    return `${label} can contain only alphabets, single spaces, periods, hyphens, or apostrophes`;
  }
  return null;
};

export const validateOptionalPersonName = (value: unknown, label = 'Name'): string | null => {
  if (!normalizeSingleSpaces(value)) return null;
  return validatePersonName(value, label);
};

export const validateIndianMobile = (value: unknown, label = 'Mobile number'): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return `${label} is required`;
  if (!/^\d+$/.test(raw)) return `${label} must contain digits only`;
  if (raw.length !== 10) return `${label} must be exactly 10 digits`;
  if (!INDIAN_MOBILE_PATTERN.test(raw)) return `${label} must start with 6, 7, 8, or 9`;
  return null;
};

export const validateOptionalIndianMobile = (value: unknown, label = 'Mobile number'): string | null => {
  if (!String(value || '').trim()) return null;
  return validateIndianMobile(value, label);
};

export const validationPatterns = {
  aadhaar: /^[0-9]{12}$/,
  pan: /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]{1}$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  mobile: INDIAN_MOBILE_PATTERN,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pincode: /^[1-9][0-9]{5}$/,
  name: PERSON_NAME_PATTERN,
  bankAccount: /^[0-9]{9,18}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  cin: /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/,
  udyam: /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/
};

export type FieldType = keyof typeof validationPatterns;

export const validateField = (type: FieldType, value: string): string | null => {
  if (!value) return "This field is required";
  
  const trimmedValue = value.trim();
  const pattern = validationPatterns[type];
  
  if (!pattern.test(trimmedValue)) {
    switch (type) {
      case 'aadhaar': return "Invalid Aadhaar: Must be 12 digits";
      case 'pan': return "Invalid PAN: Standard format is ABCDE1234F with valid taxpayer category";
      case 'gst': return "Invalid GSTIN: Standard 15-character GSTIN format";
      case 'mobile': return "Invalid Mobile: 10 digits starting with 6-9";
      case 'email': return "Invalid Email: Please check the format";
      case 'pincode': return "Invalid PIN: Must be 6 digits and cannot start with 0";
      case 'name': return "Invalid Name: use alphabets, single spaces, periods, hyphens, or apostrophes";
      case 'bankAccount': return "Invalid Bank A/C: 9 to 18 digits required";
      case 'ifsc': return "Invalid IFSC: Format ABCD0XXXXXX";
      case 'cin': return "Invalid CIN: 21 characters standard format";
      case 'udyam': return "Invalid Udyam: Format UDYAM-XX-00-0000000";
      default: return "Invalid format";
    }
  }
  
  return null;
};

export const validateOptionalField = (type: FieldType, value?: string | null): string | null => {
  if (!String(value || '').trim()) return null;
  return validateField(type, String(value));
};

export const validatePastOrTodayDate = (value: string, label = 'Date'): string | null => {
  if (!value) return `${label} is required`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return `${label} is invalid`;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (parsed > today) return `${label} cannot be in the future`;
  return null;
};

export const validateRequiredText = (
  value: unknown,
  label: string,
  options: { min?: number; max?: number; pattern?: RegExp; patternMessage?: string } = {}
): string | null => {
  const trimmed = String(value || '').replace(/\s+/g, ' ').trim();
  const min = options.min ?? 2;
  const max = options.max ?? 150;
  if (!trimmed) return `${label} is required`;
  if (trimmed.length < min) return `${label} must be at least ${min} characters`;
  if (trimmed.length > max) return `${label} cannot exceed ${max} characters`;
  if (options.pattern && !options.pattern.test(trimmed)) return options.patternMessage || `${label} contains invalid characters`;
  return null;
};

export const validateTurnoverDeclaration = (value: string): string | null => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 'Turnover declaration is required';
  const numeric = Number(trimmed.replace(/,/g, ''));
  if (Number.isFinite(numeric)) {
    if (numeric < 0) return 'Turnover cannot be negative';
    if (numeric > 1000000) return 'Turnover value is unusually high. Please enter amount in crores or use a clear declaration';
    return null;
  }
  if (!/^[A-Za-z0-9 .,/()-]{2,80}$/.test(trimmed)) {
    return 'Use a clear turnover value, e.g. 10 Crores or 0';
  }
  return null;
};
