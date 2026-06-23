import React, { useEffect, useState } from 'react';
import FormField from './FormField';
import SearchableSelect from './SearchableSelect';
import { fetchDeliveryAddresses, type DeliveryAddressDto } from '../../../directPurchase/api';

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';

export default function ConsigneeForm({ data, updateField, errors }: { data: Record<string, any>; updateField: (field: string, value: any) => void; errors: Record<string, string[]> }) {
  const [addresses, setAddresses] = useState<DeliveryAddressDto[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingAddresses(true);
    fetchDeliveryAddresses()
      .then(res => {
        if (active) setAddresses(res || []);
      })
      .catch(err => {
        console.warn('Failed to load saved addresses:', err);
      })
      .finally(() => {
        if (active) setLoadingAddresses(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {addresses.length > 0 && (
        <FormField label="Select From Saved Addresses" className="md:col-span-2">
          <SearchableSelect
            placeholder={loadingAddresses ? "Loading addresses..." : "Search saved addresses..."}
            options={addresses.map(addr => ({
              value: String(addr.id),
              label: `${addr.addressLabel} - ${addr.addressLine1}, ${addr.city} (${addr.contactPersonName})`
            }))}
            value=""
            onChange={(val) => {
              if (!val) return;
              const selected = addresses.find(a => String(a.id) === String(val));
              if (selected) {
                updateField('consigneeName', selected.contactPersonName || selected.addressLabel);
                updateField('consigneeMobile', selected.mobileNumber);
                updateField('deliveryDistrict', selected.district);
                updateField('pincode', selected.pincode);
                const fullAddr = [
                  selected.addressLine1,
                  selected.addressLine2,
                  `${selected.city}, ${selected.district}, ${selected.state} - ${selected.pincode}`
                ].filter(Boolean).join(', ');
                updateField('deliveryAddress', fullAddr);
              }
            }}
            allowOther={false}
          />
        </FormField>
      )}

      {[
        ['consigneeName', 'Consignee Name'],
        ['consigneeDesignation', 'Consignee Designation'],
        ['consigneeMobile', 'Consignee Mobile'],
        ['deliveryDistrict', 'Delivery District'],
        ['pincode', 'PIN Code'],
      ].map(([field, label]) => (
        <FormField key={field} label={label} required error={errors[field]}>
          <input value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} />
        </FormField>
      ))}

      <FormField label="Delivery Period" required error={errors.deliveryPeriod}>
        <SearchableSelect
          value={data.deliveryPeriod}
          options={['15 Days', '30 Days', '45 Days', '60 Days', '90 Days', '120 Days', '180 Days']}
          onChange={value => updateField('deliveryPeriod', value)}
          allowOther
          placeholder="Select delivery period..."
        />
      </FormField>

      <FormField label="Delivery Address" required error={errors.deliveryAddress} className="md:col-span-2">
        <textarea value={data.deliveryAddress || ''} onChange={event => updateField('deliveryAddress', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15" />
      </FormField>
    </div>
  );
}
