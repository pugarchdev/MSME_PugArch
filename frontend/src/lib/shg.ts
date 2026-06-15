export const isShgBusinessType = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return [
    'hershg',
    'women_shg',
    'farmer_shg',
    'artisan_shg',
    'dairy_shg',
    'livelihood_shg',
    'tribal_shg',
    'youth_shg',
    'other_shg'
  ].includes(normalized);
};

export const isShgUser = (user: any) => {
  if (!user || user.role !== 'seller') return false;
  return isShgBusinessType(user?.registrationDetails?.businessType)
    || isShgBusinessType(user?.profile?.organizationType)
    || isShgBusinessType(user?.organizationType)
    || isShgBusinessType(user?.businessType);
};

export const getSellerPortalPath = (user: any) => (
  isShgUser(user) ? '/shg/onboarding' : '/seller/onboarding'
);

export const getSellerPortalLabel = (user: any) => (
  isShgUser(user) ? 'SHG Hub' : 'Seller Hub'
);
