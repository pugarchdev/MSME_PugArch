/**
 * InviteSignupPage — dedicated lightweight signup for invited team members.
 *
 * Unlike the full seller/buyer registration (which creates a NEW organisation
 * via GST + onboarding review), this flow simply creates the user's account
 * and joins them to the EXISTING organisation that invited them, with the
 * OrgRole the admin assigned. The invited email is fixed (read-only) — it must
 * match the invitation. On success the user is logged straight in.
 *
 * Reached via /invite/signup?token=xxx (redirected from AcceptInvitePage when
 * no account exists yet for the invited email).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, Eye, EyeOff, Key, Mail, ShieldCheck, User, XCircle } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import { api } from '../../../lib/api';

type InviteInfo = {
    email: string;
    orgRole: string;
    organizationName: string;
    organizationType: string;
    invitedByName: string | null;
    portalRole: 'buyer' | 'seller';
    expiresAt: string;
    accountExists: boolean;
};

type SignupResult = {
    token?: string;
    accessToken?: string;
    refreshToken?: string;
    user: any;
    organizationName: string;
    orgRole: string;
};

const passwordRules = (pw: string) => {
    const errors: string[] = [];
    if (pw.length < 12) errors.push('at least 12 characters');
    if (!/[A-Z]/.test(pw)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(pw)) errors.push('one lowercase letter');
    if (!/\d/.test(pw)) errors.push('one number');
    if (!/[^A-Za-z0-9]/.test(pw)) errors.push('one special character');
    return errors;
};

export default function InviteSignupPage() {
    const router = useRouter();
    const { user, token, login } = useAuth();

    const inviteToken = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('token')
        : null;

    const [phase, setPhase] = useState<'loading' | 'form' | 'invalid' | 'success'>('loading');
    const [info, setInfo] = useState<InviteInfo | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const passwordErrors = useMemo(() => passwordRules(password), [password]);

    useEffect(() => {
        // Already authenticated? They don't need to sign up — send them to the
        // accept flow which will attach the membership.
        if (token && user) {
            router.replace(`/invite/accept?token=${encodeURIComponent(inviteToken || '')}`);
            return;
        }
        if (!inviteToken) {
            setPhase('invalid');
            setErrorMsg('Invalid invitation link. No token found.');
            return;
        }
        void loadInfo();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadInfo = async () => {
        try {
            const res = await api.get(`/api/org/invite/info?token=${encodeURIComponent(inviteToken!)}`);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                setPhase('invalid');
                setErrorMsg(body?.message || 'This invitation is no longer valid.');
                return;
            }
            const data: InviteInfo = body?.data ?? body;
            if (data.accountExists) {
                // Account already exists — they should log in instead.
                const returnUrl = encodeURIComponent(`/invite/accept?token=${inviteToken}`);
                router.replace(`/login?returnUrl=${returnUrl}`);
                return;
            }
            setInfo(data);
            setPhase('form');
        } catch (err: any) {
            setPhase('invalid');
            setErrorMsg(err?.message || 'Unable to load the invitation. Please try again.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim().length < 2) {
            toast.error('Please enter your full name.');
            return;
        }
        if (passwordErrors.length > 0) {
            toast.error(`Password must include ${passwordErrors.join(', ')}.`);
            return;
        }
        if (mobile && !/^\d{7,15}$/.test(mobile.trim())) {
            toast.error('Please enter a valid mobile number, or leave it blank.');
            return;
        }

        setSubmitting(true);
        const loadingToast = toast.loading('Creating your account...');
        try {
            const res = await api.post('/api/org/invite/signup', {
                token: inviteToken,
                name: name.trim(),
                password,
                ...(mobile.trim() ? { mobile: mobile.trim() } : {})
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                const message = body?.message || 'Could not create your account.';
                toast.error(message, { id: loadingToast });
                // If an account now exists (race), redirect to login.
                if (body?.code === 'ACCOUNT_EXISTS') {
                    const returnUrl = encodeURIComponent(`/invite/accept?token=${inviteToken}`);
                    router.replace(`/login?returnUrl=${returnUrl}`);
                }
                return;
            }
            const data: SignupResult = body?.data ?? body;
            login(data.accessToken || data.token || '', data.user, data.refreshToken);
            toast.success(`Welcome to ${data.organizationName}!`, { id: loadingToast });
            setPhase('success');
        } catch (err: any) {
            toast.error(err?.message || 'Something went wrong. Please try again.', { id: loadingToast });
        } finally {
            setSubmitting(false);
        }
    };

    if (phase === 'loading') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#12335f]" />
                    <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#12335f]">Loading Invitation...</p>
                </div>
            </div>
        );
    }

    if (phase === 'invalid') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-6 py-5 text-center text-white">
                        <XCircle className="mx-auto h-10 w-10 text-red-400" />
                        <h1 className="mt-3 text-lg font-black uppercase tracking-widest">Invitation Unavailable</h1>
                    </div>
                    <div className="space-y-4 p-6 text-center">
                        <p className="text-sm font-semibold text-slate-700">{errorMsg}</p>
                        <Button variant="outline" onClick={() => router.replace('/login')} className="w-full">
                            Go to Login
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (phase === 'success') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
                <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-6 py-5 text-center text-white">
                        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-400" />
                        <h1 className="mt-3 text-lg font-black uppercase tracking-widest">Welcome Aboard!</h1>
                    </div>
                    <div className="space-y-4 p-6 text-center">
                        <div className="flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <Building2 className="h-6 w-6 text-[#12335f]" />
                            <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Organisation</p>
                                <p className="text-sm font-black text-slate-900">{info?.organizationName}</p>
                            </div>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Your Role</p>
                            <p className="mt-1 text-sm font-black text-emerald-800">{info?.orgRole.replace(/_/g, ' ')}</p>
                        </div>
                        <Button onClick={() => router.replace('/dashboard')} className="w-full bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            Go to Dashboard
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // phase === 'form'
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="bg-gradient-to-br from-[#0b1b33] via-[#12335f] to-[#0b1b33] px-6 py-6 text-center text-white">
                    <ShieldCheck className="mx-auto h-9 w-9 text-[#f9a825]" />
                    <h1 className="mt-2 text-lg font-black uppercase tracking-widest">Join the Team</h1>
                    <p className="mt-1 text-[11px] font-semibold text-slate-300">
                        You've been invited{info?.invitedByName ? ` by ${info.invitedByName}` : ''} to
                    </p>
                    <p className="text-sm font-black text-white">{info?.organizationName}</p>
                </div>

                <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Role</span>
                        <span className="text-xs font-black text-[#12335f]">{info?.orgRole.replace(/_/g, ' ')}</span>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email (fixed to the invite) */}
                        <div className="space-y-1">
                            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Invited Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="email"
                                    value={info?.email || ''}
                                    disabled
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-4 text-sm font-semibold text-slate-500"
                                />
                            </div>
                        </div>

                        {/* Name */}
                        <div className="space-y-1">
                            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="e.g. Priya Sharma"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm font-semibold focus:border-[#12335f] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                            </div>
                        </div>

                        {/* Mobile (optional) */}
                        <div className="space-y-1">
                            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Mobile (optional)</label>
                            <input
                                type="tel"
                                inputMode="numeric"
                                placeholder="10-digit mobile number"
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
                                maxLength={15}
                                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold focus:border-[#12335f] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                            />
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                            <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Create Password</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="12+ chars, upper, lower, number, symbol"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-11 text-sm font-semibold focus:border-[#12335f] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#12335f]"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {password.length > 0 && passwordErrors.length > 0 && (
                                <p className="ml-1 text-[10px] font-semibold text-amber-600">
                                    Needs {passwordErrors.join(', ')}.
                                </p>
                            )}
                        </div>

                        <Button
                            type="submit"
                            disabled={submitting}
                            className="h-11 w-full rounded-xl bg-[#12335f] text-xs font-black uppercase tracking-[0.2em] text-white hover:bg-[#0e2a4f] disabled:opacity-50"
                        >
                            {submitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Creating Account...
                                </span>
                            ) : (
                                'Create Account & Join'
                            )}
                        </Button>
                    </form>

                    <p className="text-center text-[10px] font-semibold text-slate-400">
                        By joining you agree to access {info?.organizationName}'s workspace as a team member.
                    </p>
                </div>
            </div>
        </div>
    );
}
