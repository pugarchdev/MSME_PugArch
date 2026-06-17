import { CheckCircle2, FileSearch, Gavel, Megaphone, ShoppingCart } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { ProcurementIntent, ProcurementMethod } from '../types';

const intents: Array<ProcurementIntent & { icon: any }> = [
  {
    method: 'BUY_DIRECTLY',
    title: 'Buy directly from marketplace',
    helper: 'Best when the item or service is already listed and you know what to buy.',
    icon: ShoppingCart,
  },
  {
    method: 'REQUEST_QUOTATIONS',
    title: 'Request quotations from suppliers',
    helper: 'Best when you want price comparison from multiple sellers.',
    icon: FileSearch,
  },
  {
    method: 'LARGE_PROCUREMENT',
    title: 'Create a large procurement',
    helper: 'Best for high-value or formal tender-based procurement.',
    icon: CheckCircle2,
  },
  {
    method: 'NEGOTIATE_PRICE',
    title: 'Negotiate through auction',
    helper: 'Best when qualified sellers compete on price.',
    icon: Gavel,
  },
  {
    method: 'POST_REQUIREMENT',
    title: 'Post an open requirement',
    helper: 'Best when you do not know the exact seller or product.',
    icon: Megaphone,
  },
];

export default function ProcurementIntentStep({
  value,
  onChange,
}: {
  value?: ProcurementMethod;
  onChange: (method: ProcurementMethod) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {intents.map((intent) => {
        const Icon = intent.icon;
        const active = value === intent.method;
        return (
          <button
            key={intent.method}
            type="button"
            onClick={() => onChange(intent.method)}
            className={cn(
              'group min-h-28 rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#12335f]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#12335f]/30',
              active ? 'border-[#12335f] ring-2 ring-[#12335f]/10' : 'border-slate-200'
            )}
          >
            <div className="flex items-start gap-3">
              <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', active ? 'bg-[#12335f] text-white' : 'bg-slate-100 text-[#12335f]')}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-950">{intent.title}</span>
                <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{intent.helper}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
