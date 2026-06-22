import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { useActiveCart } from '../../cart/hooks';
import {
  convertCheckoutToBid,
  evaluateCartProcurementMode,
  finalizeDirectPurchase,
  initProcurementCheckout,
  saveProcurementCheckout,
  submitProcurementCheckout,
} from '../api';
import { DEFAULT_CHECKOUT_FORM } from '../constants';
import type { CartEvaluation, CheckoutFormData } from '../types';
import { fetchDeliveryAddresses } from '../../directPurchase/api';

export function useProcurementCheckout() {
  const { user } = useAuth();
  const router = useRouter();
  const cartQuery = useActiveCart();
  const cart = cartQuery.data;

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<CheckoutFormData>(DEFAULT_CHECKOUT_FORM as CheckoutFormData);
  const [evaluation, setEvaluation] = useState<CartEvaluation | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || formData.buyerDetails.organizationName) return;
    const profile = (user as any).buyerProfile || {};
    const org = (user as any).organization || {};
    setFormData(prev => ({
      ...prev,
      buyerDetails: {
        organizationName: profile.organizationName || org.organizationName || org.name || '',
        buyerOfficerName: user.name || profile.representativeName || '',
        designation: profile.designation || '',
        email: user.email || '',
        mobile: user.mobile || profile.mobile || '',
        officeAddress: profile.registeredAddress || profile.corporateAddress || '',
        financialYear: `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(-2)}`,
        budgetHead: '',
        competentAuthorityName: '',
        competentAuthorityDesignation: '',
      },
    }));
  }, [user, formData.buyerDetails.organizationName]);

  useEffect(() => {
    if (!user || formData.deliveryDetails.deliveryAddress) return;

    const loadDefaultAddress = async () => {
      let defaultAddress: any = null;
      try {
        const addresses = await fetchDeliveryAddresses();
        defaultAddress = addresses.find((addr: any) => addr.isDefault);
      } catch (err) {
        console.error('Failed to fetch delivery addresses', err);
      }

      if (defaultAddress) {
        const addressLines = [
          defaultAddress.addressLine1,
          defaultAddress.addressLine2,
          defaultAddress.landmark
        ].filter(Boolean).join(', ');

        setFormData(prev => ({
          ...prev,
          consigneeDetails: {
            ...prev.consigneeDetails,
            consigneeName: defaultAddress.contactPersonName || prev.consigneeDetails.consigneeName || user.name || '',
            consigneeMobile: defaultAddress.mobileNumber || prev.consigneeDetails.consigneeMobile || user.mobile || '',
            consigneeEmail: defaultAddress.email || prev.consigneeDetails.consigneeEmail || user.email || '',
          },
          deliveryDetails: {
            ...prev.deliveryDetails,
            deliveryAddress: addressLines,
            city: defaultAddress.city || '',
            district: defaultAddress.district || '',
            state: defaultAddress.state || '',
            pinCode: defaultAddress.pincode || '',
          }
        }));
      }
    };

    loadDefaultAddress();
  }, [user, formData.deliveryDetails.deliveryAddress]);

  const refreshEvaluation = useCallback(async (selectedMethod?: string) => {
    if (!cart?.id) return null;
    try {
      const result = await evaluateCartProcurementMode({
        cartId: cart.id,
        selectedMethod,
        proprietary: selectedMethod === 'PAC_PROCUREMENT',
      });
      setEvaluation(result);
      return result;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to evaluate procurement method');
      return null;
    }
  }, [cart?.id]);

  const updateField = (section: keyof CheckoutFormData, field: string, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      [section]: typeof prev[section] === 'object' && prev[section] !== null
        ? { ...(prev[section] as Record<string, unknown>), [field]: value }
        : value,
    }));
  };

  const ensureRequest = async () => {
    if (requestId) return requestId;
    if (!cart?.id || !formData.selectedMethod) {
      throw new Error('Cart and procurement method are required');
    }
    const res = await initProcurementCheckout({
      cartId: cart.id,
      ...formData,
      selectedMethod: formData.selectedMethod,
      demandSplittingConfirmation: formData.demandSplittingConfirmation,
    });
    setRequestId(res.procurementRequestId);
    return res.procurementRequestId;
  };

  const saveDraft = async () => {
    try {
      const id = await ensureRequest();
      await saveProcurementCheckout(id, formData);
      toast.success('Draft saved');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save draft');
    }
  };

  const submitForApproval = async () => {
    setIsSubmitting(true);
    try {
      const id = await ensureRequest();
      await saveProcurementCheckout(id, formData);
      await submitProcurementCheckout(id);
      toast.success('Submitted for internal approval');
      router.push('/buyer/procurement/approvals');
    } catch (err: any) {
      toast.error(err?.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const placeOrder = async () => {
    setIsSubmitting(true);
    try {
      const id = await ensureRequest();
      await saveProcurementCheckout(id, formData);
      const result = await finalizeDirectPurchase(id);
      toast.success(`Order placed — ${result.orders.length} PO(s) created (one per seller)`);
      router.push('/orders');
    } catch (err: any) {
      toast.error(err?.message || 'Order placement failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const convertToBid = async () => {
    setIsSubmitting(true);
    try {
      const id = await ensureRequest();
      const result = await convertCheckoutToBid(id);
      toast.success('Bid draft created from cart');
      router.push(result.redirectPath.replace(/^\//, '/') || `/buyer/create-bid?draft=${result.bidWizardDraftId}`);
    } catch (err: any) {
      toast.error(err?.message || 'Bid conversion failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    cart,
    cartQuery,
    currentStep,
    setCurrentStep,
    formData,
    setFormData,
    updateField,
    evaluation,
    refreshEvaluation,
    requestId,
    isSubmitting,
    errors,
    setErrors,
    saveDraft,
    submitForApproval,
    placeOrder,
    convertToBid,
  };
}
