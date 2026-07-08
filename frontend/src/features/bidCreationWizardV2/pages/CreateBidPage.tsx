'use client';

import React, { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import BidWizardLayout from '../components/BidWizardLayout';
import Step1 from '../components/steps/Step1_BidTypeSelection';
import Step2 from '../components/steps/Step2_BuyerDetails';
import Step3 from '../components/steps/Step3_BidBasicDetails';
import Step4 from '../components/steps/Step4_ItemsDetails';
import Step5 from '../components/steps/Step5_DeliveryDetails';
import Step6 from '../components/steps/Step6_EligibilityDetails';
import Step7 from '../components/steps/Step7_TermsDocuments';
import Step8 from '../components/steps/Step8_SpecialConditions';
import Step9 from '../components/steps/Step9_PreviewPublish';
import { useBidWizard } from '../hooks/useBidWizard';
import type { StepComponentProps } from '../types/steps';
import { STEP_TITLES } from '../utils/constants';
import { fetchDeliveryAddresses } from '../../directPurchase/api';
import { PdfEngine, DocumentConfig } from '../../../lib/pdfEngine';
import { formatDateTime } from '../../shared/format';

const steps = [Step1, Step2, Step3, Step4, Step5, Step6, Step7, Step8, Step9];

export default function CreateBidPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const wizard = useBidWizard();

  React.useEffect(() => {
    const draft = searchParams.get('draft');
    if (draft && /^\d+$/.test(draft)) {
      wizard.loadDraft(Number(draft)).catch(() => undefined);
    }
  }, [searchParams]);

  React.useEffect(() => {
    if (!user) return;

    // Load defaults if organization name or buyer name is missing in step 2
    const step2 = wizard.formData.step2;
    const isStep2MissingData = !step2.organizationName || !step2.buyerName;
    if (!isStep2MissingData) return;

    const loadDefaultDetails = async () => {
      let defaultAddress: any = null;
      try {
        const addresses = await fetchDeliveryAddresses();
        defaultAddress = addresses.find((addr: any) => addr.isDefault);
      } catch (err) {
        console.error('Failed to fetch delivery addresses', err);
      }

      const profile = (user as any).buyerProfile || {};
      const organization = (user as any).organization || {};

      let officeAddress = profile.registeredAddress || profile.corporateAddress || '';
      let state = profile.state || 'MAHARASHTRA';
      let district = profile.district || '';
      let taluka = '';
      let villageOrCity = profile.city || '';

      if (defaultAddress) {
        const parts = [
          defaultAddress.addressLine1,
          defaultAddress.addressLine2,
          defaultAddress.landmark,
          defaultAddress.city,
          defaultAddress.district,
          defaultAddress.state,
          defaultAddress.pincode
        ].filter(Boolean);
        officeAddress = parts.join(', ');
        
        state = defaultAddress.state || state;
        district = defaultAddress.district || district;
        villageOrCity = defaultAddress.city || '';
      }

      if (state) {
        state = state.toUpperCase();
      }

      wizard.updateStepData(2, {
        organizationName: profile.organizationName || organization.organizationName || organization.name || (user as any).company?.name || '',
        ministry: profile.ministry || profile.department || '',
        buyerName: user.name || profile.representativeName || '',
        designation: profile.designation || '',
        email: user.email || profile.email || '',
        mobile: user.mobile || profile.mobile || '',
        officeAddress,
        state,
        district,
        taluka,
        villageOrCity,
      });
    };

    loadDefaultDetails();
  }, [user, wizard.formData.step2.buyerName, wizard.formData.step2.organizationName, wizard.updateStepData]);

  const StepComponent = steps[wizard.currentStep - 1];
  const stepKey = `step${wizard.currentStep}` as keyof typeof wizard.formData;
  const props = useMemo<StepComponentProps>(() => ({
    data: wizard.formData[stepKey],
    allData: wizard.formData,
    bidType: wizard.bidType,
    packetType: wizard.packetType,
    errors: wizard.validationErrors[wizard.currentStep] || {},
    updateField: (field, value) => wizard.updateField(wizard.currentStep, field, value),
    updateStepData: (data) => wizard.updateStepData(wizard.currentStep, data),
    goToStep: wizard.setStep,
  }), [stepKey, wizard]);

  const canSubmit = Boolean(
    wizard.formData.step9.buyerDeclarationAccepted &&
    wizard.formData.step9.restrictiveConditionsDeclarationAccepted
  );
  const generatePreviewPdf = async () => {
    const tableData: any[][] = [];
    STEP_TITLES.forEach((title, index) => {
      const data = wizard.formData[`step${index + 1}` as keyof typeof wizard.formData] || {};
      Object.entries(data).forEach(([key, value]) => {
        let displayValue = '-';
        if (typeof value === 'object' && value !== null) {
          displayValue = JSON.stringify(value);
        } else if (value !== undefined && value !== null && value !== '') {
          displayValue = String(value);
        }
        if (displayValue.length > 100) {
          displayValue = displayValue.slice(0, 97) + '...';
        }
        tableData.push([`${index + 1}. ${title}`, key, displayValue]);
      });
    });

    const config: DocumentConfig = {
      documentTitle: 'Bid Creation Preview Draft',
      documentNumber: `DRAFT-${Date.now()}`,
      dateStr: formatDateTime(new Date()),
      status: 'DRAFT PREVIEW',
      parties: [
        {
          title: 'Buyer Organization',
          name: wizard.formData.step2?.organizationName || 'N/A',
          details: [
            `Representative: ${wizard.formData.step2?.buyerName || 'N/A'}`,
            `Ministry: ${wizard.formData.step2?.ministry || 'N/A'}`,
            `Address: ${wizard.formData.step2?.officeAddress || 'N/A'}`
          ]
        }
      ],
      infoGrid: {
        'Bid Type': wizard.bidType || 'N/A',
        'Packet Type': wizard.packetType || 'N/A',
        'Current Step': `${wizard.currentStep} / 9`
      },
      tableHeaders: ['Section', 'Configuration Field', 'Draft Value'],
      tableData: tableData,
      notes: [
        '1. This is a draft preview of the bid document configuration.',
        '2. This document is not legally binding and has not been published to the portal.',
        '3. Please review all fields before final submission.'
      ]
    };

    const engine = new PdfEngine('p');
    const doc = engine.generate(config);
    doc.save('bid-preview.pdf');
  };

  return (
    <BidWizardLayout
      currentStep={wizard.currentStep}
      packetType={wizard.packetType}
      saveStatus={wizard.saveStatus}
      lastSavedAt={wizard.lastSavedAt}
      canSubmit={canSubmit}
      isSubmitting={wizard.isSubmitting}
      validationErrors={wizard.validationErrors}
      stepContentRef={wizard.stepContentRef}
      onStepClick={wizard.setStep}
      onPrevious={() => wizard.setStep(wizard.currentStep - 1)}
      onNext={() => wizard.setStep(wizard.currentStep + 1)}
      onSave={wizard.saveDraft}
      onSubmit={() => wizard.submitBid(true)}
      onPublish={() => wizard.submitBid(false)}
      onGeneratePdf={generatePreviewPdf}
    >
      <StepComponent {...props} />
    </BidWizardLayout>
  );
}
