/**
 * NotificationPrefsPage - delivery channels and event category preferences.
 *
 * Route: /settings/notifications
 */
import { useMemo, useState } from 'react';
import {
    Bell,
    CheckCircle2,
    ClipboardList,
    Clock3,
    Mail,
    MessageSquare,
    MonitorSmartphone,
    RefreshCw,
    RotateCcw,
    Save,
    Settings2,
    ShieldAlert,
    SlidersHorizontal,
    Smartphone,
} from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { runWithToast } from '../../../lib/toast';
import { fetchNotificationPreferences, updateNotificationPreferences, type NotificationPreferenceDto } from '../api';

const THEME = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', text: 'text-blue-700', icon: 'bg-blue-100 text-blue-700', switch: 'bg-blue-600 hover:bg-blue-700', ring: 'focus:ring-blue-500' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', icon: 'bg-purple-100 text-purple-700', switch: 'bg-purple-600 hover:bg-purple-700', ring: 'focus:ring-purple-500' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', icon: 'bg-amber-100 text-amber-700', switch: 'bg-amber-500 hover:bg-amber-600', ring: 'focus:ring-amber-500' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', icon: 'bg-emerald-100 text-emerald-700', switch: 'bg-emerald-600 hover:bg-emerald-700', ring: 'focus:ring-emerald-500' },
    rose: { bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-700', icon: 'bg-rose-100 text-rose-700', switch: 'bg-rose-600 hover:bg-rose-700', ring: 'focus:ring-rose-500' }
} as const;

type ThemeColor = keyof typeof THEME;
type PreferenceKey = keyof Omit<NotificationPreferenceDto, 'id' | 'userId' | 'mobile' | 'mobileVerified'>;

const deliveryMethods: PreferenceConfig[] = [
    {
        key: 'emailNotifications',
        icon: Mail,
        color: 'blue',
        title: 'Email notifications',
        description: 'Registered email delivery for approvals, procurement milestones, and account alerts.',
        meta: 'Primary channel',
    },
    {
        key: 'smsNotifications',
        icon: MessageSquare,
        color: 'purple',
        title: 'SMS notifications',
        description: 'Short text alerts for urgent actions that should not wait for inbox review.',
        meta: 'Requires verified mobile',
    },
    {
        key: 'pushNotifications',
        icon: Smartphone,
        color: 'amber',
        title: 'Push notifications',
        description: 'Browser and mobile app alerts for real-time operational updates.',
        meta: 'Device permission required',
    },
];

const eventCategories: PreferenceConfig[] = [
    {
        key: 'procurementAlerts',
        icon: Bell,
        color: 'emerald',
        title: 'Procurement alerts',
        description: 'Purchase orders, tenders, RFQs, deliveries, invoices, and payment workflow updates.',
        meta: 'Operational',
    },
    {
        key: 'complianceAlerts',
        icon: ShieldAlert,
        color: 'rose',
        title: 'Compliance alerts',
        description: 'Fraud signals, compliance exceptions, verification status, and GST or PAN changes.',
        meta: 'High priority',
    },
];

interface PreferenceConfig {
    key: PreferenceKey;
    icon: any;
    color: ThemeColor;
    title: string;
    description: string;
    meta: string;
}

export default function NotificationPrefsPage() {
    const { user } = useAuth();
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

    const isSmsEnabled = !!user?.enabledFeatures?.includes('sms');

    const filteredDeliveryMethods = useMemo(() => {
        return isSmsEnabled
            ? deliveryMethods
            : deliveryMethods.filter(item => item.key !== 'smsNotifications');
    }, [isSmsEnabled]);

    const activeDeliveryCount = useMemo(() => current ? filteredDeliveryMethods.filter(item => current[item.key]).length : 0, [current, filteredDeliveryMethods]);
    const activeCategoryCount = useMemo(() => current ? eventCategories.filter(item => current[item.key]).length : 0, [current]);
    const activeTotal = activeDeliveryCount + activeCategoryCount;

    const set = (key: PreferenceKey, value: boolean) => {
        if (key === 'smsNotifications' && value && !current?.mobileVerified) return;
        setDraft(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!hasChanges) return;
        await runWithToast(() => updateMut.mutateAsync(draft), {
            loading: 'Saving notification preferences...',
            success: 'Notification preferences saved',
            error: 'Save failed'
        });
        setDraft({});
    };

    if (isLoading) return <LoadingState label="Loading notification preferences..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!current) return null;

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 pb-28">
            <div className="brand-tricolor-strip rounded-full" />

            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-[#12335f]/10 bg-[#12335f]/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                        <Settings2 className="h-3.5 w-3.5" />
                        Account controls
                    </div>
                    <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">Notification Preferences</h1>
                    <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
                        Configure which channels and event classes are active for procurement, compliance, and account alerts.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="h-10 rounded-md text-xs font-black"
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => setDraft({})}
                        disabled={!hasChanges || updateMut.isPending}
                        className="h-10 rounded-md text-xs font-black"
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reset
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || updateMut.isPending}
                        className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]"
                    >
                        {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <MetricCard icon={MonitorSmartphone} label="Active channels" value={`${activeDeliveryCount}/${filteredDeliveryMethods.length}`} description="Delivery methods enabled" />
                <MetricCard icon={ClipboardList} label="Active categories" value={`${activeCategoryCount}/2`} description="Event groups enabled" />
                <MetricCard icon={CheckCircle2} label="Preference state" value={hasChanges ? 'Draft' : 'Synced'} description={hasChanges ? `${Object.keys(draft).length} pending change${Object.keys(draft).length === 1 ? '' : 's'}` : 'Current settings saved'} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-6">
                    <SettingsPanel
                        eyebrow="Delivery methods"
                        title="Channel routing"
                        description="Choose where the platform sends alerts. Keep at least one channel active for critical workflow visibility."
                        items={filteredDeliveryMethods}
                        current={current}
                        onChange={set}
                        smsLocked={!current.mobileVerified}
                    />

                    <SettingsPanel
                        eyebrow="Event categories"
                        title="Alert subscriptions"
                        description="Select the operational domains that should generate notifications for this account."
                        items={eventCategories}
                        current={current}
                        onChange={set}
                    />
                </div>

                <aside className="space-y-4">
                    <Card className="border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-4 p-5">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Notification policy</p>
                                <h2 className="mt-1 text-base font-black text-slate-950">Enterprise delivery rules</h2>
                            </div>
                            <div className="space-y-3">
                                <PolicyLine title="Critical compliance" description="Compliance alerts should remain enabled for audit and fraud visibility." />
                                <PolicyLine title="Procurement continuity" description="Procurement alerts support PO, RFQ, tender, invoice, and delivery follow-up." />
                                <PolicyLine title="Channel redundancy" description="Use email with SMS or push where urgent response is required." />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-4 p-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-[#12335f]">
                                    <Clock3 className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-black text-slate-950">Update behavior</p>
                                    <p className="text-xs font-semibold text-slate-500">Changes apply after saving.</p>
                                </div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-600">
                                Refresh reloads the saved server state. Reset clears only unsaved local edits.
                            </div>
                        </CardContent>
                    </Card>
                </aside>
            </div>

            {hasChanges && (
                <div className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-3xl">
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
                                <SlidersHorizontal className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-sm font-black">Unsaved notification changes</p>
                                <p className="text-xs font-semibold text-slate-300">Save to apply these preferences to your account.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="ghost"
                                onClick={() => setDraft({})}
                                className="h-9 rounded-md text-xs font-black text-slate-200 hover:bg-white/10 hover:text-white"
                            >
                                Discard
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={updateMut.isPending}
                                className="h-9 rounded-md bg-white px-4 text-xs font-black text-slate-950 hover:bg-slate-100"
                            >
                                {updateMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SettingsPanel({
    eyebrow,
    title,
    description,
    items,
    current,
    onChange,
    smsLocked = false,
}: {
    eyebrow: string;
    title: string;
    description: string;
    items: PreferenceConfig[];
    current: NotificationPreferenceDto;
    onChange: (key: PreferenceKey, value: boolean) => void;
    smsLocked?: boolean;
}) {
    return (
        <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-0">
                <div className="flex flex-col gap-2 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{eyebrow}</p>
                        <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">{description}</p>
                    </div>
                    <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {items.filter(item => current[item.key]).length} active
                    </span>
                </div>
                <div className="divide-y divide-slate-100">
                    {items.map(item => (
                        <PreferenceRow
                            key={item.key}
                            item={item}
                            value={!!current[item.key]}
                            locked={smsLocked && item.key === 'smsNotifications'}
                            onChange={(value) => onChange(item.key, value)}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function PreferenceRow({ item, value, locked, onChange }: { item: PreferenceConfig; value: boolean; locked?: boolean; onChange: (v: boolean) => void }) {
    const Icon = item.icon;
    const theme = THEME[item.color];

    return (
        <div className="grid gap-4 p-5 transition-colors hover:bg-slate-50/70 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
            <div className="flex min-w-0 items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${value ? theme.icon : 'bg-slate-100 text-slate-500'}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-slate-950">{item.title}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${value ? `${theme.bg} ${theme.border} ${theme.text}` : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                            {item.meta}
                        </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{item.description}</p>
                    {locked && (
                        <p className="mt-1 text-xs font-black text-amber-700">Verify your mobile number to enable SMS notifications.</p>
                    )}
                </div>
            </div>
            <div className="flex items-center justify-between gap-3 lg:justify-end">
                <span className={`text-[10px] font-black uppercase tracking-wider ${value ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {value ? 'Enabled' : 'Disabled'}
                </span>
                <Switch value={value} onChange={onChange} theme={theme} label={item.title} disabled={locked} />
            </div>
        </div>
    );
}

function Switch({ value, onChange, theme, label, disabled }: { value: boolean; onChange: (v: boolean) => void; theme: typeof THEME[ThemeColor]; label: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(!value)}
            role="switch"
            aria-checked={value}
            aria-label={label}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${theme.ring} ${disabled ? 'cursor-not-allowed bg-slate-200 opacity-60' : value ? `${theme.switch} cursor-pointer` : 'cursor-pointer bg-slate-300 hover:bg-slate-400'}`}
        >
            <span className={`pointer-events-none inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
    );
}

function MetricCard({ icon: Icon, label, value, description }: { icon: any; label: string; value: string; description: string }) {
    return (
        <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#12335f]/10 text-[#12335f]">
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

function PolicyLine({ title, description }: { title: string; description: string }) {
    return (
        <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
                <p className="text-xs font-black text-slate-900">{title}</p>
                <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-500">{description}</p>
            </div>
        </div>
    );
}
