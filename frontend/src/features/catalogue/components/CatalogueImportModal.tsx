'use client';
import React, { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Upload, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { catalogueApi, downloadCatalogueFile, type ImportPreviewResult } from '../api';

type ImportKind = 'product' | 'service';

export function CatalogueImportModal({ kind, open, onClose, onComplete }: {
  kind: ImportKind;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleValidate = async () => {
    if (!file) {
      toast.error('Select an Excel file first');
      return;
    }
    setLoading(true);
    try {
      const result = kind === 'product'
        ? await catalogueApi.importProductsPreview(file)
        : await catalogueApi.importServicesPreview(file);
      setPreview(result);
      toast.success(`Validated ${result.validRows} of ${result.totalRows} rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (publish: boolean) => {
    if (!preview?.batchId) return;
    setLoading(true);
    try {
      await catalogueApi.confirmImport(preview.batchId, publish);
      toast.success(publish ? 'Imported and published valid rows' : 'Imported valid rows as drafts');
      reset();
      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const title = kind === 'product' ? 'Import Products' : 'Import Services';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-full w-full max-h-[92vh] flex-col overflow-hidden bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl sm:border sm:border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Bulk Import</p>
            <h2 className="text-lg font-black text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={() => { reset(); onClose(); }} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
            <p className="font-bold text-slate-800">Instructions</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Use the official template — do not rename columns.</li>
              <li>Only .xlsx files up to 10MB, max 1000 rows.</li>
              <li>Valid rows import as <strong>DRAFT</strong> unless you choose publish on confirm.</li>
              <li>Invalid rows are skipped; download the error report after validation.</li>
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-8 text-[10px] font-black uppercase"
              onClick={() => downloadCatalogueFile(
                kind === 'product' ? '/api/catalogue/import/templates/products' : '/api/catalogue/import/templates/services',
                kind === 'product' ? 'catalogue_products_template.xlsx' : 'catalogue_services_template.xlsx'
              ).catch(() => toast.error('Template download failed'))}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Download Template
            </Button>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 hover:bg-slate-50">
            <Upload className="mb-2 h-6 w-6 text-slate-400" />
            <span className="text-xs font-bold text-slate-600">{file ? file.name : 'Choose .xlsx file'}</span>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={loading || !file} onClick={handleValidate} className="h-9 bg-emerald-700 text-xs font-black uppercase hover:bg-emerald-800">
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}
              Validate & Preview
            </Button>
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Total', preview.totalRows],
                  ['Valid', preview.validRows],
                  ['Invalid', preview.invalidRows],
                  ['Duplicates', preview.duplicateRows]
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
                    <p className="text-lg font-black text-slate-900">{val}</p>
                  </div>
                ))}
              </div>

              {preview.warnings?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {preview.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}

              {preview.rowErrors?.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                      <AlertTriangle className="h-4 w-4" /> Row errors ({preview.rowErrors.length})
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 text-[10px]"
                      onClick={() => downloadCatalogueFile(`/api/catalogue/import/${preview.batchId}/errors/download`, `import_errors_${preview.batchId}.xlsx`).catch(() => toast.error('Error report download failed'))}
                    >
                      <Download className="mr-1 h-3 w-3" /> Error Report
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto text-[11px]">
                    <table className="w-full">
                      <thead><tr className="text-left text-red-700"><th className="py-1 pr-2">Row</th><th className="py-1 pr-2">Field</th><th>Message</th></tr></thead>
                      <tbody>
                        {preview.rowErrors.slice(0, 20).map((err, i) => (
                          <tr key={i} className="border-t border-red-100">
                            <td className="py-1 pr-2 font-mono">{err.rowNumber}</td>
                            <td className="py-1 pr-2">{err.field || '—'}</td>
                            <td className="py-1">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.preview?.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" /> Preview (first {Math.min(preview.preview.length, 50)} valid rows)
                  </p>
                  <div className="max-h-48 overflow-y-auto text-[11px]">
                    <table className="w-full">
                      <thead><tr className="text-left text-slate-600"><th className="py-1">Name</th><th className="py-1">Status</th><th className="py-1">Specs</th></tr></thead>
                      <tbody>
                        {preview.preview.map((row: any, i) => (
                          <tr key={i} className="border-t border-emerald-100">
                            <td className="py-1 font-semibold">{row.name}</td>
                            <td className="py-1">{row.status}</td>
                            <td className="py-1">{row.specifications?.length || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button type="button" disabled={loading || preview.validRows === 0} onClick={() => handleConfirm(false)} className="h-9 bg-[#0b2447] text-xs font-black uppercase">
                  Confirm Import as Draft
                </Button>
                <Button type="button" disabled={loading || preview.validRows === 0} variant="outline" onClick={() => handleConfirm(true)} className="h-9 text-xs font-black uppercase">
                  Confirm & Publish ACTIVE rows
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
