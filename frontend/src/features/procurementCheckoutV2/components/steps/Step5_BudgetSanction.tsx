'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eye, FileText, Trash2, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { openFileAsset } from '../../../../lib/files';
import { uploadProcurementDocument } from '../../api';
import { formatCurrency } from '../../../shared/format';
import { Input, Select } from '../../../../components/ui/input';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { api, readJsonResponse, unwrapApiData } from '../../../../lib/api';
import { cn } from '../../../../lib/utils';
import type { CartDto } from '../../../cart/api';

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600 font-bold">*</span> : null;

function DocumentUploadField({
  label,
  description,
  fileId,
  fileName,
  error,
  required,
  onUploadSuccess,
  onRemove,
}: {
  label: string;
  description: string;
  fileId?: number;
  fileName?: string;
  error?: string;
  required?: boolean;
  onUploadSuccess: (fileId: number, fileName: string) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be 10MB or less');
      return;
    }
    setUploading(true);
    try {
      const res = await uploadProcurementDocument(file);
      const fileAssetId = Number(res.fileId || res.file?.id);
      const name = res.file?.originalName || file.name;
      onUploadSuccess(fileAssetId, name);
      toast.success(`${label} uploaded`);
    } catch (err: any) {
      toast.error(err?.message || 'File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800">
            {label}
            <RequiredMark required={required} />
          </p>
          <p className="text-[10px] text-slate-500 leading-normal">{description}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="hidden"
        />
        {fileName ? (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                openFileAsset(
                  { id: fileId!, fileAssetId: fileId!, originalName: fileName, mimeType: '' },
                  fileName
                )
              }
              className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-black uppercase text-[#12335f] hover:bg-slate-100"
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-150 bg-white text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        )}
      </div>
      {fileName && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 mt-1">
          <FileText className="h-3.5 w-3.5" /> {fileName}
        </div>
      )}
      {error && <p className="text-[10px] text-red-500 font-bold mt-1">{error}</p>}
    </div>
  );
}

export default function Step5_BudgetSanction({
  data,
  priceReasonability,
  onChange,
  onPriceChange,
  errors,
  highValue,
  cart,
  method,
  l1ComparisonId,
}: {
  data: Record<string, unknown>;
  priceReasonability: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  onPriceChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
  highValue?: boolean;
  cart?: CartDto;
  method?: string;
  l1ComparisonId?: number;
}) {
  const cartTotal =
    cart?.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0) ?? 0;

  const [overrideEstimatedPrice, setOverrideEstimatedPrice] = useState(
    Boolean(priceReasonability.estimatedPriceOverrideReason)
  );

  const [authorityDropdown, setAuthorityDropdown] = useState(() => {
    const val = String(data.approvingAuthority || '');
    if (!val) return '';
    const isStandard = ['Board of Directors', 'Managing Director / CEO', 'Financial Advisor / CFO', 'Executive Committee', 'Department Head / GM'].includes(val);
    return isStandard ? val : 'Other';
  });

  useEffect(() => {
    const val = String(data.approvingAuthority || '');
    if (!val) {
      setAuthorityDropdown('');
    } else {
      const isStandard = ['Board of Directors', 'Managing Director / CEO', 'Financial Advisor / CFO', 'Executive Committee', 'Department Head / GM'].includes(val);
      setAuthorityDropdown(isStandard ? val : 'Other');
    }
  }, [data.approvingAuthority]);

  const [l1Loading, setL1Loading] = useState(false);

  useEffect(() => {
    // If estimatedPrice is not set, initialize to cartTotal
    if (!priceReasonability.estimatedPrice) {
      onPriceChange('estimatedPrice', cartTotal);
    }
  }, [cartTotal, priceReasonability.estimatedPrice]);

  useEffect(() => {
    if (
      l1ComparisonId &&
      (method === 'L1_PURCHASE' || method === 'BID_FROM_CART' || method === 'RA_FROM_CART')
    ) {
      const loadL1 = async () => {
        setL1Loading(true);
        try {
          const res = await api.get(`/api/l1-comparisons/${l1ComparisonId}`);
          const body = await readJsonResponse(res);
          const comparison = unwrapApiData<any>(body);
          const rows = (comparison?.comparedSellers || []) as any[];
          const l1SellerId = comparison?.l1SellerId;
          const l1Total = rows
            .filter((r: any) => r.sellerId === l1SellerId)
            .reduce((sum: number, r: any) => sum + Number(r.totalPrice || 0), 0);
          if (l1Total > 0) {
            onPriceChange('portalL1Price', l1Total);
          }
        } catch (err) {
          console.error('Failed to load L1 Comparison price', err);
        } finally {
          setL1Loading(false);
        }
      };
      loadL1();
    }
  }, [l1ComparisonId, method]);

  const handleOverrideToggle = (checked: boolean) => {
    setOverrideEstimatedPrice(checked);
    if (!checked) {
      onPriceChange('estimatedPrice', cartTotal);
      onPriceChange('estimatedPriceOverrideReason', '');
    }
  };

  const isBudgetConfirmed = data.budgetAvailabilityConfirmed === 'Yes';
  const showL1Price =
    method === 'L1_PURCHASE' || method === 'BID_FROM_CART' || method === 'RA_FROM_CART';
  const isL1BidOrRa = method === 'BID_FROM_CART' || method === 'RA_FROM_CART';

  // Specific rule flags
  const isDirectPurchase = method === 'DIRECT_PURCHASE';
  const isPAC = method === 'PAC_PROCUREMENT';
  const isSingleSource = method === 'SINGLE_SOURCE';
  const isRepeatOrder = method === 'REPEAT_ORDER';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h2 className="text-lg font-black text-slate-950">Step 5 — Budget & Sanction</h2>
        <span className="text-xs font-bold text-slate-500">
          Total Payable Value: {formatCurrency(cartTotal)}
        </span>
      </div>

      {/* Budget Availability Confirmation */}
      <div className="max-w-md space-y-1">
        <label className="text-xs font-bold text-slate-700">
          Budget Availability Confirmed
          <RequiredMark required />
        </label>
        <SearchableSelect
          options={[
            { value: 'Yes', label: 'Yes' },
            { value: 'No', label: 'No' },
          ]}
          value={String(data.budgetAvailabilityConfirmed || 'Yes')}
          onChange={v => {
            onChange('budgetAvailabilityConfirmed', v);
            if (v === 'No') {
              toast.warning('Budget availability must be confirmed to proceed.');
            }
          }}
        />
        {errors.budgetAvailabilityConfirmed && (
          <p className="text-xs text-red-500 font-bold">{errors.budgetAvailabilityConfirmed}</p>
        )}
      </div>

      {!isBudgetConfirmed ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-bold">Budget Availability Required</p>
            <p className="mt-1 text-xs text-red-700 leading-normal">
              Budget availability must be confirmed before procurement submission. Next steps remain locked.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Budget Head & Schemes */}
          <div className="rounded-2xl border border-slate-150 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">
              Budget Booking Details
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Input
                  label="Budget Head / Scheme"
                  value={String(data.budgetHeadScheme || '')}
                  onChange={e => onChange('budgetHeadScheme', e.target.value)}
                  error={errors.budgetHeadScheme}
                  placeholder="e.g. 2401-00-104-0010 (Optional)"
                />
              </div>

              <div className="space-y-1">
                <Select
                  label="Financial Year"
                  required
                  value={String(data.financialYear || '2026-27')}
                  onChange={e => onChange('financialYear', e.target.value)}
                  error={errors.financialYear}
                >
                  <option value="2026-27">2026-27</option>
                  <option value="2025-26">2025-26</option>
                  <option value="2024-25">2024-25</option>
                </Select>
              </div>

              <div className="space-y-1">
                <Select
                  label="Fund Source / Grant Type"
                  required
                  value={String(data.fundSource || 'Department Budget')}
                  onChange={e => onChange('fundSource', e.target.value)}
                  error={errors.fundSource}
                >
                  <option value="Department Budget">Department Budget</option>
                  <option value="Scheme Fund">Scheme Fund</option>
                  <option value="Grant Fund">Grant Fund</option>
                  <option value="CSR Fund">CSR Fund</option>
                  <option value="Internal Fund">Internal Fund</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Input
                  label="Sanction Amount"
                  required
                  type="number"
                  value={String(data.sanctionAmount || '')}
                  onChange={e => onChange('sanctionAmount', e.target.value.replace(/-/g, ''))}
                  error={errors.sanctionAmount}
                  placeholder="Enter sanctioned budget amount"
                />
                <p className="text-[10px] text-slate-500 font-semibold leading-normal">
                  Must be greater than or equal to total payable amount: {formatCurrency(cartTotal)}
                </p>
              </div>

              <DocumentUploadField
                label="Budget Approval / Fund Availability Certificate"
                description="Upload approved budget document or fund certificate (PDF/JPG/PNG)"
                required
                fileId={Number(data.budgetApprovalDocumentId || 0) || undefined}
                fileName={String(data.budgetApprovalDocumentName || '') || undefined}
                error={errors.budgetApprovalDocumentId}
                onUploadSuccess={(id, name) => {
                  onChange('budgetApprovalDocumentId', id);
                  onChange('budgetApprovalDocumentName', name);
                }}
                onRemove={() => {
                  onChange('budgetApprovalDocumentId', null);
                  onChange('budgetApprovalDocumentName', '');
                }}
              />
            </div>
          </div>

          {/* Sanction Details */}
          <div className="rounded-2xl border border-slate-150 bg-white p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">
              Administrative Sanction Order
            </h3>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Input
                  label="Sanction Order Number"
                  value={String(data.sanctionOrderNumber || '')}
                  onChange={e => onChange('sanctionOrderNumber', e.target.value)}
                  error={errors.sanctionOrderNumber}
                  placeholder="Leave empty if pending approval"
                />
              </div>

              <div className="space-y-1">
                <Input
                  label="Sanction Date"
                  required={Boolean(data.sanctionOrderNumber)}
                  type="date"
                  value={String(data.sanctionDate || '')}
                  onChange={e => onChange('sanctionDate', e.target.value)}
                  error={errors.sanctionDate}
                />
              </div>

              <div className="space-y-1">
                <Select
                  label="Approving Authority"
                  required={Boolean(data.sanctionOrderNumber)}
                  value={authorityDropdown}
                  onChange={e => {
                    const val = e.target.value;
                    setAuthorityDropdown(val);
                    if (val === 'Other') {
                      onChange('approvingAuthority', '');
                    } else {
                      onChange('approvingAuthority', val);
                    }
                  }}
                  error={errors.approvingAuthority && authorityDropdown !== 'Other' ? errors.approvingAuthority : undefined}
                >
                  <option value="">Select Authority...</option>
                  <option value="Board of Directors">Board of Directors</option>
                  <option value="Managing Director / CEO">Managing Director / CEO</option>
                  <option value="Financial Advisor / CFO">Financial Advisor / CFO</option>
                  <option value="Executive Committee">Executive Committee</option>
                  <option value="Department Head / GM">Department Head / GM</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
            </div>

            {authorityDropdown === 'Other' && (
              <div className="max-w-md space-y-1">
                <Input
                  label="Specify Approving Authority"
                  required={Boolean(data.sanctionOrderNumber)}
                  value={
                    !['Board of Directors', 'Managing Director / CEO', 'Financial Advisor / CFO', 'Executive Committee', 'Department Head / GM'].includes(String(data.approvingAuthority))
                      ? String(data.approvingAuthority || '')
                      : ''
                  }
                  onChange={e => onChange('approvingAuthority', e.target.value)}
                  error={errors.approvingAuthority}
                  placeholder="e.g. Deputy Secretary, Section Officer"
                />
              </div>
            )}

            {data.sanctionOrderNumber ? (
              <div className="max-w-md">
                <DocumentUploadField
                  label="Sanction Order Upload"
                  description="Upload official administrative sanction order copy (PDF/JPG/PNG)"
                  required
                  fileId={Number(data.sanctionOrderDocumentId || 0) || undefined}
                  fileName={String(data.sanctionOrderDocumentName || '') || undefined}
                  error={errors.sanctionOrderDocumentId}
                  onUploadSuccess={(id, name) => {
                    onChange('sanctionOrderDocumentId', id);
                    onChange('sanctionOrderDocumentName', name);
                  }}
                  onRemove={() => {
                    onChange('sanctionOrderDocumentId', null);
                    onChange('sanctionOrderDocumentName', '');
                  }}
                />
              </div>
            ) : (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs text-blue-800 leading-relaxed">
                  <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-bold">Sanction order pending</p>
                    <p className="mt-0.5 font-semibold text-blue-700">
                      You can proceed to submit using a Proposal Approval Note. Provide Approval Note details below.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Approval Note / Justification
                    <RequiredMark required />
                  </label>
                  <textarea
                    rows={3}
                    value={String(data.approvalNote || '')}
                    onChange={e => onChange('approvalNote', e.target.value)}
                    placeholder="Enter details of pending sanction status and administrative justification..."
                    className={cn(
                      "w-full rounded-lg border border-slate-200 bg-slate-100/50 p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#12335f] transition-all",
                      errors.approvalNote && "border-red-500 bg-red-50/30 focus:ring-red-500"
                    )}
                  />
                  {errors.approvalNote && (
                    <p className="text-xs text-red-500 font-bold">{errors.approvalNote}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Price Reasonability */}
          <div className="rounded-2xl border border-slate-150 bg-white p-5 shadow-2xs space-y-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">
              Price Reasonability & Estimation
            </h3>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/30 p-4">
                <div className="space-y-1">
                  <Input
                    label="Estimated Price"
                    required
                    disabled={!overrideEstimatedPrice}
                    type="number"
                    value={String(priceReasonability.estimatedPrice || '')}
                    onChange={e => onPriceChange('estimatedPrice', e.target.value.replace(/-/g, ''))}
                    error={errors.estimatedPrice}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overrideEstimatedPrice}
                    onChange={e => handleOverrideToggle(e.target.checked)}
                  />
                  Override auto-calculated estimated price
                </label>

                {overrideEstimatedPrice && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">
                      Estimated Price Override Reason
                      <RequiredMark required />
                    </label>
                    <textarea
                      rows={2}
                      value={String(priceReasonability.estimatedPriceOverrideReason || '')}
                      onChange={e => onPriceChange('estimatedPriceOverrideReason', e.target.value)}
                      placeholder="Explain why the estimated price differs from the cart total..."
                      className={cn(
                        "w-full rounded-lg border border-slate-200 bg-slate-100/50 p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#12335f] transition-all",
                        errors.estimatedPriceOverrideReason && "border-red-500 bg-red-50/30"
                      )}
                    />
                    {errors.estimatedPriceOverrideReason && (
                      <p className="text-xs text-red-500 font-bold">{errors.estimatedPriceOverrideReason}</p>
                    )}
                  </div>
                )}
              </div>

              {showL1Price && (
                <div className="flex flex-col justify-center rounded-xl border border-slate-100 bg-slate-50/30 p-4 space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Portal L1 Price
                  </label>
                  {l1Loading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />
                      Loading L1 comparison details...
                    </div>
                  ) : isL1BidOrRa && !l1ComparisonId ? (
                    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 mt-1">
                      Will be available after bid evaluation / RA completion
                    </div>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-950 mt-1">
                      {priceReasonability.portalL1Price
                        ? formatCurrency(Number(priceReasonability.portalL1Price))
                        : 'L1 price not calculated. Run L1 comparison in Step 4 first.'}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Input
                  label="Last Purchase Price"
                  required={isRepeatOrder}
                  type="number"
                  value={String(priceReasonability.lastPurchasePrice || '')}
                  onChange={e => onPriceChange('lastPurchasePrice', e.target.value.replace(/-/g, ''))}
                  error={errors.lastPurchasePrice}
                  placeholder="Enter previous purchase price"
                />
              </div>

              <div className="space-y-1">
                <Input
                  label="Market Comparison Price"
                  required={isDirectPurchase || isSingleSource || isPAC}
                  type="number"
                  value={String(priceReasonability.marketComparisonPrice || '')}
                  onChange={e =>
                    onPriceChange('marketComparisonPrice', e.target.value.replace(/-/g, ''))
                  }
                  error={errors.marketComparisonPrice}
                  placeholder="Enter average external market price"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">
                Price Reasonability Remarks
                <RequiredMark required={isDirectPurchase || isPAC || isSingleSource || isRepeatOrder || highValue} />
              </label>
              <textarea
                rows={3}
                value={String(priceReasonability.priceReasonabilityRemarks || '')}
                onChange={e => onPriceChange('priceReasonabilityRemarks', e.target.value)}
                placeholder="Describe how the pricing was evaluated as fair and reasonable..."
                className={cn(
                  "w-full rounded-lg border border-slate-200 bg-slate-100/50 p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#12335f] transition-all",
                  errors.priceReasonabilityRemarks && "border-red-500 bg-red-50/30 focus:ring-red-500"
                )}
              />
              {errors.priceReasonabilityRemarks && (
                <p className="text-xs text-red-500 font-bold">{errors.priceReasonabilityRemarks}</p>
              )}
            </div>
          </div>

          {/* Department Remarks */}
          <div className="rounded-2xl border border-slate-150 bg-white p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">
              Department Remarks
            </h3>
            <div className="space-y-1">
              <textarea
                rows={2}
                value={String(data.departmentRemarks || '')}
                onChange={e => onChange('departmentRemarks', e.target.value)}
                placeholder="Enter any additional office notes or department remarks (optional)..."
                className="w-full rounded-lg border border-slate-200 bg-slate-100/50 p-2.5 text-xs outline-none focus:ring-2 focus:ring-[#12335f]"
              />
            </div>
          </div>

          {/* Budget & Sanction Notes */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-slate-700">
            <p className="font-black uppercase tracking-wide text-[#12335f]">Budget & Sanction notes</p>
            <p><strong>Budget Head / Scheme:</strong> Specify the official accounting classification code (e.g. Major Head to Object Head) under which the expenditure is booked. If not yet assigned, you may leave this field empty.</p>
            <p><strong>Sanction Order Number:</strong> Enter the formal administrative approval number if issued. If sanction is currently pending, leave blank and provide the Approval Note detailing progress instead.</p>
          </div>
        </>
      )}
    </div>
  );
}
