import { OrganizationBannerUploadCard } from '../components/OrganizationBannerUploadCard';

export default function OrganizationBannerEligibilityPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Organization</p>
        <h1 className="text-2xl font-black text-slate-950">Banner Eligibility</h1>
      </div>
      <OrganizationBannerUploadCard />
    </div>
  );
}
