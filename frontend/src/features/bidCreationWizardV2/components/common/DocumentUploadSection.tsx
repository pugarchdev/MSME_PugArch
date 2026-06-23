import React, { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { bidWizardApi } from '../../api';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png';

export default function DocumentUploadSection({
  label,
  mandatory,
  value,
  onChange,
  error,
}: {
  label: string;
  mandatory?: boolean;
  value?: any[];
  onChange: (value: any[]) => void;
  error?: string[];
}) {
  const rows = Array.isArray(value) ? value : [];
  const hasError = Boolean(error?.length);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error('File size must be 10MB or less');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await bidWizardApi.uploadDocument(file);
      const asset = uploaded.file || uploaded;
      const fileAssetId = Number(uploaded.fileId || asset.id);
      onChange([...rows, {
        documentType: label,
        fileAssetId,
        fileName: asset.originalName || file.name,
        mimeType: asset.mimeType || file.type,
        fileSize: asset.size || file.size,
        url: uploaded.url || asset.url || asset.documentUrl,
        uploadedAt: new Date().toISOString()
      }]);
      toast.success(`${label} uploaded`);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      data-field-error={hasError ? 'true' : undefined}
      className={`rounded-lg border border-dashed bg-white p-4 ${hasError ? 'border-red-400 bg-red-50/40 ring-2 ring-red-500/20' : 'border-slate-300'}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-sm font-black ${hasError ? 'text-red-800' : 'text-slate-900'}`}>{label}</p>
          <p className="text-xs font-semibold text-slate-500">{mandatory ? 'Mandatory document' : 'Optional document'} - PDF, Office, CSV or image up to 10MB.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {rows.length > 0 && (
        <div className="mt-3 space-y-2">
          {rows.map((row, index) => {
            const key = `${row.fileAssetId || row.fileName}-${index}`;
            return (
              <div key={key} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate">{row.fileName || row.documentType}</span>
                </span>
                <button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {hasError && (
        <p className="mt-3 text-xs font-bold text-red-600">{error![0]}</p>
      )}
    </div>
  );
}
