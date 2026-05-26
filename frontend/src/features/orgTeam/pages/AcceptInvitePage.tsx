/**
 * AcceptInvitePage — handles the /invite/accept?token=xxx flow.
 * User must be logged in. If not, redirected to login with returnUrl.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle, Building2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import { postApi } from '../../shared/apiClient';

type InviteResult = {
    organizationId: number;
    organizationName: string;
    orgRole: string;
};

export default function AcceptInvitePage() {
    const router = useRouter();
    const { user, token, refreshUser } = useAuth();
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [result, setResult] = useState<InviteResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Get token from URL
    const inviteToken = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('token')
        : null;

    useEffect(() => {
        if (!inviteToken) {
            setStatus('error');
            setErrorMsg('Invalid invitation link. No token found.');
            return;
        }

        if (!token || !user) {
            // Not logged in — redirect to login with returnUrl
            const returnUrl = encodeURIComponent(`/invite/accept?token=${inviteToken}`);
            router.replace(`/?returnUrl=${returnUrl}`);
            return;
        }

        // Auto-accept on load
        void acceptInvite();
    }, [inviteToken, token, user]);

    const acceptInvite = async () => {
        if (!inviteToken) return;
        setStatus('loading');
        try {
            const data = await postApi<InviteResult>('/api/org/accept-invite', { token: inviteToken });
            setResult(data);
            setStatus('success');
            // Refresh user context to pick up new organizationId
            await refreshUser();
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err?.message || 'Failed to accept invitation. The link may have expired.');
        }
    };

    if (status === 'idle' || status === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#12335f]" />
                    <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#12335f]">Accepting Invitation...</p>
                </div>
            </div>
        );
    }

    if (status === 'success' && result) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-6 py-5 text-white text-center">
                        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                        <h1 className="mt-3 text-lg font-black uppercase tracking-widest">Welcome Aboard!</h1>
                    </div>
                    <div className="p-6 space-y-4 text-center">
                        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <Building2 className="h-6 w-6 text-[#12335f]" />
                            <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Organisation</p>
                                <p className="text-sm font-black text-slate-900">{result.organizationName}</p>
                            </div>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Your Role</p>
                            <p className="mt-1 text-sm font-black text-emerald-800">{result.orgRole.replace(/_/g, ' ')}</p>
                        </div>
                        <p className="text-xs font-semibold text-slate-500">
                            You now have access to {result.organizationName}'s procurement workspace.
                        </p>
                        <Button
                            onClick={() => router.replace('/dashboard')}
                            className="w-full bg-[#12335f] text-white hover:bg-[#0e2a4f]"
                        >
                            Go to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-6 py-5 text-white text-center">
                    <XCircle className="mx-auto h-10 w-10 text-red-400" />
                    <h1 className="mt-3 text-lg font-black uppercase tracking-widest">Invitation Failed</h1>
                </div>
                <div className="p-6 space-y-4 text-center">
                    <p className="text-sm font-semibold text-slate-700">{errorMsg}</p>
                    <Button variant="outline" onClick={() => router.replace('/dashboard')} className="w-full">
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        </div>
    );
}
