import React from 'react';
import StakeholderRegistrationFlow from '../components/registration/StakeholderRegistrationFlow';

export default function ShgRegistrationFlow() {
  return (
    <StakeholderRegistrationFlow
      initialBusinessType="herSHG"
      role="seller"
      variant="hershg"
    />
  );
}
