import { GitCompareArrows } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useCompare, type CompareItemRef } from '../hooks/useCompare';
import { cn } from '../../../lib/utils';

export function CompareToggleButton({ item, className, iconOnly = false }: { item: CompareItemRef; className?: string; iconOnly?: boolean }) {
  const compare = useCompare();
  const selected = compare.has(item.type, item.id);
  return (
    <Button
      type="button"
      variant={selected ? 'primary' : 'outline'}
      size="sm"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        compare.toggle(item);
      }}
      disabled={!selected && compare.items.length >= compare.limit}
      title={selected ? 'Remove from compare' : compare.items.length >= compare.limit ? 'Compare list is full' : 'Add to compare'}
      aria-label={selected ? 'Remove from compare' : 'Add to compare'}
      aria-pressed={selected}
      className={cn(iconOnly && 'h-8 w-8 p-0', className)}
    >
      <GitCompareArrows className={cn('h-3.5 w-3.5', !iconOnly && 'mr-1')} />
      <span className={iconOnly ? 'sr-only' : undefined}>{selected ? 'Comparing' : 'Compare'}</span>
    </Button>
  );
}
