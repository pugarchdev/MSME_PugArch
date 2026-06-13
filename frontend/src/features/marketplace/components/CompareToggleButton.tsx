import { GitCompareArrows } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useCompare, type CompareItemRef } from '../hooks/useCompare';

export function CompareToggleButton({ item }: { item: CompareItemRef }) {
  const compare = useCompare();
  const selected = compare.has(item.type, item.id);
  return (
    <Button
      type="button"
      variant={selected ? 'primary' : 'outline'}
      size="sm"
      onClick={() => compare.toggle(item)}
      disabled={!selected && compare.items.length >= compare.limit}
      title="Add to compare"
    >
      <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
      {selected ? 'Comparing' : 'Compare'}
    </Button>
  );
}
