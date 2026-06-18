import { ArrowRight, CheckCircle2, FileSearch, Gavel, Megaphone, ShoppingCart } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { METHOD_ROUTE_MAP, type ProcurementIntent, type ProcurementMethod } from '../types';

const intents: Array<ProcurementIntent & { icon: any; result: string; when: string }> = [
  {
    method: 'BUY_DIRECTLY',
    title: 'Buy directly from marketplace',
    helper: 'Best when the item or service is already listed and you know what to buy.',
    icon: ShoppingCart,
    result: 'Opens marketplace cart and approval flow',
    when: 'Known item, known seller, fastest PO path',
  },
  {
    method: 'REQUEST_QUOTATIONS',
    title: 'Request quotations from suppliers',
    helper: 'Best when you want price comparison from multiple sellers.',
    icon: FileSearch,
    result: 'Opens RFQ creation',
    when: 'Need comparable supplier prices and delivery terms',
  },
  {
    method: 'LARGE_PROCUREMENT',
    title: 'Create a large procurement',
    helper: 'Best for high-value or formal tender-based procurement.',
    icon: CheckCircle2,
    result: 'Opens buyer bid / tender publishing',
    when: 'High value, technical evaluation, formal award',
  },
  {
    method: 'NEGOTIATE_PRICE',
    title: 'Negotiate through auction',
    helper: 'Best when qualified sellers compete on price.',
    icon: Gavel,
    result: 'Opens reverse auction setup',
    when: 'Fixed specification and price competition',
  },
  {
    method: 'POST_REQUIREMENT',
    title: 'Post an open requirement',
    helper: 'Best when you do not know the exact seller or product.',
    icon: Megaphone,
    result: 'Opens buyer requirement posting',
    when: 'Need supplier discovery before selection',
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
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {intents.map((intent) => {
          const Icon = intent.icon;
          const active = value === intent.method;
          return (
            <button
              key={intent.method}
              type="button"
              onClick={() => onChange(intent.method)}
              className={cn(
                'group flex min-h-44 flex-col rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#12335f]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#12335f]/30',
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
              <span className="mt-4 grid gap-2 text-[11px] font-semibold text-slate-600">
                <span className="rounded-md bg-slate-50 px-3 py-2">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Use when</span>
                  {intent.when}
                </span>
                <span className="rounded-md bg-slate-50 px-3 py-2">
                  <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Next executable page</span>
                  {METHOD_ROUTE_MAP[intent.method]}
                </span>
              </span>
              <span className={cn('mt-auto flex items-center justify-between pt-4 text-[10px] font-black uppercase tracking-widest', active ? 'text-[#12335f]' : 'text-slate-400')}>
                {active ? 'Selected path' : intent.result}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
