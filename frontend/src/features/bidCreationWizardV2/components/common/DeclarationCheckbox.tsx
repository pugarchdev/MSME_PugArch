import React from 'react';
import { cn } from '../../../../lib/utils';

export default function DeclarationCheckbox({
  checked,
  onChange,
  error,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string[];
  children: React.ReactNode;
}) {
  const hasError = Boolean(error?.length);

  return (
    <div data-field-error={hasError ? 'true' : undefined} className="space-y-1.5">
      <label
        className={cn(
          'flex items-start gap-3 rounded-lg border p-3 text-sm font-bold leading-6 transition',
          hasError
            ? 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-500/20'
            : 'border-slate-200 bg-slate-50 text-slate-700'
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-[#12335f]"
          aria-invalid={hasError}
        />
        <span>{children}</span>
      </label>
      {hasError && <p className="text-xs font-bold text-red-600">{error![0]}</p>}
    </div>
  );
}
