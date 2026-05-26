/**
 * EntityDetailModal - generic "I just need to show what's in this record"
 * drawer. Used by pages that don't have a bespoke detail page yet, so
 * clicking an ID still produces a meaningful "show me everything" view.
 *
 * Renders the entity as a key-value grid plus a JSON pre-block at the bottom
 * for fields the grid doesn't recognise. Sensitive fields (PAN/GST/Aadhaar/
 * bank account) are already masked server-side, so we can show the raw
 * payload safely.
 */

import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDateTime } from './format';

export interface EntityDetailField {
    key: string;
    label: string;
    /** Optional formatter; default is String(value). */
    format?: (value: any, record: any) => string | null | undefined | React.ReactNode;
}

export interface EntityDetailModalProps {
    open: boolean;
    title: string;
    subtitle?: string;
    entity: Record<string, any> | null | undefined;
    fields?: EntityDetailField[];
    onClose: () => void;
    /** Footer slot (e.g. action buttons). */
    footer?: React.ReactNode;
}

const dateLikeKey = (key: string) =>
    /at$/i.test(key) || /Date$/i.test(key) || key === 'createdAt' || key === 'updatedAt';

export function EntityDetailModal({ open, title, subtitle, entity, fields, onClose, footer }: EntityDetailModalProps) {
    if (!open) return null;

    // Auto-derive fields when the caller doesn't supply any. Skips collections
    // and large blobs - those go in the JSON tail block instead.
    const derived: EntityDetailField[] = fields || (entity
        ? Object.keys(entity)
            .filter(k => {
                const v = entity[k];
                if (v === null || v === undefined) return true;
                if (Array.isArray(v)) return false;
                if (typeof v === 'object') return false;
                return true;
            })
            .slice(0, 24)
            .map(k => ({ key: k, label: humanize(k) }))
        : []);

    const seenKeys = new Set(derived.map(f => f.key));
    const remainder = entity ? Object.fromEntries(Object.entries(entity).filter(([k]) => !seenKeys.has(k))) : {};

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200">
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-3.5 text-white">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black uppercase tracking-widest text-wrap-anywhere">{title}</h2>
                        {subtitle && <p className="mt-0.5 text-[10px] font-bold text-white/70 text-wrap-anywhere">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
                    {!entity ? (
                        <p className="text-xs font-semibold text-slate-500">Loading...</p>
                    ) : (
                        <>
                            <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {derived.map(field => {
                                    const raw = entity[field.key];
                                    const formatted =
                                        field.format
                                            ? field.format(raw, entity)
                                            : raw === null || raw === undefined
                                                ? '—'
                                                : dateLikeKey(field.key)
                                                    ? formatDateTime(raw)
                                                    : typeof raw === 'boolean'
                                                        ? raw ? 'Yes' : 'No'
                                                        : String(raw);

                                    return (
                                        <div key={field.key} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                            <dt className="text-[9px] font-black uppercase tracking-widest text-slate-400">{field.label}</dt>
                                            <dd className="mt-1 text-xs font-bold text-slate-900 text-wrap-anywhere">{formatted ?? '—'}</dd>
                                        </div>
                                    );
                                })}
                            </dl>

                            {Object.keys(remainder).length > 0 && (
                                <details className="rounded-lg border border-slate-200 bg-slate-50">
                                    <summary className="cursor-pointer px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Additional fields ({Object.keys(remainder).length})
                                    </summary>
                                    <pre className={cn('p-3 text-[10px] font-mono text-slate-700 overflow-x-auto text-wrap-anywhere')}>
                                        {JSON.stringify(remainder, null, 2)}
                                    </pre>
                                </details>
                            )}
                        </>
                    )}
                </div>

                {footer && <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
            </div>
        </div>
    );
}

const humanize = (key: string) =>
    key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, c => c.toUpperCase())
        .replace(/_/g, ' ')
        .trim();
