'use client';

import React, { useRef, useState } from 'react';
import { Eye, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { openFileAsset } from '../../../../lib/files';
import { uploadProcurementDocument } from '../../api';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png';

interface UploadedDoc {
  documentType: string;
  fileAssetId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

const DOCUMENT_CATEGORIES = [
  {
    key: 'Terms and Conditions Document',
    label: 'Terms and Conditions Document',
    description: 'Delivery, payment, warranty, inspection, delay penalty, and additional contract terms',
  },
  { key: 'Approval Document', label: 'Approval Document', description: 'Administrative approval or sanction order' },
  { key: 'L1 Comparison Sheet', label: 'L1 Comparison Sheet', description: 'L1 price comparison document' },
  { key: 'PAC Certificate', label: 'PAC Certificate', description: 'Proprietary Article Certificate' },
  { key: 'Technical Specification', label: 'Technical Specification', description: 'Technical specification or scope of work' },
  { key: 'Other Supporting Document', label: 'Other Supporting Documents', description: 'Any other relevant procurement documents' },
];

function DocumentUploadZone({
  label,
  description,
  documents,
  onAdd,
  onRemove,
}: {
  label: string;
  description: string;
  documents: UploadedDoc[];
  onAdd: (doc: UploadedDoc) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be 10MB or less');
      return;
    }
    setUploading(true);
    try {
      const result = await uploadProcurementDocument(file);
      const asset = result.file || result;
      const fileAssetId = Number((result as any).fileId || asset.id);
      onAdd({
        documentType: label,
        fileAssetId,
        fileName: asset.originalName || file.name,
        mimeType: asset.mimeType || file.type,
        fileSize: asset.size || file.size,
        uploadedAt: new Date().toISOString(),
      });
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{description} — PDF, Office, CSV or image up to 10MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {documents.length > 0 && (
        <div className="mt-3 space-y-2">
          {documents.map((doc, idx) => (
            <div
              key={`${doc.fileAssetId}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate text-[#12335f]">{doc.fileName}</span>
                <span className="shrink-0 text-slate-400">
                  ({(doc.fileSize / 1024).toFixed(0)} KB)
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openFileAsset({
                      id: doc.fileAssetId,
                      fileAssetId: doc.fileAssetId,
                      originalName: doc.fileName,
                      mimeType: doc.mimeType,
                    }, doc.fileName).catch(err => {
                      toast.error(err instanceof Error ? err.message : 'Unable to open document');
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-[#12335f] hover:bg-slate-100"
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${doc.fileName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Step7_TermsDocuments({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
}) {
  const documents = (Array.isArray(data.documents) ? data.documents : []) as UploadedDoc[];

  const handleAddDoc = (doc: UploadedDoc) => {
    onChange('documents', [...documents, doc]);
  };

  const handleRemoveDoc = (categoryKey: string, indexInCategory: number) => {
    // Find the absolute index of the nth document matching this category
    let count = 0;
    const absoluteIndex = documents.findIndex(d => {
      if (d.documentType === categoryKey) {
        if (count === indexInCategory) return true;
        count++;
      }
      return false;
    });
    if (absoluteIndex >= 0) {
      onChange('documents', documents.filter((_, i) => i !== absoluteIndex));
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-black text-slate-950">Step 7 — Terms & Documents</h2>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <h3 className="text-sm font-black text-slate-900">Terms and conditions upload</h3>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          Upload one document containing delivery terms, payment terms, warranty terms, inspection terms,
          liquidated damages, delay penalty details, and any additional procurement clauses.
        </p>
      </div>

      {/* Document Upload Section */}
      <div className="border-t border-slate-200 pt-5">
        <h3 className="mb-1 text-sm font-black text-slate-900">Upload Procurement Documents</h3>
        <p className="mb-4 text-xs text-slate-500">
          Upload terms and conditions, approval, L1 comparison, PAC, technical specification, and other supporting documents.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {DOCUMENT_CATEGORIES.map(cat => {
            const categoryDocs = documents.filter(d => d.documentType === cat.key);
            return (
              <DocumentUploadZone
                key={cat.key}
                label={cat.key}
                description={cat.description}
                documents={categoryDocs}
                onAdd={handleAddDoc}
                onRemove={idx => handleRemoveDoc(cat.key, idx)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
