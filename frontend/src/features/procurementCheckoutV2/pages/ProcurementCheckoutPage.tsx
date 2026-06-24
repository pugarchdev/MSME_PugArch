'use client';

/**
 * ProcurementCheckoutPage — GeM-style marketplace/cart procurement checkout.
 * Replaces deprecated DirectPurchaseCheckoutPage (legacy direct-purchase checkout).
 */
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LoadingState, EmptyState } from '../../shared/FeatureStates';
import { useRemoveCartItem, useUpdateCartItem } from '../../cart/hooks';
import CheckoutWizardLayout from '../components/CheckoutWizardLayout';
import Step1_CartReview from '../components/steps/Step1_CartReview';
import Step2_BuyerDetails from '../components/steps/Step2_BuyerDetails';
import Step3_ConsigneeDelivery from '../components/steps/Step3_ConsigneeDelivery';
import Step4_ProcurementMethod from '../components/steps/Step4_ProcurementMethod';
import Step5_BudgetSanction from '../components/steps/Step5_BudgetSanction';
import Step6_PaymentAuthority from '../components/steps/Step6_PaymentAuthority';
import Step7_TermsDocuments from '../components/steps/Step7_TermsDocuments';
import Step8_PreviewSubmit from '../components/steps/Step8_PreviewSubmit';
import { useProcurementCheckout } from '../hooks/useProcurementCheckout';
import { validateStep } from '../validation';
import type { ProcurementMethodCode } from '../types';

export default function ProcurementCheckoutPage() {
  const router = useRouter();
  const wizard = useProcurementCheckout();
  const updateMut = useUpdateCartItem();
  const removeMut = useRemoveCartItem();

  if (wizard.cartQuery.isLoading) return <LoadingState label="Loading cart…" />;

  if (!wizard.cart || wizard.cart.items.length === 0) {
    return (
      <EmptyState
        title="Cart is empty"
        description="Add products or services from the Marketplace before procurement checkout."
        action={{ label: 'Go to Marketplace', onClick: () => router.push('/buyer/marketplace') }}
      />
    );
  }

  if (wizard.cart.status !== 'ACTIVE') {
    return (
      <EmptyState
        title="Cart not available for checkout"
        description={`Cart status is ${wizard.cart.status}. Only active carts can proceed to procurement checkout.`}
        action={{ label: 'View Cart', onClick: () => router.push('/cart') }}
      />
    );
  }

  const stepErrors = validateStep(wizard.currentStep, wizard.formData);

  const handleNext = () => {
    const errs = validateStep(wizard.currentStep, wizard.formData);
    if (wizard.currentStep === 4 && wizard.evaluation?.demandSplittingRisk && !wizard.formData.demandSplittingConfirmation) {
      toast.error('Confirm demand splitting declaration');
      return;
    }
    if (Object.keys(errs).length > 0) {
      wizard.setErrors(errs);
      toast.error('Please complete required fields');
      return;
    }
    wizard.setErrors({});
    wizard.setCurrentStep(s => Math.min(8, s + 1));
  };

  const method = wizard.formData.selectedMethod;
  const canPlaceOrder = method === 'DIRECT_PURCHASE' || method === 'L1_PURCHASE';
  const canConvertBid = method === 'BID_FROM_CART' || method === 'RA_FROM_CART' || method === 'PAC_PROCUREMENT';

  return (
    <CheckoutWizardLayout
      currentStep={wizard.currentStep}
      isSubmitting={wizard.isSubmitting}
      isSavingDraft={wizard.isSavingDraft}
      onStepClick={wizard.setCurrentStep}
      onPrevious={() => wizard.setCurrentStep(s => Math.max(1, s - 1))}
      onNext={handleNext}
      onSave={wizard.saveDraft}
      onSubmitApproval={wizard.submitForApproval}
      onPlaceOrder={wizard.placeOrder}
      onConvertBid={wizard.convertToBid}
      canPlaceOrder={canPlaceOrder}
      canConvertBid={canConvertBid}
    >
      {wizard.currentStep === 1 && (
        <Step1_CartReview
          cart={wizard.cart}
          isUpdating={updateMut.isPending}
          onUpdateQty={(id, qty) => updateMut.mutate({ id, quantity: qty })}
          onRemove={id => removeMut.mutate(id)}
        />
      )}
      {wizard.currentStep === 2 && (
        <Step2_BuyerDetails
          data={wizard.formData.buyerDetails}
          errors={stepErrors}
          onChange={(f, v) => wizard.updateField('buyerDetails', f, v)}
        />
      )}
      {wizard.currentStep === 3 && (
        <Step3_ConsigneeDelivery
          consignee={wizard.formData.consigneeDetails}
          delivery={wizard.formData.deliveryDetails}
          errors={stepErrors}
          onConsigneeChange={(f, v) => wizard.updateField('consigneeDetails', f, v)}
          onDeliveryChange={(f, v) => wizard.updateField('deliveryDetails', f, v)}
        />
      )}
      {wizard.currentStep === 4 && (
        <Step4_ProcurementMethod
          cartId={wizard.cart.id}
          selectedMethod={wizard.formData.selectedMethod}
          evaluation={wizard.evaluation}
          demandSplittingConfirmation={wizard.formData.demandSplittingConfirmation}
          errors={stepErrors}
          onSelect={(m: ProcurementMethodCode) => {
            wizard.setFormData(prev => ({ ...prev, selectedMethod: m }));
            wizard.refreshEvaluation(m);
          }}
          onDemandSplitConfirm={v => wizard.setFormData(prev => ({ ...prev, demandSplittingConfirmation: v }))}
          onEvaluationRefresh={() => wizard.refreshEvaluation(wizard.formData.selectedMethod || undefined)}
          onL1Created={id => wizard.setFormData(prev => ({ ...prev, l1ComparisonId: id }))}
        />
      )}
      {wizard.currentStep === 5 && (
        <Step5_BudgetSanction
          data={wizard.formData.budgetSanction}
          priceReasonability={wizard.formData.priceReasonability}
          errors={stepErrors}
          highValue={wizard.evaluation?.priceReasonabilityRisk}
          onChange={(f, v) => wizard.updateField('budgetSanction', f, v)}
          onPriceChange={(f, v) => wizard.updateField('priceReasonability', f, v)}
        />
      )}
      {wizard.currentStep === 6 && (
        <Step6_PaymentAuthority
          data={wizard.formData.paymentAuthority}
          errors={stepErrors}
          onChange={(f, v) => wizard.updateField('paymentAuthority', f, v)}
        />
      )}
      {wizard.currentStep === 7 && (
        <Step7_TermsDocuments
          data={wizard.formData.termsDocuments}
          onChange={(f, v) => wizard.updateField('termsDocuments', f, v)}
        />
      )}
      {wizard.currentStep === 8 && (
        <Step8_PreviewSubmit
          cart={wizard.cart}
          form={wizard.formData}
          evaluation={wizard.evaluation}
          errors={stepErrors}
          onDeclarationChange={(f, v) =>
            wizard.setFormData(prev => ({
              ...prev,
              declarations: { ...prev.declarations, [f]: v },
            }))
          }
        />
      )}
    </CheckoutWizardLayout>
  );
}
