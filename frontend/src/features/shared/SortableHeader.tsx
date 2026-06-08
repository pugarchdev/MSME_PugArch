import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';

export type SortDirection = 'asc' | 'desc';

function SortableHeaderBase<T extends string>({
  label,
  field,
  activeField,
  direction,
  onSort,
  className,
}: {
  label: string;
  field: T;
  activeField: T;
  direction: SortDirection;
  onSort: (field: T) => void;
  className?: string;
}) {
  const active = activeField === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        'inline-flex items-center gap-1.5 text-left text-[10px] font-black uppercase tracking-wider transition',
        active ? 'text-[#12335f]' : 'text-slate-500 hover:text-[#12335f]',
        className
      )}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active ? (
        direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-45" />
      )}
    </button>
  );
}

export const SortableHeader = React.memo(SortableHeaderBase) as typeof SortableHeaderBase;
