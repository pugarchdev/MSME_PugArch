export const validationPatterns = {
  aadhaar: /^[0-9]{12}$/,
  pan: /^[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z]{1}$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  mobile: /^[6-9][0-9]{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pincode: /^[1-9][0-9]{5}$/,
  name: /^[A-Za-z][A-Za-z .'-]{1,99}$/,
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
      case 'name': return "Invalid Name: Use alphabets, spaces, dots, hyphens, or apostrophes";
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
