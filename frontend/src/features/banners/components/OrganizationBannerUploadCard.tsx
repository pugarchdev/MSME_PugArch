import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { bannerApi } from '../api';

export function OrganizationBannerUploadCard() {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const eligibility = useQuery({ queryKey: ['my-org-banner-eligibility'], queryFn: bannerApi.eligibility, staleTime: 30_000 });
  const upload = useMutation({
    mutationFn: bannerApi.uploadOrgBanner,
    onSuccess: () => { setMessage('Banner uploaded for admin approval'); qc.invalidateQueries({ queryKey: ['my-org-banner-eligibility'] }); },
    onError: err => setMessage((err as Error).message)
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    upload.mutate({
      title: form.get('title'),
      subtitle: form.get('subtitle') || undefined,
      imageUrl: form.get('imageUrl'),
      targetUrl: form.get('targetUrl') || undefined,
      displayLocation: 'HOME_HERO',
      durationDays: 10
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Promotion Banner</p>
          <h2 className="text-lg font-black text-slate-950">You are now eligible to upload the advertise/promote in the banner section.</h2>
          {!eligibility.data?.eligible && <p className="mt-1 text-xs font-semibold text-slate-500">Eligibility is not currently active for this organization.</p>}
        </div>
        {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#12335f]">{message}</div>}
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <input name="title" required placeholder="Banner title" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <input name="imageUrl" required placeholder="Secure image URL" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <input name="subtitle" placeholder="Subtitle" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <input name="targetUrl" placeholder="Optional target URL" className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold" />
          <Button disabled={!eligibility.data?.eligible || upload.isPending} className="md:col-span-2">
            <UploadCloud className="mr-2 h-4 w-4" />Upload for approval
          </Button>
        </form>
        {(eligibility.data?.banners || []).length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Recent uploads</p>
            {eligibility.data.banners.map((banner: any) => (
              <div key={banner.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                <span>{banner.title}</span>
                <span className="uppercase text-slate-500">{banner.status}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
