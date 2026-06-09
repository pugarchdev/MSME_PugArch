import { api, unwrapApiData, BASE_URL } from './api';

export type DocumentPreviewMode = 'image' | 'pdf' | 'office' | 'google';

export type DocumentPreview = {
  label: string;
  url: string;
  mode: DocumentPreviewMode;
};

const getAbsoluteApiUrl = (endpoint: string) => {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://') || endpoint.startsWith('data:')) {
    return endpoint;
  }
  return `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
};

export const getDocumentPreviewMode = (url: string, contentType = '', extension = ''): DocumentPreviewMode => {
  const cleanUrl = url.split('?')[0].toLowerCase();
  const ext = extension || cleanUrl.match(/\.([a-z0-9]+)$/)?.[1] || '';

  if (contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (contentType.toLowerCase().includes('application/pdf') || ext === 'pdf') return 'pdf';
  if (
    contentType.toLowerCase().includes('word') ||
    contentType.toLowerCase().includes('excel') ||
    contentType.toLowerCase().includes('powerpoint') ||
    ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)
  ) return 'office';
  return 'google';
};

export const getFileAssetPreview = async (fileAsset: any, label = 'Document'): Promise<DocumentPreview> => {
  let fileId = Number(fileAsset?.id || fileAsset?.fileAssetId || fileAsset?.fileId);
  const fallbackUrl = fileAsset?.url || fileAsset?.signedUrl || fileAsset?.documentUrl;
  const absoluteFallbackUrl = fallbackUrl ? getAbsoluteApiUrl(fallbackUrl) : '';

  if (!fileId && fallbackUrl) {
    const match = String(fallbackUrl).match(/\/api\/files\/(\d+)/);
    if (match) {
      fileId = Number(match[1]);
    }
  }

  if (!fileId) {
    if (!absoluteFallbackUrl) throw new Error('Document link is not available yet. Please refresh and try again.');
    return {
      label,
      url: absoluteFallbackUrl,
      mode: getDocumentPreviewMode(absoluteFallbackUrl, fileAsset?.mimeType || '')
    };
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const signedUrlEndpoint = token ? `/api/files/${fileId}/signed-url` : `/api/public/files/${fileId}/signed-url`;
  const viewEndpoint = token ? `/api/files/${fileId}/view` : `/api/public/files/${fileId}/view`;
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const res = await api.fetch(signedUrlEndpoint, {
      method: 'GET',
      headers: authHeader,
      skipCache: true
    });

    if (res.ok) {
      const body = await res.json().catch(() => null);
      const data = unwrapApiData<any>(body);
      if (data?.signedUrl) {
        return {
          label,
          url: data.signedUrl,
          mode: getDocumentPreviewMode(data.signedUrl, data.file?.mimeType || fileAsset?.mimeType || '')
        };
      }
    }
  } catch {
    // Fallback to the authenticated blob view below.
  }

  const res = await api.fetch(viewEndpoint, {
    method: 'GET',
    headers: authHeader,
    skipCache: true
  });

  if (!res.ok) {
    let message = '';
    if (res.headers.get('content-type')?.includes('application/json')) {
      const body = await res.json().catch(() => null);
      message = body?.message || body?.error || body?.detail || '';
    } else {
      message = (await res.text().catch(() => '')).trim().slice(0, 160);
    }
    throw new Error(message || `Unable to open document (HTTP ${res.status})`);
  }

  const contentType = res.headers.get('content-type') || fileAsset?.mimeType || '';
  const disposition = res.headers.get('content-disposition');
  let ext = '';
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i) || disposition.match(/filename="?([^";\n]+)"?/i);
    if (match) {
      try {
        const filename = decodeURIComponent(match[1]);
        ext = filename.split('.').pop()?.toLowerCase() || '';
      } catch {}
    }
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return {
    label,
    url,
    mode: getDocumentPreviewMode(url, contentType, ext)
  };
};

export const openFileAsset = async (fileAsset: any, label = 'Document') => {
  let fileId = Number(fileAsset?.id || fileAsset?.fileAssetId || fileAsset?.fileId);
  const fallbackUrl = fileAsset?.url || fileAsset?.signedUrl;
  const absoluteFallbackUrl = fallbackUrl ? getAbsoluteApiUrl(fallbackUrl) : '';

  if (!fileId && fallbackUrl) {
    const match = String(fallbackUrl).match(/\/api\/files\/(\d+)/);
    if (match) {
      fileId = Number(match[1]);
    }
  }

  const previewWindow = window.open('about:blank', '_blank');

  if (previewWindow) {
    previewWindow.opener = null;
    previewWindow.document.title = label;
    previewWindow.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Opening document...</p>';
  }

  try {
    if (!fileId) {
      if (!absoluteFallbackUrl) throw new Error('Document link is not available yet. Please refresh and try again.');
      if (previewWindow) previewWindow.location.href = absoluteFallbackUrl;
      else window.open(absoluteFallbackUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Try fetching signed URL from backend
    try {
      const res = await api.fetch(`/api/files/${fileId}/signed-url`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        skipCache: true
      });

      if (res.ok) {
        const body = await res.json().catch(() => null);
        const data = unwrapApiData<any>(body);
        if (data?.signedUrl) {
          if (previewWindow) {
            previewWindow.location.href = data.signedUrl;
          } else {
            window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
          }
          return;
        }
      }
    } catch {
      // Gracefully ignore and fallback
    }

    // Fallback to fetching blob from view endpoint
    const res = await api.fetch(`/api/files/${fileId}/view`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      },
      skipCache: true
    });

    if (!res.ok) {
      let message = '';
      if (res.headers.get('content-type')?.includes('application/json')) {
        const body = await res.json().catch(() => null);
        message = body?.message || body?.error || body?.detail || '';
      } else {
        message = (await res.text().catch(() => '')).trim().slice(0, 160);
      }
      throw new Error(message || `Unable to open document (HTTP ${res.status})`);
    }

    const contentType = res.headers.get('content-type') || fileAsset?.mimeType || '';
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.document.body.innerHTML = '';
      if (contentType.startsWith('image/')) {
        previewWindow.document.body.style.margin = '0';
        previewWindow.document.body.style.background = '#f1f5f9';
        previewWindow.document.body.style.display = 'flex';
        previewWindow.document.body.style.justifyContent = 'center';
        previewWindow.document.body.style.alignItems = 'center';
        previewWindow.document.body.style.minHeight = '100vh';
        const img = previewWindow.document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100vh';
        img.style.objectFit = 'contain';
        img.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
        img.style.borderRadius = '8px';
        previewWindow.document.body.appendChild(img);
      } else if (contentType === 'application/pdf') {
        previewWindow.document.body.style.margin = '0';
        const iframe = previewWindow.document.createElement('iframe');
        iframe.src = url;
        iframe.style.width = '100%';
        iframe.style.height = '100vh';
        iframe.style.border = 'none';
        previewWindow.document.body.appendChild(iframe);
      } else {
        const link = previewWindow.document.createElement('a');
        link.href = url;
        link.download = fileAsset?.originalName || 'document';
        link.style.fontFamily = 'sans-serif';
        link.style.display = 'block';
        link.style.padding = '24px';
        link.style.textAlign = 'center';
        link.style.fontSize = '16px';
        link.style.fontWeight = 'bold';
        link.style.color = '#2563eb';
        link.style.textDecoration = 'none';
        link.innerText = 'Click here to download ' + (fileAsset?.originalName || 'document');
        previewWindow.document.body.appendChild(link);
        link.click();
      }
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (previewWindow) previewWindow.close();
    throw err;
  }
};
