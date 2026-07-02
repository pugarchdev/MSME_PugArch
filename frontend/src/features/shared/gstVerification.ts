export const formatGstVerificationError = (error: any) => {
  const code = String(error?.code || error?.errorCode || '').toUpperCase();
  const message = String(error?.message || '');
  const instruction = String(error?.instruction || '');
  const combined = [message, instruction].filter(Boolean).join(' ');

  if (code === 'GST_ALREADY_REGISTERED' || /already registered/i.test(combined)) {
    return 'This GSTIN is already registered with another account.';
  }
  if (code === 'INVALID_GSTIN_CHECKSUM' || /checksum/i.test(combined)) {
    return 'Invalid GSTIN checksum. Please re-check the last character from your GST certificate.';
  }
  if (code === 'INVALID_GSTIN' || /invalid gstin|invalid gst number/i.test(combined)) {
    return 'Please enter a valid 15-character GSTIN.';
  }
  if (
    code === 'GST_PROVIDER_ERROR' ||
    code === 'GST_PROVIDER_UNREACHABLE' ||
    code === 'GST_NOT_CONFIGURED' ||
    code === 'GST_CONTACT_NOT_CONFIGURED' ||
    /api setu returned status|provider is unreachable|service is not configured/i.test(combined)
  ) {
    return 'GST verification provider is not responding right now. You can try again after a few minutes.';
  }

  return combined || 'Could not verify GSTIN. Please re-check the number or try again later.';
};

export const isGstProviderUnavailable = (error: any) => {
  const code = String(error?.code || error?.errorCode || '').toUpperCase();
  const message = String(error?.message || '');
  const instruction = String(error?.instruction || '');
  const combined = [message, instruction].filter(Boolean).join(' ');

  return (
    code === 'GST_PROVIDER_ERROR' ||
    code === 'GST_PROVIDER_UNREACHABLE' ||
    code === 'GST_NOT_CONFIGURED' ||
    code === 'GST_CONTACT_NOT_CONFIGURED' ||
    /api setu returned status|provider is unreachable|service is not configured/i.test(combined)
  );
};
