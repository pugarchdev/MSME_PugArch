export const validationPatterns = {
  aadhaar: /^[0-9]{12}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
  mobile: /^[6-9][0-9]{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  pincode: /^[0-9]{6}$/,
  name: /^[A-Za-z ]{2,}$/,
  bankAccount: /^[0-9]{9,18}$/,
  ifsc: /^[A-Z]{4}0[0-9]{6}$/,
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
      case 'pan': return "Invalid PAN: Standard format is ABCDE1234F";
      case 'gst': return "Invalid GSTIN: Standard 15-character format";
      case 'mobile': return "Invalid Mobile: 10 digits starting with 6-9";
      case 'email': return "Invalid Email: Please check the format";
      case 'pincode': return "Invalid PIN: Must be 6 digits";
      case 'name': return "Invalid Name: Letters only, min 2 characters";
      case 'bankAccount': return "Invalid Bank A/C: 9 to 18 digits required";
      case 'ifsc': return "Invalid IFSC: Format ABCD0XXXXXX";
      case 'cin': return "Invalid CIN: 21 characters standard format";
      case 'udyam': return "Invalid Udyam: Format UDYAM-XX-00-0000000";
      default: return "Invalid format";
    }
  }
  
  return null;
};
