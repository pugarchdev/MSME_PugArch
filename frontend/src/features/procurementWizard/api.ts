import { EMPTY_PROCUREMENT_DRAFT, type ProcurementWizardDraft } from './types';
import { BASE_URL } from '../../lib/api';
import { authHeaders, deleteApi, getApi, postApi } from '../shared/apiClient';
import { getCookieValue } from '../../lib/auth';

const DRAFT_KEY = 'msme:guided-procurement-create:v1';

export const PROCUREMENT_DRAFTS_ROUTE = '/buyer/procurement/drafts';

export const fetchProcurementMethods = () =>
  getApi<any[]>('/api/procurement/methods');

export const fetchProcurementDrafts = () =>
  getApi<any>('/api/procurement/drafts');

export const fetchProcurementDraft = (id: number) =>
  getApi<any>(`/api/procurement/drafts/${id}`);

export const deleteProcurementDraft = (id: number) =>
  deleteApi<any>(`/api/buyer/requirements/${id}`);

export const saveProcurementDraft = (payload: Record<string, unknown>) =>
  postApi<any>('/api/procurement/drafts', payload);

export const submitProcurementDraft = (payload: Record<string, unknown>) =>
  postApi<any>('/api/procurement/submit', payload);

export type ProcurementDocumentUpload = {
  id: number;
  originalName?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  documentUrl?: string;
};

export const uploadProcurementDocument = (
  procurementId: number,
  file: File,
  onProgress?: (percent: number) => void
) => new Promise<ProcurementDocumentUpload>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);

  xhr.open('POST', `${BASE_URL}/api/procurement/${encodeURIComponent(String(procurementId))}/documents`, true);
  xhr.withCredentials = true;
  for (const [key, value] of Object.entries(authHeaders())) {
    xhr.setRequestHeader(key, value);
  }

  const csrfToken = getCookieValue('csrfToken');
  if (csrfToken) {
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
  }

  xhr.upload.addEventListener('progress', event => {
    if (!event.lengthComputable || !onProgress) return;
    onProgress(Math.round((event.loaded / event.total) * 100));
  });

  xhr.onreadystatechange = () => {
    if (xhr.readyState !== 4) return;
    let body: any = {};
    try {
      body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
    } catch {
      reject(new Error('Backend API returned a non-JSON response.'));
      return;
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      const asset = body?.data ?? body?.file ?? body;
      const fileAsset = asset?.file ?? asset?.fileAsset ?? asset;
      const id = Number(fileAsset?.id || fileAsset?.fileAssetId || fileAsset?.fileId || asset?.id || 0);
      if (id) {
        resolve({
          ...asset,
          ...fileAsset,
          id,
          url: fileAsset?.url || fileAsset?.documentUrl || asset?.url || asset?.documentUrl || `/api/files/${id}/view`,
        });
        return;
      }
    }

    reject(new Error(body?.message || body?.error || `Upload failed (${xhr.status})`));
  };

  xhr.onerror = () => reject(new Error('Network error during upload'));
  xhr.ontimeout = () => reject(new Error('Upload timed out'));
  xhr.onabort = () => reject(new Error('Upload aborted'));
  xhr.send(formData);
});

export const procurementWizardApi = {
  loadLocalDraft(): any {
    if (typeof window === 'undefined') return null;
    try {
      const rawV2 = localStorage.getItem('msme:guided-procurement-create:v2');
      if (rawV2) return JSON.parse(rawV2);
      const rawV1 = localStorage.getItem('msme:guided-procurement-create:v1');
      return rawV1 ? JSON.parse(rawV1) : null;
    } catch {
      return null;
    }
  },

  saveLocalDraft(draft: any) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('msme:guided-procurement-create:v2', JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
  },

  clearLocalDraft() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('msme:guided-procurement-create:v1');
    localStorage.removeItem('msme:guided-procurement-create:v2');
  },
};
