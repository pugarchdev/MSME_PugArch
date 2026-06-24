import React, { useState, useEffect } from 'react';
import { FileText, FileImage, FileSpreadsheet, Eye, Download, X, Loader2 } from 'lucide-react';
import { openFileAsset, getFileAssetPreview, type DocumentPreview } from '../../../../lib/files';

interface DocumentObj {
  documentType?: string;
  fileAssetId?: number;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  url?: string;
  uploadedAt?: string;
}

// Format database/camelCase keys to human-readable text
function formatKey(key: string): string {
  const overrides: Record<string, string> = {
    technicalSpecificationDocumentIds: 'Technical Specification Documents',
    budgetSanctionDocumentIds: 'Budget Sanction Documents',
    administrativeApprovalDocumentIds: 'Administrative Approval Documents',
    scopeOfWorkDocumentIds: 'Scope of Work Documents',
    boqDocumentIds: 'BOQ Documents',
    pacCertificateDocumentIds: 'PAC Certificate Documents',
    drawingDocumentIds: 'Drawings / Layouts',
    additionalTermDocumentIds: 'Additional Terms Documents',
    documentUploads: 'Document Uploads',
    gstInvoiceRequired: 'GST Invoice Required',
    ewayBillRequired: 'E-Way Bill Required',
    advancePaymentAllowed: 'Advance Payment Allowed',
    partPaymentAllowed: 'Part Payment Allowed',
    invoiceRequired: 'Invoice Required',
    buyerDeclarationAccepted: 'Buyer Declaration Accepted',
    restrictiveConditionsDeclarationAccepted: 'Restrictive Conditions Declaration Accepted',
    financialPacket: 'Financial Packet Details',
  };

  if (overrides[key]) return overrides[key];

  let formatted = key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim();

  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  if (formatted.endsWith(' Ids')) {
    formatted = formatted.slice(0, -4);
  } else if (formatted.endsWith(' Id')) {
    formatted = formatted.slice(0, -3);
  }

  return formatted;
}

// Parse stringified JSON safely
function tryParseJson(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Detect if value is a list of uploaded files
const isFileList = (val: any, key: string): boolean => {
  if (!Array.isArray(val)) return false;
  
  // Explicitly ignore string lists that represent required metadata/eligibility
  const ignoredKeys = ['bidderDocuments', 'certifications', 'technicalEligibilityCriteria', 'pastWorkDocuments'];
  if (ignoredKeys.includes(key)) return false;

  if (val.length === 0) return isKeyLikelyFileList(key);
  
  const first = val[0];
  if (typeof first === 'string') {
    // If it's a string, it must be a URL or path to be a file
    return first.startsWith('/') || first.startsWith('http') || first.startsWith('data:');
  }
  
  // Numbers are treated as file asset IDs
  if (typeof first === 'number') {
    return true;
  }
  
  return typeof first === 'object' && first !== null;
};

// Check if a key is likely to represent a file list (for empty lists)
const isKeyLikelyFileList = (key: string): boolean => {
  const lowercase = key.toLowerCase();
  return (
    lowercase.endsWith('ids') ||
    lowercase.endsWith('uploads') ||
    lowercase.includes('document') ||
    lowercase.includes('certificate') ||
    lowercase.includes('file')
  );
};

// Format file size
const formatFileSize = (size?: number) => {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

// Determine if field should span the full row width
const isFullWidthField = (key: string, value: any): boolean => {
  const parsedValue = tryParseJson(value);
  if (isFileList(parsedValue, key)) return true;
  if (Array.isArray(parsedValue) && isKeyLikelyFileList(key)) return true;
  if (typeof parsedValue === 'string' && parsedValue.length > 80) return true;
  if (['officeAddress', 'description', 'paymentTerms', 'financialPacket', 'lineItems'].includes(key)) return true;
  return false;
};

export default function PreviewSection({ title, data, onEdit }: { title: string; data: Record<string, any>; onEdit: () => void }) {
  const [previewingFile, setPreviewingFile] = useState<DocumentObj | null>(null);

  // Filter out internal state management fields (like UI control flags or declarations)
  const renderableEntries = Object.entries(data || {}).filter(([key]) => {
    return !['buyerDeclarationAccepted', 'restrictiveConditionsDeclarationAccepted'].includes(key);
  });

  // Render a list of files with View and Download buttons
  const renderFileList = (files: any[], onView: (file: any) => void) => {
    if (files.length === 0) {
      return <span className="text-xs italic text-slate-400 font-medium">No documents uploaded</span>;
    }

    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {files.map((file, idx) => {
          const name = file.fileName || file.documentType || 'Document';
          const size = file.fileSize ? formatFileSize(file.fileSize) : '';
          const mime = file.mimeType || '';

          let Icon = FileText;
          if (mime.startsWith('image/')) Icon = FileImage;
          else if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) Icon = FileSpreadsheet;

          return (
            <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xs transition hover:border-[#12335f]/30">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-500">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800" title={name}>{name}</p>
                  {size && <p className="text-[10px] font-semibold text-slate-400">{size}</p>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onView(file)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#12335f]/5 text-[#12335f] hover:bg-[#12335f]/10 transition"
                  title="View document"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openFileAsset(file, name).catch(() => {});
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                  title="Download document"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Render generic list of objects (like line items)
  const renderGenericObjectList = (items: any[]) => {
    if (items.length === 0) return <span className="text-xs text-slate-400 italic font-medium">None</span>;
    return (
      <ul className="mt-1 space-y-1.5 text-xs text-slate-700">
        {items.map((item, idx) => {
          if (typeof item === 'object' && item !== null) {
            if ('raw' in item) return <li key={idx} className="list-disc ml-4 font-semibold">{String(item.raw)}</li>;
            const text = Object.entries(item)
              .map(([k, v]) => `${formatKey(k)}: ${String(v)}`)
              .join(' | ');
            return <li key={idx} className="list-disc ml-4 font-semibold">{text}</li>;
          }
          return <li key={idx} className="list-disc ml-4 font-semibold">{String(item)}</li>;
        })}
      </ul>
    );
  };

  // Render generic objects (like financialPacket details)
  const renderGenericObject = (obj: Record<string, any>, onViewFile: (file: any) => void) => {
    return (
      <div className="mt-2 space-y-2 text-xs text-slate-700 bg-white/70 border border-slate-200 rounded-lg p-3 shadow-xs">
        {Object.entries(obj).map(([k, v]) => {
          if (v === undefined || v === null || v === '') return null;
          
          const formattedKey = formatKey(k);

          if (typeof v === 'object') {
            const parsed = tryParseJson(v);
            if (isFileList(parsed, k)) {
              return (
                <div key={k} className="mt-1.5">
                  <span className="font-bold text-slate-500">{formattedKey}:</span>
                  {renderFileList(parsed, onViewFile)}
                </div>
              );
            } else if (Array.isArray(parsed)) {
              return (
                <div key={k} className="mt-1.5">
                  <span className="font-bold text-slate-500">{formattedKey}:</span>
                  {renderGenericObjectList(parsed)}
                </div>
              );
            } else {
              return (
                <div key={k} className="mt-1.5 pl-2.5 border-l-2 border-slate-200">
                  <span className="font-bold text-slate-500">{formattedKey}:</span>
                  {renderGenericObject(parsed, onViewFile)}
                </div>
              );
            }
          }

          let formattedValue = '';
          if (typeof v === 'boolean') {
            formattedValue = v ? 'Yes' : 'No';
          } else {
            formattedValue = String(v);
          }

          return (
            <div key={k} className="flex flex-wrap items-baseline gap-1.5 border-b border-slate-100 pb-1 last:border-0 last:pb-0">
              <span className="font-bold text-slate-500">{formattedKey}:</span>
              <span className="font-semibold text-slate-800">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-900 tracking-wide uppercase">{title}</h3>
        <button type="button" onClick={onEdit} className="text-xs font-black text-[#12335f] hover:underline transition">Edit</button>
      </div>
      <dl className="grid gap-3 md:grid-cols-2">
        {renderableEntries.map(([key, value]) => {
          const parsedValue = tryParseJson(value);
          const isFile = isFileList(parsedValue, key);
          const fullWidth = isFullWidthField(key, value);
          const formattedKey = formatKey(key);

          return (
            <div key={key} className={`rounded-lg bg-slate-50 px-4 py-3 border border-slate-100 ${fullWidth ? 'col-span-full' : ''}`}>
              <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{formattedKey}</dt>
              <dd className="mt-1.5 break-words text-xs text-slate-800">
                {isFile ? (
                  renderFileList(parsedValue || [], setPreviewingFile)
                ) : Array.isArray(parsedValue) ? (
                  renderGenericObjectList(parsedValue)
                ) : typeof parsedValue === 'object' && parsedValue !== null ? (
                  renderGenericObject(parsedValue, setPreviewingFile)
                ) : typeof parsedValue === 'boolean' ? (
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                    parsedValue 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {parsedValue ? 'Yes' : 'No'}
                  </span>
                ) : (
                  <span className="font-semibold text-slate-700">{String(parsedValue || '-')}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Modern Document Viewer Modal */}
      {previewingFile && (
        <DocumentViewerModal 
          file={previewingFile} 
          onClose={() => setPreviewingFile(null)} 
        />
      )}
    </section>
  );
}

// Document Viewer Sub-component
function DocumentViewerModal({ file, onClose }: { file: DocumentObj; onClose: () => void }) {
  const [previewData, setPreviewData] = useState<DocumentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = file.fileName || file.documentType || 'Document';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPreviewData(null);

    getFileAssetPreview(file, name)
      .then(data => {
        if (active) setPreviewData(data);
      })
      .catch(err => {
        if (active) setError(err.message || 'Failed to load document preview');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [file, name]);

  const handleDownload = () => {
    if (previewData) {
      const a = document.createElement('a');
      a.href = previewData.url;
      a.download = name;
      a.click();
    } else {
      openFileAsset(file, name).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-slate-800">{name}</h2>
              {file.fileSize && (
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{formatFileSize(file.fileSize)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                <Download className="h-4 w-4" /> Download
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                aria-label="Close document viewer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Content / Viewer Area */}
        <div className="flex-1 overflow-auto bg-slate-100 p-5 flex items-center justify-center min-h-[50vh]">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
              <p className="text-xs font-bold">Loading document preview...</p>
            </div>
          )}

          {error && (
            <div className="max-w-md text-center py-12 px-6 rounded-xl bg-white border border-slate-200 shadow-xs">
              <FileText className="h-12 w-12 text-slate-400 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-800 mb-1">Preview Unavailable</h3>
              <p className="text-xs font-medium text-slate-500 mb-4">{error}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#12335f] px-4 text-xs font-bold text-white hover:bg-[#12335f]/95 shadow-xs transition"
              >
                <Download className="h-4 w-4" /> Download to View
              </button>
            </div>
          )}

          {!loading && !error && previewData && (
            <div className="w-full h-full flex items-center justify-center">
              {previewData.mode === 'image' && (
                <img 
                  src={previewData.url} 
                  alt={name} 
                  className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm border border-slate-200 bg-white" 
                />
              )}
              {previewData.mode === 'pdf' && (
                <iframe 
                  src={previewData.url} 
                  className="w-full h-[70vh] border-0 rounded-lg shadow-sm bg-white"
                  title="PDF Preview"
                />
              )}
              {previewData.mode !== 'image' && previewData.mode !== 'pdf' && (
                <div className="max-w-md text-center py-12 px-6 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <FileText className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Standard Preview Limit</h3>
                  <p className="text-xs font-medium text-slate-500 mb-4">
                    Direct previews for Office documents (Word, Excel) are not supported inside the web viewer. Please download the file to view its contents.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#12335f] px-4 text-xs font-bold text-white hover:bg-[#12335f]/95 shadow-xs transition"
                  >
                    <Download className="h-4 w-4" /> Download Document
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
