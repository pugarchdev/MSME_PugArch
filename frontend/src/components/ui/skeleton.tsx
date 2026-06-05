import { cn } from '../../lib/utils';
import type React from 'react';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-md bg-slate-100 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
                className
            )}
            {...props}
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

export function KpiSkeleton() {
    return <MetricCardSkeleton />;
}

export function ChartSkeleton() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24 rounded-md" />
            </div>
            <div className="flex h-56 items-end gap-3">
                {[45, 70, 52, 88, 64, 78, 58].map((height, index) => (
                    <Skeleton key={index} className="flex-1 rounded-t-lg" style={{ height: `${height}%` }} />
                ))}
            </div>
        </div>
    );
}

export function FormSectionSkeleton({ fields = 6 }: { fields?: number }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="mb-4 h-4 w-40" />
            <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: fields }).map((_, index) => (
                    <div key={index} className="space-y-2">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function PageSectionSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => <KpiSkeleton key={index} />)}
            </div>
            <CardSkeleton rows={4} />
            <TableSkeleton rows={5} cols={6} />
        </div>
    );
}
