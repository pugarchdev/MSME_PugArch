import * as React from "react";
import { cn } from "../../lib/utils";

interface BaseProps extends React.HTMLProps<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  key?: React.Key;
}

const Card = ({ className, children, ...props }: BaseProps) => (
  <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden", className)} {...props}>
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: BaseProps) => (
  <div className={cn("px-4 py-3 border-b border-slate-100", className)} {...props}>{children}</div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLProps<HTMLHeadingElement>) => (
  <h3 className={cn("text-lg font-semibold text-slate-900", className)} {...props}>{children}</h3>
);

const CardContent = ({ className, children, ...props }: BaseProps) => (
  <div className={cn("px-4 py-3", className)} {...props}>{children}</div>
);

const Table = ({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-auto">
    <table className={cn("w-full caption-bottom text-sm border-collapse", className)} {...props}>{children}</table>
  </div>
);

const TableHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn("bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-wider sticky top-0 z-10", className)} {...props}>{children}</thead>
);

const TableBody = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props}>{children}</tbody>
);

const TableRow = ({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-slate-100 transition-colors hover:bg-slate-50/50 data-[state=selected]:bg-slate-50", props.onClick && "cursor-pointer", className)} {...props}>{children}</tr>
);

const TableHead = ({ className, children, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-10 px-4 text-left align-middle font-medium text-slate-500 [&:has([role=checkbox])]:pr-0", className)} {...props}>{children}</th>
);

const TableCell = ({ className, children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0 text-slate-700 font-medium", className)} {...props}>{children}</td>
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
