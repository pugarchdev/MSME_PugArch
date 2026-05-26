/**
 * PageToolbar - the search box + filters + reset row used by every list page.
 *
 * Standardises the layout so search and all filters live on a single row on
 * desktop, collapse to a 2-column grid on tablet, and stack on phones. Keeps
 * pages from drifting into bespoke filter bars that look different on every
 * screen.
 *
 * Usage:
 *   <PageToolbar
 *     search={q} onSearchChange={setQ}
 *     onReset={() => { setQ(''); setStatus(''); }}
 *     filters={[
 *       { kind: 'select', value: status, onChange: setStatus, options: [...] },
 *       { kind: 'select', value: range, onChange: setRange, options: [...] }
 *     ]}
 *   />
 */

import React from 'react';
import { Filter, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

export type ToolbarFilterOption = { value: string; label: string };

export type ToolbarFilter =
    | {
        kind: 'select';
        value: string;
        onChange: (value: string) => void;
        options: ToolbarFilterOption[];
        placeholder?: string;
        ariaLabel?: string;
        className?: string;
    }
    | {
        kind: 'date';
        value: string;
        onChange: (value: string) => void;
        ariaLabel?: string;
        placeholder?: string;
        className?: string;
    }
    | {
        kind: 'custom';
        render: () => React.ReactNode;
        className?: string;
    };

export interface PageToolbarProps {
    search?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    filters?: ToolbarFilter[];
    onReset?: () => void;
    /** Optional right-aligned button cluster (e.g. "+ New Rule"). */
    actions?: React.ReactNode;
    className?: string;
    /** Optional eyebrow shown above the row, e.g. "Filters". */
    eyebrow?: string;
    /** Disable the rounded card styling when embedding the toolbar inline. */
    embedded?: boolean;
}

const inputBase =
    'h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30';

export function PageToolbar({
    search,
    onSearchChange,
    searchPlaceholder = 'Search...',
    filters = [],
    onReset,
    actions,
    className,
    eyebrow,
    embedded
}: PageToolbarProps) {
    const hasSearch = onSearchChange !== undefined;

    // Build the grid template so search takes the lion's share, then each filter
    // gets a fixed minmax window, and the action cluster sits on the far right.
    const filterCount = filters.length;
    const cols = `${hasSearch ? 'minmax(0, 1.3fr) ' : ''}${'minmax(0, 1fr) '.repeat(filterCount)}auto${actions ? ' auto' : ''}`;

    return (
        <div
            className={cn(
                embedded ? 'space-y-3' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3',
                className
            )}
        >
            {eyebrow && (
                <div className="flex items-center gap-2 text-[#12335f]">
                    <Filter className="h-4 w-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">{eyebrow}</p>
                </div>
            )}

            <div
                className="grid gap-3"
                style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}
            >
                {/* On wide screens, force a single row layout. The hidden md:grid block
            below replaces the auto-fit with explicit columns once we have room. */}
            </div>

            <div
                className={cn(
                    'grid gap-3 items-stretch',
                    // Phones: stack everything
                    'grid-cols-1',
                    // Tablets: search wide, filters in 2 columns
                    'sm:grid-cols-2',
                    // Desktops: single row using inline grid template below
                    'lg:[grid-template-columns:var(--toolbar-cols)]'
                )}
                style={{ ['--toolbar-cols' as any]: cols }}
            >
                {hasSearch && (
                    <div className="relative min-w-0">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search ?? ''}
                            onChange={e => onSearchChange?.(e.target.value)}
                            placeholder={searchPlaceholder}
                            aria-label="Search"
                            className={cn(inputBase, 'pl-10 pr-3')}
                        />
                    </div>
                )}

                {filters.map((f, idx) => {
                    if (f.kind === 'select') {
                        return (
                            <select
                                key={idx}
                                value={f.value}
                                onChange={e => f.onChange(e.target.value)}
                                aria-label={f.ariaLabel || 'Filter'}
                                className={cn(inputBase, 'px-3', f.className)}
                            >
                                {f.placeholder && <option value="">{f.placeholder}</option>}
                                {f.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        );
                    }
                    if (f.kind === 'date') {
                        return (
                            <input
                                key={idx}
                                type="date"
                                value={f.value}
                                onChange={e => f.onChange(e.target.value)}
                                aria-label={f.ariaLabel || 'Date filter'}
                                placeholder={f.placeholder}
                                className={cn(inputBase, 'px-3', f.className)}
                            />
                        );
                    }
                    return (
                        <div key={idx} className={cn('min-w-0', f.className)}>{f.render()}</div>
                    );
                })}

                {onReset && (
                    <Button
                        variant="outline"
                        className="h-10 rounded-lg text-xs font-black uppercase"
                        onClick={onReset}
                        type="button"
                    >
                        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reset
                    </Button>
                )}

                {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
        </div>
    );
}
