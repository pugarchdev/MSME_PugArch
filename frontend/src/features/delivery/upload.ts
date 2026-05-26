/**
 * Document upload helper. Uses XMLHttpRequest (rather than fetch) because
 * we need real-time progress events to show a progress bar - fetch in
 * browsers does not support upload progress without ReadableStream tricks
 * that are not supported in Safari yet.
 */

import { authHeaders } from '../shared/apiClient';

export interface UploadedFileAsset {
  id: number;
  originalName?: string;
  mimeType?: string;
  size?: number;
  url?: string;
}

export interface UploadOptions {
  onProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
  entityType?: string;
}

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const resolveUploadUrl = () => {
  if (BASE_URL) return `${BASE_URL}/api/upload`;
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
      return `${protocol}//${hostname}:5000/api/upload`;
    }
  }
  return '/api/upload';
};

export const uploadDeliveryFile = (file: File, opts: UploadOptions = {}): Promise<UploadedFileAsset> =>
  new Promise<UploadedFileAsset>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', opts.entityType || 'delivery');

    xhr.open('POST', resolveUploadUrl(), true);

    const headers = authHeaders();
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable && opts.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        opts.onProgress(percent, event.loaded, event.total);
      }
    });

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      let body: any = {};
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        // non-JSON body, ignore
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const asset = body?.data ?? body;
        if (asset?.id) {
          resolve(asset as UploadedFileAsset);
          return;
        }
      }
      const message = body?.message || body?.error || `Upload failed (${xhr.status})`;
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    if (opts.signal) {
      const onAbort = () => xhr.abort();
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort);
    }

    xhr.send(formData);
  });
