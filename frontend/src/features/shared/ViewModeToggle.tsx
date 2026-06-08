/**
 * ViewModeToggle — single source of truth for the list/grid switcher used
 * across every list page (Marketplace, Tenders, Quotations, Vendors,
 * Organizations, AdminRecords, etc.).
 *
 * Standardising this control means the icon order, button height, focus
 * styling, and active-state colour are identical no matter which page the
 * user is on. This keeps the IA predictable and saves us having to redo
 * accessibility (aria-pressed) on every screen.
 */

import React from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ViewMode = 'list' | 'grid';

export interface ViewModeToggleProps {
    value: ViewMode;
    onChange: (next: ViewMode) => void;
    /** Optional theme — `light` for white backgrounds, `dark` for navy banners. */
    theme?: 'light' | 'dark';
    /** Render compact (32px) or default (40px) variant. */
    size?: 'sm' | 'md';
    className?: string;
}

export function ViewModeToggle({
    value,
    onChange,
    theme = 'light',
    size = 'md',
    className
}: ViewModeToggleProps) {
    const heightClass = size === 'sm' ? 'h-9' : 'h-10';
    const buttonSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';

    const wrapperClass = theme === 'dark'
        ? 'border-white/20 bg-white/10'
        : 'border-slate-200 bg-slate-50';

    const activeClass = theme === 'dark'
        ? 'bg-white text-[#0c2340] shadow-sm'
        : 'bg-white text-[#12335f] shadow-sm';

    const inactiveClass = theme === 'dark'
        ? 'text-white/80 hover:text-white'
        : 'text-slate-500 hover:text-[#12335f]';

    return (
        <div
            role="group"
            aria-label="Toggle view mode"
            className={cn(
                'inline-flex items-center gap-1 rounded-lg border p-1',
                heightClass,
                wrapperClass,
                className
            )}
        >
            <button
                type="button"
                onClick={() => onChange('list')}
                aria-label="List view"
                aria-pressed={value === 'list'}
                className={cn(
                    'flex items-center justify-center rounded-md transition-all',
                    buttonSize,
                    value === 'list' ? activeClass : inactiveClass
                )}
            >
                <List className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => onChange('grid')}
                aria-label="Grid view"
                aria-pressed={value === 'grid'}
                className={cn(
                    'flex items-center justify-center rounded-md transition-all',
                    buttonSize,
                    value === 'grid' ? activeClass : inactiveClass
                )}
            >
                <LayoutGrid className="h-4 w-4" />
            </button>
        </div>
    );
}
