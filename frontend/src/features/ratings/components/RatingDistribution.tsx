import { Star } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { RatingSummary } from '../types';

/**
 * Horizontal bar chart of how many 5-star, 4-star, ..., 1-star ratings the
 * subject has received. Rendered on the seller profile and the ratings page.
 */
export function RatingDistribution({ summary, className }: { summary: RatingSummary | undefined; className?: string }) {
    if (!summary || summary.count === 0) {
        return (
            <div className={cn('rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center', className)}>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">No ratings yet</p>
            </div>
        );
    }

    const max = Math.max(...summary.distribution.map(b => b.count), 1);

    return (
        <div className={cn('space-y-2', className)}>
            {[5, 4, 3, 2, 1].map(star => {
                const bucket = summary.distribution.find(b => b.star === star);
                const count = bucket?.count ?? 0;
                const pct = (count / max) * 100;
                return (
                    <div key={star} className="flex items-center gap-3">
                        <div className="flex w-12 shrink-0 items-center gap-1 text-[10px] font-black uppercase text-slate-500">
                            {star}
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        </div>
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <div className="w-10 shrink-0 text-right text-[11px] font-bold text-slate-600">{count}</div>
                    </div>
                );
            })}
        </div>
    );
}
