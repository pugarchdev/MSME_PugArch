'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, IdCard, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { aadhaarKycApi, type AadhaarKycStatus } from './aadhaarKycApi';
import { cn } from '../../lib/utils';

const statusCopy: Record<AadhaarKycStatus['status'], { label: string; className: string; description: string }> = {
  NOT_STARTED: {
    label: 'Not started',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
    description: 'Start secure DigiLocker / MeriPehchaan identity verification.',
  },
  PENDING: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'A verification session is in progress or awaiting completion.',
  },
  VERIFIED: {
    label: 'Verified',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Your Aadhaar identity verification is completed.',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Verification failed. You can reset and try again.',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    description: 'The verification session expired. Please start again.',
  },
};

export function AadhaarVerificationCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [consented, setConsented] = useState(false);

  const query = useQuery({
    queryKey: ['aadhaar-kyc-status'],
    queryFn: () => aadhaarKycApi.status(),
    staleTime: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: aadhaarKycApi.startUrl,
    onSuccess: (data) => {
      if (!data.authorizationUrl) {
        toast.error('Aadhaar verification could not be started.');
        return;
      }
      window.location.assign(data.authorizationUrl);
    },
    onError: (error: any) => toast.error(error?.message || 'Unable to start Aadhaar verification'),
  });

  const resetMutation = useMutation({
    mutationFn: aadhaarKycApi.reset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aadhaar-kyc-status'] });
      toast.success('Aadhaar verification reset. You can start again.');
    },
    onError: (error: any) => toast.error(error?.message || 'Unable to reset Aadhaar verification'),
  });

  useEffect(() => {
    const aadhaar = searchParams?.get('aadhaar');
    if (!aadhaar) return;
    queryClient.invalidateQueries({ queryKey: ['aadhaar-kyc-status'] });
    if (aadhaar === 'verified') toast.success('Aadhaar verification completed.');
    if (aadhaar === 'failed') toast.error('Aadhaar verification failed. Please try again.');
    if (aadhaar === 'expired') toast.error('Aadhaar verification session expired. Please try again.');
    if (aadhaar === 'already_verified') toast.info('Aadhaar is already verified.');
  }, [queryClient, searchParams]);

  const status = query.data?.status || 'NOT_STARTED';
  const copy = statusCopy[status];
  const canRetry = status === 'FAILED' || status === 'EXPIRED' || status === 'PENDING';
  const verifiedAt = useMemo(() => {
    if (!query.data?.verifiedAt) return '';
    const date = new Date(query.data.verifiedAt);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }, [query.data?.verifiedAt]);

  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', compact ? 'p-4' : 'p-5')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className={cn('flex shrink-0 items-center justify-center rounded-lg', status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#12335f]/10 text-[#12335f]', compact ? 'h-10 w-10' : 'h-12 w-12')}>
            {status === 'VERIFIED' ? <ShieldCheck className="h-6 w-6" /> : <IdCard className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cn('font-black text-slate-950', compact ? 'text-sm' : 'text-base')}>Aadhaar Verification</h3>
              <span className={cn('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider', copy.className)}>
                {copy.label}
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              Verify your identity securely using DigiLocker / MeriPehchaan. We store only verification status and minimum verified profile details required for onboarding.
            </p>
            {query.isLoading ? (
              <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading verification status...
              </p>
            ) : (
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <SafeDetail label="Status" value={copy.description} />
                <SafeDetail label="Provider" value="MeriPehchaan / API Setu" />
                <SafeDetail label="Verified name" value={query.data?.verifiedName || 'Not available'} />
                {verifiedAt && <SafeDetail label="Verified at" value={verifiedAt} />}
                {typeof query.data?.ageVerified === 'boolean' && <SafeDetail label="Age verified" value={query.data.ageVerified ? 'Yes' : 'No'} />}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="h-9 rounded-md text-xs font-black"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', query.isFetching && 'animate-spin')} />
            Refresh
          </Button>
          {canRetry && (
            <Button
              type="button"
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="h-9 rounded-md text-xs font-black"
            >
              {resetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Reset
            </Button>
          )}
        </div>
      </div>

      {status !== 'VERIFIED' && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-start gap-3 text-xs font-semibold leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={consented}
              onChange={event => setConsented(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#12335f]"
            />
            <span>
              I consent to verify my identity through DigiLocker / MeriPehchaan for onboarding and compliance verification on the JSGSmile MSME Portal. I understand that my verified name, date of birth, gender, email/address if approved, reference ID, and verification status may be stored for compliance and audit purposes.
            </span>
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Aadhaar number, OTP, and provider tokens are not stored by this portal.
            </p>
            <Button
              type="button"
              onClick={() => {
                const path = window.location.pathname + window.location.search;
                startMutation.mutate({ redirectPath: path, frontendOrigin: window.location.origin });
              }}
              disabled={!consented || startMutation.isPending}
              className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]"
            >
              {startMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Verify with DigiLocker
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SafeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 line-clamp-2 font-bold text-slate-700">{value}</p>
    </div>
  );
}
