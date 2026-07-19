'use client';

import React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import {
  Download,
  Share2,
  Calendar,
  MapPin,
  Building2,
  Phone,
  Mail,
  User,
  Check,
  ChevronRight,
  Loader2,
  Eye,
  FileText,
  FileSpreadsheet,
  MessageSquare,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  HelpCircle,
  ArrowLeft,
  Clock,
  Info,
  IndianRupee,
  Layers,
  ClipboardCheck,
  ClipboardList,
  Package,
  CalendarDays,
  Clipboard,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { openFileAsset } from '../../../lib/files';
import { procurementBidApi } from '../../procurementBid/api';

const isPresentValue = (value: any): boolean => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

const humanizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

const noisyDetailKeys = new Set([
  'draftMeta',
  'raw',
  'rawPayload',
  'payloadSnapshot',
  'originalPayload',
  'sourcePayload',
  'technicalPacket',
]);

const lowValueArrayColumns = new Set([
  'id',
  '_id',
  'draftMeta',
  'payload',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'fileAssetId',
  'assetId',
]);

const preferredArrayColumns = [
  'itemName',
  'name',
  'title',
  'description',
  'quantity',
  'unit',
  'unitOfMeasure',
  'estimatedUnitPrice',
  'price',
  'amount',
  'specification',
  'specifications',
  'fileName',
  'documentType',
];

const isNoisyDetailKey = (key: string): boolean => {
  if (noisyDetailKeys.has(key)) return true;
  const normalized = key.toLowerCase();
  return normalized.includes('draftmeta') || normalized.includes('rawpayload') || normalized.includes('payloadsnapshot');
};

const formatDetailValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('en-IN');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (item && typeof item === 'object') {
          return String(item.name || item.label || item.supplierName || item.itemName || item.fileName || item.location || item.id || 'Details available');
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k, v]) => !isNoisyDetailKey(k) && isPresentValue(v))
      .map(([k, v]) => `${humanizeKey(k)}: ${formatDetailValue(v)}`)
      .join('; ');
  }
  return String(value);
};

const formatPrimitiveDetailValue = (value: any, key = ''): string => {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  const keyLower = key.toLowerCase();
  if (typeof value === 'number') {
    if (/(amount|value|price|budget|fee|deposit|security|rate|cost)/i.test(keyLower)) {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(value);
    }
    return new Intl.NumberFormat('en-IN').format(value);
  }

  if (value instanceof Date) {
    return value.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'N/A';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return summarizeComplexDetailValue(JSON.parse(trimmed), key);
      } catch {
        return 'Details available';
      }
    }
    const looksLikeDate = /(date|time|deadline|validity|submitted|published|closing|opening|updated|created|start|end)/i.test(keyLower);
    if (looksLikeDate) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      }
    }
    if (/^[A-Z0-9_ -]+$/.test(trimmed) && /[_-]/.test(trimmed)) {
      return trimmed
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    return trimmed;
  }

  return String(value);
};

const detailEntries = (source: any) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.entries(source).filter(([key, value]) => !isNoisyDetailKey(key) && isPresentValue(value));
};

const hasDetailData = (source: any): boolean => {
  if (source instanceof Date) return !Number.isNaN(source.getTime());
  if (!isPresentValue(source)) return false;
  if (Array.isArray(source)) return source.some(item => isPresentValue(item));
  if (typeof source === 'object') return detailEntries(source).length > 0;
  return true;
};

const compactObject = (source: Record<string, any>) =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => hasDetailData(value)));

const firstPresent = (...values: any[]) => values.find(value => isPresentValue(value));

const joinAddressParts = (...values: any[]) =>
  values
    .flat()
    .filter((value, index, allValues) => isPresentValue(value) && allValues.indexOf(value) === index)
    .join(', ');

const summarizeComplexDetailValue = (value: any, key = ''): string => {
  if (!hasDetailData(value)) return 'N/A';
  if (Array.isArray(value)) {
    const labels = value
      .map(item => {
        if (item && typeof item === 'object') {
          return item.name || item.label || item.title || item.fileName || item.documentType || item.id;
        }
        return item;
      })
      .filter(Boolean)
      .slice(0, 3);
    return labels.length ? `${labels.join(', ')}${value.length > labels.length ? ` +${value.length - labels.length} more` : ''}` : `${value.length} entries`;
  }
  if (typeof value !== 'object') return formatPrimitiveDetailValue(value, key);

  const keyLower = key.toLowerCase();
  const specKeys = [
    'specification',
    'technicalSpecification',
    'scopeOfWork',
    'brandPreference',
    'brandPolicy',
    'warrantyTerms',
    'inspectionRequired',
    'fileName',
    'specificationFileName',
  ];
  const summaryKeys = keyLower.includes('spec') ? specKeys : ['name', 'title', 'label', 'fileName', 'documentType', 'description', 'location'];
  const summaryParts = summaryKeys
    .filter(summaryKey => isPresentValue(value[summaryKey]))
    .map(summaryKey => formatPrimitiveDetailValue(value[summaryKey], summaryKey));

  if (summaryParts.length) return summaryParts.slice(0, 4).join(' | ');

  const primitiveEntries = Object.entries(value)
    .filter(([entryKey, entryValue]) => !isNoisyDetailKey(entryKey) && isPresentValue(entryValue) && (typeof entryValue !== 'object' || entryValue instanceof Date))
    .slice(0, 4);

  if (!primitiveEntries.length) return `${detailEntries(value).length} fields`;

  return primitiveEntries
    .map(([entryKey, entryValue]) => `${humanizeKey(entryKey)}: ${formatPrimitiveDetailValue(entryValue, entryKey)}`)
    .join(' | ');
};

const getArrayColumns = (items: any[]) => {
  const columns = new Set<string>();
  items.forEach(item => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.entries(item).forEach(([key, value]) => {
        if (!lowValueArrayColumns.has(key) && !isNoisyDetailKey(key) && hasDetailData(value)) columns.add(key);
      });
    }
  });
  return Array.from(columns)
    .sort((a, b) => {
      const aIndex = preferredArrayColumns.indexOf(a);
      const bIndex = preferredArrayColumns.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    })
    .slice(0, 8);
};

const ArrayTableCell = ({ value, column }: { value: any; column: string }) => (
  <span className="block max-h-32 overflow-y-auto whitespace-pre-wrap break-words pr-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
    {value && typeof value === 'object'
      ? summarizeComplexDetailValue(value, column)
      : formatPrimitiveDetailValue(value, column)}
  </span>
);

const DetailValue = ({ value, valueKey = '', depth = 0 }: { value: any; valueKey?: string; depth?: number }) => {
  if (!hasDetailData(value)) {
    return <span className="text-slate-400">N/A</span>;
  }

  if (Array.isArray(value)) {
    const objectRows = value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
    if (objectRows.length === value.length && objectRows.length > 0) {
      const columns = getArrayColumns(objectRows);
      return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="bg-slate-50">
              <tr>
                {columns.map(column => (
                  <th key={column} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                    {humanizeKey(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {objectRows.map((item, rowIndex) => (
                <tr key={item.id || `${valueKey}-${rowIndex}`} className="transition-all duration-200 hover:bg-slate-50 hover:shadow-sm">
                  {columns.map(column => (
                    <td key={column} className="px-4 py-3.5 align-top text-xs font-semibold leading-relaxed text-slate-800">
                      <ArrayTableCell value={item[column]} column={column} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      );
    }

    return (
      <ul className="mt-1 space-y-1.5">
        {value.map((item, idx) => (
          <li key={`${valueKey}-${idx}`} className="rounded-lg bg-white px-3 py-2.5 text-sm font-normal leading-relaxed text-slate-800 ring-1 ring-slate-200 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:ring-slate-300">
            {item && typeof item === 'object' ? summarizeComplexDetailValue(item, valueKey) : formatPrimitiveDetailValue(item, valueKey)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const entries = detailEntries(value);
    if (!entries.length) return <span className="text-slate-400">N/A</span>;
    return (
      <div className={cn('mt-2 grid gap-3', depth > 0 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
        {entries.map(([key, nestedValue]) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700">{humanizeKey(key)}</p>
            <div className="mt-1.5 text-sm font-normal leading-relaxed text-slate-900">
              <DetailValue value={nestedValue} valueKey={key} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="whitespace-pre-wrap break-words">{formatPrimitiveDetailValue(value, valueKey)}</span>;
};

const ProcurementDetailSection = ({
  title,
  icon: Icon,
  data,
  defaultExpanded = false,
  isPanelMode = false,
}: {
  title: string;
  icon: any;
  data: any;
  defaultExpanded?: boolean;
  isPanelMode?: boolean;
}) => {
  const entries = Array.isArray(data) ? [[title, data]] : detailEntries(data);
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);

  if (!entries.length) return null;

  const contentGrid = (
    <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => {
        const keyStr = String(key);
        const keyLower = keyStr.toLowerCase();
        
        let cardBg = 'bg-white border-slate-200/70 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.04)] hover:border-indigo-300 hover:shadow-[0_8px_30px_-10px_rgba(99,102,241,0.15)]';
        let labelColor = 'text-slate-500';
        let valueColor = 'text-slate-900 font-normal';
        let badgeClass = '';
        
        if (keyLower.includes('status')) {
          cardBg = 'bg-gradient-to-br from-emerald-50/80 to-white border-emerald-200 shadow-sm shadow-emerald-100/30 hover:border-emerald-400 hover:shadow-emerald-200/50';
          labelColor = 'text-emerald-700/80';
          valueColor = ''; 
          badgeClass = 'inline-flex items-center rounded-md bg-emerald-100/80 px-2.5 py-1 text-xs font-bold text-emerald-800 ring-1 ring-inset ring-emerald-300/50 uppercase tracking-wider';
        } else if (keyLower.includes('value') || keyLower.includes('budget') || keyLower.includes('price')) {
          cardBg = 'bg-gradient-to-br from-indigo-50/60 to-white border-indigo-200 shadow-sm shadow-indigo-100/30 hover:border-indigo-400 hover:shadow-indigo-200/50';
          labelColor = 'text-indigo-600/80';
          valueColor = 'text-indigo-950 text-[15px] font-normal tracking-tight'; 
        } else if (keyLower.includes('deadline') || keyLower.includes('enddate') || keyLower.includes('closing') || keyLower.includes('urgency') || keyLower.includes('date')) {
          cardBg = 'bg-gradient-to-br from-rose-50/60 to-white border-rose-200 shadow-sm shadow-rose-100/30 hover:border-rose-400 hover:shadow-rose-200/50';
          labelColor = 'text-rose-600/80';
          valueColor = 'text-rose-950 font-normal';
        } else if (keyLower.includes('title') || keyLower.includes('subject') || keyLower.includes('category')) {
          cardBg = 'bg-gradient-to-br from-sky-50/60 to-white border-sky-200 shadow-sm shadow-sky-100/30 hover:border-sky-400 hover:shadow-sky-200/50';
          labelColor = 'text-sky-600/80';
          valueColor = 'text-sky-950 font-normal';
        } else if (keyLower.includes('rfpnumber') || keyLower.includes('requirementnumber') || keyLower === 'id' || keyLower === 'uuid') {
          cardBg = 'bg-gradient-to-br from-slate-50/80 to-white border-slate-200 shadow-sm shadow-slate-100/30 hover:border-slate-400 hover:shadow-slate-200/50';
          labelColor = 'text-slate-500';
          valueColor = 'text-slate-800 font-mono text-[13px] bg-slate-100 px-2 py-0.5 rounded-md';
        }

        const isComplex = typeof value === 'object' && value !== null;
        return (
          <div key={keyStr} className={cn(`group flex flex-col gap-2 rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 ${cardBg}`, isComplex ? 'col-span-full' : '')}>
            <p className={`text-[10px] font-black uppercase tracking-widest transition-colors ${labelColor}`}>{Array.isArray(data) ? title : humanizeKey(keyStr)}</p>
            <div className={`text-[14px] leading-relaxed ${valueColor}`}>
              {badgeClass ? (
                <span className={badgeClass}>
                  <DetailValue value={value} valueKey={keyStr} />
                </span>
              ) : (
                <DetailValue value={value} valueKey={keyStr} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (isPanelMode) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 ease-out">
        {contentGrid}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-xl shadow-sm shadow-slate-200/50 transition-all duration-300 hover:shadow-lg hover:border-indigo-300/50 overflow-hidden group/section">
      <div 
        className={cn(
          "flex items-center justify-between p-5 cursor-pointer transition-all duration-500 ease-out",
          isExpanded ? "bg-gradient-to-r from-indigo-50/50 via-white to-white border-b border-indigo-100/50" : "bg-white hover:bg-indigo-50/30"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="flex items-center gap-4 text-[13px] font-black uppercase tracking-[0.1em] text-slate-800 group-hover/section:text-indigo-900 transition-colors">
          <span className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300",
            isExpanded ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-200" : "bg-indigo-50/80 border-indigo-100 text-indigo-600 group-hover/section:bg-indigo-100"
          )}>
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </h3>
        <span className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300",
          isExpanded ? "bg-slate-100 text-slate-600 rotate-180" : "bg-transparent text-slate-400 group-hover/section:bg-slate-100 group-hover/section:text-slate-600"
        )}>
          <ChevronDown className="h-5 w-5 shrink-0" />
        </span>
      </div>
      <div className={cn("px-6 pb-6 pt-5 transition-all duration-500 ease-in-out", isExpanded ? "block opacity-100 translate-y-0" : "hidden opacity-0 -translate-y-2")}>
        {contentGrid}
      </div>
    </div>
  );
};
const ProcurementDetailsLayout = ({ sections }: { sections: any[] }) => {
  const [activeIndex, setActiveIndex] = React.useState(0);

  const validSections = React.useMemo(() => {
    return sections.filter(section => {
      const entries = Array.isArray(section.data) ? [[section.title, section.data]] : detailEntries(section.data);
      return entries.length > 0;
    });
  }, [sections]);

  if (validSections.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-bold text-slate-500">
        No additional procurement details were found for this RFP.
      </p>
    );
  }

  const currentSection = validSections[activeIndex] || validSections[0];
  const activeIdxSafe = validSections[activeIndex] ? activeIndex : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left Navigation Menu */}
      <div className="w-full lg:w-1/3 xl:w-1/4 shrink-0">
        <div className="sticky top-24 space-y-1 rounded-2xl border border-slate-200/60 bg-white/50 p-2 backdrop-blur-xl shadow-sm">
          {validSections.map((section, idx) => {
            const isActive = idx === activeIdxSafe;
            const Icon = section.icon;
            return (
              <button
                key={section.title}
                onClick={() => setActiveIndex(idx)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-300",
                  isActive 
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" 
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-indigo-100" : "text-slate-400")} />
                <span className="text-[11px] font-black uppercase tracking-widest">{section.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content Panel */}
      <div className="w-full lg:w-2/3 xl:w-3/4">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-xl shadow-sm shadow-slate-200/50 p-1 lg:p-2 overflow-hidden">
          <div className="flex items-center gap-4 px-4 pt-4 pb-4 border-b border-slate-100 mb-2 mx-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-sm shadow-indigo-100/50">
              <currentSection.icon className="h-5 w-5" />
            </span>
            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-slate-800">
              {currentSection.title}
            </h3>
          </div>
          <ProcurementDetailSection
            key={currentSection.title}
            title={currentSection.title}
            icon={currentSection.icon}
            data={currentSection.data}
            defaultExpanded={true}
            isPanelMode={true}
          />
        </div>
      </div>
    </div>
  );
};

const detailCardClass =
  'rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 transition-all duration-300 ease-out hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/60 hover:-translate-y-1';

const metricTileClass =
  'group min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/60';

export default function RfpDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || '';
  const { user } = useAuth();
  const requestId = searchParams?.get('requestId') || '';
  const requirementId = searchParams?.get('requirementId') || '';

  // Fetch ProcurementBid data when requestId is provided (numeric ID or REQ-* reference ID)
  const { data: bidData, isLoading: bidLoading, error: bidError } = useQuery({
    queryKey: ['procurement-bid-rfp-detail', requestId],
    queryFn: () => procurementBidApi.detail(requestId),
    enabled: !!requestId,
  });

  // Fetch BuyerRequirement data when requirementId is provided
  const { data: reqData, isLoading: reqLoading, error: reqError } = useQuery({
    queryKey: ['marketplace-requirement-rfp-detail', requirementId, user?.role],
    queryFn: async () => {
      const ownerEndpoint = `/api/requirements/${requirementId}`;
      const marketplaceEndpoint = `/api/marketplace/requirements/${requirementId}`;

      if (user?.role === 'buyer') {
        try {
          return await getApi<any>(ownerEndpoint, true);
        } catch {
          return getApi<any>(marketplaceEndpoint, true);
        }
      }

      return getApi<any>(marketplaceEndpoint, true);
    },
    enabled: !!requirementId,
  });

  const isLoading = (!!requestId && bidLoading) || (!!requirementId && reqLoading);
  const error = (!!requestId && bidError) || (!!requirementId && reqError);

  const reqObj = reqData?.requirement || reqData;
  const ownResponse = reqData?.ownResponse || null;
  const hasSubmittedProposal = 
    reqObj?.participations?.some((p: any) => p.submissionStatus === 'SUBMITTED' && (p.sellerId === user?.id || (user?.organizationId && p.seller?.organizationId === user?.organizationId))) ||
    bidData?.participations?.some((p: any) => p.submissionStatus === 'SUBMITTED' && (p.sellerId === user?.id || (user?.organizationId && p.seller?.organizationId === user?.organizationId))) || 
    (ownResponse && (ownResponse.submissionStatus === 'SUBMITTED' || ownResponse.status === 'SUBMITTED'));

  // Map data from whichever source responded
  const rawBid: any = bidData;
  const rfpData: any = rawBid ? {
    id: rawBid.id || rawBid.sourceId,
    subject: rawBid.title,
    buyer: rawBid.buyer || {
      name: '',
      email: rawBid.buyerEmail || '',
      mobile: rawBid.buyerMobile || '',
      buyerProfile: rawBid.buyerOrganization || null
    },
    estimatedValue: rawBid.estimatedValue,
    deadlineDate: rawBid.endDate,
    createdAt: rawBid.startDate,
    status: rawBid.status,
    location: rawBid.deliveryLocation,
    requirementNumber: rawBid.id,
    paymentTerms: rawBid.technicalPacket?.terms?.paymentTerms || rawBid.termsAndConditions?.[0] || rawBid.terms?.[0] || '',
    deliveryTerms: rawBid.technicalPacket?.terms?.deliveryTerms || rawBid.termsAndConditions?.[1] || '',
    description: rawBid.description,
    payload: rawBid.technicalPacket || rawBid.payload || {
      basics: {
        buyerType: rawBid.buyerType,
        buyingType: rawBid.procurementType,
        bidType: rawBid.bidType,
        visibility: rawBid.visibility,
        category: rawBid.category,
      },
      consigneeDetails: rawBid.consigneeDetails || (rawBid.deliveryLocation ? { default: { location: rawBid.deliveryLocation, name: 'Default Delivery Location' } } : null),
      items: rawBid.items || rawBid.products || undefined,
      serviceDetails: rawBid.serviceDetails || undefined,
      terms: {
        paymentTerms: rawBid.technicalPacket?.terms?.paymentTerms || rawBid.termsAndConditions?.[0] || rawBid.terms?.[0] || '',
        deliveryTerms: rawBid.technicalPacket?.terms?.deliveryTerms || rawBid.termsAndConditions?.[1] || '',
        otherTerms: Array.isArray(rawBid.termsAndConditions) ? rawBid.termsAndConditions.slice(2).join(', ') : ''
      },
      rules: {
        evaluationMethod: rawBid.evaluationMethod,
        isEmdRequired: rawBid.isEmdRequired,
        emdAmount: rawBid.emdAmount,
        documentFee: rawBid.documentFee,
        allowClarification: rawBid.allowClarification,
        allowReverseAuction: rawBid.allowReverseAuction,
        packetType: rawBid.packetType
      },
      schedule: {
        technicalOpeningDate: rawBid.technicalOpeningDate || rawBid.technicalOpening,
        financialOpeningDate: rawBid.financialOpeningDate || rawBid.financialOpening,
        bidValidityDate: rawBid.bidValidityDate || rawBid.bidValidity,
        clarificationDeadline: rawBid.clarificationEndDate || rawBid.clarificationDeadline,
        preBidMeetingDate: rawBid.preBidMeetingDate || rawBid.preBidDate,
        presentationDate: rawBid.presentationDate,
        awardDate: rawBid.awardDate || rawBid.awardingDate,
        finalEvaluationDate: rawBid.finalEvaluationDate || rawBid.financialEvaluationDate,
      }
    },
    documents: rawBid.documents?.length
      ? rawBid.documents
      : (rawBid.bidDocuments?.length
        ? rawBid.bidDocuments
        : ((rawBid.requiredDocuments || []).map((name: any, i: number) => ({
            id: `req-doc-${i}`,
            fileName: typeof name === 'string' ? name : name?.name || 'Required Document',
            documentType: 'REQUIRED',
            fileUrl: '#',
          }))
      )),
    items:
      (rawBid.items?.length ? rawBid.items : null)
      || rawBid.technicalPacket?.boq
      || rawBid.technicalPacket?.items
      || rawBid.technicalPacket?.wizardData?.items
      || rawBid.financialPacket?.boq
      || (rawBid.quantity ? [{
          id: 'item-1',
          name: rawBid.title || rawBid.itemName || 'Main Requirement',
          description: rawBid.description || '',
          quantity: rawBid.quantity,
          unit: rawBid.unit || 'Unit',
          estimatedUnitPrice: rawBid.estimatedValue ? (Number(rawBid.estimatedValue) / Number(rawBid.quantity)) : 0
        }] : []),
    category: rawBid.category,
    buyerOrganization: rawBid.buyerOrganization || { organizationName: rawBid.buyerName || rawBid.buyerOrganizationName },
    buyerOrganizationName: rawBid.buyerName || rawBid.buyerOrganizationName,
    emdAmount: rawBid.emdAmount,
    isEmdRequired: rawBid.isEmdRequired,
    evaluationMethod: rawBid.evaluationMethod,
    technicalOpeningDate: rawBid.technicalOpeningDate,
    financialOpeningDate: rawBid.financialOpeningDate,
    contactPerson: rawBid.technicalPacket?.internal?.contactPerson || rawBid.buyer?.name || '',
    buyerEmail: rawBid.technicalPacket?.internal?.email || rawBid.buyer?.email || '',
    buyerMobile: rawBid.technicalPacket?.internal?.mobile || rawBid.buyer?.mobile || '',
  } : reqObj ? {
    id: reqObj.id,
    subject: reqObj.title || reqObj.description,
    buyer: {
      name: reqObj.buyerOrganization?.organizationName || reqObj.organization?.organizationName || reqObj.payload?.internal?.orgName || 'Buyer',
      email: reqObj.buyerEmail || reqObj.buyer?.email || reqObj.createdBy?.email || reqObj.payload?.internal?.email || '',
      mobile: reqObj.buyerMobile || reqObj.buyer?.mobile || reqObj.createdBy?.mobile || reqObj.payload?.internal?.mobile || '',
      buyerProfile: reqObj.buyerOrganization || reqObj.organization || reqObj.buyer?.buyerProfile
    },
    estimatedValue: reqObj.estimatedValue || reqObj.budgetMax || reqObj.budgetMin || reqObj.payload?.basics?.estimatedValue,
    deadlineDate: reqObj.lastDate || reqObj.requiredBy || reqObj.payload?.schedule?.submissionDate || reqObj.payload?.tender?.bidClosingDate,
    createdAt: reqObj.createdAt,
    status: reqObj.status,
    tenders: reqObj.tenders,
    location: reqObj.location || reqObj.payload?.basics?.deliveryLocation || reqObj.payload?.internal?.deliveryAddress || reqObj.organization?.district || reqObj.buyerOrganization?.district,
    requirementNumber: reqObj.requirementNumber,
    paymentTerms: reqObj.paymentTerms || reqObj.payload?.terms?.paymentTerms || reqObj.payload?.paymentTerms,
    deliveryTerms: reqObj.deliveryTerms || reqObj.payload?.terms?.deliveryTerms || reqObj.payload?.deliveryTerms,
    description: reqObj.description || reqObj.payload?.basics?.description || reqObj.payload?.basics?.justification,
    payload: reqObj.payload,
    documents: reqObj.documents || reqObj.payload?.documents || reqObj.payload?.requiredDocs,
    items: reqObj.payload?.items || reqObj.items || reqObj.payload?.boqTable || reqObj.payload?.boq,
    category: reqObj.category?.name || reqObj.category || reqObj.payload?.basics?.category,
    buyerOrganization: reqObj.buyerOrganization || reqObj.organization,
    technicalOpeningDate: reqObj.technicalOpeningDate || reqObj.payload?.schedule?.technicalOpeningDate || reqObj.payload?.tender?.technicalEvaluationDate,
    financialOpeningDate: reqObj.financialOpeningDate || reqObj.payload?.schedule?.financialOpeningDate || reqObj.payload?.tender?.financialEvaluationDate,
    contactPerson: reqObj.contactPerson || reqObj.payload?.internal?.contactPerson || reqObj.buyer?.name || reqObj.createdBy?.name || '',
    buyerEmail: reqObj.buyerEmail || reqObj.payload?.internal?.email || reqObj.buyer?.email || reqObj.createdBy?.email || '',
    buyerMobile: reqObj.buyerMobile || reqObj.payload?.internal?.mobile || reqObj.buyer?.mobile || reqObj.createdBy?.mobile || '',
  } : null;

  const formatCurrency = (val?: number) => {
    if (!val) return '—';
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  };

  const formatDateString = (dateStr?: string | Date, includeTime = false) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      
      const day = d.getDate().toString().padStart(2, '0');
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[d.getMonth()];
      const year = d.getFullYear();
      
      let base = `${day} ${month} ${year}`;
      if (includeTime) {
        let hours = d.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const formattedHours = hours.toString().padStart(2, '0');
        base += ` ${formattedHours}:${minutes} ${ampm}`;
      }
      return base;
    } catch {
      return String(dateStr);
    }
  };

  // Payload data extraction
  const payload = rfpData?.payload || {};
  const basics = payload.basics || {};
  const internal = payload.internal || {};
  const schedule = payload.schedule || {};
  const tender = payload.tender || {};
  const terms = payload.terms || {};
  const rules = payload.rules || {};
  const evaluation = payload.evaluation || {};
  const timelineRef = React.useRef<HTMLElement | null>(null);
  const overviewRef = React.useRef<HTMLElement | null>(null);
  const keyDatesRef = React.useRef<HTMLElement | null>(null);
  const buyerInfoRef = React.useRef<HTMLElement | null>(null);
  const documentsRef = React.useRef<HTMLElement | null>(null);
  const detailsRef = React.useRef<HTMLElement | null>(null);
  const scrollToSection = (target: React.RefObject<HTMLElement | null>) => {
    target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const quickNavItems = [
    { label: 'Timeline', ref: timelineRef },
    { label: 'Overview', ref: overviewRef },
    { label: 'Dates', ref: keyDatesRef },
    { label: 'Buyer', ref: buyerInfoRef },
    { label: 'Documents', ref: documentsRef },
    { label: 'Details', ref: detailsRef },
  ];

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-slate-700" />
        <p className="text-sm font-bold text-slate-500">Loading RFP details...</p>
      </div>
    );
  }

  // Determine which RFP is being viewed
  let subject = rfpData?.subject || rfpData?.title || '';
  const isSeedId = [100, 101, 102, 103, 104].includes(Number(requestId));
  if (!subject && isSeedId) {
    if (Number(requestId) === 100) subject = '[SEED] Implementation of Cloud-Based Inventory System';
    else if (Number(requestId) === 101) subject = '[SEED] Structural Design Consultancy for Nagpur Plant';
    else if (Number(requestId) === 102) subject = '[SEED] Hazardous Chemical Waste Disposal Service';
    else if (Number(requestId) === 103) subject = '[SEED] Warehouse Robot Sorting Automation Integration';
    else if (Number(requestId) === 104) subject = '[SEED] Annual Maintenance Contract for HVAC Systems';
  }
  if (!subject) subject = 'RFP Sourcing Opportunity';

  const isInventory = isSeedId && (subject.toLowerCase().includes('inventory') || subject.toLowerCase().includes('cloud'));
  const isStructural = isSeedId && (subject.toLowerCase().includes('structural') || subject.toLowerCase().includes('nagpur'));
  const isWaste = isSeedId && (subject.toLowerCase().includes('waste') || subject.toLowerCase().includes('chemical'));
  const isRobot = isSeedId && (subject.toLowerCase().includes('robot') || subject.toLowerCase().includes('sorting'));
  const isHvac = isSeedId && (subject.toLowerCase().includes('hvac') || subject.toLowerCase().includes('annual'));

  // 1. RFP Number
  let rfpNumberString = rfpData?.requirementNumber || (rfpData?.id ? `RFP-2026-015${Math.abs(Number(rfpData.id))}` : '—');
  if (!rfpData?.requirementNumber && isSeedId) {
    if (isInventory) rfpNumberString = 'SEED-BID-RFP-100-8451';
    else if (isStructural) rfpNumberString = 'SEED-BID-RFP-101-9214';
    else if (isWaste) rfpNumberString = 'SEED-BID-RFP-102-7634';
    else if (isRobot) rfpNumberString = 'SEED-BID-RFP-103-3482';
    else if (isHvac) rfpNumberString = 'SEED-BID-RFP-104-5109';
  }

  // 2. Buyer Info
  const buyerProfile = rfpData?.buyer?.buyerProfile || {};
  const buyerOrg = rfpData?.buyerOrganization || rfpData?.buyer?.organization || {};
  const orgName = firstPresent(
    internal.orgName,
    basics.organizationName,
    rfpData?.buyerOrganizationName,
    buyerOrg.organizationName,
    buyerProfile.organizationName,
    rfpData?.buyer?.name,
    isSeedId ? 'Govt. Buyer Org' : undefined
  ) || '—';

  const contactPerson = firstPresent(
    rfpData?.contactPerson,
    internal.contactPerson,
    buyerProfile.representativeName,
    buyerProfile.contactPersonName,
    buyerProfile.contactPerson,
    rfpData?.buyer?.name,
    isSeedId ? 'M. R. Patnaik' : undefined
  ) || '—';

  const email = firstPresent(
    rfpData?.buyerEmail,
    internal.email,
    buyerProfile.contactPersonEmail,
    buyerProfile.email,
    rfpData?.buyer?.email,
    isSeedId ? 'tenders@govorg.in' : undefined
  ) || '—';

  const phone = firstPresent(
    rfpData?.buyerMobile,
    internal.mobile,
    buyerProfile.contactPersonMobile,
    buyerProfile.mobile,
    rfpData?.buyer?.mobile,
    isSeedId ? '+91 94370 67890' : undefined
  ) || '—';

  const address = firstPresent(
    buyerOrg.registeredAddress,
    buyerOrg.address,
    buyerProfile.registeredAddress,
    buyerProfile.address,
    joinAddressParts(orgName !== '—' ? orgName : undefined, buyerOrg.city || buyerProfile.city, buyerOrg.district || buyerProfile.district, buyerOrg.state || buyerProfile.state),
    isSeedId ? 'Secretariat Main Annex, Bhubaneswar - 751001, Odisha' : undefined
  ) || '—';

  const deliveryLocationDisplay = firstPresent(
    tender.deliveryAddress,
    tender.deliveryLocation,
    basics.deliveryLocation,
    rfpData?.location,
    isInventory || isStructural || isWaste || isRobot || isHvac ? 'Mumbai, Maharashtra' : undefined
  ) || '—';

  const projectDurationDisplay = firstPresent(
    basics.projectDuration,
    basics.duration,
    payload.serviceDetails?.duration,
    terms.contractPeriod,
    terms.projectDuration
  ) || '—';

  const paymentTermsDisplay = firstPresent(rfpData?.paymentTerms, terms.paymentTerms, terms.paymentMode) || '—';
  const evaluationMethodDisplay = firstPresent(rfpData?.evaluationMethod, evaluation.evaluationMethod, rules.evaluationMethod) || '—';
  const emdRequiredValue = firstPresent(rfpData?.isEmdRequired, rules.emdRequired, rules.isEmdRequired, terms.emdRequired);
  const emdAmountValue = Number(firstPresent(rfpData?.emdAmount, rules.emdAmount, terms.emdAmount) || 0);
  const emdDisplay = emdAmountValue > 0
    ? formatCurrency(emdAmountValue)
    : emdRequiredValue === false
      ? 'Not Required'
      : '—';

  // 3. Estimated Value
  let estimatedValueVal: number | undefined = undefined;
  if (rfpData?.estimatedValue) estimatedValueVal = Number(rfpData.estimatedValue);
  else if (isSeedId) {
    if (isInventory) estimatedValueVal = 7500000;
    else if (isStructural) estimatedValueVal = 1800000;
    else if (isWaste) estimatedValueVal = 2400000;
    else if (isRobot) estimatedValueVal = 9500000;
    else if (isHvac) estimatedValueVal = 1500000;
    else estimatedValueVal = 45000000;
  }

  // 4. Category & Subcategory
  let category = rfpData?.category || rfpData?.payload?.basics?.category || (isSeedId ? 'IT Services' : '—');
  let subCategory = rfpData?.payload?.basics?.subCategory || (isSeedId ? 'ERP Implementation' : '—');
  if (isSeedId) {
    if (isInventory) {
      category = 'IT & Computer Equipment';
      subCategory = 'Cloud Inventory';
    } else if (isStructural) {
      category = 'Engineering Services';
      subCategory = 'Structural Design';
    } else if (isWaste) {
      category = 'Environmental Services';
      subCategory = 'Waste Management';
    } else if (isRobot) {
      category = 'Automation & Robotics';
      subCategory = 'Robotics Sorting';
    } else if (isHvac) {
      category = 'Maintenance Services';
      subCategory = 'HVAC AMC';
    }
  }

  // 5. Closes At / Closes At formatted
  const publishedDateValue = firstPresent(
    schedule.publishDate,
    tender.publishDate,
    tender.bidStartDate,
    schedule.submissionStartDate,
    rfpData?.createdAt
  );
  const closingDateValue = firstPresent(
    tender.bidClosingDate,
    schedule.submissionDate,
    schedule.bidClosingDate,
    rfpData?.deadlineDate
  );
  let closesAtFormatted = closingDateValue ? formatDateString(closingDateValue, true) : '—';
  if (closesAtFormatted === '—' && isSeedId) {
    if (isInventory) closesAtFormatted = '26 Jul 2026 17:00 IST';
    else if (isStructural) closesAtFormatted = '28 Jul 2026 17:00 IST';
    else if (isWaste) closesAtFormatted = '30 Jul 2026 17:00 IST';
    else if (isRobot) closesAtFormatted = '02 Aug 2026 17:00 IST';
    else if (isHvac) closesAtFormatted = '04 Aug 2026 17:00 IST';
    else closesAtFormatted = '30 Sep 2026 17:00 IST';
  }

  const publishedDateFormatted = publishedDateValue ? formatDateString(publishedDateValue) : (isSeedId ? '16 Jul 2026' : '—');

  // 6. RFP Scope Text
  const scopeText = rfpData?.description || (isSeedId 
    ? (isInventory ? "Sourcing a cloud-based inventory tracking and storage reconciliation platform integrated with internal ERP modules."
      : isStructural ? "Consultancy contract for designing the load bearing structural framework of Nagpur factory assembly plant expansion."
      : isWaste ? "Safe disposal, packaging, logistics, and compliance reporting of hazardous chemical byproducts from manufacturing plant."
      : isRobot ? "Integration and programming of automated robotic arm sorting systems along shipping conveyors in main sorting zone."
      : isHvac ? "Annual Maintenance Contract for heavy industrial centralized ventilation, air filter chambers, and HVAC overhauls."
      : "Implementation of end-to-end ERP solution covering Finance, Inventory, Procurement, Sales, HR & Payroll modules with integration and user training.")
    : "No scope description provided.");

  // 8. Key Dates Rows
  const clarificationEndDateValue = firstPresent(schedule.clarificationEndDate, schedule.clarificationDeadline, tender.clarificationEndDate, rfpData?.clarificationEndDate, schedule.preBidDate, schedule.preBidMeetingDate, tender.preBidDate, tender.preBidMeetingDate);
  const technicalEvalDateValue = firstPresent(tender.technicalEvaluationDate, schedule.technicalOpeningDate, rfpData?.technicalOpeningDate);
  const presentationDateValue = firstPresent(schedule.presentationDate, tender.presentationDate);
  const finalEvalDateValue = firstPresent(tender.financialEvaluationDate, schedule.financialOpeningDate, schedule.finalEvaluationDate, rfpData?.financialOpeningDate);
  const awardDateValue = firstPresent(tender.awardDate, schedule.awardDate, schedule.awardingDate);

  let preBidMeetingDate = clarificationEndDateValue ? formatDateString(clarificationEndDateValue, true) : (isSeedId ? '15 Jul 2026, 11:00 AM' : '—');
  let submissionEndDate = closesAtFormatted;
  let technicalEvalDate = technicalEvalDateValue ? formatDateString(technicalEvalDateValue, true) : (isSeedId ? '30 Sep 2026' : '—');
  let presentationDate = presentationDateValue ? formatDateString(presentationDateValue, true) : (isSeedId ? '05 Aug 2026' : '—');
  let finalEvalDate = finalEvalDateValue ? formatDateString(finalEvalDateValue, true) : (isSeedId ? '30 Sep 2026' : '—');
  let awardDate = awardDateValue ? formatDateString(awardDateValue, true) : (isSeedId ? '10 Aug 2026 (Tentative)' : '—');

  if (isSeedId && isStructural) {
    preBidMeetingDate = '17 Jul 2026, 11:00 AM';
    submissionEndDate = closesAtFormatted;
    technicalEvalDate = '28 Jul 2026 - 05 Aug 2026';
    presentationDate = '07 Aug 2026';
    finalEvalDate = '08 Aug 2026 - 11 Aug 2026';
    awardDate = '12 Aug 2026 (Tentative)';
  } else if (isSeedId && isWaste) {
    preBidMeetingDate = '19 Jul 2026, 11:00 AM';
    submissionEndDate = closesAtFormatted;
    technicalEvalDate = '30 Jul 2026 - 07 Aug 2026';
    presentationDate = '09 Aug 2026';
    finalEvalDate = '10 Aug 2026 - 13 Aug 2026';
    awardDate = '15 Aug 2026 (Tentative)';
  }

  // 7. Timeline Steps (blue checked circles, matching mockup style)
  const timelineSteps = [
    { label: 'RFP Published', date: publishedDateFormatted, completed: publishedDateFormatted !== '—' },
    { label: 'Clarification Deadline', date: preBidMeetingDate, completed: preBidMeetingDate !== '—' },
    { label: 'Proposal Submission', date: submissionEndDate, completed: false },
    { label: 'Technical Evaluation', date: technicalEvalDate, completed: technicalEvalDate !== '—' && submissionEndDate === '—' },
    { label: 'Presentation', date: presentationDate, completed: false },
    { label: 'Final Evaluation', date: finalEvalDate, completed: false },
    { label: 'Award', date: awardDate, completed: false },
  ];

  // 9. Activity Snapshot counts
  const totalQueries = rfpData?.clarifications?.length || (isSeedId ? (isInventory ? 9 : isStructural ? 4 : isWaste ? 7 : 15) : 0);
  const totalResponses = rfpData?.participations?.length || (isSeedId ? (isInventory ? 9 : isStructural ? 4 : isWaste ? 7 : 15) : 0);

  // 10. Documents
  const documents: any[] = [];
  const rawDocs = (rfpData as any)?.documents || (reqData as any)?.documents || (bidData as any)?.bidDocuments || [];
  if (Array.isArray(rawDocs) && rawDocs.length > 0) {
    rawDocs.forEach((doc: any) => {
      documents.push({
        id: doc.id,
        name: doc.name || doc.title || doc.originalName || doc.fileName || doc.documentType || 'Bid document',
        meta: [doc.documentType, doc.mimeType].filter(Boolean).join(' - ') || 'Uploaded document',
        fileAssetId: doc.fileAssetId,
        url: doc.fileUrl || doc.url,
      });
    });
  }
  if (rfpData?.documentUrl) {
    documents.push({
      id: rfpData.id,
      name: rfpData.documentUrl.split('/').pop() || 'RFP Document',
      meta: 'Document link',
      url: rfpData.documentUrl
    });
  }

  const knownPayloadKeys = new Set([
    'id',
    'type',
    'fullProcurementMethod',
    'buyerType',
    'buyingType',
    'basics',
    'internal',
    'items',
    'serviceDetails',
    'boqTable',
    'boq',
    'boqFileAssetId',
    'boqFileName',
    'vendors',
    'schedule',
    'terms',
    'requiredDocs',
    'documents',
    'evaluation',
    'approval',
    'auctionConfig',
    'rateContractConfig',
    'rateContract',
    'consigneeDetails',
    'tender',
    'rules',
    'recommendation',
    'rfqType',
    'questionnaire',
    'requireDemo',
    'tenderType',
    'limitedTenderJustification',
    'sealedSubmissionFlag',
    'draftStep',
    'workflowStatus',
    'approvalStatus',
    'updatedAt',
    'sourceRequirementId',
    'requirementId',
    'requirementNumber',
    'linkedProcurementBidId',
    'linkedProcurementBidNumber',
  ]);

  const additionalPayloadFields = compactObject(
    Object.fromEntries(Object.entries(payload).filter(([key]) => !knownPayloadKeys.has(key)))
  );

  const activeProcurementMethod = String(payload?.fullProcurementMethod || payload?.type || rfpData?.procurementType || '').toUpperCase();
  const activeBuyingType = String(payload?.buyingType || basics?.whatAreYouBuying || '').toUpperCase();
  const isServiceType = pathname.includes('rfp') || activeProcurementMethod.includes('RFP') || activeProcurementMethod.includes('RFI') || activeBuyingType.includes('SERVICE');

  const procurementDetailSections = [
    {
      title: 'Procurement Record',
      icon: Info,
      data: compactObject({
        rfpNumber: rfpNumberString,
        title: subject,
        status: rfpData?.status,
        category,
        subCategory,
        estimatedValue: estimatedValueVal,
        publishedDate: publishedDateFormatted,
        submissionDeadline: closesAtFormatted,
        deliveryLocation: deliveryLocationDisplay,
        scope: scopeText,
      }),
    },
    {
      title: 'Procurement Intent & Method',
      icon: ClipboardList,
      data: compactObject({
        procurementMethod: payload.fullProcurementMethod || payload.type || rfpData?.procurementType,
        buyerType: payload.buyerType || basics.buyerType,
        buyingType: payload.buyingType || basics.whatAreYouBuying,
        rfqType: payload.rfqType,
        tenderType: payload.tenderType,
        sealedSubmissionFlag: payload.sealedSubmissionFlag,
        limitedTenderJustification: payload.limitedTenderJustification,
        requireDemo: payload.requireDemo,
        recommendation: payload.recommendation,
        ...basics,
      }),
    },
    {
      title: 'Buyer Organization & Contact',
      icon: Building2,
      data: compactObject({
        ...internal,
        organization: orgName,
        contactPerson,
        email,
        phone,
        address,
      }),
    },
    {
      title: isServiceType ? 'RFP Service Details' : 'Items / Line Items',
      icon: isServiceType ? FileText : Package,
      data: isServiceType 
        ? (payload.serviceDetails || payload.items || rfpData?.items)
        : (payload.items || rfpData?.items),
    },
    {
      title: 'BOQ Details',
      icon: FileSpreadsheet,
      data: compactObject({
        boqFileName: payload.boqFileName,
        boqFileAssetId: payload.boqFileAssetId,
        boqTable: payload.boqTable || payload.boq,
      }),
    },
    {
      title: 'Service Details',
      icon: FileText,
      data: isServiceType ? undefined : payload.serviceDetails,
    },
    {
      title: 'Vendor / Supplier Selection',
      icon: User,
      data: payload.vendors,
    },
    {
      title: 'Schedule, Tender & Rules',
      icon: CalendarDays,
      data: compactObject({
        ...schedule,
        tender,
        rules,
      }),
    },
    {
      title: 'Commercial Terms',
      icon: IndianRupee,
      data: compactObject({
        ...terms,
        paymentTerms: paymentTermsDisplay,
        deliveryTerms: firstPresent(rfpData?.deliveryTerms, terms.deliveryTerms) || '—',
        termsAndConditions: rawBid?.terms,
        eligibilityCriteria: rawBid?.eligibility,
      }),
    },
    {
      title: 'Required Documents',
      icon: FileText,
      data: compactObject({
        requiredDocs: payload.requiredDocs,
        procurementDocuments: payload.documents,
        uploadedDocuments: documents,
      }),
    },
    {
      title: 'Evaluation Criteria',
      icon: ClipboardCheck,
      data: evaluation,
    },
    {
      title: 'Approval Details',
      icon: ShieldCheck,
      data: payload.approval,
    },
    {
      title: 'Consignee & Delivery',
      icon: MapPin,
      data: payload.consigneeDetails,
    },
    {
      title: 'Questionnaire / Demo',
      icon: MessageSquare,
      data: compactObject({
        questionnaire: payload.questionnaire,
        requireDemo: payload.requireDemo,
      }),
    },
    {
      title: 'Reverse Auction Configuration',
      icon: TrendingUp,
      data: payload.auctionConfig,
    },
    {
      title: 'Rate Contract Configuration',
      icon: Clipboard,
      data: payload.rateContractConfig || payload.rateContract,
    },
    {
      title: 'System Links & Workflow',
      icon: Layers,
      data: compactObject({
        draftId: payload.id,
        draftStep: payload.draftStep,
        workflowStatus: payload.workflowStatus,
        approvalStatus: payload.approvalStatus,
        updatedAt: payload.updatedAt,
        sourceRequirementId: payload.sourceRequirementId,
        requirementId: payload.requirementId,
        requirementNumber: payload.requirementNumber,
        linkedProcurementBidId: payload.linkedProcurementBidId,
        linkedProcurementBidNumber: payload.linkedProcurementBidNumber,
      }),
    },
    {
      title: 'Additional Procurement Fields',
      icon: Layers,
      data: additionalPayloadFields,
    },
  ].filter(section => hasDetailData(section.data));

  const handleDownload = () => {
    toast.success('Downloading RFP package...');
  };

  const handleSubmitProposal = () => {
    if (!user) {
      toast.error('Please login to participate and submit your proposal.');
      router.push(`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`);
      return;
    }
    const targetBidId = requestId || rfpData?.payload?.linkedProcurementBidId || rfpData?.tenders?.[0]?.id || (requirementId && !isNaN(Number(requirementId)) ? Math.abs(Number(requirementId)) : requirementId);
    router.push(`/bids/${targetBidId}/participate`);
  };

  const InfoRow = ({ label, value, red }: { label: string; value: string; red?: boolean }) => (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{label}</span>
      <span className={cn("text-xs font-semibold text-right", red ? "text-red-600" : "text-slate-800")}>{value}</span>
    </div>
  );

  const statusLabel = rfpData?.status || 'Published';
  const statusClass = /open|publish|active/i.test(statusLabel)
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : /close|cancel|reject/i.test(statusLabel)
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';

  const priorityCards = [
    {
      label: 'Procurement Status',
      value: statusLabel,
      icon: ShieldCheck,
      className: statusClass,
    },
    {
      label: 'Submission Deadline',
      value: closesAtFormatted,
      icon: Clock,
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    },
    {
      label: 'Estimated Value',
      value: formatCurrency(estimatedValueVal),
      icon: IndianRupee,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      label: 'EMD',
      value: emdDisplay,
      icon: IndianRupee,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: 'Payment Terms',
      value: paymentTermsDisplay,
      icon: Info,
      className: 'border-sky-200 bg-sky-50 text-sky-700',
    },
    {
      label: 'Evaluation Method',
      value: evaluationMethodDisplay,
      icon: ClipboardCheck,
      className: 'border-violet-200 bg-violet-50 text-violet-700',
    },
  ];

  return (
    <div className="mx-auto max-w-[1540px] scroll-smooth space-y-5 px-4 py-5 md:px-8 animate-in fade-in duration-500">
      <style dangerouslySetInnerHTML={{ __html: `html { scroll-behavior: smooth; }` }} />
      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500 animate-in fade-in slide-in-from-top-2 duration-300">
        {pathname.startsWith('/buyer') ? (
          <>
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/buyer/my-procurements')}>My Procurements</span>
            <ChevronRight className="h-3 w-3" />
          </>
        ) : (
          <>
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities')}>Opportunities</span>
            <ChevronRight className="h-3 w-3" />
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities/rfps')}>RFPs</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span className="hover:text-slate-800 cursor-pointer">{rfpNumberString}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-slate-900">Details</span>
      </nav>

      {/* Guest login banner */}
      {!user && (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <Info className="h-5 w-5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900">Want to participate in this procurement?</p>
            <p className="text-xs text-amber-700 mt-0.5">Please login or register as a seller to submit your quotation/proposal.</p>
          </div>
          <a
            href={`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`}
            className="whitespace-nowrap rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-700"
          >
            Login to Participate
          </a>
        </div>
      )}

{/* ── Page Header ── */}
      <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-md shadow-slate-200/40 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider', statusClass)}>
                <div className="h-2 w-2 rounded-full bg-current animate-pulse"></div>
                {statusLabel}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                <Building2 className="h-3.5 w-3.5" /> Buyer: {orgName}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 uppercase tracking-wider">
                <Layers className="h-3.5 w-3.5" /> {evaluationMethodDisplay !== '—' ? evaluationMethodDisplay : 'Standard'}
              </span>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-950 leading-tight">
              {subject}
            </h1>
            
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 font-mono font-bold">
                {rfpNumberString}
              </div>
              <span className="h-4 w-px bg-slate-300"></span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" /> Published {publishedDateFormatted}
              </span>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex shrink-0 flex-wrap items-center gap-3 mt-4 lg:mt-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              className="h-11 rounded-xl border-slate-200 text-sm font-bold uppercase tracking-wider text-slate-700 transition-all duration-300 hover:-translate-y-1 hover:bg-slate-50 hover:shadow-md hover:border-slate-300 flex items-center gap-2"
            >
              <Download className="h-4 w-4" /> Download
            </Button>
            {user && user.role === 'seller' && (
              <Button
                type="button"
                onClick={handleSubmitProposal}
                className="h-11 rounded-xl bg-slate-900 px-6 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:bg-slate-800 hover:shadow-lg flex items-center gap-2"
              >
                {hasSubmittedProposal ? 'View Proposal' : 'Submit Proposal'} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Enterprise KPI Strip */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-5 gap-4 border-t border-slate-100 pt-8">
          <div className="group relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-100">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-100/50 transition-transform duration-500 group-hover:scale-150"></div>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-200/50 text-emerald-700"><IndianRupee className="h-3.5 w-3.5" /></div>
                Estimated Value
              </span>
              <span className="text-2xl font-black tracking-tight text-emerald-950">{formatCurrency(estimatedValueVal)}</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-rose-100 bg-rose-50/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-rose-100">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-rose-100/50 transition-transform duration-500 group-hover:scale-150"></div>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-200/50 text-rose-700"><Clock className="h-3.5 w-3.5" /></div>
                Closing Date
              </span>
              <span className="text-xl font-bold tracking-tight text-rose-950 leading-tight">{closesAtFormatted}</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-100">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-blue-100/50 transition-transform duration-500 group-hover:scale-150"></div>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-200/50 text-blue-700"><Calendar className="h-3.5 w-3.5" /></div>
                Tech Opening
              </span>
              <span className="text-xl font-bold tracking-tight text-blue-950 leading-tight">{technicalEvalDate}</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-amber-100 bg-amber-50/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-100">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-100/50 transition-transform duration-500 group-hover:scale-150"></div>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-200/50 text-amber-700"><ShieldCheck className="h-3.5 w-3.5" /></div>
                EMD Required
              </span>
              <span className="text-xl font-bold tracking-tight text-amber-950">{emdDisplay}</span>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-violet-100 bg-violet-50/50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-100">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-violet-100/50 transition-transform duration-500 group-hover:scale-150"></div>
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-xs font-bold text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-200/50 text-violet-700"><ClipboardCheck className="h-3.5 w-3.5" /></div>
                Evaluation
              </span>
              <span className="text-xl font-bold tracking-tight text-violet-950">{evaluationMethodDisplay}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Timeline Section ── */}
      <div className="sticky top-3 z-20 rounded-lg border border-slate-200/80 bg-white/90 p-2 shadow-sm shadow-slate-200/50 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex gap-1.5 overflow-x-auto">
          {quickNavItems.map(item => (
            <button
              key={item.label}
              type="button"
              onClick={() => scrollToSection(item.ref)}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-all duration-200 hover:bg-slate-900 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-900/20"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

<section ref={timelineRef} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 scroll-mt-24 overflow-x-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-lg font-bold text-slate-950 pb-4 uppercase tracking-wider flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-600" /> Procurement Timeline
        </h2>
        <div className="min-w-[1000px] flex items-start justify-between relative px-2 py-6">
          {timelineSteps.map((step, idx) => {
            const hasNext = idx < timelineSteps.length - 1;
            const nextStepCompleted = hasNext && timelineSteps[idx + 1].completed;
            const isCurrent = step.completed && !nextStepCompleted; // The "active" bouncing step
            const isCompleted = step.completed && !isCurrent;
            const isPending = !step.completed;
            const stepNum = String(idx + 1).padStart(2, '0');

            return (
              <div key={idx} className="flex flex-col items-center relative flex-1 last:flex-none group">
                {/* Background line segment */}
                {hasNext && (
                  <div className="absolute top-7 left-[50%] w-full h-1 rounded-full bg-slate-100 z-0" />
                )}
                {/* Active line segment */}
                {hasNext && step.completed && (
                  <div className={cn("absolute top-7 left-[50%] h-1 rounded-full bg-indigo-600 z-0 transition-all duration-1000 ease-in-out", nextStepCompleted ? "w-full" : "w-0")} />
                )}

                {/* Circle Icon Node */}
                <div className="flex h-14 w-14 items-center justify-center bg-white relative z-10 transition-transform duration-500 group-hover:scale-110">
                  {isCompleted ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-200 transition-all duration-300">
                      <Check className="h-5 w-5 stroke-[3]" />
                    </div>
                  ) : isCurrent ? (
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white border-2 border-indigo-600 text-indigo-700 shadow-lg shadow-indigo-100">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-20"></span>
                      <span className="font-bold text-lg tracking-tight">{stepNum}</span>
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 border-2 border-slate-200 text-slate-400 transition-colors duration-300 group-hover:border-slate-300 group-hover:text-slate-500">
                      <span className="font-bold text-lg tracking-tight">{stepNum}</span>
                    </div>
                  )}
                </div>

                {/* Labels */}
                <div className="mt-5 space-y-1.5 text-center w-32 px-1">
                  <p className={cn(
                    "text-xs uppercase tracking-wider transition-colors duration-300",
                    isCurrent ? "text-indigo-700 font-extrabold" : isCompleted ? "text-slate-900 font-bold" : "text-slate-500 font-semibold"
                  )}>
                    {step.label}
                  </p>
                  <p className={cn(
                    "text-[11px] font-semibold transition-colors duration-300",
                    isCurrent || isCompleted ? "text-slate-600" : "text-slate-400"
                  )}>
                    {step.date}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── RFP Overview / General Info ── */}
      <section ref={overviewRef} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
        <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            General Information
          </h2>
        </div>
        
        <div className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <Layers className="h-3.5 w-3.5" /> RFP Number
            </span>
            <span className="text-sm font-mono font-bold text-slate-900">{rfpNumberString}</span>
          </div>
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <Package className="h-3.5 w-3.5" /> Category
            </span>
            <span className="text-sm font-bold text-slate-900">{category}</span>
          </div>
          {subCategory && (
            <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
                <Package className="h-3.5 w-3.5" /> Sub Category
              </span>
              <span className="text-sm font-bold text-slate-900">{subCategory}</span>
            </div>
          )}
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <Calendar className="h-3.5 w-3.5" /> Published
            </span>
            <span className="text-sm font-bold text-slate-900">{publishedDateFormatted}</span>
          </div>
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <Clock className="h-3.5 w-3.5" /> Duration
            </span>
            <span className="text-sm font-bold text-slate-900">{projectDurationDisplay}</span>
          </div>
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <MapPin className="h-3.5 w-3.5" /> Delivery Location
            </span>
            <span className="text-sm font-bold text-slate-900">{deliveryLocationDisplay}</span>
          </div>
          <div className="group flex flex-col gap-1.5 rounded-lg border border-transparent p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 transition-colors group-hover:text-indigo-600">
              <Info className="h-3.5 w-3.5" /> Payment Terms
            </span>
            <span className="text-sm font-bold text-slate-900">{paymentTermsDisplay}</span>
          </div>
        </div>
      </section>

      {/* ── Main Details Grid (2 columns layout) ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Left Column (spans 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scope Card */}
          <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
            <h2 className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                <FileText className="h-4 w-4" />
              </span>
              RFP Scope
            </h2>
            <div className="group rounded-xl bg-slate-50 border border-slate-100 p-5 transition-all duration-300 hover:bg-white hover:border-indigo-100 hover:shadow-sm">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700 break-words transition-colors group-hover:text-slate-900">
                {scopeText}
              </p>
            </div>
          </section>

          {/* Key Dates Vertical Timeline Card */}
          <section ref={keyDatesRef} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 scroll-mt-24 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
            <h2 className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-slate-900 border-b border-slate-100 pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 border border-rose-100 text-rose-600">
                <CalendarDays className="h-4 w-4" />
              </span>
              Key Dates
            </h2>
            <div className="relative pl-3 space-y-6">
              <div className="absolute left-[19px] top-3 bottom-3 w-px bg-slate-200 z-0"></div>
              {[
                { label: 'Bid Published', value: publishedDateFormatted, active: publishedDateFormatted !== '—', color: 'emerald' },
                { label: 'Clarification Deadline', value: preBidMeetingDate, active: preBidMeetingDate !== '—', color: 'slate' },
                { label: 'Proposal Submission End', value: submissionEndDate, active: submissionEndDate !== '—', color: 'rose', highlight: true },
                { label: 'Technical Opening', value: technicalEvalDate, active: technicalEvalDate !== '—', color: 'blue' },
                { label: 'Presentation', value: presentationDate, active: presentationDate !== '—', color: 'slate' },
                { label: 'Financial Opening', value: finalEvalDate, active: finalEvalDate !== '—', color: 'blue' },
                { label: 'Awarding Date', value: awardDate, active: awardDate !== '—', color: 'slate' },
              ].map((row, idx) => (
                <div key={idx} className="relative z-10 flex items-start gap-4">
                  <div className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full mt-1 border-[3px] bg-white ring-4 ring-white",
                    row.active ? `border-${row.color}-500` : "border-slate-300"
                  )}></div>
                  <div className={cn(
                    "flex flex-col flex-1 rounded-lg px-3 py-2 -mt-2 transition-all duration-300",
                    row.highlight && row.active ? "bg-rose-50/50 border border-rose-100 shadow-sm" : "hover:bg-slate-50"
                  )}>
                    <span className={cn("text-xs uppercase tracking-wider", row.active ? "font-bold text-slate-700" : "font-semibold text-slate-400")}>
                      {row.label}
                    </span>
                    <span className={cn("text-sm mt-0.5 font-bold", row.active ? (row.highlight ? "text-rose-700" : "text-slate-900") : "text-slate-500")}>
                      {row.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

{/* ═══ COLUMN 3: Buyer Information Profile Card ═══ */}
        <section ref={buyerInfoRef} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 scroll-mt-24 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
             <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 shadow-sm">
                <Building2 className="h-6 w-6" />
             </div>
             <div>
                <h2 className="text-lg font-bold text-slate-950 uppercase tracking-wider leading-tight">
                  Buyer Information
                </h2>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider border border-emerald-200">
                    <ShieldCheck className="h-3 w-3" /> Verified Account
                  </span>
                </div>
             </div>
          </div>
          
          <div className="space-y-5 mt-2">
            <div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
              <div className="mt-0.5 text-slate-400 group-hover:text-indigo-600"><Building2 className="h-4 w-4" /></div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Organization</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{orgName}</span>
              </div>
            </div>

            <div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
              <div className="mt-0.5 text-slate-400 group-hover:text-indigo-600"><User className="h-4 w-4" /></div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Contact Person</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{contactPerson}</span>
              </div>
            </div>

            <div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
              <div className="mt-0.5 text-slate-400 group-hover:text-indigo-600"><Mail className="h-4 w-4" /></div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Email</span>
                <span className="text-sm font-mono font-bold text-indigo-700 block mt-0.5 hover:underline cursor-pointer">{email}</span>
              </div>
            </div>

            <div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
              <div className="mt-0.5 text-slate-400 group-hover:text-indigo-600"><Phone className="h-4 w-4" /></div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Phone</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{phone}</span>
              </div>
            </div>

            <div className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-slate-50">
              <div className="mt-0.5 text-slate-400 group-hover:text-indigo-600"><MapPin className="h-4 w-4" /></div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Address</span>
                <span className="text-xs font-semibold leading-relaxed text-slate-600 block mt-1">{address}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Bottom Section: RFP Documents & Activity Snapshot ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        
{/* RFP Documents Card */}
        <section ref={documentsRef} className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 scroll-mt-24 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
          <h2 className="text-lg font-bold text-slate-950 pb-4 border-b border-slate-100 uppercase tracking-wider flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> RFP Documents
          </h2>
          
          <div className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 xl:grid-cols-3">
            {documents.length > 0 ? (
              documents.map((doc, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    if (doc.fileAssetId || doc.url) {
                      openFileAsset({
                        id: doc.fileAssetId || doc.id,
                        fileAssetId: doc.fileAssetId,
                        originalName: doc.name,
                        url: doc.url,
                      }, doc.name).catch(err => {
                        toast.error(err instanceof Error ? err.message : 'Unable to open document');
                      });
                    }
                  }}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-300 hover:bg-white hover:shadow-lg hover:shadow-indigo-100 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 transition-transform duration-300 group-hover:scale-110">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-bold text-slate-900 block leading-tight truncate group-hover:text-indigo-700 transition-colors">{doc.name}</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        {doc.meta?.toUpperCase() === 'REQUIRED' ? (
                          <span className="inline-flex items-center rounded-md bg-rose-50 border border-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-600">
                            Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-200/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                            {doc.meta || 'Document'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <span className="flex items-center gap-1 text-xs font-bold uppercase text-indigo-600">
                      View File <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm font-bold text-slate-500 col-span-full py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                No documents uploaded for this RFP.
              </p>
            )}
          </div>
        </section>

{/* Activity Snapshot Section */}
        <section className="rounded-xl border border-slate-200/60 bg-white p-6 shadow-sm shadow-slate-200/40 animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all hover:shadow-md hover:-translate-y-1 hover:border-slate-300">
          <h2 className="text-lg font-bold text-slate-950 pb-4 border-b border-slate-100 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" /> Activity Snapshot
          </h2>
          
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-slate-300 hover:shadow-sm">
              <HelpCircle className="absolute -right-2 -top-2 h-16 w-16 text-slate-200/50" />
              <div className="relative z-10">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Total Queries</span>
                <span className="text-3xl font-black text-slate-900 mt-1 block tabular-nums">{totalQueries}</span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-slate-300 hover:shadow-sm">
              <MessageSquare className="absolute -right-2 -top-2 h-16 w-16 text-slate-200/50" />
              <div className="relative z-10">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Total Responses</span>
                <span className="text-3xl font-black text-slate-900 mt-1 block tabular-nums">{totalResponses}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Procurement Details Structured Grids ── */}
      <section ref={detailsRef} className={`${detailCardClass} mt-8 scroll-mt-24 space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-500`}>
        <div className="pb-4 border-b border-slate-100 mb-8 pl-1">
          <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-violet-700 uppercase tracking-widest flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 border border-indigo-200/50 shadow-sm shadow-indigo-100">
              <Layers className="h-5 w-5 text-indigo-700" />
            </span>
            Comprehensive Procurement Details
          </h2>
          <p className="text-[13px] font-bold text-slate-500 mt-2 ml-14">
            Specifications, terms, and requirements for this RFP.
          </p>
        </div>

        {procurementDetailSections.length > 0 ? (
          <ProcurementDetailsLayout sections={procurementDetailSections} />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-bold text-slate-500">
            No additional procurement details were found for this RFP.
          </p>
        )}
      </section>

      {/* ── Seller Proposals (Buyer View) ── */}
      {(user?.role === 'buyer' || user?.id === rfpData?.buyer?.id) && rfpData?.participations && rfpData.participations.length > 0 && (
        <section className={`${detailCardClass} mt-8 animate-in fade-in slide-in-from-bottom-3 duration-500`}>
          <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <User className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-950 uppercase tracking-wider">
              Seller Proposals
            </h2>
          </div>
          
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50">
                <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 border-b border-slate-100">Seller Name</th>
                  <th className="px-4 py-3 border-b border-slate-100">Submission Status</th>
                  <th className="px-4 py-3 border-b border-slate-100">Tech Eval</th>
                  <th className="px-4 py-3 border-b border-slate-100">Submitted At</th>
                  <th className="px-4 py-3 border-b border-slate-100 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {rfpData.participations.filter((p: any) => p.submissionStatus === 'SUBMITTED').map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 text-slate-900">{p.seller?.sellerProfile?.organizationName || p.seller?.name || `Seller #${p.sellerId}`}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        {p.submissionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">{p.technicalStatus || 'Pending'}</td>
                    <td className="px-4 py-3 text-xs">{formatDateString(p.updatedAt || p.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        onClick={() => router.push(`/bids/${rfpData.id}/results`)}
                        className="h-8 rounded-lg bg-indigo-50 px-3 text-xs font-semibold uppercase text-indigo-600 hover:bg-indigo-100 flex items-center gap-1.5 ml-auto"
                      >
                        <Eye className="h-3.5 w-3.5" /> Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {rfpData.participations.filter((p: any) => p.submissionStatus === 'SUBMITTED').length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs font-bold text-slate-500">
                      No proposals submitted yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

    </div>
  );
}
