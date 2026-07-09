import { ChangeEvent, FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, ImagePlus, Link as LinkIcon, UploadCloud, AlignLeft, FileText, Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
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
  if (status === 'ACTIVE' || status === 'APPROVED') return 'border-emerald-200 bg-emerald-50/50 text-emerald-700';
  if (status === 'PENDING_APPROVAL') return 'border-amber-200 bg-amber-50/50 text-amber-700';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50/50 text-red-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};

export function OrganizationBannerUploadCard() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [upload, setUpload] = useState<UploadState>({ fileId: null, url: '', name: '' });
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [previewError, setPreviewError] = useState(false);
  
  // Controlled form states for Live Banner Simulation
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');

  const eligibility = useQuery({
    queryKey: ['my-org-banner-eligibility'],
    queryFn: bannerApi.eligibility,
    staleTime: 30_000
  });

  const bannerUpload = useMutation({
    mutationFn: bannerApi.uploadOrgBanner,
    onSuccess: () => {
      setMessage('Banner uploaded successfully! It is now pending admin approval before it goes live.');
      setUpload({ fileId: null, url: '', name: '' });
      setImageUrl('');
      setTitle('');
      setSubtitle('');
      setTargetUrl('');
      qc.invalidateQueries({ queryKey: ['my-org-banner-eligibility'] });
    },
    onError: err => setMessage((err as Error).message)
  });

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('Please upload a valid JPG, PNG, or WebP banner image.');
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
      setMessage('Image optimized and uploaded successfully. Preview your slide below before submitting.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to upload banner image');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = imageUrl.trim();

    if (!url && !upload.fileId) {
      setMessage('Upload a banner image or enter a valid URL before submitting.');
      return;
    }

    bannerUpload.mutate({
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      imageUrl: url || undefined,
      documentId: upload.fileId || undefined,
      targetUrl: targetUrl.trim() || undefined,
      displayLocation: 'HOME_HERO',
      durationDays: 10
    });
  };

  const latestEligibility = Array.isArray(eligibility.data?.eligibility) ? eligibility.data.eligibility[0] : null;
  const recentBanners = Array.isArray(eligibility.data?.banners) ? eligibility.data.banners : [];
  const preview = imageSrc(upload.url || imageUrl);
  const isEligible = Boolean(eligibility.data?.eligible);

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/92 shadow-sm">
      <CardContent className="space-y-5 p-4 sm:p-5 lg:p-6">
        {/* Banner Eligibility Header & Status Panel */}
        <div className="grid gap-4 border-b border-slate-100 pb-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ad & Promotion Setup</span>
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              Create Homepage Promotion Slide
            </h2>
            <p className="max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
              Fill out the details below, upload a high-resolution hero background, and submit it for admin verification.
            </p>
          </div>
          
          {/* High-Fidelity Eligibility Widget */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Status</span>
              <span className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm',
                isEligible 
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              )}>
                <span className={cn('h-1.5 w-1.5 rounded-full', isEligible ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500')} />
                {isEligible ? 'Active Grant' : 'No Active Grant'}
              </span>
            </div>
            
            <div className="mt-3 grid grid-cols-2 gap-y-2.5 text-xs font-semibold text-slate-700">
              <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider">Method</span>
              <span className="text-right text-slate-800 font-extrabold">{readable(latestEligibility?.eligibilityType || 'Manual')}</span>
              
              <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider">Duration</span>
              <span className="text-right text-slate-800 font-extrabold">10 Days Active</span>
            </div>
          </div>
        </div>

        {/* Warning Alert if ineligible */}
        {!isEligible && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs font-semibold text-amber-800 flex items-start gap-3 shadow-sm">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-amber-900 text-sm">Eligibility Currently Locked</p>
              <p className="mt-1 text-amber-700 font-medium">
                Your organization is not currently active for promotional uploads. Administrators can grant promotion access from the Monthly Rankings dashboard or Banner Eligibility controls.
              </p>
            </div>
          </div>
        )}

        {/* Messaging Box */}
        {message && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs font-bold text-[#12335f] flex items-center gap-2.5 shadow-sm">
            <Sparkles className="h-4 w-4 text-blue-500 animate-pulse shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Main Interface Form & Simulator */}
        <form onSubmit={submit} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div className="space-y-4">
            {/* Input fields */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#12335f]" />
                Banner Title <span className="text-red-500">*</span>
              </label>
              <input
                name="title"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Enter dynamic banner headline..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-[#12335f] focus:ring-4 focus:ring-[#12335f]/5"
                disabled={!isEligible}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <AlignLeft className="h-4 w-4 text-[#12335f]" />
                Subtitle / Description
              </label>
              <textarea
                name="subtitle"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
                placeholder="Write a compelling short description or call to action..."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none transition-all focus:border-[#12335f] focus:ring-4 focus:ring-[#12335f]/5"
                disabled={!isEligible}
              />
            </div>

            {/* Media Upload & URL Sourcing Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              <label className={cn(
                "flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all",
                uploading ? "border-slate-300 bg-slate-50" : "border-slate-300 bg-slate-50/50 hover:border-[#12335f] hover:bg-slate-50"
              )}>
                {uploading ? (
                  <RefreshCw className="h-6 w-6 text-[#12335f] animate-spin" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-[#12335f]" />
                )}
                <span className="mt-2 text-xs font-black uppercase tracking-wide text-slate-800">
                  {uploading ? 'Optimizing Image...' : 'Upload Image'}
                </span>
                <span className="mt-1 text-[10px] font-semibold text-slate-400">JPG, PNG, WebP (Max 5MB)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} className="sr-only" disabled={uploading || !isEligible} />
              </label>

              <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <LinkIcon className="h-3.5 w-3.5 text-slate-400" />
                    Or Image URL
                  </div>
                  <input
                    value={imageUrl}
                    onChange={event => {
                      setImageUrl(event.target.value);
                      if (event.target.value) setUpload({ fileId: null, url: '', name: '' });
                      setPreviewError(false);
                    }}
                    placeholder="https://example.com/banner.webp"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold outline-none transition-all focus:border-[#12335f] focus:ring-4 focus:ring-[#12335f]/5"
                    disabled={!isEligible}
                  />
                </div>
                <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-400">
                  Enter a secure HTTPS image URL if you prefer not to upload.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <LinkIcon className="h-4 w-4 text-[#12335f]" />
                Target URL (Optional)
              </label>
              <input
                name="targetUrl"
                value={targetUrl}
                onChange={e => setTargetUrl(e.target.value)}
                placeholder="e.g., /buyer/marketplace or a custom path"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold outline-none transition-all focus:border-[#12335f] focus:ring-4 focus:ring-[#12335f]/5"
                disabled={!isEligible}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold leading-relaxed text-slate-500 border-l-4 border-l-[#12335f]">
              Recommended size: <strong className="text-slate-700">1920 x 600 px</strong>. Keep text readable on mobile and leave space around logos.
            </div>

            <Button
              type="submit"
              disabled={!isEligible || uploading || bannerUpload.isPending}
              className="h-11 w-full rounded-xl bg-[#12335f] text-xs font-bold uppercase tracking-wider text-white shadow-sm shadow-blue-900/10 transition-all duration-200 hover:bg-[#0b2445] hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
            >
              {bannerUpload.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Submitting for Approval...
                </>
              ) : (
                <>
                  <UploadCloud className="mr-2 h-4.5 w-4.5" /> Submit Banner for Approval
                </>
              )}
            </Button>
          </div>

          {/* Right Side Simulator and Guide Cards */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
              <div className="relative aspect-[16/7] w-full overflow-hidden sm:aspect-[16/6]">
                {preview && !previewError ? (
                  <img src={preview} alt="Banner preview" onError={() => setPreviewError(true)} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-900/40">
                    <UploadCloud className="h-8 w-8 opacity-40 animate-pulse text-slate-400" />
                    <p className="mt-2 text-[9px] font-black uppercase tracking-widest opacity-60">Upload Image / Paste URL</p>
                  </div>
                )}

                {/* Navy Gradient Overlay to match HeroBanner.tsx */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#07172e]/95 via-[#0b2447]/80 to-transparent" />
                
                {/* Content overlaid on the image */}
                <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5 select-none text-left">
                  {/* Top tag */}
                  <div className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[8px] font-bold text-white/80 uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Official MSME Partner
                  </div>

                  {/* Title & Subtitle */}
                  <div className="space-y-1">
                    <h3 className="text-xs sm:text-sm md:text-base font-black leading-tight text-white tracking-tight break-words line-clamp-2 max-w-[85%] whitespace-pre-line">
                      {title.trim() ? title : "Your Promotional Banner Headline"}
                    </h3>
                    <p className="text-[9px] leading-relaxed text-white/70 line-clamp-2 max-w-[80%] font-semibold">
                      {subtitle.trim() ? subtitle : "Your banner subtitle description will appear here..."}
                    </p>
                  </div>

                  {/* CTA Buttons */}
                  <div className="flex gap-2 items-center">
                    {targetUrl.trim() ? (
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded bg-white text-[#0b2447] text-[8px] font-black shadow-sm">
                        View Details
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-3 py-1 rounded bg-white/45 text-[#0b2447]/60 text-[8px] font-black shadow-sm">
                        View Details
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1 px-3 py-1 rounded border border-white/20 text-white text-[8px] font-bold bg-white/5">
                      Login to Portal
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Footer descriptor */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500">
                <span className="truncate max-w-[65%]">{upload.name ? `File: ${upload.name}` : 'Live Banner Simulator'}</span>
                {preview && !previewError ? (
                  <span className="text-emerald-600 font-extrabold uppercase text-[9px] tracking-wider flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Live Preview Active
                  </span>
                ) : (
                  <span className="text-slate-400 font-extrabold uppercase text-[9px] tracking-wider flex items-center gap-1 shrink-0">
                    No Image loaded
                  </span>
                )}
              </div>
            </div>

            {/* Information points */}
            <div className="grid gap-2.5 text-[11px] font-semibold text-slate-600">
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-colors hover:border-slate-300">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
                <span>Pending uploads require admin approval before they appear on the homepage hero.</span>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-colors hover:border-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Approved banners will run for exactly 10 days unless customized by an admin.</span>
              </div>
            </div>
          </div>
        </form>

        {/* Recent Uploads Section */}
        {recentBanners.length > 0 && (
          <div className="space-y-4 pt-5 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Historical uploads</p>
              <p className="text-sm font-bold text-slate-900">Submitted Slides History</p>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">Track your banner reviews, approvals, and reject feedback.</p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {recentBanners.map((banner: any) => (
                <div key={banner.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md">
                  <div className="relative aspect-[16/7] overflow-hidden bg-slate-950 sm:aspect-[16/6]">
                    {banner.imageUrl ? (
                      <img src={imageSrc(banner.imageUrl)} alt={banner.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-400 bg-slate-900">
                        <ImagePlus className="h-6 w-6 opacity-30" />
                      </div>
                    )}
                    
                    {/* Navy Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#07172e]/90 via-[#0b2447]/70 to-transparent" />
                    
                    {/* Text Overlay */}
                    <div className="absolute inset-0 flex flex-col justify-between p-3.5 select-none text-left">
                      <div className="flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[8px] font-bold text-white/80 uppercase tracking-widest">
                        {readable(banner.bannerType || 'Manual')}
                      </div>
                      
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-black leading-tight text-white tracking-tight break-words line-clamp-1">
                          {banner.title}
                        </h4>
                        {banner.subtitle && (
                          <p className="text-[8px] leading-relaxed text-white/70 line-clamp-1 font-semibold">
                            {banner.subtitle}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-1.5 items-center">
                        {banner.targetUrl && (
                          <div className="px-2 py-0.5 rounded bg-white text-[#0b2447] text-[7px] font-extrabold">
                            View Details
                          </div>
                        )}
                        <div className="px-2 py-0.5 rounded border border-white/20 text-white text-[7px] font-bold bg-white/5">
                          Portal
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Details Footer */}
                  <div className="flex items-center justify-between gap-3 p-3.5 bg-slate-50/50 border-t border-slate-100 mt-auto">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Review Status</p>
                      <span className={cn('mt-1 inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider', statusTone(banner.status))}>
                        {readable(banner.status)}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Duration</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-1">{banner.durationDays || 10} Days Display</p>
                    </div>
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
