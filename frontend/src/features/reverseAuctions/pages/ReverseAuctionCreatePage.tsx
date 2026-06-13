import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { reverseAuctionApi } from '../api';

type LinkType = 'linkedTenderId' | 'linkedBidId' | 'linkedRequirementId';

export default function ReverseAuctionCreatePage() {
  const router = useRouter();
  const [linkType, setLinkType] = useState<LinkType>('linkedBidId');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: reverseAuctionApi.create,
    onSuccess: auction => router.push(`/reverse-auctions/${auction.id}`),
    onError: err => setError((err as Error).message)
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {
      title: form.get('title'),
      description: form.get('description'),
      [linkType]: Number(form.get('linkedId')),
      startAt: form.get('startAt'),
      endAt: form.get('endAt'),
      startingPrice: Number(form.get('startingPrice')),
      reservePrice: form.get('reservePrice') ? Number(form.get('reservePrice')) : undefined,
      minDecrementAmount: Number(form.get('minDecrementAmount') || 1),
      minDecrementPercent: form.get('minDecrementPercent') ? Number(form.get('minDecrementPercent')) : undefined,
      autoExtensionEnabled: form.get('autoExtensionEnabled') === 'on',
      autoExtensionWindowMinutes: Number(form.get('autoExtensionWindowMinutes') || 5),
      autoExtensionByMinutes: Number(form.get('autoExtensionByMinutes') || 5),
      maxAutoExtensions: Number(form.get('maxAutoExtensions') || 0),
      visibilityMode: form.get('visibilityMode'),
      allowCompetitorNames: form.get('allowCompetitorNames') === 'on'
    };
    mutation.mutate(data);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Reverse Auction</p>
        <h1 className="text-2xl font-black text-slate-950">Create Auction</h1>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}
      <Card>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-2">
          <Field label="Title"><input name="title" required className="input" /></Field>
          <Field label="Link type">
            <select value={linkType} onChange={event => setLinkType(event.target.value as LinkType)} className="input">
              <option value="linkedBidId">Procurement bid</option>
              <option value="linkedTenderId">Tender</option>
              <option value="linkedRequirementId">Buyer requirement</option>
            </select>
          </Field>
          <Field label="Linked record ID"><input name="linkedId" type="number" min="1" required className="input" /></Field>
          <Field label="Starting price"><input name="startingPrice" type="number" min="1" step="0.01" required className="input" /></Field>
          <Field label="Reserve price"><input name="reservePrice" type="number" min="1" step="0.01" className="input" /></Field>
          <Field label="Minimum decrement"><input name="minDecrementAmount" type="number" min="1" step="0.01" defaultValue="1" required className="input" /></Field>
          <Field label="Minimum decrement %"><input name="minDecrementPercent" type="number" min="0" max="100" step="0.01" className="input" /></Field>
          <Field label="Start time"><input name="startAt" type="datetime-local" required className="input" /></Field>
          <Field label="End time"><input name="endAt" type="datetime-local" required className="input" /></Field>
          <Field label="Visibility">
            <select name="visibilityMode" defaultValue="INVITED_SELLERS_ONLY" className="input">
              <option value="INVITED_SELLERS_ONLY">Invited sellers only</option>
              <option value="TECHNICALLY_QUALIFIED_ONLY">Technically qualified only</option>
            </select>
          </Field>
          <Field label="Auto extension window"><input name="autoExtensionWindowMinutes" type="number" min="1" defaultValue="5" className="input" /></Field>
          <Field label="Auto extension by"><input name="autoExtensionByMinutes" type="number" min="1" defaultValue="5" className="input" /></Field>
          <Field label="Max extensions"><input name="maxAutoExtensions" type="number" min="0" defaultValue="0" className="input" /></Field>
          <Field label="Description"><textarea name="description" rows={4} className="input" /></Field>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input name="autoExtensionEnabled" type="checkbox" /> Enable auto extension</label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input name="allowCompetitorNames" type="checkbox" /> Show competitor names after approval</label>
        </CardContent>
      </Card>
      <Button disabled={mutation.isPending}><Save className="mr-2 h-4 w-4" />Create reverse auction</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-xs font-black uppercase tracking-wider text-slate-500">
      <span>{label}</span>
      {children}
    </label>
  );
}
