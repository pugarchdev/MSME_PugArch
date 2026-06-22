import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import OtherTextInput from './OtherTextInput';

export type SelectOption = string | { value: string; label: string };

const getValue = (option: SelectOption) => typeof option === 'string' ? option : option.value;
const getLabel = (option: SelectOption) => typeof option === 'string' ? option : option.label;

export default function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Select',
  allowOther = true,
  allowNA = false,
  className,
  disabled = false,
}: {
  value: any;
  options: readonly SelectOption[];
  onChange: (value: any) => void;
  placeholder?: string;
  allowOther?: boolean;
  allowNA?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { normalizedValue, otherValue } = useMemo(() => {
    let nv = '';
    let ov = '';
    if (value && typeof value === 'object') {
      nv = value.dropdownValue || '';
      ov = value.otherValue || '';
    } else if (typeof value === 'string' && value !== '') {
      const exists = options.some(opt => getValue(opt) === value) || (allowNA && value === 'N/A') || (allowOther && value === 'Other');
      if (exists) {
        nv = value;
      } else if (allowOther) {
        nv = 'Other';
        ov = value;
      } else {
        nv = value;
      }
    }
    return { normalizedValue: nv, otherValue: ov };
  }, [value, options, allowNA, allowOther]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options.filter(option => 
      getLabel(option).toLowerCase().includes(q) || 
      getValue(option).toLowerCase().includes(q)
    );
  }, [options, search]);

  const allOptions = useMemo(() => {
    const list = [
      ...(allowNA ? [{ value: 'N/A', label: 'N/A' }] : []),
      ...filtered,
      ...(allowOther ? [{ value: 'Other', label: 'Other' }] : []),
    ];
    const seen = new Set<string>();
    const unique: SelectOption[] = [];
    for (const opt of list) {
      const val = getValue(opt);
      if (!seen.has(val)) {
        seen.add(val);
        unique.push(opt);
      }
    }
    return unique;
  }, [filtered, allowNA, allowOther]);

  // Find the selected option label to display on the button
  const selectedOption = options.find(opt => getValue(opt) === normalizedValue);
  const displayLabel = normalizedValue === 'Other'
    ? `Other: ${otherValue || '(Please specify)'}`
    : normalizedValue === 'N/A'
    ? 'N/A'
    : selectedOption
    ? getLabel(selectedOption)
    : placeholder;

  const handleSelect = (optValue: string) => {
    if (optValue === 'Other') {
      onChange({ dropdownValue: 'Other', otherValue: '' });
    } else {
      onChange(optValue);
    }
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={cn('relative w-full space-y-1.5', className)}>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
            isOpen && "border-[#12335f] ring-2 ring-[#12335f]/15"
          )}
        >
          <span className={cn("truncate", !selectedOption && normalizedValue !== 'Other' && normalizedValue !== 'N/A' && "text-slate-400")}>
            {displayLabel}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg animate-in fade-in duration-100">
          <div className="relative border-b border-slate-100 p-1.5 flex items-center gap-1.5">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              className="h-8 w-full rounded-md border border-slate-100 pl-8 pr-3 text-xs outline-none focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/15"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="py-1">
            {allOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs font-semibold text-slate-500">
                No results found
              </div>
            ) : (
              allOptions.map(opt => {
                const optValue = getValue(opt);
                const optLabel = getLabel(opt);
                const isSelected = normalizedValue === optValue;
                return (
                  <button
                    key={optValue}
                    type="button"
                    onClick={() => handleSelect(optValue)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-50",
                      isSelected ? "bg-[#12335f]/5 text-[#12335f]" : "text-slate-700"
                    )}
                  >
                    <span>{optLabel}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {normalizedValue === 'Other' && (
        <OtherTextInput
          value={otherValue}
          onChange={newOtherValue => onChange({ dropdownValue: 'Other', otherValue: newOtherValue })}
        />
      )}
    </div>
  );
}
