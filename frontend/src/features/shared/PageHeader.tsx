/**
 * PageHeader — standardized page header used across all feature pages.
 *
 * Renders:
 *   - Tricolor accent strip on top (saffron / white / green)
 *   - Eyebrow tag (small uppercase navy text)
 *   - Page title (large, bold, near-black)
 *   - Description (single-line wrap, slate)
 *   - Optional action slot (right-aligned buttons)
 *
 * Usage:
 *   <PageHeader
 *     eyebrow="Procurement"
 *     title="My Cart"
 *     description="Review items and submit for approval."
 *     actions={<Button>...</Button>}
 *   />
 */
import React from 'react';

interface Props {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    /** Show the saffron/white/green strip on top. Default true. */
    tricolor?: boolean;
}

export function PageHeader({ eyebrow, title, description, actions, tricolor = true }: Props) {
    return (
        <div>
            {tricolor && <div className="brand-tricolor-strip mb-3 rounded-full" />}
            <div className="page-header">
                <div className="min-w-0">
                    {eyebrow && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{eyebrow}</p>
                    )}
                    <h1 className="text-2xl font-black tracking-tight text-slate-950 text-wrap-anywhere">{title}</h1>
                    {description && (
                        <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500 text-wrap-anywhere">{description}</p>
                    )}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
        </div>
    );
}
