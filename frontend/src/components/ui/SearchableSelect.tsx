import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | number | null | undefined;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  allowOther?: boolean;
  allowNotApplicable?: boolean;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  allowOther = false,
  allowNotApplicable = false,
  className,
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customText, setCustomText] = useState('');
  const [isCustomSelected, setIsCustomSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compile full options list
  const fullOptions = [...options];
  if (allowNotApplicable) {
    fullOptions.push({ value: 'NOT_APPLICABLE', label: 'Not Applicable' });
  }
  if (allowOther) {
    fullOptions.push({ value: 'OTHER', label: 'Other' });
  }

  // Determine if the current value is a custom "Other" value
  useEffect(() => {
    if (value === undefined || value === null || value === '') {
      setIsCustomSelected(false);
      setCustomText('');
      return;
    }

    const matchesOption = fullOptions.some(opt => opt.value === value && opt.value !== 'OTHER');
    if (matchesOption) {
      setIsCustomSelected(false);
      if (value === 'NOT_APPLICABLE') {
        // Handled directly
      }
    } else if (allowOther) {
      setIsCustomSelected(true);
      setCustomText(String(value));
    }
  }, [value, options, allowOther, allowNotApplicable]);

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

  // Filter options based on search query
  const filteredOptions = fullOptions.filter(opt =>
    opt.label.toLowerCase().includes(search.toLowerCase()) ||
    String(opt.value).toLowerCase().includes(search.toLowerCase())
  );

  // Find the selected option label to display in the closed state
  const selectedOption = fullOptions.find(opt => opt.value === value);
  const displayLabel = isCustomSelected
    ? `Other: ${customText || '(Please specify)'}`
    : selectedOption
    ? selectedOption.label
    : placeholder;

  const handleSelect = (optValue: string | number) => {
    if (optValue === 'OTHER') {
      setIsCustomSelected(true);
      onChange(customText || '');
    } else {
      setIsCustomSelected(false);
      onChange(optValue);
    }
    setIsOpen(false);
    setSearch('');
  };

  const handleCustomTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomText(val);
    onChange(val);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full space-y-1.5", className)}>
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
          <span className={cn("truncate", !selectedOption && !isCustomSelected && "text-slate-400")}>
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
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-center text-xs font-semibold text-slate-500">
                No results found
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = isCustomSelected
                  ? opt.value === 'OTHER'
                  : opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-50",
                      isSelected ? "bg-[#12335f]/5 text-[#12335f]" : "text-slate-700"
                    )}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {isCustomSelected && (
        <div className="rounded-lg border border-slate-150 bg-slate-50/50 p-2.5 space-y-1.5 animate-in slide-in-from-top-1 duration-150">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
            Please specify *
          </span>
          <input
            type="text"
            required
            disabled={disabled}
            className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
            placeholder="Type custom option here..."
            value={customText}
            onChange={handleCustomTextChange}
          />
        </div>
      )}
    </div>
  );
}
