/**
 * AcceptInvitePage — handles the /invite/accept?token=xxx flow.
 *
 * Decision tree:
 *   1. No token            → error.
 *   2. Logged in           → auto-accept via /api/org/accept-invite.
 *   3. Logged out + account already exists for the invited email
 *                          → send to /login?returnUrl=... to sign in & come back.
 *   4. Logged out + no account yet
 *                          → send to /invite/signup?token=... (dedicated
 *                            lightweight signup that joins the existing org).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Building2 } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import { api } from '../../../lib/api';
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
            // Not logged in. Ask the backend whether an account already exists
            // for the invited email, then route accordingly.
            void routeUnauthenticated();
            return;
        }

        // Logged in — auto-accept.
        void acceptInvite();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inviteToken, token, user]);

    const routeUnauthenticated = async () => {
        if (!inviteToken) return;
        setStatus('loading');
        try {
            const res = await api.get(`/api/org/invite/info?token=${encodeURIComponent(inviteToken)}`);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setStatus('error');
                setErrorMsg(body?.message || 'This invitation is no longer valid.');
                return;
            }
            const info = body?.data ?? body;
            if (info?.accountExists) {
                // They have an account — log in and bounce straight back here.
                const returnUrl = encodeURIComponent(`/invite/accept?token=${inviteToken}`);
                router.replace(`/login?returnUrl=${returnUrl}`);
            } else {
                // Brand new invitee — dedicated signup that joins the org.
                router.replace(`/invite/signup?token=${encodeURIComponent(inviteToken)}`);
            }
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err?.message || 'Unable to verify the invitation. Please try again.');
        }
    };

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
                    <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#12335f]">Checking Invitation...</p>
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
