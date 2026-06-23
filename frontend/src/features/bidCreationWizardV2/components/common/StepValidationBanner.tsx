import React from 'react';
import { AlertCircle } from 'lucide-react';

export default function StepValidationBanner({ errors }: { errors: Record<string, string[]> }) {
  const entries = Object.entries(errors).filter(([, messages]) => messages?.length);
  if (!entries.length) return null;

  return (
    <div className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4" role="alert" aria-live="polite">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-red-800">
            {entries.length === 1 ? '1 field needs your attention' : `${entries.length} fields need your attention`}
          </p>
          <p className="mt-1 text-xs font-semibold text-red-700">
            Fix the highlighted fields below before continuing.
          </p>
          <ul className="mt-3 space-y-1.5">
            {entries.map(([key, messages]) => (
              <li key={key} className="text-xs font-bold text-red-700">
                • {messages[0]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
