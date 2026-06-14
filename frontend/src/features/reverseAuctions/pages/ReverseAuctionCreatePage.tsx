import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, FileText, Gavel, IndianRupee, RotateCw, Save, ShieldCheck, type LucideIcon } from 'lucide-react';
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
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push('/reverse-auctions')}
            className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[#12335f]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to auctions
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Reverse Auction</p>
          <h1 className="text-2xl font-black text-slate-950">Create Auction</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
            Configure pricing, schedule, visibility, and L1 auction rules before inviting sellers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => router.push('/reverse-auctions')}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {mutation.isPending ? 'Creating...' : 'Create reverse auction'}
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Section icon={FileText} title="Auction Details" description="Link the auction to the originating procurement record.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title" className="md:col-span-2">
                <Input name="title" required placeholder="Example: Supply of safety equipment lot" />
              </Field>
              <Field label="Link type">
                <Select value={linkType} onChange={event => setLinkType(event.target.value as LinkType)}>
                  <option value="linkedBidId">Procurement bid</option>
                  <option value="linkedTenderId">Tender</option>
                  <option value="linkedRequirementId">Buyer requirement</option>
                </Select>
              </Field>
              <Field label="Linked record ID">
                <Input name="linkedId" type="number" min="1" required placeholder="Enter record ID" />
              </Field>
              <Field label="Visibility">
                <Select name="visibilityMode" defaultValue="INVITED_SELLERS_ONLY">
                  <option value="INVITED_SELLERS_ONLY">Invited sellers only</option>
                  <option value="TECHNICALLY_QUALIFIED_ONLY">Technically qualified only</option>
                </Select>
              </Field>
              <Field label="Description" className="md:col-span-2">
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Add auction scope, item notes, or buyer instructions."
                  className={controlClass}
                />
              </Field>
            </div>
          </Section>

          <Section icon={IndianRupee} title="Commercial Rules" description="Set the starting price and minimum bid reduction.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Starting price">
                <Input name="startingPrice" type="number" min="1" step="0.01" required placeholder="0.00" />
              </Field>
              <Field label="Reserve price">
                <Input name="reservePrice" type="number" min="1" step="0.01" placeholder="Optional" />
              </Field>
              <Field label="Minimum decrement">
                <Input name="minDecrementAmount" type="number" min="1" step="0.01" defaultValue="1" required />
              </Field>
              <Field label="Minimum decrement %">
                <Input name="minDecrementPercent" type="number" min="0" max="100" step="0.01" placeholder="Optional" />
              </Field>
            </div>
          </Section>

          <Section icon={CalendarClock} title="Schedule" description="Define the live bidding window.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Start time">
                <Input name="startAt" type="datetime-local" required />
              </Field>
              <Field label="End time">
                <Input name="endAt" type="datetime-local" required />
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section icon={RotateCw} title="Auto Extension" description="Keep bidding fair when a bid arrives near closing.">
            <div className="space-y-4">
              <Toggle name="autoExtensionEnabled" label="Enable auto extension" description="Extend the end time when a valid bid is submitted near closure." />
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <Field label="Window minutes">
                  <Input name="autoExtensionWindowMinutes" type="number" min="1" defaultValue="5" />
                </Field>
                <Field label="Extend by minutes">
                  <Input name="autoExtensionByMinutes" type="number" min="1" defaultValue="5" />
                </Field>
                <Field label="Max extensions">
                  <Input name="maxAutoExtensions" type="number" min="0" defaultValue="0" />
                </Field>
              </div>
            </div>
          </Section>

          <Section icon={ShieldCheck} title="Privacy Controls" description="Choose what sellers can see after evaluation.">
            <Toggle
              name="allowCompetitorNames"
              label="Show competitor names after approval"
              description="Keep disabled when sellers should only see rank and price movement."
            />
          </Section>

          <Card className="border-[#12335f]/20 bg-[#12335f] text-white shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Gavel className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-white/70">Checklist</p>
                  <ul className="mt-3 space-y-2 text-xs font-semibold text-white/85">
                    <li>Linked record ID should belong to your buyer organization.</li>
                    <li>End time must be later than start time.</li>
                    <li>Invite sellers after the auction is created.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

const controlClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10 disabled:cursor-not-allowed disabled:bg-slate-50';

function Section({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#12335f] text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className || ''}`} />;
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className || ''}`} />;
}

function Toggle({ name, label, description }: { name: string; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-slate-100">
      <input name={name} type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]" />
      <span>
        <span className="block text-xs font-black text-slate-900">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}
