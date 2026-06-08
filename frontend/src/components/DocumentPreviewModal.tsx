import { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, RefreshCw } from 'lucide-react';
import type { DocumentPreview } from '../lib/files';

const getDocumentPreviewUrl = (url: string) => {
  if (!url) return url;

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.png') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('.gif') || lowerUrl.includes('.webp') || lowerUrl.includes('.pdf')) {
    return url;
  }

  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
};

const getOfficePreviewUrl = (url: string) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

export function DocumentPreviewModal({
  previewDocument,
  onClose
}: {
  previewDocument: DocumentPreview | null;
  onClose: () => void;
}) {
  if (!previewDocument) return null;

  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  // Derived state: reset controls if the previewed document URL changes
  const [currentUrl, setCurrentUrl] = useState('');
  if (previewDocument.url !== currentUrl) {
    setCurrentUrl(previewDocument.url);
    setScale(1);
    setRotation(0);
  }

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase text-slate-900 sm:text-lg">{previewDocument.label}</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Document Preview</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href={previewDocument.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase text-slate-600 transition-all hover:bg-slate-50 sm:inline-flex"
            >
              Open Original
            </a>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="relative flex-1 bg-slate-100 overflow-hidden">
          {previewDocument.mode === 'image' && (
            <>
              {/* Scrollable image container */}
              <div className="h-full w-full overflow-auto p-4">
                <div className="flex min-h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewDocument.url}
                    alt={previewDocument.label}
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      width: `${scale * 100}%`,
                      maxWidth: scale === 1 ? '100%' : 'none',
                      height: 'auto',
                      transition: 'transform 0.2s ease-in-out, width 0.15s ease-in-out',
                    }}
                    className="m-auto rounded-xl bg-white shadow-lg object-contain"
                  />
                </div>
              </div>

              {/* Floating Glassmorphism Toolbar */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/90 px-4 py-2 shadow-lg backdrop-blur-md z-10">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                
                <span className="min-w-[3.5rem] text-center text-xs font-bold text-slate-600 font-mono">
                  {Math.round(scale * 100)}%
                </span>

                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>

                <div className="h-4 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  title="Rotate Right"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  title="Reset Zoom & Rotation"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
          {previewDocument.mode === 'pdf' && (
            <iframe
              src={previewDocument.url}
              title={previewDocument.label}
              className="h-full w-full"
            />
          )}
          {previewDocument.mode === 'office' && (
            <iframe
              src={getOfficePreviewUrl(previewDocument.url)}
              title={previewDocument.label}
              className="h-full w-full"
            />
          )}
          {previewDocument.mode === 'google' && (
            <iframe
              src={getDocumentPreviewUrl(previewDocument.url)}
              title={previewDocument.label}
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
