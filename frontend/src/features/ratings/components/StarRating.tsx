import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface StarRatingProps {
    value: number;
    onChange?: (value: number) => void;
    size?: 'sm' | 'md' | 'lg';
    readOnly?: boolean;
    className?: string;
    /** When true, half-stars are not allowed even on display. We always round on display. */
}

const sizeClass = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-6 w-6'
} as const;

export function StarRating({ value, onChange, size = 'md', readOnly, className }: StarRatingProps) {
    const [hover, setHover] = useState<number | null>(null);
    const display = hover ?? Math.round(value);

    return (
        <div
            className={cn('inline-flex items-center gap-0.5', className)}
            onMouseLeave={() => setHover(null)}
            role={readOnly ? undefined : 'radiogroup'}
            aria-label="Star rating"
        >
            {[1, 2, 3, 4, 5].map(star => (
                <button
                    key={star}
                    type="button"
                    disabled={readOnly}
                    onMouseEnter={() => !readOnly && setHover(star)}
                    onClick={() => !readOnly && onChange?.(star)}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    aria-pressed={display === star}
                    className={cn(
                        'transition-transform',
                        !readOnly && 'cursor-pointer hover:scale-110',
                        readOnly && 'cursor-default'
                    )}
                >
                    <Star
                        className={cn(
                            sizeClass[size],
                            star <= display ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                        )}
                    />
                </button>
            ))}
        </div>
    );
}
