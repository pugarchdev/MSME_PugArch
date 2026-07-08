'use client';

import { Input } from '../../../../components/ui/input';
import { SearchableSelect } from '../common/SearchableSelect';
import { DELIVERY_PERIOD_OPTIONS, INSPECTION_TYPE_OPTIONS } from '../../constants';

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600">*</span> : null;

export default function Step3_ConsigneeDelivery({
  consignee,
  delivery,
  onConsigneeChange,
  onDeliveryChange,
  errors,
}: {
  consignee: Record<string, unknown>;
  delivery: Record<string, unknown>;
  onConsigneeChange: (field: string, value: unknown) => void;
  onDeliveryChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 3 — Consignee & Delivery</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold">Consignee Type</label>
          <SearchableSelect
            options={[{ value: 'Single', label: 'Single' }, { value: 'Multiple', label: 'Multiple' }]}
            value={String(consignee.consigneeType || 'Single')}
            onChange={v => onConsigneeChange('consigneeType', v)}
          />
        </div>
        {['consigneeName', 'consigneeDesignation', 'consigneeMobile', 'consigneeEmail'].map(field => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{field.replace(/([A-Z])/g, ' $1')}<RequiredMark required={field === 'consigneeName'} /></label>
            <Input value={String(consignee[field] || '')} onChange={e => onConsigneeChange(field, e.target.value)} />
          </div>
        ))}
        {['deliveryAddress', 'district', 'taluka', 'city', 'pinCode'].map(field => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{field.replace(/([A-Z])/g, ' $1')}<RequiredMark required={field === 'deliveryAddress' || field === 'pinCode'} /></label>
            <Input
              value={String(delivery[field] || consignee[field] || '')}
              onChange={e => onDeliveryChange(field, e.target.value)}
              className={errors[field] ? 'border-red-400' : ''}
            />
            {errors[field] && <p className="text-[10px] text-red-600">{errors[field]}</p>}
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-xs font-bold">Delivery Period</label>
          <SearchableSelect
            options={DELIVERY_PERIOD_OPTIONS.map(o => ({ value: o, label: o }))}
            value={String(delivery.deliveryPeriod || '30 Days')}
            onChange={v => onDeliveryChange('deliveryPeriod', v)}
            allowOther
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold">Inspection Type</label>
          <SearchableSelect
            options={INSPECTION_TYPE_OPTIONS.map(o => ({ value: o, label: o }))}
            value={String(delivery.inspectionType || 'Department Inspection')}
            onChange={v => onDeliveryChange('inspectionType', v)}
          />
        </div>
      </div>
    </div>
  );
}
