/**
 * NotificationPrefsPage — toggle email / SMS / push channels and event categories.
 *
 * Route: /settings/notifications
 */
import { useState } from 'react';
import { Bell, Mail, MessageSquare, RefreshCw, Save, Smartphone, ShieldAlert } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { runWithToast } from '../../../lib/toast';
import { fetchNotificationPreferences, updateNotificationPreferences, type NotificationPreferenceDto } from '../api';

const THEME = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-700', switch: 'bg-blue-500 hover:bg-blue-600', ring: 'focus:ring-blue-500' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-700', switch: 'bg-purple-500 hover:bg-purple-600', ring: 'focus:ring-purple-500' },
    amber: { bg: 'bg-amber-100', text: 'text-amber-700', switch: 'bg-amber-500 hover:bg-amber-600', ring: 'focus:ring-amber-500' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', switch: 'bg-emerald-500 hover:bg-emerald-600', ring: 'focus:ring-emerald-500' },
    rose: { bg: 'bg-rose-100', text: 'text-rose-700', switch: 'bg-rose-500 hover:bg-rose-600', ring: 'focus:ring-rose-500' }
} as const;

type ThemeColor = keyof typeof THEME;

export default function NotificationPrefsPage() {
    const qc = useQueryClient();
    const { data, isLoading, error, refetch, isFetching } = useQuery({
        queryKey: ['notification-preferences'] as const,
        queryFn: fetchNotificationPreferences
    });

    const updateMut = useMutation({
        mutationFn: updateNotificationPreferences,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-preferences'] })
    });

    const [draft, setDraft] = useState<Partial<NotificationPreferenceDto>>({});

    const current: NotificationPreferenceDto | undefined = data ? { ...data, ...draft } : undefined;
    const hasChanges = Object.keys(draft).length > 0;

    const set = (key: keyof NotificationPreferenceDto, value: boolean) => {
        setDraft(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!hasChanges) return;
        await runWithToast(() => updateMut.mutateAsync(draft), {
            loading: 'Saving...', success: 'Preferences saved', error: 'Save failed'
        });
        setDraft({});
    };

    if (isLoading) return <LoadingState label="Loading preferences..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!current) return null;

    return (
        <div className="space-y-8 max-w-4xl pb-24 relative">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex items-end justify-between border-b border-slate-200 pb-6">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#12335f] mb-1">Account</p>
                    <h1 className="text-3xl font-black text-slate-950 tracking-tight">Notification Preferences</h1>
                    <p className="mt-2 text-sm font-medium text-slate-500 max-w-xl">
                        Control how you want to be notified about important events, procurements, and compliance alerts.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-xl text-xs font-bold shadow-sm">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            <div className="grid gap-10">
                <section>
                    <div className="mb-5">
                        <h2 className="text-lg font-bold text-slate-900">Delivery Methods</h2>
                        <p className="text-sm text-slate-500">Choose where you want to receive notifications.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-1">
                        <Row icon={Mail} color="blue" title="Email Notifications" desc="Receive updates and alerts directly to your registered email address." value={!!current.emailNotifications} onChange={v => set('emailNotifications', v)} />
                        <Row icon={MessageSquare} color="purple" title="SMS Notifications" desc="Get urgent alerts via text message (requires a verified phone number)." value={!!current.smsNotifications} onChange={v => set('smsNotifications', v)} />
                        <Row icon={Smartphone} color="amber" title="Push Notifications" desc="Receive real-time notifications in your browser or mobile app." value={!!current.pushNotifications} onChange={v => set('pushNotifications', v)} />
                    </div>
                </section>

                <section>
                    <div className="mb-5">
                        <h2 className="text-lg font-bold text-slate-900">Event Categories</h2>
                        <p className="text-sm text-slate-500">Select the types of events you want to be notified about.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-1">
                        <Row icon={Bell} color="emerald" title="Procurement Alerts" desc="Updates on Purchase Orders, Tenders, RFQs, Deliveries, and Invoices." value={!!current.procurementAlerts} onChange={v => set('procurementAlerts', v)} />
                        <Row icon={ShieldAlert} color="rose" title="Compliance Alerts" desc="Important fraud alerts, compliance violations, and GST/PAN status changes." value={!!current.complianceAlerts} onChange={v => set('complianceAlerts', v)} />
                    </div>
                </section>
            </div>

            {hasChanges && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-700">
                        <div className="text-sm font-medium">
                            You have unsaved changes
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => setDraft({})}
                                className="text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl text-sm"
                            >
                                Discard
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={updateMut.isPending}
                                className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl shadow-sm px-6 font-bold"
                            >
                                {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({
    icon: Icon,
    title,
    desc,
    value,
    onChange,
    color = 'emerald'
}: {
    icon: any;
    title: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
    color?: ThemeColor;
}) {
    const theme = THEME[color];

    return (
        <div className="group flex items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200/60 bg-white hover:border-slate-300 hover:shadow-md transition-all duration-300">
            <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 transition-colors duration-300 ${value ? `${theme.bg} ${theme.text}` : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                    <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-slate-900">{title}</p>
                    <p className="mt-1 text-sm font-medium text-slate-500 leading-relaxed">{desc}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                role="switch"
                aria-checked={value}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring} ${value ? theme.switch : 'bg-slate-300 hover:bg-slate-400'}`}
            >
                <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-300 ${value ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
            </button>
        </div>
    );
}