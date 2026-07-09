import * as React from "react";
import { cn } from "../../lib/utils";

interface BaseProps extends React.HTMLProps<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  key?: React.Key;
}

const Card = ({ className, children, ...props }: BaseProps) => (
  <div
    className={cn(
      "overflow-hidden rounded-[22px] border-0 bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: BaseProps) => (
  <div className={cn("border-b border-slate-100/80 px-4 py-3", className)} {...props}>{children}</div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLProps<HTMLHeadingElement>) => (
  <h3 className={cn("text-lg font-semibold text-slate-900", className)} {...props}>{children}</h3>
);

const CardContent = ({ className, children, ...props }: BaseProps) => (
  <div className={cn("px-4 py-3", className)} {...props}>{children}</div>
);

const Table = ({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-auto rounded-[18px] bg-slate-50/70 p-2">
    <table className={cn("w-full caption-bottom border-separate border-spacing-y-2 text-sm", className)} {...props}>{children}</table>
  </div>
);

const TableHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider text-slate-500", className)} {...props}>{children}</thead>
);

const TableBody = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props}>{children}</tbody>
);

const TableRow = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("bg-white shadow-3xs transition-colors hover:bg-slate-50/80 hover:shadow-sm data-[state=selected]:bg-slate-50", props.onClick && "cursor-pointer", className)} {...props}>{children}</tr>
);

const TableHead = ({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-9 px-4 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0", className)} {...props}>{children}</th>
);

const TableCell = ({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("p-4 align-middle font-medium text-slate-700 first:rounded-l-2xl last:rounded-r-2xl [&:has([role=checkbox])]:pr-0", className)} {...props}>{children}</td>
);

interface BadgeProps extends React.HTMLProps<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error';
  children?: React.ReactNode;
  className?: string;
}

const Badge = ({ variant = 'default', children, className, ...props }: BadgeProps) => {
  const variants = {
    default: 'bg-slate-100 text-slate-500 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    error: 'bg-red-50 text-red-700 border-red-200',
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter transition-colors", variants[variant], className)} {...props as any}>{children}</span>;
}

export { Card, CardHeader, CardTitle, CardContent, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Badge };
