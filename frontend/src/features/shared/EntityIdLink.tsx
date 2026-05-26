/**
 * EntityIdLink - one component used everywhere an entity ID needs to be
 * displayed and clickable.
 *
 * Two modes:
 *   1) `to` (string) — navigates to a route via Next.js Link. Use this when
 *      the entity already has a dedicated detail page.
 *   2) `onClick` — opens a callback (typically a modal). Use this for entities
 *      whose detail lives in a drawer on the same page.
 *
 * Visually it's a monospace pill that matches the rest of the portal's
 * tracking/PO/invoice number badges. Long IDs wrap rather than truncate.
 */

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BaseProps {
    /** What to display. Falls back to the numeric ID. */
    label?: string;
    /** Entity primary key. Always shown as a sub-label so admins can correlate. */
    id?: number | string;
    size?: 'sm' | 'md';
    className?: string;
    /** Show the external-link glyph at the end. Defaults to true. */
    showIcon?: boolean;
}

interface NavProps extends BaseProps {
    to: string;
    onClick?: never;
}

interface ClickProps extends BaseProps {
    to?: never;
    onClick: () => void;
}

export type EntityIdLinkProps = NavProps | ClickProps;

const sizeClass = {
    sm: 'h-6 px-2 text-[10px]',
    md: 'h-7 px-2.5 text-[11px]'
} as const;

export function EntityIdLink({ label, id, size = 'md', className, showIcon = true, to, onClick }: EntityIdLinkProps) {
    const display = label || (id !== undefined ? `#${id}` : '—');

    const inner = (
        <>
            <span className="font-mono font-black uppercase tracking-wide text-wrap-anywhere">{display}</span>
            {showIcon && <ExternalLink className="h-3 w-3 shrink-0 opacity-60" aria-hidden />}
        </>
    );

    const styles = cn(
        'inline-flex items-center gap-1.5 rounded-md border border-[#12335f]/20 bg-[#12335f]/5 text-[#12335f] transition hover:border-[#12335f] hover:bg-[#12335f]/10 hover:underline',
        sizeClass[size],
        className
    );

    if (to) {
        return (
            <Link href={to} className={styles} onClick={e => e.stopPropagation()}>
                {inner}
            </Link>
        );
    }

    return (
        <button
            type="button"
            className={styles}
            onClick={e => {
                e.stopPropagation();
                onClick?.();
            }}
        >
            {inner}
        </button>
    );
}
