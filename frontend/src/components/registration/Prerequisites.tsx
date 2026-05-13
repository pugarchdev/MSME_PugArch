import React, { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Select } from '../ui/input';
import { CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

const sellerBusinessTypes = [
  { value: 'Proprietorship', label: 'Proprietorship' },
  { value: 'Partnership', label: 'Partnership Firm' },
  { value: 'Company', label: 'Company (Pvt Ltd / Ltd)' },
  { value: 'LLP', label: 'LLP' },
  { value: 'MSME', label: 'MSME' },
  { value: 'Startup', label: 'Startup' },
];

const buyerBusinessTypes = [
  { value: 'Primary User (HOD)', label: 'Primary User (HOD)' },
  { value: 'Verifying Authority (VA)', label: 'Verifying Authority (VA)' },
  { value: 'Primary User (Co-operative)', label: 'Primary User (Co-operative)' },
];

const buyerBaseRequiredDocs = [
  { id: 'aadhaar-number', content: 'Aadhaar number' },
  { id: 'aadhaar-mobile', content: 'Active Mobile number to which your Aadhaar is linked - for OTP purpose' },
];

const getBuyerRequiredDocs = (selectedType: string) => [
  ...buyerBaseRequiredDocs,
  {
    id: 'active-email',
    content: selectedType === 'Primary User (Co-operative)' ? (
      <>
        Active Email Id:- Use E-mail ID, Company/ organisation E-mail ID and ID from whitelisted domains to verify the OTP. To view list of whitelisted domains (Accepted by MSME Portal),{' '}
        <button type="button" className="font-bold text-indigo-600 hover:underline">Click Here</button>
      </>
    ) : (
      <>
        Government email id - preferably designation based. To view list of whitelisted domains (accepted at MSME Portal),{' '}
        <button type="button" className="font-bold text-indigo-600 hover:underline">Click Here</button>
      </>
    ),
  },
];

const prerequisiteDocs: Record<string, { personal: string[], business: string[], optional: string[] }> = {
  'Proprietorship': {
    personal: [
      'Aadhaar/Virtual ID and Aadhaar linked mobile number OR Personal PAN details with mobile number',
      'Active Email ID - Personal E-mail Id or Company / Organisation allotted Email-Id (to verify OTP)'
    ],
    business: [
      'Business PAN details (4th character of your PAN number should be P or H)',
      'Bank account number and IFSC (Not mandatory for Vivad se Vishwas)',
      'Income tax returns of last 3 years (It is required for BID participation if your business is older than 24 months) (Not mandatory for Vivad se Vishwas)',
      'Registered Address (Not mandatory for Vivad se Vishwas)',
      'Udyam number for MSME (EMD exemption in BID) (Required for Vivad se Vishwas)'
    ],
    optional: [
      'DIPP number for startup (EMD exemption for eligible start ups)',
      'GST number for inter state business'
    ]
  },
  'default': {
    personal: [
      'Aadhaar/Virtual ID and Aadhaar linked mobile number OR Personal PAN details with mobile number',
      'Active Email ID - Personal E-mail Id or Company / Organisation allotted Email-Id (to verify OTP)'
    ],
    business: [
      'Business PAN details',
      'Bank account number and IFSC',
      'Income tax returns of last 3 years',
      'Registered Address',
      'Udyam number'
    ],
    optional: [
      'DIPP number',
      'GST number'
    ]
  }
};

interface PrerequisitesProps {
  onProceed: (type: string) => void;
  role: 'buyer' | 'seller';
}

export default function Prerequisites({ onProceed, role }: PrerequisitesProps) {
  const [selectedType, setSelectedType] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  
  const docs = prerequisiteDocs[selectedType] || prerequisiteDocs['default'];

  const handleCheck = (item: string) => {
    setCheckedItems(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const isBuyer = role === 'buyer';
  const buyerRequiredDocs = getBuyerRequiredDocs(selectedType);
  const allRequiredChecked = selectedType && (isBuyer 
    ? buyerRequiredDocs.every(item => checkedItems[item.id])
    : [
      ...docs.personal,
      ...docs.business
    ].every(item => checkedItems[item])
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Card className="overflow-visible rounded-2xl border-none bg-white shadow-lg shadow-slate-200/70 sm:shadow-xl">
        <div className="p-4 pb-3 text-left sm:p-6 md:p-8 md:pb-4">
           <h2 className="text-lg font-bold text-slate-800 sm:text-xl">Pre-requisites</h2>
           <p className="mt-1 text-xs leading-relaxed text-slate-500 sm:text-sm md:text-xs">Registration on PugArch should be done by an authorized person (Director of the organisation or a Key Person/Proprietor).</p>
        </div>
        
        <CardContent className="p-4 pt-0 pb-10 sm:p-6 sm:pt-0 sm:pb-12 md:p-8 md:pt-0 md:pb-16">
          <div className="mb-6 sm:mb-8">
            <label className="mb-2 block text-xs font-bold text-slate-700">{isBuyer ? 'User Type' : 'Business / Organisation Type'} * <Info className="inline h-3 w-3 text-slate-400" /></label>
            <div className="w-full max-w-md">
              <Select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCheckedItems({});
                }}
                className="h-12 rounded-xl border-slate-200 bg-white text-base sm:text-sm"
              >
                <option value="">{isBuyer ? 'Select type of User' : 'Select type'}</option>
                {(role === 'buyer' ? buyerBusinessTypes : sellerBusinessTypes).map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
          </div>

          {selectedType && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {isBuyer ? (
                <>
                  <div className="mb-2 flex items-center gap-2">
                     <h3 className="text-sm font-bold leading-snug text-slate-800">For user registration, you require the following before you can proceed.</h3>
                  </div>
                  <BuyerSection
                    items={buyerRequiredDocs}
                    onCheck={handleCheck} 
                    checkedItems={checkedItems} 
                  />
                  <button className="min-h-10 text-left text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline">
                    {selectedType} User Manual
                  </button>
                  <div className="space-y-2">
                    <p className="text-xs font-bold leading-relaxed text-slate-800">
                      If you want to register as the buyers/ users involved in procurement process please contact Primary user (HOD) of your organisation
                    </p>
                    <p className="text-[10px] leading-relaxed text-slate-500">
                      Note: Only non-buying roles i.e. Primary User (HOD)/ Verifying Authority can get registered from here.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                     <h3 className="text-sm font-bold text-slate-800">Required *</h3>
                  </div>
                  <Section 
                    title="Personal Details" 
                    items={docs.personal} 
                    onCheck={handleCheck} 
                    checkedItems={checkedItems} 
                  />
                  <Section 
                    title="Business Details" 
                    items={docs.business} 
                    onCheck={handleCheck} 
                    checkedItems={checkedItems} 
                  />
                  <Section 
                    title="Optional" 
                    items={docs.optional} 
                    onCheck={handleCheck} 
                    checkedItems={checkedItems} 
                    isOptional 
                  />
                </>
              )}
              
              <div className="flex flex-col items-stretch justify-between gap-4 pt-6 sm:pt-8 md:flex-row md:items-center">
                <button className="min-h-10 text-left text-[10px] font-black uppercase  tracking-widest text-indigo-600 hover:underline md:text-center">
                  View Pre-requisites Document
                </button>
                <Button 
                  onClick={() => onProceed(selectedType)}
                  disabled={!allRequiredChecked}
                  className={cn(
                    "h-12 w-full rounded-lg px-8 font-black uppercase tracking-widest transition-all md:w-auto md:px-12",
                    allRequiredChecked ? "bg-slate-900 text-white shadow-lg" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  )}
                >
                  PROCEED
                </Button>
              </div>
            </div>
          )}

          {!selectedType && (
            <div className="pt-2 sm:pt-4">
               <button className="min-h-10 text-left text-[10px] font-black uppercase  tracking-widest text-indigo-600 hover:underline">
                  View Pre-requisites Document
               </button>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="mt-4 px-2">
         <p className="text-xs font-medium  leading-relaxed text-slate-500">
            Already registered with PugArch? <Link to="/login" className="text-indigo-600 font-bold hover:underline">CLICK HERE TO LOGIN</Link>
         </p>
      </div>
    </div>
  );
}

function BuyerSection({
  items,
  onCheck,
  checkedItems
}: {
  items: { id: string, content: ReactNode }[],
  onCheck: (item: string) => void,
  checkedItems: Record<string, boolean>
}) {
  return (
    <div className="space-y-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
      {items.map((item) => {
        const checked = checkedItems[item.id];
        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onCheck(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onCheck(item.id);
            }}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl p-3 text-left transition-all cursor-pointer group hover:bg-white hover:shadow-sm",
              checked ? "bg-white shadow-sm border border-slate-200/50" : "border border-transparent"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                checked 
                  ? "bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-600/20" 
                  : "bg-white border-slate-300 group-hover:border-indigo-400"
              )}
            >
              {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </div>
            <div className={cn(
              "text-sm font-medium leading-normal transition-colors",
              checked ? "text-slate-900 font-semibold" : "text-slate-600"
            )}>
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Section({ 
  title, 
  items, 
  isOptional, 
  onCheck, 
  checkedItems 
}: { 
  title: string, 
  items: string[], 
  isOptional?: boolean,
  onCheck: (item: string) => void,
  checkedItems: Record<string, boolean>
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-black uppercase tracking-[0.1em] text-indigo-400/90 flex items-center gap-2 px-1">
        {title}
        <span className="h-px flex-1 bg-indigo-100/50"></span>
      </h4>
      <div className="space-y-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
        {items.map((item, idx) => {
          const checked = checkedItems[item];
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onCheck(item)}
              className={cn(
                "flex w-full items-start gap-4 rounded-xl p-3 text-left transition-all group hover:bg-white hover:shadow-sm",
                checked ? "bg-white shadow-sm border border-slate-200/50" : "border border-transparent"
              )}
            >
              <div 
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                  checked 
                    ? "bg-indigo-600 border-indigo-600 shadow-md shadow-indigo-600/20" 
                    : "bg-white border-slate-300 group-hover:border-indigo-400"
                )}
              >
                {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </div>
              <div className={cn(
                "text-sm font-medium leading-normal transition-colors",
                checked ? "text-slate-900 font-semibold" : "text-slate-600"
              )}>
                {item}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
