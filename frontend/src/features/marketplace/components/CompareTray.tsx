import Link from 'next/link';
import { GitCompareArrows, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useCompare } from '../hooks/useCompare';

export function CompareTray() {
  const compare = useCompare();
  if (compare.items.length === 0) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-3 shadow-2xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-[#12335f]" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">{compare.items.length}/4 selected</span>
          {compare.items.map(item => (
            <button key={`${item.type}:${item.id}`} onClick={() => compare.remove(item.type, item.id)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs font-bold text-slate-700">
              {item.type} #{item.id}<X className="h-3 w-3" />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={compare.clear}>Clear</Button>
          <Link href="/marketplace/compare"><Button size="sm">Compare Now</Button></Link>
        </div>
      </div>
    </div>
  );
}
