'use client';

import React, { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '../../../../components/ui/input';
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
                <a
                  href={`/api/files/${doc.fileAssetId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[#12335f] hover:underline"
                >
                  {doc.fileName}
                </a>
                <span className="shrink-0 text-slate-400">
                  ({(doc.fileSize / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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

      {/* Terms text fields */}
      {['deliveryTerms', 'paymentTerms', 'warrantyTerms', 'inspectionTerms', 'delayPenaltyDetails', 'additionalTerms'].map(field => (
        <div key={field} className="space-y-1">
          <label className="text-xs font-bold">{field.replace(/([A-Z])/g, ' $1')}</label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={String(data[field] || '')}
            onChange={e => onChange(field, e.target.value)}
          />
        </div>
      ))}

      <div className="space-y-1">
        <label className="text-xs font-bold">Liquidated Damages / Delay Penalty Applicable</label>
        <Input
          value={String(data.delayPenaltyApplicable || 'No')}
          onChange={e => onChange('delayPenaltyApplicable', e.target.value)}
        />
      </div>

      {/* Document Upload Section */}
      <div className="border-t border-slate-200 pt-5">
        <h3 className="mb-1 text-sm font-black text-slate-900">Upload Procurement Documents</h3>
        <p className="mb-4 text-xs text-slate-500">
          Upload approval, L1 comparison, PAC, technical specification, and other supporting documents.
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
