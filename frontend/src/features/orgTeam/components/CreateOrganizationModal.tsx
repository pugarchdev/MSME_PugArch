/**
 * CreateOrganizationModal — lets a logged-in buyer/seller user without an
 * organisation self-create one (name + type + optional address). Becomes
 * ORG_ADMIN of the new org and unlocks cart/approval flows immediately.
 *
 * The created org starts as PENDING — it must still be approved by a
 * platform admin to lift the read-only banner, but cart/RFQ/PO flows that
 * only require an OrgMembership now work right away.
 *
 * Used from:
 *   - OrgApprovalBanner (when the user has no org yet)
 *   - CartPage's ORG_REQUIRED empty state
 */
import { useState } from 'react';
import { Building2, X } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { postApi } from '../../shared/apiClient';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { useAuth } from '../../../hooks/useAuth';
import { indiaStates, indiaStatesDistricts } from '../../../data/indiaStatesDistricts';

const ORG_TYPES: Array<{ value: string; label: string }> = [
    { value: 'STARTUP', label: 'Startup' },
    { value: 'MSME', label: 'MSME' },
    { value: 'PROPRIETORSHIP', label: 'Proprietorship' },
    { value: 'PARTNERSHIP', label: 'Partnership' },
    { value: 'PRIVATE_LIMITED', label: 'Private Limited' },
    { value: 'PUBLIC_LIMITED', label: 'Public Limited' },
    { value: 'LLP', label: 'LLP' },
    { value: 'TRUST', label: 'Trust' },
    { value: 'SOCIETY', label: 'Society' },
    { value: 'NGO', label: 'NGO' },
    { value: 'EDUCATIONAL_INSTITUTION', label: 'Educational Institution' },
    { value: 'GOVERNMENT', label: 'Government Department' },
    { value: 'PSU', label: 'PSU' }
];

interface CreateOrganizationModalProps {
    open: boolean;
    onClose: () => void;
    onCreated?: (org: { id: number; organizationName: string }) => void;
}

export function CreateOrganizationModal({ open, onClose, onCreated }: CreateOrganizationModalProps) {
    const { reload } = useOrgRole();
    const { refreshUser } = useAuth();
    const [submitting, setSubmitting] = useState(false);

    const [organizationName, setOrganizationName] = useState('');
    const [organizationType, setOrganizationType] = useState('STARTUP');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [pincode, setPincode] = useState('');
    const [addressLine1, setAddressLine1] = useState('');

    if (!open) return null;

    const reset = () => {
        setOrganizationName('');
        setOrganizationType('STARTUP');
        setCity('');
        setState('');
        setPincode('');
        setAddressLine1('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = organizationName.trim();
        if (name.length < 2) {
            toast.error('Organisation name is too short');
            return;
        }

        setSubmitting(true);
        try {
            const payload: Record<string, string> = {
                organizationName: name,
                organizationType
            };
            if (city.trim()) payload.city = city.trim();
            if (state.trim()) payload.state = state.trim();
            if (pincode.trim()) payload.pincode = pincode.trim();
            if (addressLine1.trim()) payload.addressLine1 = addressLine1.trim();

            const data = await postApi<{ organization: { id: number; organizationName: string }; orgRole: string }>(
                '/api/org/create-without-gst',
                payload
            );

            toast.success(`Organisation "${data.organization.organizationName}" created. You are now the Org Admin.`);

            // Refresh user + org context so the rest of the app picks up the new link
            await Promise.allSettled([refreshUser(), Promise.resolve(reload())]);

            onCreated?.(data.organization);
            reset();
            onClose();
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (/already exists/i.test(msg) || /already taken/i.test(msg)) {
                toast.error('This name is already taken. Pick a unique name or ask the existing admin to invite you.');
            } else if (/already linked|already belong|ALREADY_HAS_ORG/i.test(msg)) {
                toast.error('You already belong to an organisation.');
            } else {
                toast.error(msg || 'Failed to create organisation');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                            <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-widest">Create Organisation</h3>
                            <p className="mt-0.5 text-[10px] text-white/70">No GST yet? Start with the basics. You'll be the Org Admin.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10" type="button">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                        Your organisation will be created as <strong>Pending Verification</strong>.
                        You can use the cart and team management immediately. Some flows
                        (issuing POs, signing tenders) unlock once a platform admin approves.
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Organisation Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={organizationName}
                            onChange={e => setOrganizationName(e.target.value)}
                            placeholder="Acme Procurement Pvt Ltd"
                            maxLength={200}
                            required
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Organisation Type <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={organizationType}
                            onChange={e => setOrganizationType(e.target.value)}
                            required
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        >
                            {ORG_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Address (optional)</label>
                        <input
                            type="text"
                            value={addressLine1}
                            onChange={e => setAddressLine1(e.target.value)}
                            placeholder="Street / building / area"
                            maxLength={255}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">State</label>
                            <select
                                value={state}
                                onChange={e => {
                                    setState(e.target.value);
                                    setCity(''); // Clear city on state change
                                }}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                            >
                                <option value="">Select State</option>
                                {indiaStates.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">City</label>
                            <select
                                value={city}
                                onChange={e => setCity(e.target.value)}
                                disabled={!state}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                            >
                                <option value="">{state ? "Select City" : "Select State First"}</option>
                                {(indiaStatesDistricts[state] || []).map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Pincode</label>
                            <input
                                type="text"
                                value={pincode}
                                onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                maxLength={6}
                                inputMode="numeric"
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
                            Create Organisation
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
