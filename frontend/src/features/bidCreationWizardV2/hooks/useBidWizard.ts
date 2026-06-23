import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { BidType, PacketType, WizardFormData } from '../types/steps';
import { bidWizardApi } from '../api';
import { defaultStep4ForBidType, emptyWizardFormData, mergeStepData } from '../utils/helpers';
import { validateStepClient } from '../utils/validation';
import { scrollToFirstFieldError } from '../utils/fieldStyles';
import { useStepValidation } from './useStepValidation';
import { useDraftPersistence } from './useDraftPersistence';

const ALL_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const useBidWizard = () => {
  const router = useRouter();
  const [draftId, setDraftId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(() => emptyWizardFormData());
  const [validationErrors, setValidationErrors] = useState<Record<number, Record<string, string[]>>>({});
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touchedSteps, setTouchedSteps] = useState<Set<number>>(() => new Set());
  const stepContentRef = useRef<HTMLDivElement | null>(null);

  const bidType = (formData.step1.bidType || null) as BidType | null;
  const packetType = (formData.step1.packetType || 'SINGLE_PACKET') as PacketType;
  const validateStep = useStepValidation(formData, bidType, packetType, setValidationErrors);
  const persistence = useDraftPersistence({ draftId, currentStep, formData, validationErrors, completedSteps, enabled: Boolean(draftId) });

  const validateStepClientOnly = useCallback((step: number) => {
    const result = validateStepClient(step, formData, bidType, packetType);
    setValidationErrors(prev => ({ ...prev, [step]: result.errors }));
    return result;
  }, [bidType, formData, packetType]);

  const markStepTouched = useCallback((step: number) => {
    setTouchedSteps(prev => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, []);

  const markAllStepsTouched = useCallback(() => {
    setTouchedSteps(new Set(ALL_STEPS));
  }, []);

  const showValidationFailure = useCallback((step: number, message?: string) => {
    scrollToFirstFieldError(stepContentRef.current);
    toast.error(message || 'Please fix the highlighted fields before continuing.');
  }, []);

  useEffect(() => {
    if (!touchedSteps.has(currentStep)) return;
    validateStepClientOnly(currentStep);
  }, [currentStep, formData, touchedSteps, validateStepClientOnly]);

  const updateField = useCallback((step: number, field: string, value: any) => {
    setFormData(prev => {
      const next = mergeStepData(prev, step, { [field]: value });
      if (step === 1 && field === 'bidType') {
        next.step4 = defaultStep4ForBidType(String(value));
      }
      return next;
    });
  }, []);

  const updateStepData = useCallback((step: number, data: Record<string, any>) => {
    setFormData(prev => mergeStepData(prev, step, data));
  }, []);

  const ensureDraft = useCallback(async () => {
    const selectedBidType = formData.step1.bidType as BidType | undefined;
    if (draftId || !selectedBidType) return draftId;
    const draft = await bidWizardApi.createDraft(selectedBidType, formData);
    setDraftId(draft.id);
    persistence.setLastSavedAt(draft.lastSavedAt);
    return draft.id;
  }, [draftId, formData, persistence]);

  const goToStep = useCallback(async (step: number) => {
    if (step > currentStep) {
      markStepTouched(currentStep);
      const clientResult = validateStepClientOnly(currentStep);
      if (!clientResult.valid) {
        showValidationFailure(currentStep);
        return;
      }

      const ok = await validateStep(currentStep, true);
      if (!ok) {
        showValidationFailure(currentStep);
        return;
      }

      setCompletedSteps(prev => Array.from(new Set([...prev, currentStep])));
      if (currentStep === 1) await ensureDraft();
    }
    setCurrentStep(Math.min(9, Math.max(1, step)));
  }, [currentStep, ensureDraft, markStepTouched, showValidationFailure, validateStep, validateStepClientOnly]);

  const saveDraft = useCallback(async () => {
    const hadDraft = Boolean(draftId);
    const id = await ensureDraft();
    if (!id) {
      toast.error('Select bid type before saving draft');
      return;
    }
    if (hadDraft) {
      await persistence.saveDraft();
    } else {
      const draft = await bidWizardApi.updateDraft(id, {
        currentStep,
        formData,
        validationState: validationErrors,
        completedSteps,
      });
      persistence.setLastSavedAt(draft.lastSavedAt);
    }
    toast.success('Draft saved');
  }, [completedSteps, currentStep, draftId, ensureDraft, formData, persistence, validationErrors]);

  const submitBid = useCallback(async (submitForApproval = true) => {
    const id = await ensureDraft();
    if (!id) return;
    markAllStepsTouched();
    setIsSubmitting(true);
    try {
      await bidWizardApi.updateDraft(id, {
        currentStep,
        formData,
        validationState: validationErrors,
        completedSteps,
      });

      const collectedErrors: Record<number, Record<string, string[]>> = {};
      const invalidSteps: number[] = [];
      for (let step = 1; step <= 9; step += 1) {
        const serverResult = await bidWizardApi.validateStep(step, formData, bidType, packetType);
        if (!serverResult.valid) {
          invalidSteps.push(step);
          collectedErrors[step] = serverResult.errors || {};
        }
      }
      if (invalidSteps.length) {
        setValidationErrors(prev => ({ ...prev, ...collectedErrors }));
        const firstStep = invalidSteps[0];
        setCurrentStep(firstStep);
        const firstError = Object.values(collectedErrors[firstStep] || {})[0]?.[0];
        showValidationFailure(firstStep, firstError || `Please fix validation errors in step ${firstStep}`);
        return;
      }

      const result = await bidWizardApi.submit(id, submitForApproval);
      toast.success(`Bid submitted: ${result.procurementBid?.bidNumber || result.procurementBid?.id}`);
      setTimeout(() => {
        router.push('/buyer/bids');
      }, 1500);
    } catch (error: any) {
      const details = error?.details;
      if (details && typeof details === 'object') {
        const stepKeys = Object.keys(details)
          .map((key) => Number(key))
          .filter((step) => Number.isFinite(step) && step > 0)
          .sort((a, b) => a - b);

        if (stepKeys.length) {
          const normalized = Object.fromEntries(
            stepKeys.map((step) => [step, details[String(step)] as Record<string, string[]>])
          );
          setValidationErrors(prev => ({ ...prev, ...normalized }));
          setCurrentStep(stepKeys[0]);
          const firstError = Object.values(normalized[stepKeys[0]] || {})[0]?.[0];
          showValidationFailure(stepKeys[0], firstError || `Please fix validation errors in step ${stepKeys[0]}`);
          return;
        }
      }
      toast.error(error.message || 'Unable to submit bid');
    } finally {
      setIsSubmitting(false);
    }
  }, [bidType, completedSteps, currentStep, ensureDraft, formData, markAllStepsTouched, packetType, showValidationFailure, validationErrors]);

  const loadDraft = useCallback(async (id: number) => {
    const draft = await bidWizardApi.getDraft(id);
    setDraftId(draft.id);
    setCurrentStep(draft.currentStep || 1);
    setFormData({ ...emptyWizardFormData(), ...(draft.formData || {}) });
    setCompletedSteps(draft.completedSteps || []);
    setValidationErrors({});
    setTouchedSteps(new Set());
    persistence.setLastSavedAt(draft.lastSavedAt);
  }, [persistence]);

  const resetWizard = useCallback(() => {
    setDraftId(null);
    setCurrentStep(1);
    setFormData(emptyWizardFormData());
    setValidationErrors({});
    setCompletedSteps([]);
    setTouchedSteps(new Set());
  }, []);

  return useMemo(() => ({
    draftId,
    currentStep,
    bidType,
    packetType,
    formData,
    validationErrors,
    completedSteps,
    touchedSteps,
    stepContentRef,
    saveStatus: persistence.saveStatus,
    lastSavedAt: persistence.lastSavedAt,
    isSubmitting,
    setStep: goToStep,
    updateField,
    updateStepData,
    validateCurrentStep: () => validateStep(currentStep, true),
    saveDraft,
    submitBid,
    loadDraft,
    resetWizard,
  }), [bidType, completedSteps, currentStep, draftId, formData, goToStep, isSubmitting, loadDraft, packetType, persistence.lastSavedAt, persistence.saveStatus, resetWizard, saveDraft, submitBid, touchedSteps, updateField, updateStepData, validateStep, validationErrors]);
};
