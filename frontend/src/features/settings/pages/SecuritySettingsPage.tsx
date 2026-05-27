/**
 * SecuritySettingsPage — 2FA toggle + password change + logout.
 *
 * Route: /settings/security
 */
import { useState } from 'react';
import {
    CheckCircle2, KeyRound, Loader2, Lock, LogOut, Mail, Shield, ShieldCheck, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { runWithToast } from '../../../lib/toast';
import { changePassword, disable2fa, enable2faRequest } from '../api';

export default function SecuritySettingsPage() {
    const { user, logout, refreshUser } = useAuth();
    const [enableModal, setEnableModal] = useState(false);
    const [disableModal, setDisableModal] = useState(false);
    const [pwModal, setPwModal] = useState(false);

    const has2fa = !!user?.twoFactorEnabled;

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="border-b border-slate-200 pb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Account</p>
                <h1 className="text-2xl font-black text-slate-950">Security Settings</h1>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                    Two-factor authentication, password, and active session management.
                </p>
            </div>

            {/* 2FA */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 ${has2fa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {has2fa ? <ShieldCheck className="h-6 w-6" /> : <Shield className="h-6 w-6" />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-950">Two-Factor Authentication</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                                    {has2fa ? 'Active — login requires an OTP sent to your email.' : 'Disabled — login uses password only.'}
                                </p>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    Email: <span className="font-bold">{user?.email}</span>
                                </p>
                            </div>
                        </div>
                        {has2fa ? (
                            <Button variant="outline" onClick={() => setDisableModal(true)} className="border-red-200 text-red-700 hover:bg-red-50">
                                Disable 2FA
                            </Button>
                        ) : (
                            <Button onClick={() => setEnableModal(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                                Enable 2FA
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Password */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shrink-0">
                                <KeyRound className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-950">Password</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                                    Change your password regularly. Doing so will revoke all other active sessions.
                                </p>
                            </div>
                        </div>
                        <Button onClick={() => setPwModal(true)} className="bg-[#12335f] text-white">
                            Change Password
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Sign out */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
                                <LogOut className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-950">Sign Out</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                                    Sign out of this device. Your refresh token will be invalidated.
                                </p>
                            </div>
                        </div>
                        <Button variant="outline" onClick={logout} className="border-amber-200 text-amber-800 hover:bg-amber-50">
                            <LogOut className="mr-2 h-4 w-4" /> Sign Out
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {enableModal && (
                <Enable2faModal
                    email={user?.email || ''}
                    onClose={() => setEnableModal(false)}
                    onDone={async () => { await refreshUser(); setEnableModal(false); }}
                />
            )}
            {disableModal && (
                <Disable2faModal
                    onClose={() => setDisableModal(false)}
                    onDone={async () => { await refreshUser(); setDisableModal(false); }}
                />
            )}
            {pwModal && (
                <ChangePasswordModal onClose={() => setPwModal(false)} onDone={() => setPwModal(false)} />
            )}
        </div>
    );
}

function Enable2faModal({ email, onClose, onDone }: { email: string; onClose: () => void; onDone: () => void }) {
    const [step, setStep] = useState<'send' | 'verify'>('send');
    const [otp, setOtp] = useState('');
    const [pending, setPending] = useState(false);

    const handleSend = async () => {
        setPending(true);
        try {
            await enable2faRequest();
            toast.success(`OTP sent to ${email}`);
            setStep('verify');
        } catch (e: any) {
            toast.error(e?.message || 'Failed to send OTP');
        } finally {
            setPending(false);
        }
    };

    const handleVerify = async () => {
        if (otp.length < 4) { toast.error('Enter the OTP'); return; }
        setPending(true);
        try {
            await enable2faRequest(otp.trim());
            toast.success('Two-factor authentication enabled');
            onDone();
        } catch (e: any) {
            toast.error(e?.message || 'Verification failed');
        } finally {
            setPending(false);
        }
    };

    return (
        <Modal title="Enable Two-Factor Authentication" tone="emerald" onClose={onClose}>
            {step === 'send' ? (
                <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                        We'll email a verification code to <span className="font-black">{email}</span>. Enter it on the next step to confirm.
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSend} disabled={pending} className="bg-emerald-600 text-white">
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                            Send Code
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">6-digit Code</label>
                        <input
                            type="text"
                            value={otp}
                            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            inputMode="numeric"
                            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-center text-xl font-mono font-black tracking-widest"
                        />
                        <p className="text-[10px] text-slate-400">Check {email}.</p>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setStep('send')}>Resend</Button>
                        <Button onClick={handleVerify} disabled={pending || otp.length < 4} className="bg-emerald-600 text-white">
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Verify & Enable
                        </Button>
                    </div>
                </>
            )}
        </Modal>
    );
}

function Disable2faModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [password, setPassword] = useState('');
    const [pending, setPending] = useState(false);

    const handleDisable = async () => {
        if (password.length < 1) { toast.error('Enter your password'); return; }
        setPending(true);
        try {
            await disable2fa(password);
            toast.success('Two-factor authentication disabled');
            onDone();
        } catch (e: any) {
            toast.error(e?.message || 'Failed to disable 2FA');
        } finally {
            setPending(false);
        }
    };

    return (
        <Modal title="Disable Two-Factor Authentication" tone="red" onClose={onClose}>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Disabling 2FA will reduce your account security. Enter your password to confirm.
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold"
                    autoComplete="current-password"
                />
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleDisable} disabled={pending} className="bg-red-600 text-white">
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                    Disable 2FA
                </Button>
            </div>
        </Modal>
    );
}

function ChangePasswordModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const [currentPassword, setCurrent] = useState('');
    const [newPassword, setNew] = useState('');
    const [confirm, setConfirm] = useState('');
    const [pending, setPending] = useState(false);

    const handleSubmit = async () => {
        if (newPassword.length < 8) { toast.error('New password must be ≥8 chars'); return; }
        if (newPassword !== confirm) { toast.error('Passwords do not match'); return; }
        setPending(true);
        try {
            await changePassword({ currentPassword, newPassword });
            toast.success('Password changed. You will need to sign in again on other devices.');
            onDone();
        } catch (e: any) {
            toast.error(e?.message || 'Change failed');
        } finally {
            setPending(false);
        }
    };

    return (
        <Modal title="Change Password" tone="blue" onClose={onClose}>
            <div className="space-y-3">
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Password</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrent(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" autoComplete="current-password" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">New Password</label>
                    <input type="password" value={newPassword} onChange={e => setNew(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" autoComplete="new-password" />
                    <p className="text-[10px] text-slate-400">Minimum 8 characters with letters and numbers.</p>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Confirm New Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-semibold" autoComplete="new-password" />
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-3">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={pending} className="bg-[#12335f] text-white">
                    {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Change Password
                </Button>
            </div>
        </Modal>
    );
}

function Modal({ title, tone, onClose, children }: {
    title: string;
    tone: 'emerald' | 'red' | 'blue';
    onClose: () => void;
    children: React.ReactNode;
}) {
    const headers = {
        emerald: 'bg-gradient-to-r from-emerald-700 to-emerald-800',
        red: 'bg-gradient-to-r from-red-700 to-red-800',
        blue: 'bg-gradient-to-r from-[#0b1f3a] to-[#12335f]'
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className={`flex items-center justify-between border-b border-slate-200 px-5 py-4 text-white ${headers[tone]}`}>
                    <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-3">{children}</div>
            </div>
        </div>
    );
}
