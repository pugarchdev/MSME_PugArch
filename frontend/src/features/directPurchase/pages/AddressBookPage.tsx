import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, MapPin, Building, Phone, Mail, CheckCircle2, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Loader2 } from '@/components/ui/loader';
import {
    fetchDeliveryAddresses,
    createDeliveryAddress,
    updateDeliveryAddress,
    deleteDeliveryAddress,
    setAddressAsDefault,
    fetchAddressGroups,
    createAddressGroup,
    type DeliveryAddressDto,
    type AddressGroupDto
} from '../api';
import { STATE_OPTIONS, getDistrictOptions, getGstStateLabel } from '../../../data/indianLocations';

export default function AddressBookPage() {
    const [addresses, setAddresses] = useState<DeliveryAddressDto[]>([]);
    const [groups, setGroups] = useState<AddressGroupDto[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Address Modal State
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<DeliveryAddressDto | null>(null);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
    
    // Form fields
    const [addressLabel, setAddressLabel] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [contactPersonName, setContactPersonName] = useState('');
    const [mobileNumber, setMobileNumber] = useState('');
    const [alternateMobileNumber, setAlternateMobileNumber] = useState('');
    const [email, setEmail] = useState('');
    const [addressLine1, setAddressLine1] = useState('');
    const [addressLine2, setAddressLine2] = useState('');
    const [city, setCity] = useState('');
    const [district, setDistrict] = useState('');
    const [state, setState] = useState('');
    const [pincode, setPincode] = useState('');
    const [landmark, setLandmark] = useState('');
    const [gstState, setGstState] = useState('');
    const [placeOfSupply, setPlaceOfSupply] = useState('');
    const [addressType, setAddressType] = useState('OFFICE');
    const [isDefault, setIsDefault] = useState(false);

    // Auto-update GST state code and place of supply when state changes
    useEffect(() => {
        if (state) {
            const gstLabel = getGstStateLabel(state);
            setGstState(gstLabel);
            setPlaceOfSupply(state);
        }
    }, [state]);

    // Clear district when state changes
    const handleStateChange = (newState: string) => {
        setState(newState);
        setDistrict('');
        setCity('');
    };

    // Clear city when district changes
    const handleDistrictChange = (newDistrict: string) => {
        setDistrict(newDistrict);
        setCity('');
    };

    // Group Modal State
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [groupDescription, setGroupDescription] = useState('');
    const [isDefaultGroup, setIsDefaultGroup] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [addrData, groupData] = await Promise.all([
                fetchDeliveryAddresses(),
                fetchAddressGroups()
            ]);
            setAddresses(addrData);
            setGroups(groupData);
        } catch (err: any) {
            toast.error(err.message || 'Failed to load address data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleOpenAddAddress = (groupId?: number) => {
        setEditingAddress(null);
        setSelectedGroupId(groupId || null);
        setAddressLabel('');
        setOrganizationName('');
        setContactPersonName('');
        setMobileNumber('');
        setAlternateMobileNumber('');
        setEmail('');
        setAddressLine1('');
        setAddressLine2('');
        setCity('');
        setDistrict('');
        setState('');
        setPincode('');
        setLandmark('');
        setGstState('');
        setPlaceOfSupply('');
        setAddressType('OFFICE');
        setIsDefault(false);
        setIsAddressModalOpen(true);
    };

    const handleOpenEditAddress = (addr: DeliveryAddressDto) => {
        setEditingAddress(addr);
        setSelectedGroupId(addr.addressGroupId || null);
        setAddressLabel(addr.addressLabel || '');
        setOrganizationName(addr.organizationName || '');
        setContactPersonName(addr.contactPersonName || '');
        setMobileNumber(addr.mobileNumber || '');
        setAlternateMobileNumber(addr.alternateMobileNumber || '');
        setEmail(addr.email || '');
        setAddressLine1(addr.addressLine1 || '');
        setAddressLine2(addr.addressLine2 || '');
        setCity(addr.city || '');
        setDistrict(addr.district || '');
        setState(addr.state || '');
        setPincode(addr.pincode || '');
        setLandmark(addr.landmark || '');
        setGstState(addr.gstState || '');
        setPlaceOfSupply(addr.placeOfSupply || '');
        setAddressType(addr.addressType || 'OFFICE');
        setIsDefault(addr.isDefault || false);
        setIsAddressModalOpen(true);
    };

    const handleSaveAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        const payload = {
            addressGroupId: selectedGroupId,
            addressLabel,
            organizationName: organizationName || null,
            contactPersonName,
            mobileNumber,
            alternateMobileNumber: alternateMobileNumber || null,
            email: email || null,
            addressLine1,
            addressLine2: addressLine2 || null,
            city,
            district,
            state,
            pincode,
            landmark: landmark || null,
            gstState: gstState || null,
            placeOfSupply: placeOfSupply || null,
            addressType,
            isDefault
        };

        try {
            if (editingAddress) {
                await updateDeliveryAddress(editingAddress.id, payload);
                toast.success('Address updated successfully.');
            } else {
                await createDeliveryAddress(payload);
                toast.success('Address added successfully.');
            }
            setIsAddressModalOpen(false);
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to save address.');
        }
    };

    const handleDeleteAddress = async (id: number) => {
        if (!confirm('Are you sure you want to delete this address?')) return;
        try {
            await deleteDeliveryAddress(id);
            toast.success('Address deleted successfully.');
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to delete address.');
        }
    };

    const handleSetDefault = async (id: number) => {
        try {
            await setAddressAsDefault(id);
            toast.success('Default address updated.');
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to set default address.');
        }
    };

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await createAddressGroup({
                groupName,
                groupDescription: groupDescription || null,
                isDefaultGroup
            });
            toast.success('Address group created successfully.');
            setIsGroupModalOpen(false);
            setGroupName('');
            setGroupDescription('');
            setIsDefaultGroup(false);
            loadData();
        } catch (err: any) {
            toast.error(err.message || 'Failed to create address group.');
        }
    };

    if (loading && addresses.length === 0) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-6 animate-in fade-in duration-300">
            {/* Top Toolbar */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-[#12335f] tracking-tight">
                        Delivery Addresses
                    </h1>
                    <p className="text-sm font-semibold text-slate-500 mt-1">
                        Manage saved delivery locations and organized address books for procurement workflows.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setIsGroupModalOpen(true)}
                        variant="outline"
                        className="h-10 text-xs font-bold border-slate-350 hover:bg-slate-50 text-slate-700"
                    >
                        New Address Group
                    </Button>
                    <Button
                        onClick={() => handleOpenAddAddress()}
                        className="h-10 text-xs font-bold bg-[#12335f] hover:bg-[#12335f]/90 text-white"
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add New Address
                    </Button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar - Groups */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                        <span className="text-xs font-black uppercase tracking-widest text-[#12335f]">
                            Address Groups
                        </span>
                        <div className="space-y-1">
                            <button
                                onClick={() => setSelectedGroupId(null)}
                                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                                    selectedGroupId === null
                                        ? 'bg-[#12335f]/5 text-[#12335f]'
                                        : 'text-slate-650 hover:bg-slate-50'
                                }`}
                            >
                                <span>All Saved Addresses</span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                    {addresses.length}
                                </span>
                            </button>
                            
                            {groups.map(group => {
                                const groupAddressesCount = addresses.filter(a => a.addressGroupId === group.id).length;
                                return (
                                    <button
                                        key={group.id}
                                        onClick={() => setSelectedGroupId(group.id)}
                                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                                            selectedGroupId === group.id
                                                ? 'bg-[#12335f]/5 text-[#12335f]'
                                                : 'text-slate-650 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex flex-col items-start">
                                            <span className="truncate max-w-[120px]">{group.groupName}</span>
                                            {group.isDefaultGroup && (
                                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tight">
                                                    Default Group
                                                </span>
                                            )}
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                            {groupAddressesCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Addresses List */}
                <div className="lg:col-span-3 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-[#12335f]" />
                        </div>
                    ) : (
                        (() => {
                            const filteredAddresses = selectedGroupId === null
                                ? addresses
                                : addresses.filter(a => a.addressGroupId === selectedGroupId);

                            if (filteredAddresses.length === 0) {
                                return (
                                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                                        <MapPin className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                                        <h3 className="text-sm font-bold text-slate-700">No addresses saved</h3>
                                        <p className="text-xs text-slate-500 mt-1 mb-4">
                                            Add a saved delivery address to speed up direct purchase and quotation workflows.
                                        </p>
                                        <Button
                                            onClick={() => handleOpenAddAddress(selectedGroupId || undefined)}
                                            size="sm"
                                            className="bg-[#12335f] text-white hover:bg-[#12335f]/90"
                                        >
                                            Add Address
                                        </Button>
                                    </div>
                                );
                            }

                            return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {filteredAddresses.map(addr => (
                                        <Card key={addr.id} className={`overflow-hidden border transition-all hover:shadow-md ${
                                            addr.isDefault ? 'border-[#12335f] ring-2 ring-[#12335f]/5' : 'border-slate-200'
                                        }`}>
                                            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-700 uppercase tracking-widest">
                                                            {addr.addressType}
                                                        </span>
                                                        {addr.isDefault && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-250">
                                                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                                                Default
                                                            </span>
                                                        )}
                                                    </div>

                                                    <h3 className="text-sm font-extrabold text-[#12335f] mb-1">
                                                        {addr.addressLabel}
                                                    </h3>
                                                    {addr.organizationName && (
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-650 font-semibold mb-2">
                                                            <Building className="h-3.5 w-3.5 text-slate-400" />
                                                            <span>{addr.organizationName}</span>
                                                        </div>
                                                    )}

                                                    <div className="text-xs text-slate-700 font-semibold space-y-1">
                                                        <p>{addr.addressLine1}</p>
                                                        {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                                                        <p className="font-extrabold text-slate-900">
                                                            {addr.city}, {addr.district}, {addr.state} - {addr.pincode}
                                                        </p>
                                                        {addr.landmark && (
                                                            <p className="text-[11px] text-slate-500 italic">
                                                                Landmark: {addr.landmark}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="border-t border-slate-100 pt-3 mt-3 space-y-1.5 text-[11px] font-semibold text-slate-600">
                                                        <div className="flex items-center gap-1.5">
                                                            <Phone className="h-3.5 w-3.5 text-slate-450" />
                                                            <span>{addr.contactPersonName} — {addr.mobileNumber}</span>
                                                        </div>
                                                        {addr.email && (
                                                            <div className="flex items-center gap-1.5">
                                                                <Mail className="h-3.5 w-3.5 text-slate-450" />
                                                                <span>{addr.email}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between border-t border-slate-100 pt-3.5">
                                                    {!addr.isDefault ? (
                                                        <button
                                                            onClick={() => handleSetDefault(addr.id)}
                                                            className="text-xs font-bold text-slate-600 hover:text-[#12335f] transition"
                                                        >
                                                            Set as default
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs font-bold text-emerald-700">
                                                            Primary Address
                                                        </span>
                                                    )}
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleOpenEditAddress(addr)}
                                                            className="rounded-lg p-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#12335f] transition"
                                                        >
                                                            <Edit3 className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteAddress(addr.id)}
                                                            className="rounded-lg p-1.5 border border-slate-250 text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            );
                        })()
                    )}
                </div>
            </div>

            {/* Address Form Modal */}
            {isAddressModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                            <h2 className="text-lg font-bold text-[#12335f]">
                                {editingAddress ? 'Edit Delivery Address' : 'Add New Delivery Address'}
                            </h2>
                            <button
                                onClick={() => setIsAddressModalOpen(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                            >
                                <Plus className="h-5 w-5 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAddress} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Address Group
                                    </label>
                                    <select
                                        className="h-10 w-full rounded-lg border border-slate-250 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                                        value={selectedGroupId || ''}
                                        onChange={e => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
                                    >
                                        <option value="">General (No group)</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id}>{g.groupName}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Address Label *
                                    </label>
                                    <Input
                                        required
                                        placeholder="e.g. Headquarters, Warehouse A"
                                        value={addressLabel}
                                        onChange={e => setAddressLabel(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Organisation Name
                                    </label>
                                    <Input
                                        placeholder="Company / Department Name"
                                        value={organizationName}
                                        onChange={e => setOrganizationName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Address Type *
                                    </label>
                                    <select
                                        className="h-10 w-full rounded-lg border border-slate-250 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                                        value={['OFFICE', 'WAREHOUSE', 'PROJECT_SITE', 'FACTORY'].includes(addressType) ? addressType : 'OTHER'}
                                        onChange={e => setAddressType(e.target.value)}
                                    >
                                        <option value="OFFICE">Office</option>
                                        <option value="WAREHOUSE">Warehouse</option>
                                        <option value="PROJECT_SITE">Project Site</option>
                                        <option value="FACTORY">Factory</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>

                                {!['OFFICE', 'WAREHOUSE', 'PROJECT_SITE', 'FACTORY'].includes(addressType) && (
                                    <div className="space-y-1.5 mt-2 animate-in slide-in-from-top-1 duration-150">
                                        <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                            Specify Address Type *
                                        </label>
                                        <Input
                                            required
                                            placeholder="e.g. Temporary, SHG Center, Hub"
                                            value={addressType === 'OTHER' ? '' : addressType}
                                            onChange={e => setAddressType(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Contact Person Name *
                                    </label>
                                    <Input
                                        required
                                        placeholder="Receiver Name"
                                        value={contactPersonName}
                                        onChange={e => setContactPersonName(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Mobile Number *
                                    </label>
                                    <Input
                                        required
                                        type="tel"
                                        pattern="[0-9]{10,15}"
                                        minLength={10}
                                        maxLength={15}
                                        title="Mobile number must be between 10 and 15 digits"
                                        placeholder="10-digit Mobile Number"
                                        value={mobileNumber}
                                        onChange={e => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Alternate Mobile
                                    </label>
                                    <Input
                                        type="tel"
                                        pattern="[0-9]{10,15}"
                                        maxLength={15}
                                        title="Alternate mobile number must be between 10 and 15 digits"
                                        placeholder="Optional Mobile"
                                        value={alternateMobileNumber}
                                        onChange={e => setAlternateMobileNumber(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Email Address
                                    </label>
                                    <Input
                                        type="email"
                                        placeholder="Receiver Email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                    Address Line 1 *
                                </label>
                                <Input
                                    required
                                    placeholder="Building/Flat/Plot Number, Street Name"
                                    value={addressLine1}
                                    onChange={e => setAddressLine1(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                    Address Line 2
                                </label>
                                <Input
                                    placeholder="Locality, Sector, Area (Optional)"
                                    value={addressLine2}
                                    onChange={e => setAddressLine2(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        State *
                                    </label>
                                    <select
                                        required
                                        className="h-10 w-full rounded-lg border border-slate-250 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                                        value={state}
                                        onChange={e => handleStateChange(e.target.value)}
                                    >
                                        <option value="">Select State</option>
                                        {STATE_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        District *
                                    </label>
                                    <select
                                        required
                                        disabled={!state}
                                        className="h-10 w-full rounded-lg border border-slate-250 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                                        value={district}
                                        onChange={e => handleDistrictChange(e.target.value)}
                                    >
                                        <option value="">Select District</option>
                                        {getDistrictOptions(state).map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        City *
                                    </label>
                                    <Input
                                        required
                                        placeholder="Enter city / town / village"
                                        value={city}
                                        onChange={e => setCity(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Pincode *
                                    </label>
                                    <Input
                                        required
                                        pattern="[0-9]{6,10}"
                                        minLength={6}
                                        maxLength={10}
                                        title="Pincode must be between 6 and 10 digits"
                                        placeholder="6 digits"
                                        value={pincode}
                                        onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Landmark
                                    </label>
                                    <Input
                                        placeholder="Nearby popular spot"
                                        value={landmark}
                                        onChange={e => setLandmark(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        GST State Code
                                    </label>
                                    <Input
                                        placeholder="e.g. 27-Maharashtra"
                                        value={gstState}
                                        onChange={e => setGstState(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                        Place of Supply
                                    </label>
                                    <Input
                                        placeholder="e.g. Maharashtra"
                                        value={placeOfSupply}
                                        onChange={e => setPlaceOfSupply(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="isDefault"
                                    className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/15"
                                    checked={isDefault}
                                    onChange={e => setIsDefault(e.target.checked)}
                                />
                                <label htmlFor="isDefault" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                    Set as primary delivery address
                                </label>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsAddressModalOpen(false)}
                                    className="h-10 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-750"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="h-10 text-xs font-bold bg-[#12335f] hover:bg-[#12335f]/90 text-white"
                                >
                                    {editingAddress ? 'Update Address' : 'Save Address'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Address Group Modal */}
            {isGroupModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                            <h2 className="text-lg font-bold text-[#12335f]">
                                Create Address Group
                            </h2>
                            <button
                                onClick={() => setIsGroupModalOpen(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                            >
                                <Plus className="h-5 w-5 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateGroup} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                    Group Name *
                                </label>
                                <Input
                                    required
                                    placeholder="e.g. Western Zone, Site Offices"
                                    value={groupName}
                                    onChange={e => setGroupName(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-wider text-slate-750">
                                    Description
                                </label>
                                <textarea
                                    className="flex w-full rounded-lg border border-slate-250 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    rows={3}
                                    placeholder="Add detail about address group..."
                                    value={groupDescription}
                                    onChange={e => setGroupDescription(e.target.value)}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="isDefaultGroup"
                                    className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]/15"
                                    checked={isDefaultGroup}
                                    onChange={e => setIsDefaultGroup(e.target.checked)}
                                />
                                <label htmlFor="isDefaultGroup" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                    Set as default group
                                </label>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsGroupModalOpen(false)}
                                    className="h-10 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-755"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="h-10 text-xs font-bold bg-[#12335f] hover:bg-[#12335f]/90 text-white"
                                >
                                    Create Group
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}