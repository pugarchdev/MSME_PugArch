'use client';

import React from 'react';
import {
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Gavel,
  Info,
  Layers,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  Users,
  AlertTriangle,
  Upload,
  UserCheck,
  Clock,
  ExternalLink,
  Award,
  Globe
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../../components/ui/button';

// Helper to format currency
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

// ─────────────────────────────────────────────────────────────────────────────
// 1. ProcurementStepper
// ─────────────────────────────────────────────────────────────────────────────
export interface StepperStep {
  id: string;
  label: string;
  description?: string;
  icon?: any;
}

interface ProcurementStepperProps {
  steps: StepperStep[];
  currentStep: number;
  completedSteps: string[];
  onStepClick?: (idx: number) => void;
  disabledFutureSteps?: boolean;
}

export function ProcurementStepper({
  steps,
  currentStep,
  completedSteps,
  onStepClick,
  disabledFutureSteps = false
}: ProcurementStepperProps) {
  return (
    <nav className="space-y-1.5 rounded-[22px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
      {steps.map((step, idx) => {
        const isActive = idx === currentStep;
        const isCompleted = completedSteps.includes(step.id) || idx < currentStep;
        const isDisabled = disabledFutureSteps && idx > currentStep;
        const Icon = step.icon || ClipboardList;

        return (
          <button
            key={step.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onStepClick && !isDisabled && onStepClick(idx)}
            className={cn(
              "w-full flex items-start gap-3 rounded-2xl p-2.5 text-left transition",
              isActive ? "bg-[#12335f]/10 ring-1 ring-[#12335f]/15" : "hover:bg-slate-50",
              isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
            )}
          >
            <span className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition",
              isActive ? "bg-[#12335f] border-[#12335f] text-white" :
              isCompleted ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
              "bg-white border-slate-200 text-slate-455"
            )}>
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-xs font-black tracking-tight truncate leading-tight", isActive ? "text-slate-900" : "text-slate-700")}>
                {step.label}
              </p>
              {step.description && (
                <p className="text-[9px] text-slate-400 truncate mt-0.5 font-semibold leading-none">{step.description}</p>
              )}
            </div>
          </button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ProcurementMethodCard
// ─────────────────────────────────────────────────────────────────────────────
interface ProcurementMethodCardProps {
  title: string;
  subtitle: string;
  icon: any;
  complexity: 'Low' | 'Medium' | 'High';
  estimatedTime: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  isRecommended?: boolean;
  onSelect: () => void;
  fitCriteria?: string[];
}

export function ProcurementMethodCard({
  title,
  subtitle,
  icon: Icon,
  complexity,
  estimatedTime,
  isSelected = false,
  isDisabled = false,
  isRecommended = false,
  onSelect,
  fitCriteria = []
}: ProcurementMethodCardProps) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "flex h-full w-full flex-col justify-between rounded-[22px] border-0 bg-white/95 p-4 text-left shadow-3xs ring-1 ring-slate-200/70 transition",
        isSelected ? "ring-2 ring-[#12335f]/35 shadow-[0_14px_34px_rgba(18,51,95,0.12)]" : "hover:ring-[#12335f]/25 hover:shadow-sm",
        isDisabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "cursor-pointer"
      )}
    >
      <div className="w-full">
        <div className="flex items-start justify-between gap-2">
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
            isSelected ? "bg-[#12335f] text-white border-[#12335f]" : "bg-slate-50 border-slate-200 text-slate-500"
          )}>
            <Icon className="h-4.5 w-4.5" />
          </span>
          {isRecommended && (
            <span className="bg-amber-100 text-amber-800 font-extrabold uppercase text-[8px] px-2 py-0.5 rounded leading-none border border-amber-200 animate-pulse">
              Recommended
            </span>
          )}
        </div>

        <div className="mt-3">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide leading-tight truncate">{title}</h3>
          <p className="text-[10px] text-slate-500 leading-normal mt-1 min-h-[30px] line-clamp-2 font-medium">{subtitle}</p>
        </div>

        {fitCriteria.length > 0 && (
          <ul className="mt-3 space-y-1 text-[9px] font-semibold text-slate-400 border-t border-slate-100 pt-2">
            {fitCriteria.slice(0, 2).map((fit, i) => (
              <li key={i} className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="truncate">{fit}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="w-full flex items-center justify-between mt-4 pt-2 border-t border-slate-100 text-[9px] font-bold text-slate-450">
        <span>Complexity: <strong className="text-slate-800">{complexity}</strong></span>
        <span>Est. Time: <strong className="text-slate-800">{estimatedTime}</strong></span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ProcurementStatusBadge
// ─────────────────────────────────────────────────────────────────────────────
interface ProcurementStatusBadgeProps {
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'OPEN' | 'CLOSED' | 'AWARDED' | 'REJECTED' | 'CANCELLED' | string;
}

export function ProcurementStatusBadge({ status }: ProcurementStatusBadgeProps) {
  const norm = String(status || '').toUpperCase().trim();
  let style = 'bg-slate-50 text-slate-700 border-slate-200';

  if (norm === 'DRAFT') {
    style = 'bg-slate-100 text-slate-700 border-slate-300';
  } else if (norm === 'PENDING_APPROVAL') {
    style = 'bg-amber-50 text-amber-800 border-amber-200';
  } else if (norm === 'APPROVED') {
    style = 'bg-emerald-50 text-emerald-800 border-emerald-250';
  } else if (norm === 'PUBLISHED' || norm === 'OPEN') {
    style = 'bg-blue-50 text-blue-800 border-blue-200';
  } else if (norm === 'AWARDED') {
    style = 'bg-emerald-100 text-emerald-900 border-emerald-300';
  } else if (norm === 'CLOSED') {
    style = 'bg-slate-100 text-slate-800 border-slate-300';
  } else if (norm === 'REJECTED' || norm === 'CANCELLED') {
    style = 'bg-rose-50 text-rose-800 border-rose-200';
  }

  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider leading-none", style)}>
      {norm.replace(/_/g, ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. BuyerTypeBadge
// ─────────────────────────────────────────────────────────────────────────────
interface BuyerTypeBadgeProps {
  buyerType: 'PRIVATE_BUYER' | 'GOVERNMENT_BUYER' | string;
}

export function BuyerTypeBadge({ buyerType }: BuyerTypeBadgeProps) {
  const isGov = String(buyerType || '').toUpperCase().includes('GOVT') || String(buyerType || '').toUpperCase().includes('GOVERNMENT');
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded border text-[8.5px] font-black uppercase tracking-wider leading-none",
      isGov ? "bg-amber-50 text-amber-850 border-amber-250" : "bg-indigo-50 text-indigo-850 border-indigo-250"
    )}>
      {isGov ? 'Government Buyer' : 'Private Buyer'}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MethodBadge
// ─────────────────────────────────────────────────────────────────────────────
interface MethodBadgeProps {
  method: string;
}

export function MethodBadge({ method }: MethodBadgeProps) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase leading-none text-slate-650">
      {String(method || '').replace(/_/g, ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SectionCard
// ─────────────────────────────────────────────────────────────────────────────
interface SectionCardProps {
  title: string;
  description?: string;
  icon?: any;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  rightAction,
  className
}: SectionCardProps) {
  return (
    <div className={cn("space-y-4 rounded-[24px] border-0 bg-white/95 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-100">
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide leading-none">{title}</h3>
            {description && (
              <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-none">{description}</p>
            )}
          </div>
        </div>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. StickyActionBar
// ─────────────────────────────────────────────────────────────────────────────
interface StickyActionBarProps {
  onBack?: () => void;
  onSaveDraft?: () => void;
  onContinue?: () => void;
  onSubmit?: () => void;
  backText?: string;
  continueText?: string;
  saveText?: string;
  submitText?: string;
  isSaving?: boolean;
  isSubmitting?: boolean;
  disableContinue?: boolean;
  showSubmit?: boolean;
}

export function StickyActionBar({
  onBack,
  onSaveDraft,
  onContinue,
  onSubmit,
  backText = 'Back',
  continueText = 'Save & Continue',
  saveText = 'Save Draft',
  submitText = 'Submit & Publish',
  isSaving = false,
  isSubmitting = false,
  disableContinue = false,
  showSubmit = false
}: StickyActionBarProps) {
  return (
    <div className="sticky bottom-4 z-50 flex items-center justify-between rounded-[22px] border-0 bg-white/95 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.14)] ring-1 ring-slate-200/70 backdrop-blur">
      <Button
        variant="outline"
        onClick={onBack}
        className="h-10 px-5 text-slate-700"
        type="button"
      >
        {backText}
      </Button>

      <div className="flex items-center gap-2">
        {onSaveDraft && (
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={isSaving}
            className="h-10 text-slate-650"
            type="button"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {saveText}
          </Button>
        )}

        {showSubmit && onSubmit ? (
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="h-10 bg-[#12335f] text-white hover:bg-[#0b2445] px-6"
            type="button"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {submitText}
          </Button>
        ) : (
          onContinue && (
            <Button
              onClick={onContinue}
              disabled={disableContinue || isSaving}
              className="h-10 bg-[#12335f] text-white hover:bg-[#0b2445] px-6"
              type="button"
            >
              {continueText}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. EmptyState
// ─────────────────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  title: string;
  description: string;
  icon?: any;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon: Icon = FolderOpenEmptyIcon,
  actionText,
  onAction,
  className
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 border border-slate-200 mb-3.5">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">{title}</h3>
      <p className="text-[10px] text-slate-500 font-semibold max-w-sm mt-1 leading-normal">{description}</p>
      {actionText && onAction && (
        <Button
          size="sm"
          onClick={onAction}
          className="mt-4 bg-[#12335f] text-white text-[10px] uppercase font-black"
        >
          {actionText}
        </Button>
      )}
    </div>
  );
}

function FolderOpenEmptyIcon(props: any) {
  return <ClipboardList {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. BOQTable
// ─────────────────────────────────────────────────────────────────────────────
export interface BOQRow {
  srNo: number;
  description: string;
  category: string;
  quantity: number;
  uom: string;
  estimatedRate: number;
  taxPercent: number;
  total: number;
  remarks: string;
}

interface BOQTableProps {
  rows: BOQRow[];
  onChange: (idx: number, key: keyof BOQRow, val: any) => void;
  onAddRow: () => void;
  onDuplicateRow: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  estimatedTotal: number;
}

export function BOQTable({
  rows,
  onChange,
  onAddRow,
  onDuplicateRow,
  onDeleteRow,
  estimatedTotal
}: BOQTableProps) {
  const tableInput = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/15';

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-center w-14">Sr</th>
              <th className="px-3 py-2">Item Description</th>
              <th className="px-3 py-2 w-28">Category</th>
              <th className="px-3 py-2 w-24">UOM</th>
              <th className="px-3 py-2 w-20">Quantity</th>
              <th className="px-3 py-2 w-28">Est. Rate (INR)</th>
              <th className="px-3 py-2 w-20">Tax %</th>
              <th className="px-3 py-2 w-32 text-right">Total</th>
              <th className="px-3 py-2 w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold">
            {rows.map((row, idx) => (
              <tr key={idx} className="align-middle hover:bg-slate-50/50">
                <td className="px-3 py-1 text-center text-slate-400">{row.srNo}</td>
                <td className="px-3 py-1">
                  <input
                    value={row.description}
                    onChange={e => onChange(idx, 'description', e.target.value)}
                    className={tableInput}
                    placeholder="Describe item specifications"
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    value={row.category}
                    onChange={e => onChange(idx, 'category', e.target.value)}
                    className={tableInput}
                    placeholder="General"
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    value={row.uom}
                    onChange={e => onChange(idx, 'uom', e.target.value)}
                    className={tableInput}
                    placeholder="Nos, KG..."
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    value={row.quantity || ''}
                    onChange={e => onChange(idx, 'quantity', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    value={row.estimatedRate || ''}
                    onChange={e => onChange(idx, 'estimatedRate', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1">
                  <input
                    type="number"
                    value={row.taxPercent || ''}
                    onChange={e => onChange(idx, 'taxPercent', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1 text-right font-black text-slate-900">
                  {formatCurrency(row.total)}
                </td>
                <td className="px-3 py-1 text-right space-x-1.5">
                  <button
                    type="button"
                    title="Duplicate line"
                    onClick={() => onDuplicateRow(idx)}
                    className="p-1.5 text-slate-400 hover:text-[#12335f] hover:bg-slate-100 rounded"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete line"
                    onClick={() => onDeleteRow(idx)}
                    disabled={rows.length === 1}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center bg-slate-50 p-3.5 rounded-lg border border-slate-200 font-bold text-xs">
        <Button type="button" size="sm" variant="outline" onClick={onAddRow} className="h-8 text-slate-700">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add BOQ Row
        </Button>
        <span className="text-sm font-extrabold text-[#12335f]">
          BOQ Total Value: {formatCurrency(estimatedTotal)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. SupplierSelector
// ─────────────────────────────────────────────────────────────────────────────
export interface Supplier {
  id: number;
  organizationName: string;
  msmeCategory?: string;
  officeCity?: string;
  rating?: string | number;
  pastOrdersCount?: number;
  onTimeDeliveryRate?: number;
  gstVerified?: boolean;
}

interface SupplierSelectorProps {
  suppliers: Supplier[];
  invitedIds: number[];
  onToggleInvite: (id: number, name: string) => void;
  isLoading?: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  msmeOnly?: boolean;
  onMsmeOnlyChange?: (val: boolean) => void;
}

export function SupplierSelector({
  suppliers,
  invitedIds,
  onToggleInvite,
  isLoading = false,
  searchQuery,
  onSearchChange,
  msmeOnly = false,
  onMsmeOnlyChange
}: SupplierSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="h-9 w-full border border-slate-200 rounded-lg pl-9 pr-3 font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f]"
            placeholder="Search verified suppliers database..."
          />
        </div>
        {onMsmeOnlyChange && (
          <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={msmeOnly}
              onChange={e => onMsmeOnlyChange(e.target.checked)}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Filter MSME / Udyam verified only</span>
          </label>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <div className="p-10 flex items-center justify-center text-slate-450 text-xs font-semibold">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching supplier repository...
          </div>
        ) : suppliers.length === 0 ? (
          <div className="p-10 text-center text-slate-450 text-xs font-semibold">No category matched suppliers found.</div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-3 py-2 w-14 text-center">Select</th>
                <th className="px-3 py-2">Supplier Name</th>
                <th className="px-3 py-2">MSME / Udyam</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">On-Time</th>
                <th className="px-3 py-2">Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-750">
              {suppliers.map(seller => {
                const isSelected = invitedIds.includes(seller.id);
                return (
                  <tr key={seller.id} className="align-middle hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleInvite(seller.id, seller.organizationName)}
                        className="h-4 w-4 rounded accent-[#12335f] cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2 font-extrabold text-slate-900">{seller.organizationName}</td>
                    <td className="px-3 py-2">{seller.msmeCategory || 'General'}</td>
                    <td className="px-3 py-2 truncate max-w-[150px]">{seller.officeCity || 'N/A'}</td>
                    <td className="px-3 py-2">
                      <span className="text-amber-500">&#9733; {seller.rating || '4.0'}</span>
                    </td>
                    <td className="px-3 py-2">{seller.onTimeDeliveryRate ? `${seller.onTimeDeliveryRate}%` : 'N/A'}</td>
                    <td className="px-3 py-2">
                      <span className="bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase px-2 py-0.5 rounded border border-emerald-100">
                        GST Verified
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="text-[10px] text-slate-450 font-bold pl-0.5">
        Selected: <span className="text-slate-900 font-black">{invitedIds.length} suppliers</span> to invite.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. DocumentRequirementBuilder
// ─────────────────────────────────────────────────────────────────────────────
export interface SourcingDoc {
  id: string;
  name: string;
  required: boolean;
  instructions?: string;
  fileAssetId?: number | null;
  fileName?: string;
}

interface DocumentRequirementBuilderProps {
  documents: SourcingDoc[];
  onToggleRequired: (id: string) => void;
  onRemove: (id: string) => void;
  onAddCustomDoc: (name: string, required: boolean) => void;
  onUploadFile?: (id: string, file: File) => Promise<void>;
  onRemoveFile?: (id: string) => void;
}

export function DocumentRequirementBuilder({
  documents,
  onToggleRequired,
  onRemove,
  onAddCustomDoc,
  onUploadFile,
  onRemoveFile
}: DocumentRequirementBuilderProps) {
  const [docName, setDocName] = React.useState('');
  const [docReq, setDocReq] = React.useState(true);
  const [uploadingIds, setUploadingIds] = React.useState<Record<string, boolean>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;
    onAddCustomDoc(docName.trim(), docReq);
    setDocName('');
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
        <label className="flex-1 block space-y-1">
          <span className="text-[9px] font-black uppercase text-slate-450 tracking-wider">Add Custom Document Request</span>
          <input
            value={docName}
            onChange={e => setDocName(e.target.value)}
            className="h-9 w-full border border-slate-200 rounded-lg px-2.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#12335f]"
            placeholder="ISO/BIS standard, balance sheet, solvency cert..."
          />
        </label>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={docReq}
              onChange={e => setDocReq(e.target.checked)}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Mandatory?</span>
          </label>
          <Button
            type="submit"
            disabled={!docName.trim()}
            className="h-9 bg-[#12335f] text-white hover:bg-[#0b2445]"
          >
            Add Document
          </Button>
        </div>
      </form>

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2">Document Name</th>
              <th className="px-3 py-2 w-28">Requirement</th>
              <th className="px-3 py-2 w-40">Instructions</th>
              <th className="px-3 py-2 w-48">Buyer Reference / Template</th>
              <th className="px-3 py-2 w-16 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
            {documents.map(doc => (
              <tr key={doc.id} className="align-middle hover:bg-slate-50/50">
                <td className="px-3 py-3 font-extrabold text-slate-900">{doc.name}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onToggleRequired(doc.id)}
                    className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded border transition-all",
                      doc.required ? "bg-rose-55 bg-rose-50 text-rose-800 border-rose-200" : "bg-slate-50 text-slate-500 border-slate-200"
                    )}
                  >
                    {doc.required ? 'Mandatory' : 'Optional'}
                  </button>
                </td>
                <td className="px-3 py-3 text-slate-450 truncate max-w-[220px] font-medium">
                  {doc.instructions || 'Standard verification file.'}
                </td>
                <td className="px-3 py-3">
                  {doc.fileAssetId ? (
                    <div className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded text-[11px] max-w-[180px]">
                      <span className="truncate font-bold" title={doc.fileName || 'Attached document'}>
                        {doc.fileName || 'Attached document'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveFile && onRemoveFile(doc.id)}
                        className="text-rose-500 hover:text-rose-700 font-bold ml-auto flex-shrink-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      {uploadingIds[doc.id] ? (
                        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Uploading...</span>
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="file"
                            id={`file-upload-${doc.id}`}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file && onUploadFile) {
                                setUploadingIds(prev => ({ ...prev, [doc.id]: true }));
                                try {
                                  await onUploadFile(doc.id, file);
                                } finally {
                                  setUploadingIds(prev => ({ ...prev, [doc.id]: false }));
                                }
                              }
                            }}
                            className="hidden"
                          />
                          <label
                            htmlFor={`file-upload-${doc.id}`}
                            className="cursor-pointer inline-flex items-center gap-1 bg-[#12335f]/10 hover:bg-[#12335f]/20 text-[#12335f] text-[10px] font-black uppercase px-2 py-1 rounded transition-all"
                          >
                            <Upload className="h-3 w-3" />
                            <span>Upload</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(doc.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. EvaluationCriteriaBuilder
// ─────────────────────────────────────────────────────────────────────────────
export interface EvalCriteria {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  weightage: number;
  mandatory: boolean;
  minMarks: number;
}

interface EvaluationCriteriaBuilderProps {
  criteria: EvalCriteria[];
  onChange: (id: string, key: keyof EvalCriteria, val: any) => void;
  onAddRow: () => void;
  onDeleteRow: (id: string) => void;
  isQCBS?: boolean;
}

export function EvaluationCriteriaBuilder({
  criteria,
  onChange,
  onAddRow,
  onDeleteRow,
  isQCBS = false
}: EvaluationCriteriaBuilderProps) {
  const tableInput = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/15';
  const totalWeightage = criteria.reduce((sum, c) => sum + Number(c.weightage || 0), 0);

  return (
    <div className="space-y-3">
      {isQCBS && totalWeightage !== 100 && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Note: Quality and Cost evaluation (QCBS) requires total criteria weightage to sum to 100%. (Current total: {totalWeightage}%)</span>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full min-w-[700px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Criteria Name</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="px-3 py-2.5 w-24">Max Score</th>
              <th className="px-3 py-2.5 w-24">Weight %</th>
              <th className="px-3 py-2.5 w-20 text-center">Mandatory</th>
              <th className="px-3 py-2.5 w-24">Min Marks</th>
              <th className="px-3 py-2.5 w-20 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
            {criteria.map(c => (
              <tr key={c.id} className="align-middle hover:bg-slate-50/50">
                <td className="px-3 py-1.5">
                  <input
                    value={c.name}
                    onChange={e => onChange(c.id, 'name', e.target.value)}
                    className={tableInput}
                    placeholder="e.g. Turnovers, Experience"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    value={c.description}
                    onChange={e => onChange(c.id, 'description', e.target.value)}
                    className={tableInput}
                    placeholder="Brief evaluation description"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={c.maxScore || ''}
                    onChange={e => onChange(c.id, 'maxScore', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={c.weightage || ''}
                    onChange={e => onChange(c.id, 'weightage', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={c.mandatory}
                    onChange={e => onChange(c.id, 'mandatory', e.target.checked)}
                    className="h-4 w-4 rounded accent-[#12335f] cursor-pointer"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="number"
                    value={c.minMarks || ''}
                    onChange={e => onChange(c.id, 'minMarks', Number(e.target.value || 0))}
                    className={tableInput}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onDeleteRow(c.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center font-bold text-xs px-0.5">
        <Button type="button" size="sm" variant="outline" onClick={onAddRow} className="h-8 text-slate-700">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Criteria Row
        </Button>
        <span className="text-[#12335f] font-extrabold">
          Total Weightage Sum: {totalWeightage}%
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. ApprovalTimeline
// ─────────────────────────────────────────────────────────────────────────────
interface ApprovalTimelineProps {
  stages: string[];
  currentIdx?: number;
}

export function ApprovalTimeline({ stages, currentIdx = 0 }: ApprovalTimelineProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl overflow-x-auto">
      {stages.map((stage, idx) => {
        const isPassed = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <React.Fragment key={idx}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black border transition-all",
                isPassed ? "bg-emerald-55 border-emerald-500 bg-emerald-500 text-white" :
                isCurrent ? "bg-[#12335f] border-[#12335f] text-white ring-4 ring-[#12335f]/15" :
                "bg-white border-slate-200 text-slate-450"
              )}>
                {isPassed ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-wider whitespace-nowrap",
                isCurrent ? "text-[#12335f]" : "text-slate-500"
              )}>
                {stage}
              </span>
            </div>
            {idx < stages.length - 1 && (
              <ChevronRight className="h-4 w-4 text-slate-300 hidden sm:block shrink-0" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. ProcurementSummaryPanel
// ─────────────────────────────────────────────────────────────────────────────
interface ProcurementSummaryPanelProps {
  title: string;
  buyerType: string;
  method: string;
  estimatedValue: number;
  priority: string;
  requiredBy?: string;
  location?: string;
  itemsCount: number;
  suppliersCount: number;
  docsCount: number;
}

export function ProcurementSummaryPanel({
  title,
  buyerType,
  method,
  estimatedValue,
  priority,
  requiredBy,
  location,
  itemsCount,
  suppliersCount,
  docsCount
}: ProcurementSummaryPanelProps) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 font-bold text-xs">
      <SummaryItem label="Sourcing Title" value={title} />
      <SummaryItem label="Workflow Type" value={buyerType === 'GOVERNMENT_BUYER' ? 'Government Buyer' : 'Private Buyer'} />
      <SummaryItem label="Sourcing Method" value={method.replace(/_/g, ' ')} />
      <SummaryItem label="Estimated Budget" value={formatCurrency(estimatedValue)} />
      <SummaryItem label="Priority Level" value={priority} />
      <SummaryItem label="Required By" value={requiredBy || 'N/A'} />
      <SummaryItem label="Delivery Location" value={location || 'N/A'} />
      <SummaryItem label="Line Items" value={`${itemsCount} line items scheduled`} />
      <SummaryItem label="Invited Bidders" value={`${suppliersCount} suppliers invited`} />
      <SummaryItem label="Required Checklists" value={`${docsCount} documents required`} />
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
      <p className="text-[8.5px] font-black uppercase text-slate-400 tracking-wider leading-none">{label}</p>
      <p className="mt-1.5 text-slate-900 font-extrabold tracking-tight truncate leading-none">{value}</p>
    </div>
  );
}
