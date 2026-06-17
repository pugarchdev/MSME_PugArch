/**
 * NotificationPrefsPage — toggle email / SMS / push channels and event categories.
 *
 * Route: /settings/notifications
 */
import { useState } from 'react';
import { Bell, Mail, MessageSquare, RefreshCw, Save, Smartphone } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { runWithToast } from '../../../lib/toast';
import { fetchNotificationPreferences, updateNotificationPreferences, type NotificationPreferenceDto } from '../api';

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

    const set = (key: keyof NotificationPreferenceDto, value: boolean) => {
        setDraft(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (Object.keys(draft).length === 0) return;
        await runWithToast(() => updateMut.mutateAsync(draft), {
            loading: 'Saving...', success: 'Preferences saved', error: 'Save failed'
        });
        setDraft({});
    };

    if (isLoading) return <LoadingState label="Loading preferences..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!current) return null;

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex items-end justify-between border-b border-slate-200 pb-6">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Account</p>
                    <h1 className="text-2xl font-black text-slate-950">Notification Preferences</h1>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        Choose how and when we contact you about procurement events.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="bg-slate-50/60 border-b border-slate-100">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Communication Channels
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                    <Row icon={Mail} title="Email Notifications" desc="Receive notifications by email." value={!!current.emailNotifications} onChange={v => set('emailNotifications', v)} />
                    <Row icon={MessageSquare} title="SMS Notifications" desc="Receive notifications by SMS (when phone verified)." value={!!current.smsNotifications} onChange={v => set('smsNotifications', v)} />
                    <Row icon={Smartphone} title="Push Notifications" desc="Browser/in-app push notifications." value={!!current.pushNotifications} onChange={v => set('pushNotifications', v)} />
                </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-sm">
                <CardHeader className="bg-slate-50/60 border-b border-slate-100">
                    <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Event Categories
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                    <Row icon={Bell} title="Procurement Alerts" desc="POs, tenders, RFQs, deliveries, invoices, payments." value={!!current.procurementAlerts} onChange={v => set('procurementAlerts', v)} />
                    <Row icon={Bell} title="Compliance Alerts" desc="Fraud alerts, compliance violations, GST/PAN updates." value={!!current.complianceAlerts} onChange={v => set('complianceAlerts', v)} />
                </CardContent>
            </Card>

            <div className="flex justify-end pt-2">
                <Button
                    onClick={handleSave}
                    disabled={updateMut.isPending || Object.keys(draft).length === 0}
                    className="bg-[#12335f] text-white"
                    size="md"
                >
                    {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}

function Row({ icon: Icon, title, desc, value, onChange }: { icon: any; title: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
            <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 transition-colors duration-200 ${value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{title}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-600 leading-relaxed">{desc}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={() => onChange(!value)}
                role="switch"
                aria-checked={value}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#12335f] ${value ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400'}`}
            >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-all duration-200 ${value ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
            </button>
        </div>
    );
}