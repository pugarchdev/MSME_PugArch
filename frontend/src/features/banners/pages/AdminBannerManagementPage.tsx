import { ChangeEvent, FormEvent, InputHTMLAttributes, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Images,
  Link as LinkIcon,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatDate } from '../../shared/format';
import { api, BASE_URL, readJsonResponse, unwrapApiData } from '../../../lib/api';
import { compressImage } from '../../../lib/compress';
import { cn } from '../../../lib/utils';
import { bannerApi } from '../api';
import { DEFAULT_MARKETPLACE_BANNERS } from '../defaultBanners';

type BannerAction = 'approve' | 'reject' | 'show' | 'hide' | 'delete';

type BannerRecord = {
  id: number;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  targetUrl?: string | null;
  ctaLink?: string | null;
  bannerType?: string;
  status?: string;
  startAt?: string;
  endAt?: string;
  durationDays?: number;
  priority?: number;
  displayOrder?: number;
  displayLocation?: string;
  documentId?: number | null;
  uploadedByOrgId?: number | null;
  rejectionReason?: string | null;
};

type UploadState = {
  fileId: number | null;
  url: string;
  name: string;
};

const statusOptions = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Hidden', value: 'HIDDEN' },
  { label: 'Rejected', value: 'REJECTED' }
];

const initialForm = {
  title: '',
  subtitle: '',
  imageUrl: '',
  targetUrl: '',
  bannerType: 'DEFAULT_ADMIN',
  displayLocation: 'HOME_HERO',
  priority: '10',
  durationDays: '10'
};

const imageSrc = (url?: string | null) => {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return url;
};

const statusTone = (status?: string) => {
  if (status === 'ACTIVE' || status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PENDING_APPROVAL' || status === 'DEFAULT') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'HIDDEN') return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-blue-200 bg-blue-50 text-[#12335f]';
};

export default function AdminBannerManagementPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(initialForm);
  const [upload, setUpload] = useState<UploadState>({ fileId: null, url: '', name: '' });
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ['admin-banners', status],
    queryFn: () => bannerApi.adminList(status),
    staleTime: 20_000
  });

  const banners: BannerRecord[] = query.data?.banners || [];
  const visibleBanners = useMemo(() => banners.filter(banner => banner.status !== 'DELETED'), [banners]);
  const managedCount = visibleBanners.length;
  const activeCount = visibleBanners.filter(banner => ['ACTIVE', 'APPROVED'].includes(String(banner.status))).length;
  const pendingCount = visibleBanners.filter(banner => banner.status === 'PENDING_APPROVAL').length;
  const hiddenCount = visibleBanners.filter(banner => banner.status === 'HIDDEN').length;
  const previewImage = imageSrc(upload.url || form.imageUrl);

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-banners'] });

  const action = useMutation({
    mutationFn: ({ id, next }: { id: number; next: BannerAction }) =>
      bannerApi.updateStatus(id, next, next === 'reject' ? { reason: 'Rejected by admin review' } : {}),
    onSuccess: (_data, variables) => {
      setMessage(`Banner ${actionLabel(variables.next)}.`);
      refresh();
    },
    onError: err => setMessage((err as Error).message)
  });

  const create = useMutation({
    mutationFn: bannerApi.create,
    onSuccess: () => {
      setMessage('Banner created and added to management');
      setForm(initialForm);
      setUpload({ fileId: null, url: '', name: '' });
      refresh();
    },
    onError: err => setMessage((err as Error).message)
  });

  const setField = (name: keyof typeof initialForm, value: string) => {
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please upload a JPG, PNG, WEBP, or SVG image.');
      return;
    }

    setUploading(true);
    setMessage('');
    try {
      const optimized = await compressImage(file, 1800, 900, 0.8);
      const body = new FormData();
      body.append('file', optimized);
      const token = localStorage.getItem('token');
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body
      });
      const json = unwrapApiData<any>(await readJsonResponse(res));
      if (!res.ok) throw new Error(json?.message || 'Unable to upload banner image');
      const fileId = Number(json?.fileId || json?.file?.id || 0) || null;
      const url = json?.url || json?.file?.url || json?.file?.documentUrl || (fileId ? `/api/files/${fileId}/view` : '');
      if (!fileId && !url) throw new Error('Upload completed but no file link was returned.');
      setUpload({ fileId, url, name: json?.file?.originalName || optimized.name });
      setField('imageUrl', '');
      setMessage('Image uploaded. Review the preview and add the banner.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to upload banner image');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const imageUrl = form.imageUrl.trim();
    if (!imageUrl && !upload.fileId) {
      setMessage('Add an image URL or upload a banner image first.');
      return;
    }
    create.mutate({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      imageUrl: imageUrl || undefined,
      documentId: upload.fileId || undefined,
      targetUrl: form.targetUrl.trim() || undefined,
      bannerType: form.bannerType,
      displayLocation: form.displayLocation,
      priority: Number(form.priority || 0),
      durationDays: Number(form.durationDays || 10),
      status: 'ACTIVE'
    });
  };

  const createManagedCopy = (banner: (typeof DEFAULT_MARKETPLACE_BANNERS)[number]) => {
    create.mutate({
      title: banner.title,
      subtitle: banner.subtitle,
      imageUrl: banner.imageUrl,
      targetUrl: banner.ctaLink?.startsWith('http') ? banner.ctaLink : undefined,
      bannerType: 'DEFAULT_ADMIN',
      displayLocation: banner.displayLocation,
      priority: 100 - banner.displayOrder,
      durationDays: 30,
      status: 'ACTIVE'
    });
  };

  if (query.isLoading) return <LoadingState label="Loading banners..." />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin Controls</p>
          <h1 className="text-2xl font-black text-slate-950">Banner Management</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
            Create, preview, approve, hide, and remove marketplace hero banners from one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {statusOptions.map(option => (
              <button
                key={option.label}
                type="button"
                onClick={() => setStatus(option.value)}
                className={cn(
                  'h-8 rounded-md px-3 text-[10px] font-black uppercase tracking-wider transition-colors',
                  status === option.value ? 'bg-[#12335f] text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Managed" value={managedCount} />
        <Metric label="Live" value={activeCount} />
        <Metric label="Pending" value={pendingCount} />
        <Metric label="Hidden" value={hiddenCount} />
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f]">{message}</div>}
      {query.error && <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#12335f] text-white">
                <ImagePlus className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-950">Create Banner</h2>
                <p className="text-xs font-semibold text-slate-500">Use an image URL or upload a banner image.</p>
              </div>
            </div>

            <form onSubmit={submit} className="grid gap-3 lg:grid-cols-2">
              <Input label="Title" value={form.title} onChange={value => setField('title', value)} required />
              <Input label="Target URL" value={form.targetUrl} onChange={value => setField('targetUrl', value)} placeholder="https://..." />
              <Input label="Subtitle" value={form.subtitle} onChange={value => setField('subtitle', value)} className="lg:col-span-2" />
              <Input label="Image URL" value={form.imageUrl} onChange={value => { setField('imageUrl', value); setUpload({ fileId: null, url: '', name: '' }); }} placeholder="https://..." />

              <label className="flex min-h-16 cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 transition hover:border-[#12335f]/50 hover:bg-blue-50/40">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Upload Image</p>
                  <p className="truncate text-xs font-bold text-slate-800">{upload.name || (uploading ? 'Uploading image...' : 'Choose JPG, PNG, WEBP, or SVG')}</p>
                </div>
                <UploadCloud className={cn('h-5 w-5 text-[#12335f]', uploading && 'animate-pulse')} />
                <input type="file" accept="image/*" onChange={uploadImage} disabled={uploading || create.isPending} className="hidden" />
              </label>

              <Select label="Type" value={form.bannerType} onChange={value => setField('bannerType', value)} options={[
                ['DEFAULT_ADMIN', 'Admin'],
                ['ANNOUNCEMENT', 'Announcement']
              ]} />
              <Select label="Location" value={form.displayLocation} onChange={value => setField('displayLocation', value)} options={[
                ['HOME_HERO', 'Home hero'],
                ['MARKETPLACE_HOME', 'Marketplace'],
                ['DASHBOARD', 'Dashboard']
              ]} />
              <Input label="Priority" type="number" min="0" value={form.priority} onChange={value => setField('priority', value)} />
              <Input label="Duration days" type="number" min="1" value={form.durationDays} onChange={value => setField('durationDays', value)} />
              <Button disabled={create.isPending || uploading} className="lg:col-span-2">
                <Plus className="mr-2 h-4 w-4" />Add Banner
              </Button>
            </form>
          </CardContent>
        </Card>

        <BannerPreview
          title={form.title || 'Banner title preview'}
          subtitle={form.subtitle || 'Subtitle preview appears here before this banner goes live.'}
          imageUrl={previewImage}
          status={upload.fileId ? 'UPLOADED' : form.imageUrl ? 'URL IMAGE' : 'WAITING IMAGE'}
          targetUrl={form.targetUrl}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Managed Banners</p>
            <h2 className="text-lg font-black text-slate-950">Admin controlled banners</h2>
          </div>
        </div>

        {visibleBanners.length === 0 ? (
          <EmptyState title="No managed banners yet" description="The public marketplace is using the default banner set below until you add one here." icon={Images} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleBanners.map(banner => (
              <ManagedBannerCard
                key={banner.id}
                banner={banner}
                busy={action.isPending || create.isPending}
                onAction={(next) => action.mutate({ id: banner.id, next })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Default Marketplace Banners</p>
          <h2 className="text-lg font-black text-slate-950">Currently shown when no managed banner is live</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {DEFAULT_MARKETPLACE_BANNERS.map(banner => (
            <DefaultBannerCard key={banner.id} banner={banner} busy={create.isPending} onCreate={() => createManagedCopy(banner)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}

const actionLabel = (action: BannerAction) => {
  if (action === 'approve') return 'approved';
  if (action === 'show') return 'shown';
  if (action === 'hide') return 'hidden';
  if (action === 'reject') return 'rejected';
  return 'deleted';
};

function Input({
  label,
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <input
        {...props}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none transition focus:ring-2 focus:ring-[#12335f]/20"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 outline-none transition focus:ring-2 focus:ring-[#12335f]/20"
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function BannerPreview({
  title,
  subtitle,
  imageUrl,
  status,
  targetUrl
}: {
  title: string;
  subtitle: string;
  imageUrl: string;
  status: string;
  targetUrl?: string;
}) {
  return (
    <Card className="min-h-[320px] border-slate-200">
      <CardContent className="flex h-full flex-col p-0">
        <div className="relative min-h-[260px] overflow-hidden bg-[#0b2447]">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
              <ImagePlus className="h-10 w-10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-[#07172e]/95 via-[#0b2447]/70 to-transparent" />
          <div className="relative flex min-h-[260px] flex-col justify-end p-5">
            <span className="mb-3 w-max rounded border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white/80">{status}</span>
            <h3 className="max-w-md whitespace-pre-line text-2xl font-black leading-tight text-white">{title}</h3>
            <p className="mt-2 max-w-md text-xs font-semibold leading-relaxed text-white/70">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 text-xs font-bold text-slate-500">
          <LinkIcon className="h-4 w-4" />
          <span className="truncate">{targetUrl || 'No target URL set'}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ManagedBannerCard({
  banner,
  busy,
  onAction
}: {
  banner: BannerRecord;
  busy: boolean;
  onAction: (action: BannerAction) => void;
}) {
  const src = imageSrc(banner.imageUrl);

  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="grid md:grid-cols-[240px_1fr]">
          <div className="relative min-h-[180px] bg-slate-100">
            {src ? <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full min-h-[180px] items-center justify-center"><ImagePlus className="h-8 w-8 text-slate-400" /></div>}
            <span className={cn('absolute left-3 top-3 rounded border px-2 py-1 text-[9px] font-black uppercase tracking-widest', statusTone(banner.status))}>
              {String(banner.status || 'DRAFT').replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex min-w-0 flex-col justify-between p-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{banner.bannerType || 'DEFAULT'} / {banner.displayLocation || 'HOME_HERO'}</p>
              <h3 className="mt-1 text-lg font-black leading-tight text-slate-950 text-wrap-anywhere">{banner.title}</h3>
              {banner.subtitle && <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{banner.subtitle}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500">
                <p>Priority <span className="text-slate-900">{banner.priority ?? 0}</span></p>
                <p>Order <span className="text-slate-900">{banner.displayOrder ?? 0}</span></p>
                <p className="col-span-2">Dates <span className="text-slate-900">{formatDate(banner.startAt)} - {formatDate(banner.endAt)}</span></p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => onAction('approve')}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('show')}><Eye className="mr-1 h-3.5 w-3.5" />Show</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('hide')}><EyeOff className="mr-1 h-3.5 w-3.5" />Hide</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => onAction('reject')}><X className="mr-1 h-3.5 w-3.5" />Reject</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => onAction('delete')}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DefaultBannerCard({
  banner,
  busy,
  onCreate
}: {
  banner: (typeof DEFAULT_MARKETPLACE_BANNERS)[number];
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="relative min-h-[210px] overflow-hidden bg-[#0b2447]">
          <img src={banner.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#07172e]/95 via-[#0b2447]/70 to-transparent" />
          <div className="relative flex min-h-[210px] flex-col justify-end p-5">
            <span className={cn('mb-3 w-max rounded border px-2 py-1 text-[9px] font-black uppercase tracking-widest', statusTone('DEFAULT'))}>Default</span>
            <h3 className="max-w-md whitespace-pre-line text-xl font-black leading-tight text-white">{banner.title}</h3>
            <p className="mt-2 max-w-md text-xs font-semibold leading-relaxed text-white/70">{banner.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-slate-500">Create a managed copy to edit, hide, or replace this default banner.</p>
          <Button size="sm" variant="outline" disabled={busy} onClick={onCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />Manage
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
