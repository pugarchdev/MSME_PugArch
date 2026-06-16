import type { ProcurementWizardDraft } from './types';

const DRAFT_KEY = 'msme:create-procurement:draft';

export const procurementWizardApi = {
  loadLocalDraft(): ProcurementWizardDraft | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveLocalDraft(draft: ProcurementWizardDraft) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
  },

  clearLocalDraft() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(DRAFT_KEY);
  },
};
