import React from 'react';
import { useSearchParams } from 'next/navigation';
import StakeholderRegistrationFlow from '../components/registration/StakeholderRegistrationFlow';

export default function SellerRegistrationFlow() {
  const searchParams = useSearchParams();
  const isShg = searchParams.get('entity')?.toLowerCase() === 'shg';

  return isShg
    ? <StakeholderRegistrationFlow initialBusinessType="herSHG" role="seller" variant="hershg" />
    : <StakeholderRegistrationFlow role="seller" variant="seller" />;
}
