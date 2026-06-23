import { cn } from '../../../lib/utils';

export const fieldInputClass = (hasError?: boolean) =>
  cn(
    'h-11 w-full rounded-lg border bg-white px-3 text-sm font-semibold outline-none transition',
    hasError
      ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-600 focus:ring-red-500/25'
      : 'border-slate-200 focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15'
  );

export const fieldTextareaClass = (hasError?: boolean) =>
  cn(
    'w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold outline-none transition',
    hasError
      ? 'border-red-500 ring-2 ring-red-500/20 focus:border-red-600 focus:ring-red-500/25'
      : 'border-slate-200 focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15'
  );

export const fieldContainerClass = (hasError?: boolean) =>
  cn(
    hasError && 'rounded-lg ring-2 ring-red-500/20'
  );

export function scrollToFirstFieldError(container?: HTMLElement | null) {
  requestAnimationFrame(() => {
    const root = container || document;
    const el = root.querySelector?.('[data-field-error="true"]') as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = el.querySelector('input, textarea, button') as HTMLElement | null;
      focusable?.focus?.();
    }
  });
}
