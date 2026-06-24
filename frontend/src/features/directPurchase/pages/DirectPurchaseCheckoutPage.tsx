/**
 * @deprecated DirectPurchaseCheckoutPage — replaced by ProcurementCheckoutWizardV2.
 * Route /buyer/direct-purchase/checkout now redirects to /buyer/procurement/checkout.
 * This file is retained for reference; useful field patterns were moved to procurementCheckoutV2.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, MapPin, Calendar, FileText, CheckCircle2, ChevronRight, Plus, Building, Phone, Mail, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Loader2 } from '@/components/ui/loader';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useActiveCart } from '../../cart/hooks';
import { SearchableSelect, type SelectOption } from '../../../components/ui/SearchableSelect';
import { useAuth } from '../../../hooks/useAuth';
import { formatCurrency } from '../../shared/format';
import {
    fetchDeliveryAddresses,
    createDeliveryAddress,
    directPurchaseCheckout,
    sendDirectPurchaseToSeller,
    type DeliveryAddressDto
} from '../api';
import { STATE_OPTIONS, getDistrictOptions, getGstStateLabel } from '../../../data/indianLocations';

const DEPARTMENTS = [
    { value: 'Procurement & Purchase', label: 'Procurement & Purchase' },
    { value: 'Operations & Production', label: 'Operations & Production' },
    { value: 'Finance & Accounts', label: 'Finance & Accounts' },
    { value: 'Information Technology', label: 'Information Technology' },
    { value: 'Human Resources', label: 'Human Resources' },
    { value: 'Administration', label: 'Administration' },
    { value: 'Quality Assurance', label: 'Quality Assurance' },
    { value: 'Logistics & Supply Chain', label: 'Logistics & Supply Chain' },
    { value: 'Research & Development', label: 'Research & Development' }
];

const BUDGET_HEADS = [
    { value: 'Capital Expenditure (CAPEX)', label: 'Capital Expenditure (CAPEX)' },
    { value: 'Operational Expenditure (OPEX)', label: 'Operational Expenditure (OPEX)' },
    { value: 'Office Supplies & Stationery', label: 'Office Supplies & Stationery' },
    { value: 'IT Hardware & Software', label: 'IT Hardware & Software' },
    { value: 'Raw Materials & Spares', label: 'Raw Materials & Spares' },
    { value: 'Logistics & Transportation', label: 'Logistics & Transportation' },
    { value: 'Maintenance & Repairs', label: 'Maintenance & Repairs' },
    { value: 'Professional Services', label: 'Professional Services' }
];

const COST_CENTERS = [
    { value: 'CC-HQ-001 (Headquarters)', label: 'CC-HQ-001 (Headquarters)' },
    { value: 'CC-OPS-002 (Operations)', label: 'CC-OPS-002 (Operations)' },
    { value: 'CC-IT-003 (IT Dept)', label: 'CC-IT-003 (IT Dept)' },
    { value: 'CC-WH-004 (Warehouse)', label: 'CC-WH-004 (Warehouse)' },
    { value: 'CC-FACT-005 (Factory Site)', label: 'CC-FACT-005 (Factory Site)' }
];

export default function DirectPurchaseCheckoutPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data: cart, isLoading: isCartLoading, error: cartError } = useActiveCart();

    const [addresses, setAddresses] = useState<DeliveryAddressDto[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form inputs
    const [department, setDepartment] = useState<string | number | null>('');
    const [budgetHead, setBudgetHead] = useState<string | number | null>('');
    const [costCenter, setCostCenter] = useState<string | number | null>('');
    const [justification, setJustification] = useState('');
    const [remarks, setRemarks] = useState('');
    const [deliveryInstructions, setDeliveryInstructions] = useState('');
    const [requiredDeliveryDate, setRequiredDeliveryDate] = useState('');

    // New Address Form fields
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

    const loadAddresses = async () => {
        try {
            const data = await fetchDeliveryAddresses();
            setAddresses(data);
            const defaultAddress = data.find(a => a.isDefault);
            if (defaultAddress) {
                setSelectedAddressId(defaultAddress.id);
            } else if (data.length > 0) {
                setSelectedAddressId(data[0].id);
            }
        } catch (err: any) {
            console.error('Failed to load delivery addresses', err);
        }
    };

    useEffect(() => {
        loadAddresses();
    }, []);

    // Check if buyer has auto-approval capabilities
    const [isAutoApprove, setIsAutoApprove] = useState(false);
    useEffect(() => {
        if (user) {
            const checkRole = async () => {
                try {
                    // Fetch user organization membership from backend OR use user attributes if loaded
                    const profileData = await fetchDeliveryAddresses(); // wait, we can determine from user roles
                    const orgRole = (user as any).orgRole; // if injected by middleware
                    // Safe check: Admins/Procurement Officers have higher roles
                    if (user.role === 'admin' || user.role === 'master_admin') {
                        setIsAutoApprove(true);
                    }
                } catch (err) {
                    console.error(err);
                }
            };
            checkRole();
        }
    }, [user]);

    // Let's guess user capability based on their roles
    const displayRole = user?.role;
    const canBypassApproval = displayRole === 'admin' || displayRole === 'master_admin'; // Admin/Staff

    const cartItems = cart?.items || [];
    
    // Group cart items by seller
    const sellerGroupMap = new Map<number, typeof cartItems>();
    cartItems.forEach(item => {
        const group = sellerGroupMap.get(item.sellerId) || [];
        group.push(item);
        sellerGroupMap.set(item.sellerId, group);
    });

    // Calculates total cart value including GST
    const calculateTotals = () => {
        let subtotal = 0;
        let taxTotal = 0;

        cartItems.forEach(item => {
            const qty = Number(item.quantity);
            const price = Number(item.unitPrice);
            // Default tax rate to 18% if missing, or use product's tax rate
            const itemTaxRate = Number((item as any).product?.taxRate ?? (item as any).service?.taxRate ?? 18);
            const itemSubtotal = qty * price;
            const itemTax = itemSubtotal * (itemTaxRate / 100);

            subtotal += itemSubtotal;
            taxTotal += itemTax;
        });

        return {
            subtotal,
            taxTotal,
            total: subtotal + taxTotal
        };
    };

    const totals = calculateTotals();

    const handleCreateAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const newAddr = await createDeliveryAddress({
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
                isDefault: addresses.length === 0 // Make default if first address
            });
            toast.success('New delivery address added.');
            setIsAddressModalOpen(false);
            setAddresses(prev => [newAddr, ...prev]);
            setSelectedAddressId(newAddr.id);
        } catch (err: any) {
            toast.error(err.message || 'Failed to add address.');
        }
    };

    const handleCheckoutSubmit = async () => {
        if (!selectedAddressId) {
            toast.error('Please select a delivery address.');
            return;
        }
        if (!department) {
            toast.error('Please select or specify a department.');
            return;
        }
        if (!budgetHead) {
            toast.error('Please select or specify a budget head.');
            return;
        }
        if (!costCenter) {
            toast.error('Please select or specify a cost center.');
            return;
        }
        if (!justification.trim()) {
            toast.error('Please enter procurement justification.');
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                deliveryAddressId: selectedAddressId,
                department: String(department),
                budgetHead: String(budgetHead),
                costCenter: String(costCenter),
                justification,
                remarks: remarks || null,
                deliveryInstructions: deliveryInstructions || null,
                requiredDeliveryDate: requiredDeliveryDate || null
            };

            const createdDps = await directPurchaseCheckout(payload);

            // If user is admin/procurement officer, they can bypass approvals and send directly to seller
            if (canBypassApproval) {
                toast.loading('Sending direct purchase requests to sellers...');
                for (const dp of createdDps) {
                    await sendDirectPurchaseToSeller(dp.id);
                }
                toast.dismiss();
                toast.success('Direct purchases created and sent to sellers successfully!');
            } else {
                toast.success('Direct purchase submitted for approval chain.');
            }

            // Invalidate queries so that the direct purchase list and cart update immediately
            queryClient.invalidateQueries({ queryKey: ['direct-purchases'] });
            queryClient.invalidateQueries({ queryKey: ['cart'] });

            // Redirect to buyer purchases page or approvals page
            navigate('/buyer/direct-purchase');
        } catch (err: any) {
            toast.dismiss();
            toast.error(err.message || 'Direct purchase checkout failed.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const addressOptions: SelectOption[] = addresses.map(a => ({
        value: a.id,
        label: `${a.addressLabel} - ${a.addressLine1}, ${a.city} (${a.contactPersonName})`
    }));

    const selectedAddress = addresses.find(a => a.id === selectedAddressId);

    if (isCartLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
            </div>
        );
    }

    if (cartError || cartItems.length === 0) {
        return (
            <div className="max-w-xl mx-auto py-16 text-center space-y-4">
                <div className="rounded-full bg-slate-100 p-4 w-16 h-16 flex items-center justify-center mx-auto text-slate-400">
                    <ShoppingBag className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Your cart is empty</h2>
                <p className="text-sm font-semibold text-slate-500">
                    Add products or services from the marketplace to check out.
                </p>
                <Button onClick={() => navigate('/marketplace')} className="bg-[#12335f] text-white">
                    Go to Marketplace
                </Button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-8 p-4 md:p-6 animate-in fade-in duration-300">
            {/* Header banner */}
            <div className="border-b border-slate-200 pb-5">
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#12335f] tracking-tight">
                    Direct Purchase Checkout
                </h1>
                <p className="text-sm font-semibold text-slate-500 mt-1">
                    Complete direct purchase details, delivery coordinates, and procurement parameters.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Checkout Fields */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Delivery Address Card */}
                    <Card className="border-slate-200 shadow-sm" style={{ overflow: 'visible' }}>
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 min-w-0">
                                    <MapPin className="h-4.5 w-4.5 text-[#12335f] shrink-0" />
                                    <span className="text-sm font-extrabold text-slate-800 uppercase tracking-tight whitespace-nowrap">
                                        Delivery Details
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAddressModalOpen(true)}
                                    className="flex items-center gap-1 text-xs font-bold text-[#12335f] hover:text-[#12335f]/85 transition whitespace-nowrap shrink-0"
                                >
                                    <Plus className="h-3.5 w-3.5 shrink-0" />
                                    <span>Add New Address</span>
                                </button>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Select Delivery Address *
                                </label>
                                <SearchableSelect
                                    placeholder="Search saved addresses..."
                                    options={addressOptions}
                                    value={selectedAddressId}
                                    onChange={(val) => setSelectedAddressId(val ? Number(val) : null)}
                                />
                            </div>

                            {selectedAddress && (
                                <div className="rounded-lg border border-slate-150 bg-slate-50/50 p-4 text-xs font-semibold text-slate-750 space-y-2">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <span className="font-extrabold text-[#12335f]">
                                            {selectedAddress.addressLabel} ({selectedAddress.addressType})
                                        </span>
                                        {selectedAddress.organizationName && (
                                            <span className="text-[10px] font-black text-slate-500 uppercase">
                                                {selectedAddress.organizationName}
                                            </span>
                                        )}
                                    </div>
                                    <p>{selectedAddress.addressLine1}</p>
                                    {selectedAddress.addressLine2 && <p>{selectedAddress.addressLine2}</p>}
                                    <p className="font-black text-slate-900">
                                        {selectedAddress.city}, {selectedAddress.district}, {selectedAddress.state} - {selectedAddress.pincode}
                                    </p>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 text-slate-600 pt-1 text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <Building className="h-3.5 w-3.5 text-slate-400" />
                                            <span>Contact: {selectedAddress.contactPersonName}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                                            <span>Phone: {selectedAddress.mobileNumber}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Procurement & Budget Card */}
                    <Card className="border-slate-200 shadow-sm" style={{ overflow: 'visible' }}>
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4.5 w-4.5 text-[#12335f]" />
                                <span className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">
                                    Procurement Parameters
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Requesting Department *
                                    </label>
                                    <SearchableSelect
                                        options={DEPARTMENTS}
                                        value={department}
                                        onChange={setDepartment}
                                        placeholder="Select department..."
                                        allowOther
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Budget Head *
                                    </label>
                                    <SearchableSelect
                                        options={BUDGET_HEADS}
                                        value={budgetHead}
                                        onChange={setBudgetHead}
                                        placeholder="Select budget head..."
                                        allowOther
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Cost Center *
                                    </label>
                                    <SearchableSelect
                                        options={COST_CENTERS}
                                        value={costCenter}
                                        onChange={setCostCenter}
                                        placeholder="Select cost center..."
                                        allowOther
                                        allowNotApplicable
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Required Delivery Date
                                    </label>
                                    <Input
                                        type="date"
                                        className="h-11 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-900 focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                                        value={requiredDeliveryDate}
                                        onChange={e => setRequiredDeliveryDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    Procurement Justification *
                                </label>
                                <textarea
                                    className="flex w-full rounded-lg border border-slate-250 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    rows={3}
                                    placeholder="Explain why this direct purchase is required..."
                                    required
                                    value={justification}
                                    onChange={e => setJustification(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Delivery Instructions
                                    </label>
                                    <textarea
                                        className="flex w-full rounded-lg border border-slate-250 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        rows={2}
                                        placeholder="Special instructions for delivery (e.g. gates, contacts)..."
                                        value={deliveryInstructions}
                                        onChange={e => setDeliveryInstructions(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        General Remarks
                                    </label>
                                    <textarea
                                        className="flex w-full rounded-lg border border-slate-250 bg-white px-3 py-2 text-xs font-semibold text-slate-800 placeholder:text-slate-400 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:opacity-50"
                                        rows={2}
                                        placeholder="Any additional internal remarks..."
                                        value={remarks}
                                        onChange={e => setRemarks(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Cart Items List */}
                    <div className="space-y-3">
                        <span className="text-xs font-black uppercase tracking-widest text-[#12335f]">
                            Items to Purchase
                        </span>
                        
                        {Array.from(sellerGroupMap.entries()).map(([sellerId, items]) => {
                            const sellerName = items[0]?.seller?.name || `Seller #${sellerId}`;
                            return (
                                <Card key={sellerId} className="border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-[#12335f]/5 px-4 py-2 flex items-center justify-between border-b border-slate-200">
                                        <span className="text-xs font-extrabold text-[#12335f]">
                                            Seller: {sellerName}
                                        </span>
                                        <span className="text-[10px] font-black text-slate-500">
                                            {items.length} {items.length === 1 ? 'item' : 'items'}
                                        </span>
                                    </div>
                                    <CardContent className="p-0 divide-y divide-slate-100">
                                        {items.map(item => {
                                            const itemTaxRate = Number((item as any).product?.taxRate ?? (item as any).service?.taxRate ?? 18);
                                            const qty = Number(item.quantity);
                                            const price = Number(item.unitPrice);
                                            const lineTotalExclTax = qty * price;
                                            const lineTax = lineTotalExclTax * (itemTaxRate / 100);
                                            const lineTotalInclTax = lineTotalExclTax + lineTax;

                                            return (
                                                <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="space-y-1">
                                                        <h4 className="text-xs font-extrabold text-slate-800">
                                                            {item.itemName}
                                                        </h4>
                                                        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                                                            <span>Qty: {qty} {item.unitOfMeasure}</span>
                                                            <span>•</span>
                                                            <span>Unit Price: {formatCurrency(price)}</span>
                                                            <span>•</span>
                                                            <span>GST: {itemTaxRate}%</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-extrabold text-slate-900 block">
                                                            {formatCurrency(lineTotalInclTax)}
                                                        </span>
                                                        <span className="text-[9px] font-semibold text-slate-400 block">
                                                            excl. GST: {formatCurrency(lineTotalExclTax)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </div>

                {/* Summary Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-[#12335f]/20 bg-slate-50/50 shadow-md sticky top-6">
                        <CardContent className="p-5 space-y-6">
                            <span className="text-xs font-black uppercase tracking-widest text-[#12335f]">
                                Order Summary
                            </span>

                            <div className="space-y-3 text-xs font-semibold text-slate-650">
                                <div className="flex items-center justify-between">
                                    <span>Items Subtotal</span>
                                    <span>{formatCurrency(totals.subtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>GST Total (estimated)</span>
                                    <span>{formatCurrency(totals.taxTotal)}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-sm font-extrabold text-slate-900">
                                    <span>Total Value</span>
                                    <span>{formatCurrency(totals.total)}</span>
                                </div>
                            </div>

                            {/* Help box */}
                            <div className="rounded-lg bg-blue-50 border border-blue-150 p-3.5 space-y-2 text-xs font-semibold text-blue-800">
                                <h5 className="font-extrabold flex items-center gap-1.5 text-blue-900">
                                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                                    {canBypassApproval ? 'Direct Order Mode' : 'Approval Chain Required'}
                                </h5>
                                <p className="text-[11px] leading-relaxed">
                                    {canBypassApproval
                                        ? 'As an administrator/procurement officer, this direct purchase will bypass approvals and can be sent directly to the seller.'
                                        : `This direct purchase exceeds role limits. It will trigger a multi-stage approval queue (${totals.total < 50000 ? '2 stages' : '3 stages'}) before being sent to the seller.`}
                                </p>
                            </div>

                            <Button
                                disabled={isSubmitting}
                                onClick={handleCheckoutSubmit}
                                className="w-full h-11 text-xs font-black uppercase tracking-wider bg-[#12335f] hover:bg-[#12335f]/90 text-white flex items-center justify-center gap-1.5"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : canBypassApproval ? (
                                    'Send to Seller'
                                ) : (
                                    'Submit for Approval'
                                )}
                            </Button>

                            <button
                                onClick={() => navigate('/cart')}
                                className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700 transition"
                            >
                                Cancel and Return to Cart
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Address Modal */}
            {isAddressModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                            <h2 className="text-lg font-bold text-[#12335f]">
                                Add New Delivery Address
                            </h2>
                            <button
                                onClick={() => setIsAddressModalOpen(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-650"
                            >
                                <Plus className="h-5 w-5 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateAddress} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsAddressModalOpen(false)}
                                    className="h-10 text-xs font-bold border-slate-350 hover:bg-slate-50 text-slate-700"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="h-10 text-xs font-bold bg-[#12335f] hover:bg-[#12335f]/90 text-white"
                                >
                                    Save Address
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}