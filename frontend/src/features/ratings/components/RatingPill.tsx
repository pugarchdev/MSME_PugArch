import { Star } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface RatingPillProps {
    average?: number;
    count?: number;
    size?: 'sm' | 'md';
    className?: string;
    /** Whether to show "(n reviews)" beside the score. */
    showCount?: boolean;
}

/**
 * Compact rating widget used on cards, lists, profile headers. One source of
 * truth for rating display so the same colour/size logic appears everywhere.
 */
export function RatingPill({
    average = 0,
    count = 0,
    size = 'md',
    showCount = true,
    className
}: RatingPillProps) {
    const score = Number(average || 0);
    const tone =
        score >= 4.2 ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : score >= 3.4 ? 'border-amber-200 bg-amber-50 text-amber-700'
                : score > 0 ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500';

    const dimensions = size === 'sm'
        ? 'h-6 px-2 text-[10px]'
        : 'h-7 px-2.5 text-xs';

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-md border font-black uppercase tracking-wide',
                dimensions,
                tone,
                className
            )}
            aria-label={`${score.toFixed(1)} stars across ${count} ratings`}
            title={`${score.toFixed(1)} from ${count} rating${count === 1 ? '' : 's'}`}
        >
            <Star className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', 'fill-current')} />
            <span>{count > 0 ? score.toFixed(1) : 'New'}</span>
            {showCount && count > 0 && (
                <span className="font-semibold opacity-70">({count})</span>
            )}
        </span>
    );
}
