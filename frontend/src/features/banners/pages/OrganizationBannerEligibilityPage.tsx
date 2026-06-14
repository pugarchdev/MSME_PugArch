import { OrganizationBannerUploadCard } from '../components/OrganizationBannerUploadCard';

export default function OrganizationBannerEligibilityPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Organization</p>
        <h1 className="text-2xl font-bold text-slate-950">Banner Eligibility</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
          Eligible buyer and seller organizations can submit a homepage promotional banner here. New submissions remain pending until an admin approves them from Banner Management.
        </p>
        <div className="mt-4 grid gap-3 text-xs font-bold text-slate-600 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Placement: Homepage hero</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Default display: 10 days</div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">Formats: JPG, PNG, WebP</div>
        </div>
      </div>
      <OrganizationBannerUploadCard />
    </div>
  );
}
