import { ChangeEvent, FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, ImagePlus, Link as LinkIcon, UploadCloud } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { api, BASE_URL, readJsonResponse, unwrapApiData } from '../../../lib/api';
import { compressImage } from '../../../lib/compress';
import { cn } from '../../../lib/utils';
import { bannerApi } from '../api';

type UploadState = {
  fileId: number | null;
  url: string;
  name: string;
};

const imageSrc = (url?: string | null) => {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith('/')) return `${BASE_URL}${url}`;
  return url;
};

const readable = (value?: string | null) =>
  String(value || 'Not submitted').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());

const statusTone = (status?: string | null) => {
  if (status === 'ACTIVE' || status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'PENDING_APPROVAL') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

export function OrganizationBannerUploadCard() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [upload, setUpload] = useState<UploadState>({ fileId: null, url: '', name: '' });
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [previewError, setPreviewError] = useState(false);

  const eligibility = useQuery({
    queryKey: ['my-org-banner-eligibility'],
    queryFn: bannerApi.eligibility,
    staleTime: 30_000
  });

  const bannerUpload = useMutation({
    mutationFn: bannerApi.uploadOrgBanner,
    onSuccess: () => {
      setMessage('Banner uploaded for admin approval. It will appear on the homepage after admin approval.');
      setUpload({ fileId: null, url: '', name: '' });
      setImageUrl('');
      qc.invalidateQueries({ queryKey: ['my-org-banner-eligibility'] });
    },
    onError: err => setMessage((err as Error).message)
  });

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Upload a JPG, PNG, or WebP banner image.');
      event.target.value = '';
      return;
    }

    setUploading(true);
    setMessage('');
    setPreviewError(false);
    try {
      const optimized = await compressImage(file, 1920, 600, 0.82);
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
      setImageUrl('');
      setMessage('Image uploaded. Review the preview and submit it for admin approval.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to upload banner image');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const url = imageUrl.trim();

    if (!url && !upload.fileId) {
      setMessage('Upload an image or add a secure image URL before submitting.');
      return;
    }

    bannerUpload.mutate({
      title: String(form.get('title') || '').trim(),
      subtitle: String(form.get('subtitle') || '').trim() || undefined,
      imageUrl: url || undefined,
      documentId: upload.fileId || undefined,
      targetUrl: String(form.get('targetUrl') || '').trim() || undefined,
      displayLocation: 'HOME_HERO',
      durationDays: 10
    });
  };

  const latestEligibility = Array.isArray(eligibility.data?.eligibility) ? eligibility.data.eligibility[0] : null;
  const recentBanners = Array.isArray(eligibility.data?.banners) ? eligibility.data.banners : [];
  const preview = imageSrc(upload.url || imageUrl);
  const isEligible = Boolean(eligibility.data?.eligible);

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm">
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Promotion Banner</p>
            <h2 className="text-xl font-bold text-slate-950">
              You are now eligible to upload an advertisement or promotional banner for the homepage.
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-600">
              Submit a homepage banner for admin approval. Approved banners are shown for 10 days by default.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Current Eligibility</p>
            <div className="mt-3 space-y-2 text-xs font-bold text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span>Status</span>
                <span className={cn('rounded-full border px-2 py-0.5 uppercase', isEligible ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500')}>
                  {isEligible ? 'Eligible' : 'Not Active'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Type</span>
                <span>{readable(latestEligibility?.eligibilityType || 'Manual')}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Duration</span>
                <span>10 days</span>
              </div>
            </div>
          </div>
        </div>

        {!isEligible && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
            Eligibility is not currently active for this organization. Admin can grant access from Monthly Rankings or Banner Eligibility controls.
          </div>
        )}

        {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f]">{message}</div>}

        <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <input name="title" required placeholder="Banner title" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />
            <textarea name="subtitle" placeholder="Subtitle or short promotion message" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-[#12335f] hover:bg-white">
                <ImagePlus className="h-6 w-6 text-[#12335f]" />
                <span className="mt-2 text-xs font-black uppercase tracking-wide text-slate-800">{uploading ? 'Uploading...' : 'Upload banner image'}</span>
                <span className="mt-1 text-[11px] font-semibold text-slate-500">JPG, PNG, or WebP</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} className="sr-only" disabled={uploading || !isEligible} />
              </label>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <LinkIcon className="h-3.5 w-3.5" />
                  Image URL
                </div>
                <input
                  value={imageUrl}
                  onChange={event => {
                    setImageUrl(event.target.value);
                    if (event.target.value) setUpload({ fileId: null, url: '', name: '' });
                    setPreviewError(false);
                  }}
                  placeholder="https://example.com/banner.webp"
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-xs font-bold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
                  disabled={!isEligible}
                />
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-500">
                  Use a secure HTTPS URL if you are not uploading a file.
                </p>
              </div>
            </div>

            <input name="targetUrl" placeholder="Optional target URL when a user clicks the banner" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10" />

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-relaxed text-slate-600">
              Recommended size: 1920 x 600 px. Keep text readable on mobile and leave space around logos.
            </div>

            <Button disabled={!isEligible || uploading || bannerUpload.isPending} className="h-11 w-full bg-[#12335f] text-white hover:bg-[#0b2445]">
              <UploadCloud className="mr-2 h-4 w-4" />
              {bannerUpload.isPending ? 'Submitting...' : 'Upload for approval'}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <div className="aspect-[16/5] w-full bg-slate-200">
                {preview && !previewError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Banner preview" onError={() => setPreviewError(true)} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                    <UploadCloud className="h-7 w-7" />
                    <p className="mt-2 text-xs font-bold uppercase tracking-wide">Preview appears here</p>
                  </div>
                )}
              </div>
              <div className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                {upload.name ? `Uploaded file: ${upload.name}` : 'Homepage hero banner preview'}
              </div>
            </div>

            <div className="grid gap-2 text-xs font-semibold text-slate-600">
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <Clock className="mt-0.5 h-4 w-4 text-amber-600" />
                <span>Pending uploads need admin approval before they appear on the homepage.</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>Approved banners run for 10 days unless an admin changes the duration.</span>
              </div>
            </div>
          </div>
        </form>

        {recentBanners.length > 0 && (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent uploads</p>
              <p className="text-xs font-semibold text-slate-500">Track submitted banners and admin review status.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {recentBanners.map((banner: any) => (
                <div key={banner.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <div className="aspect-[16/5] bg-slate-100">
                    {banner.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc(banner.imageUrl)} alt={banner.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <ImagePlus className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{banner.title}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{banner.durationDays || 10} day display window</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide', statusTone(banner.status))}>
                      {readable(banner.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
