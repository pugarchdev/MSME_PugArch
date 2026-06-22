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
    if (!user || wizard.formData.step2.buyerName) return;

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
      let state = profile.state || 'Maharashtra';
      let district = profile.district || '';
      let taluka = '';
      let villageOrCity = '';

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
  }, [user, wizard.formData.step2.buyerName, wizard.updateStepData]);

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

  const canSubmit = Boolean(wizard.formData.step9.buyerDeclarationAccepted && wizard.formData.step9.restrictiveConditionsDeclarationAccepted);
  const generatePreviewPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('BidCreationWizardV2 Preview', 14, 16);
    doc.setFontSize(9);
    let y = 28;
    STEP_TITLES.forEach((title, index) => {
      const data = wizard.formData[`step${index + 1}` as keyof typeof wizard.formData] || {};
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}. ${title}`, 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      Object.entries(data).slice(0, 10).forEach(([key, value]) => {
        const text = `${key}: ${typeof value === 'object' ? JSON.stringify(value).slice(0, 80) : String(value || '-')}`;
        doc.text(doc.splitTextToSize(text, 180), 16, y);
        y += 5;
        if (y > 280) {
          doc.addPage();
          y = 16;
        }
      });
      y += 3;
    });
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
