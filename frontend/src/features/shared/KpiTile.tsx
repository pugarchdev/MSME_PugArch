/**
 * KpiTile - clickable KPI/summary card used at the top of dashboard pages.
 *
 * Behaviour:
 *   - Renders as a real <button>, so it's keyboard-accessible and tabs into.
 *   - When `isActive`, draws a navy ring so the user can see which filter
 *     is currently driving the table below.
 *   - `tone` controls only the icon background, not the card itself, so
 *     adjacent tiles read as a coherent row rather than a rainbow strip.
 *
 * Drop into any dashboard like:
 *   <KpiTile
 *     label="Critical"
 *     value={criticalCount}
 *     hint="Highest severity"
 *     icon={ShieldAlert}
 *     tone="negative"
 *     isActive={severity === 'CRITICAL'}
 *     onClick={() => setSeverity('CRITICAL')}
 *   />
 */

import React from 'react';
import { cn } from '../../lib/utils';

export type KpiTone = 'neutral' | 'positive' | 'warning' | 'negative' | 'info';

const TONE_STYLES: Record<KpiTone, string> = {
    neutral: 'bg-[#12335f]',
    positive: 'bg-emerald-600',
    warning: 'bg-amber-600',
    negative: 'bg-red-600',
    info: 'bg-sky-600'
};

export interface KpiTileProps {
    label: string;
    value: React.ReactNode;
    hint?: string;
    icon?: React.ComponentType<{ className?: string }>;
    tone?: KpiTone;
    isActive?: boolean;
    onClick?: () => void;
    /** Optional ariaLabel; defaults to "Filter by {label}". */
    ariaLabel?: string;
}

function KpiTileBase({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'neutral',
    isActive,
    onClick,
    ariaLabel
}: KpiTileProps) {
    const interactive = typeof onClick === 'function';
    const Element: any = interactive ? 'button' : 'div';

    return (
        <Element
            type={interactive ? 'button' : undefined}
            onClick={onClick}
            aria-pressed={interactive ? Boolean(isActive) : undefined}
            aria-label={interactive ? (ariaLabel || `Filter by ${label}`) : undefined}
            className={cn(
                'flex w-full items-center justify-between rounded-xl border bg-white p-4 text-left transition',
                interactive && 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#12335f]/40',
                isActive
                    ? 'border-[#12335f] shadow-sm ring-2 ring-[#12335f]/20'
                    : 'border-slate-200 hover:-translate-y-0.5 hover:border-[#12335f]/40 hover:shadow'
            )}
        >
            <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
                {hint && (
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 text-wrap-anywhere">
                        {hint}
                    </p>
                )}
            </div>
            {Icon && (
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', TONE_STYLES[tone])}>
                    <Icon className="h-5 w-5" />
                </div>
            )}
        </Element>
    );
}

export const KpiTile = React.memo(KpiTileBase);
