const gstinChecksumChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const hasValidGstinChecksum = (raw: string) => {
  const value = raw.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return false;

  let factor = 2;
  let sum = 0;
  for (let index = 13; index >= 0; index -= 1) {
    const codePoint = gstinChecksumChars.indexOf(value[index]);
    const product = codePoint * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }

  const checksumIndex = (36 - (sum % 36)) % 36;
  return gstinChecksumChars[checksumIndex] === value[14];
};

export const validators = {
  pan(value: string) {
    return /^[A-Z]{5}\d{4}[A-Z]$/.test(value.trim().toUpperCase());
  },
  gstin(value: string) {
    return hasValidGstinChecksum(value);
  },
  indianMobile(value: string) {
    return /^[6-9]\d{9}$/.test(value.trim());
  }
};
