import { cn } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-md bg-slate-100 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
                className
            )}
        />
    );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            {Array.from({ length: rows - 2 }).map((_, idx) => (
                <Skeleton key={idx} className="h-3 w-full" />
            ))}
        </div>
    );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50/60 p-3">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {Array.from({ length: cols }).map((_, idx) => (
                        <Skeleton key={idx} className="h-3 w-full" />
                    ))}
                </div>
            </div>
            <div className="divide-y divide-slate-100">
                {Array.from({ length: rows }).map((_, idx) => (
                    <div key={idx} className="p-3">
                        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                            {Array.from({ length: cols }).map((__, cellIdx) => (
                                <Skeleton key={cellIdx} className="h-3 w-full" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, idx) => (
                <CardSkeleton key={idx} />
            ))}
        </div>
    );
}

export function MetricCardSkeleton() {
    return (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
            <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
    );
}
