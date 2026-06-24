export const normalizeSpaces = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();

export const validatePersonalVerification = (
  role: unknown,
  details: any,
  dob: unknown,
  mobile: unknown
): { errors: Record<string, string>; isValid: boolean } => {
  const errors: Record<string, string> = {};
  const method = String(details?.verificationMethod || '').trim();
  const mobileValue = String(mobile || '').trim();
  const dobValue = String(dob || '').trim();

  if (role !== 'seller' && role !== 'buyer') return { errors, isValid: true };

  // PAN/Aadhaar provider integrations are not live yet. Treat this step as
  // deferred when the user has not selected a method, and only validate obvious
  // local formats for values that are actually submitted.
  if (!method) return { errors, isValid: true };

  if (!['aadhaar', 'pan'].includes(method)) {
    errors.verificationMethod = 'Select Aadhaar or Personal PAN verification';
    return { errors, isValid: false };
  }

  if (method === 'aadhaar') {
    const aadhaarValue = String(details?.aadhaarNumber || '').trim();
    const isMasked = /^[X\s-]+\d{4}$/i.test(aadhaarValue);
    const validIdentity = /^\d{12}$/.test(aadhaarValue) || /^\d{16}$/.test(aadhaarValue) || (details?.isAadhaarVerified && isMasked);
    const validMobile = /^[6-9]\d{9}$/.test(mobileValue) && !/^(\d)\1{9}$/.test(mobileValue);
    if (!validIdentity) errors.aadhaarNumber = 'Aadhaar must be 12 digits or Virtual ID must be 16 digits';
    if (!validMobile) errors.mobile = 'Aadhaar-linked mobile must be a valid 10 digit Indian mobile number';
    if (!details?.isAadhaarVerified) errors.aadhaarVerified = 'Aadhaar verification is required';
  }

  if (method === 'pan') {
    const pan = String(details?.pan || '').trim().toUpperCase();
    const name = normalizeSpaces(details?.accountName);
    const parsedDob = dobValue ? new Date(dobValue) : null;
    const now = new Date();
    const age = parsedDob
      ? now.getFullYear() - parsedDob.getFullYear() - (now < new Date(now.getFullYear(), parsedDob.getMonth(), parsedDob.getDate()) ? 1 : 0)
      : 0;
    if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) errors.pan = 'PAN must follow ABCDE1234F format';
    if (name && !/^[A-Za-z .-]{2,100}$/.test(name)) errors.accountName = 'Name as on PAN must be 2-100 valid text characters';
    if (dobValue && (!parsedDob || parsedDob > now || age < 18)) errors.dob = 'Date of birth must not be future and user must be at least 18 years old';
  }

  return { errors, isValid: Object.keys(errors).length === 0 };
};
