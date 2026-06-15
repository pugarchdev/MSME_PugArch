export const isShgBusinessType = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  return [
    'hershg',
    'her_shg',
    'shg',
    'women shg',
    'self help group',
    'women_self_help_group',
    'women_shg',
    'women-shg',
    'farmer_producer_group',
    'farmer_shg',
    'artisan_handicraft_shg',
    'artisan_shg',
    'dairy_cooperative_shg',
    'dairy_shg',
    'livelihood_shg',
    'tribal_shg',
    'youth_shg',
    'other_shg'
  ].includes(normalized);
};

export const isShgUser = (user: any) => {
  if (!user) return false;
  if (user.role === 'shg') return true;
  if (user.role !== 'seller') return false;
  return isShgBusinessType(user?.registrationDetails?.businessType)
    || isShgBusinessType(user?.registrationDetails?.stakeholderCategory)
    || isShgBusinessType(user?.registrationDetails?.shgType)
    || isShgBusinessType(user?.sellerProfile?.organizationType)
    || isShgBusinessType(user?.profile?.organizationType)
    || isShgBusinessType(user?.organization?.organizationType)
    || isShgBusinessType(user?.organizationType)
    || isShgBusinessType(user?.businessType);
};

export const getSellerPortalPath = (user: any) => (
  isShgUser(user) ? '/shg/onboarding' : '/seller/onboarding'
);

export const getSellerPortalLabel = (user: any) => (
  isShgUser(user) ? 'SHG Hub' : 'Seller Hub'
);
